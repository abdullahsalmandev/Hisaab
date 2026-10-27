import * as SQLite from 'expo-sqlite';
import type { AccountWithBalance, BackupFile, Entry, NewEntry, Source } from '../types';

// One entry per schema version; index + 1 is the PRAGMA user_version it migrates to.
const MIGRATIONS: string[] = [
  `CREATE TABLE accounts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE TABLE entries (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
     type TEXT NOT NULL CHECK(type IN ('in','out')),
     amount INTEGER NOT NULL CHECK(amount > 0),
     source TEXT,
     note TEXT,
     date TEXT NOT NULL
   );
   CREATE TABLE sources (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL UNIQUE COLLATE NOCASE
   );
   CREATE INDEX entries_account_date ON entries(account_id, date);
   INSERT INTO sources (name) VALUES ('Salary'), ('Allowance'), ('Mamu''s money');`,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('hisaab.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

// Shared connection, opened and migrated on first use so callers work even without initDb.
function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= open().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

const BALANCE = `COALESCE(SUM(CASE WHEN e.type = 'in' THEN e.amount ELSE -e.amount END), 0)`;
const ACCOUNTS = `SELECT a.id, a.name, a.created_at AS createdAt, ${BALANCE} AS balance
  FROM accounts a LEFT JOIN entries e ON e.account_id = a.id`;
const ENTRIES = `SELECT id, account_id AS accountId, type, amount, source, note, date FROM entries`;

const cleanEntry = (e: NewEntry) => ({
  source: e.type === 'in' ? e.source?.trim() || null : null,
  note: e.note?.trim() || null,
});

export async function initDb(): Promise<void> {
  await getDb();
}

export async function getAccounts(): Promise<AccountWithBalance[]> {
  const db = await getDb();
  return db.getAllAsync<AccountWithBalance>(`${ACCOUNTS} GROUP BY a.id ORDER BY a.created_at, a.id`);
}

export async function getAccount(id: number): Promise<AccountWithBalance | null> {
  const db = await getDb();
  return db.getFirstAsync<AccountWithBalance>(`${ACCOUNTS} WHERE a.id = ? GROUP BY a.id`, id);
}

export async function getTotal(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(`SELECT ${BALANCE} AS total FROM entries e`);
  return row?.total ?? 0;
}

export async function addAccount(name: string): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync('INSERT INTO accounts (name, created_at) VALUES (?, ?)', name.trim(), new Date().toISOString());
  return r.lastInsertRowId;
}

export async function renameAccount(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET name = ? WHERE id = ?', name.trim(), id);
}

export async function deleteAccount(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM accounts WHERE id = ?', id);
}

export async function getEntries(accountId: number): Promise<Entry[]> {
  const db = await getDb();
  return db.getAllAsync<Entry>(`${ENTRIES} WHERE account_id = ? ORDER BY date DESC, id DESC`, accountId);
}

export async function getEntry(id: number): Promise<Entry | null> {
  const db = await getDb();
  return db.getFirstAsync<Entry>(`${ENTRIES} WHERE id = ?`, id);
}

export async function addEntry(e: NewEntry): Promise<number> {
  const db = await getDb();
  const { source, note } = cleanEntry(e);
  let id = 0;
  await db.withTransactionAsync(async () => {
    if (source) await db.runAsync('INSERT OR IGNORE INTO sources (name) VALUES (?)', source);
    const r = await db.runAsync(
      'INSERT INTO entries (account_id, type, amount, source, note, date) VALUES (?, ?, ?, ?, ?, ?)',
      e.accountId, e.type, e.amount, source, note, e.date,
    );
    id = r.lastInsertRowId;
  });
  return id;
}

export async function updateEntry(id: number, e: NewEntry): Promise<void> {
  const db = await getDb();
  const { source, note } = cleanEntry(e);
  await db.withTransactionAsync(async () => {
    if (source) await db.runAsync('INSERT OR IGNORE INTO sources (name) VALUES (?)', source);
    await db.runAsync(
      'UPDATE entries SET account_id = ?, type = ?, amount = ?, source = ?, note = ?, date = ? WHERE id = ?',
      e.accountId, e.type, e.amount, source, note, e.date, id,
    );
  });
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM entries WHERE id = ?', id);
}

export async function getSources(): Promise<Source[]> {
  const db = await getDb();
  return db.getAllAsync<Source>('SELECT id, name FROM sources ORDER BY name');
}

export async function addSource(name: string): Promise<void> {
  const db = await getDb();
  const clean = name.trim();
  if (clean) await db.runAsync('INSERT OR IGNORE INTO sources (name) VALUES (?)', clean);
}

export async function exportData(): Promise<BackupFile> {
  const db = await getDb();
  let backup!: BackupFile;
  await db.withTransactionAsync(async () => {
    backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts: await db.getAllAsync('SELECT id, name, created_at AS createdAt FROM accounts ORDER BY id'),
      entries: await db.getAllAsync<Entry>(`${ENTRIES} ORDER BY id`),
      sources: await db.getAllAsync<Source>('SELECT id, name FROM sources ORDER BY id'),
    };
  });
  return backup;
}

const isId = (n: unknown) => Number.isSafeInteger(n) && (n as number) > 0;
const isText = (s: unknown) => typeof s === 'string' && s.trim() !== '';
const isTextOrNull = (s: unknown) => s === null || typeof s === 'string';

// Rejects the whole backup before anything is deleted; the table constraints stay as a second line of defence.
function validateBackup(data: BackupFile): void {
  if (!data || data.version !== 1) throw new Error('Invalid backup: unsupported or missing version (expected 1)');
  for (const key of ['accounts', 'entries', 'sources'] as const) {
    if (!Array.isArray(data[key])) throw new Error(`Invalid backup: "${key}" must be an array`);
  }
  const bad = (what: string, i: number, why: string): never => {
    throw new Error(`Invalid backup: ${what} #${i + 1} ${why}`);
  };
  const accountIds = new Set<number>();
  data.accounts.forEach((a, i) => {
    if (!isId(a?.id)) bad('account', i, 'has an invalid id');
    if (!isText(a.name)) bad('account', i, 'has no name');
    if (!isText(a.createdAt)) bad('account', i, 'has no createdAt');
    accountIds.add(a.id);
  });
  data.sources.forEach((s, i) => {
    if (!isId(s?.id)) bad('source', i, 'has an invalid id');
    if (!isText(s.name)) bad('source', i, 'has no name');
  });
  data.entries.forEach((e, i) => {
    if (!isId(e?.id)) bad('entry', i, 'has an invalid id');
    if (e.type !== 'in' && e.type !== 'out') bad('entry', i, `has type "${e.type}" (expected "in" or "out")`);
    if (!isId(e.amount)) bad('entry', i, 'amount must be a positive whole number of paisa');
    if (!accountIds.has(e.accountId)) bad('entry', i, `refers to account ${e.accountId}, which is not in the backup`);
    if (!isText(e.date)) bad('entry', i, 'has no date');
    if (!isTextOrNull(e.source) || !isTextOrNull(e.note)) bad('entry', i, 'has a non-text source or note');
  });
}

export async function importData(data: BackupFile): Promise<void> {
  validateBackup(data);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM entries');
    await db.runAsync('DELETE FROM accounts');
    await db.runAsync('DELETE FROM sources');
    for (const a of data.accounts) {
      await db.runAsync('INSERT INTO accounts (id, name, created_at) VALUES (?, ?, ?)', a.id, a.name, a.createdAt);
    }
    for (const s of data.sources) {
      await db.runAsync('INSERT INTO sources (id, name) VALUES (?, ?)', s.id, s.name);
    }
    for (const e of data.entries) {
      await db.runAsync(
        'INSERT INTO entries (id, account_id, type, amount, source, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        e.id, e.accountId, e.type, e.amount, e.source, e.note, e.date,
      );
    }
  });
}
