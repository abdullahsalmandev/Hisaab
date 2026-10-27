import * as SQLite from 'expo-sqlite';
import type { AccountWithBalance, BackupFile, Entry, LedgerRow, NewEntry, SourceWithBalance } from '../types';
import { convertV1, parseBackup, withRunningBalance, type V1Entry } from './logic';

const SCHEMA_VERSION = 2;

const ACCOUNTS_DDL = `
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`;

// note stays in the table so notes written by v1 are never lost; nothing reads it except exportData.
const SOURCES_ENTRIES_DDL = `
  CREATE TABLE sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (account_id, name COLLATE NOCASE)
  );
  CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('in','out')),
    amount INTEGER NOT NULL CHECK(amount > 0),
    note TEXT,
    date TEXT NOT NULL
  );
  CREATE INDEX entries_source_date ON entries(source_id, date);`;

const SIGNED = `CASE WHEN type = 'in' THEN amount ELSE -amount END`;

// ponytail: no copy of the db file is taken first; the single transaction plus the checks below are the safety net. Add a serializeAsync copy if a future migration is riskier.
// v1 -> v2 in ONE transaction. The v1 tables are renamed aside, v2 is built and filled, balances are checked against v1,
// and only then are the v1 tables dropped. Any throw rolls everything back, including the user_version bump.
async function migrateV1(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync('ALTER TABLE entries RENAME TO entries_v1; ALTER TABLE sources RENAME TO sources_v1;');
    await db.execAsync(SOURCES_ENTRIES_DDL);

    const old = await db.getAllAsync<V1Entry>(
      'SELECT id, account_id AS accountId, type, amount, source, note, date FROM entries_v1 ORDER BY id',
    );
    const plan = convertV1(old);
    for (const s of plan.sources) {
      await db.runAsync('INSERT INTO sources (id, account_id, name, created_at) VALUES (?, ?, ?, ?)', s.id, s.accountId, s.name, s.createdAt);
    }
    for (const e of plan.entries) {
      await db.runAsync('INSERT INTO entries (id, source_id, type, amount, note, date) VALUES (?, ?, ?, ?, ?, ?)', e.id, e.sourceId, e.type, e.amount, e.note ?? null, e.date);
    }

    const counts = await db.getFirstAsync<{ oldCount: number; newCount: number; moved: number }>(
      `SELECT (SELECT COUNT(*) FROM entries_v1) AS oldCount,
              (SELECT COUNT(*) FROM entries) AS newCount,
              (SELECT COUNT(*) FROM entries e JOIN entries_v1 o ON o.id = e.id JOIN sources s ON s.id = e.source_id
                WHERE s.account_id <> o.account_id OR e.amount <> o.amount OR e.type <> o.type OR e.date <> o.date) AS moved`,
    );
    if (!counts || counts.oldCount !== counts.newCount || counts.moved !== 0) {
      throw new Error(`Migration check failed: entries differ (${counts?.oldCount} before, ${counts?.newCount} after, ${counts?.moved} changed)`);
    }
    const balances = await db.getAllAsync<{ id: number; oldBalance: number; newBalance: number }>(
      `SELECT a.id,
         COALESCE((SELECT SUM(${SIGNED}) FROM entries_v1 WHERE account_id = a.id), 0) AS oldBalance,
         COALESCE((SELECT SUM(${SIGNED}) FROM entries e WHERE e.source_id IN (SELECT id FROM sources WHERE account_id = a.id)), 0) AS newBalance
       FROM accounts a`,
    );
    const wrong = balances.find((b) => b.oldBalance !== b.newBalance);
    if (wrong) throw new Error(`Migration check failed: account ${wrong.id} balance was ${wrong.oldBalance} paisa, would become ${wrong.newBalance}`);

    await db.execAsync(`DROP TABLE entries_v1; DROP TABLE sources_v1; PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('hisaab.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (version === 0) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`${ACCOUNTS_DDL} ${SOURCES_ENTRIES_DDL} PRAGMA user_version = ${SCHEMA_VERSION};`);
    });
  } else if (version === 1) {
    await migrateV1(db);
  } else if (version !== SCHEMA_VERSION) {
    throw new Error(`This database was written by a newer version of Hisaab (schema ${version}). Update the app.`);
  }
  return db;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Shared connection, opened and migrated on first use so callers work even without initDb.
function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= open().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

const ACCOUNTS = `
  SELECT a.id, a.name, a.created_at AS createdAt,
    COALESCE((SELECT SUM(${SIGNED}) FROM entries WHERE source_id IN (SELECT id FROM sources WHERE account_id = a.id)), 0) AS balance,
    (SELECT COUNT(*) FROM sources WHERE account_id = a.id) AS sourceCount
  FROM accounts a`;

const SOURCES = `
  SELECT s.id, s.account_id AS accountId, s.name, s.created_at AS createdAt,
    COALESCE(SUM(CASE WHEN e.type = 'in' THEN e.amount END), 0) - COALESCE(SUM(CASE WHEN e.type = 'out' THEN e.amount END), 0) AS balance,
    COALESCE(SUM(CASE WHEN e.type = 'in' THEN e.amount END), 0) AS totalIn,
    COALESCE(SUM(CASE WHEN e.type = 'out' THEN e.amount END), 0) AS totalOut,
    MAX(e.date) AS lastEntryDate
  FROM sources s LEFT JOIN entries e ON e.source_id = s.id`;

const ENTRIES = `SELECT id, source_id AS sourceId, type, amount, date FROM entries`;

const cleanName = (name: string, what: string) => {
  const n = name.trim();
  if (!n) throw new Error(`${what} name is required`);
  return n;
};

function checkEntry(e: NewEntry): void {
  if (e.type !== 'in' && e.type !== 'out') throw new Error('Entry type must be "in" or "out"');
  if (!Number.isSafeInteger(e.amount) || e.amount <= 0) throw new Error('Amount must be a positive whole number of paisa');
  if (Number.isNaN(Date.parse(e.date))) throw new Error('Entry date is not valid');
}

export async function initDb(): Promise<void> {
  await getDb();
}

export async function getAccounts(): Promise<AccountWithBalance[]> {
  const db = await getDb();
  return db.getAllAsync<AccountWithBalance>(`${ACCOUNTS} ORDER BY a.created_at, a.id`);
}

export async function getAccount(id: number): Promise<AccountWithBalance | null> {
  const db = await getDb();
  return db.getFirstAsync<AccountWithBalance>(`${ACCOUNTS} WHERE a.id = ?`, id);
}

export async function getTotal(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(`SELECT COALESCE(SUM(${SIGNED}), 0) AS total FROM entries`);
  return row?.total ?? 0;
}

export async function addAccount(name: string): Promise<number> {
  const db = await getDb();
  const r = await db.runAsync('INSERT INTO accounts (name, created_at) VALUES (?, ?)', cleanName(name, 'Account'), new Date().toISOString());
  return r.lastInsertRowId;
}

export async function renameAccount(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET name = ? WHERE id = ?', cleanName(name, 'Account'), id);
}

export async function deleteAccount(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM accounts WHERE id = ?', id); // cascades to sources and entries
}

export async function getSources(accountId: number): Promise<SourceWithBalance[]> {
  const db = await getDb();
  return db.getAllAsync<SourceWithBalance>(`${SOURCES} WHERE s.account_id = ? GROUP BY s.id ORDER BY balance DESC, s.name COLLATE NOCASE, s.id`, accountId);
}

export async function getSource(id: number): Promise<SourceWithBalance | null> {
  const db = await getDb();
  return db.getFirstAsync<SourceWithBalance>(`${SOURCES} WHERE s.id = ? GROUP BY s.id`, id);
}

// Rejects a name already used by another source of the account (case-insensitive) with a clear message.
async function assertNameFree(db: SQLite.SQLiteDatabase, accountId: number, name: string, exceptId: number): Promise<void> {
  const dup = await db.getFirstAsync<{ id: number }>('SELECT id FROM sources WHERE account_id = ? AND name = ? COLLATE NOCASE AND id <> ?', accountId, name, exceptId);
  if (dup) throw new Error(`A source named "${name}" already exists in this account`);
}

export async function addSource(accountId: number, name: string): Promise<number> {
  const db = await getDb();
  const clean = cleanName(name, 'Source');
  let id = 0;
  await db.withTransactionAsync(async () => {
    await assertNameFree(db, accountId, clean, 0);
    const r = await db.runAsync('INSERT INTO sources (account_id, name, created_at) VALUES (?, ?, ?)', accountId, clean, new Date().toISOString());
    id = r.lastInsertRowId;
  });
  return id;
}

export async function renameSource(id: number, name: string): Promise<void> {
  const db = await getDb();
  const clean = cleanName(name, 'Source');
  await db.withTransactionAsync(async () => {
    const s = await db.getFirstAsync<{ accountId: number }>('SELECT account_id AS accountId FROM sources WHERE id = ?', id);
    if (!s) throw new Error('Source not found');
    await assertNameFree(db, s.accountId, clean, id);
    await db.runAsync('UPDATE sources SET name = ? WHERE id = ?', clean, id);
  });
}

export async function deleteSource(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sources WHERE id = ?', id); // cascades to its entries
}

export async function getLedger(sourceId: number): Promise<LedgerRow[]> {
  const db = await getDb();
  return withRunningBalance(await db.getAllAsync<Entry>(`${ENTRIES} WHERE source_id = ?`, sourceId));
}

export async function getEntry(id: number): Promise<Entry | null> {
  const db = await getDb();
  return db.getFirstAsync<Entry>(`${ENTRIES} WHERE id = ?`, id);
}

export async function addEntry(e: NewEntry): Promise<number> {
  checkEntry(e);
  const db = await getDb();
  const r = await db.runAsync('INSERT INTO entries (source_id, type, amount, date) VALUES (?, ?, ?, ?)', e.sourceId, e.type, e.amount, e.date);
  return r.lastInsertRowId;
}

// The entry may move to another source, but only within its own account. note is left untouched.
export async function updateEntry(id: number, e: NewEntry): Promise<void> {
  checkEntry(e);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const cur = await db.getFirstAsync<{ accountId: number }>('SELECT s.account_id AS accountId FROM entries e JOIN sources s ON s.id = e.source_id WHERE e.id = ?', id);
    if (!cur) throw new Error('Entry not found');
    const next = await db.getFirstAsync<{ accountId: number }>('SELECT account_id AS accountId FROM sources WHERE id = ?', e.sourceId);
    if (!next) throw new Error('Source not found');
    if (next.accountId !== cur.accountId) throw new Error('An entry can only move to another source of the same account');
    await db.runAsync('UPDATE entries SET source_id = ?, type = ?, amount = ?, date = ? WHERE id = ?', e.sourceId, e.type, e.amount, e.date, id);
  });
}

export async function deleteEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM entries WHERE id = ?', id);
}

export async function exportData(): Promise<BackupFile> {
  const db = await getDb();
  let backup!: BackupFile;
  await db.withTransactionAsync(async () => {
    backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      accounts: await db.getAllAsync('SELECT id, name, created_at AS createdAt FROM accounts ORDER BY id'),
      sources: await db.getAllAsync('SELECT id, account_id AS accountId, name, created_at AS createdAt FROM sources ORDER BY id'),
      entries: await db.getAllAsync('SELECT id, source_id AS sourceId, type, amount, date, note FROM entries ORDER BY id'),
    };
  });
  return backup;
}

// Accepts a version 1 or 2 backup. The whole file is validated before anything is deleted.
export async function importData(data: unknown): Promise<void> {
  const { accounts, sources, entries } = parseBackup(data);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM entries');
    await db.runAsync('DELETE FROM sources');
    await db.runAsync('DELETE FROM accounts');
    for (const a of accounts) {
      await db.runAsync('INSERT INTO accounts (id, name, created_at) VALUES (?, ?, ?)', a.id, a.name, a.createdAt);
    }
    for (const s of sources) {
      await db.runAsync('INSERT INTO sources (id, account_id, name, created_at) VALUES (?, ?, ?, ?)', s.id, s.accountId, s.name, s.createdAt);
    }
    for (const e of entries) {
      await db.runAsync('INSERT INTO entries (id, source_id, type, amount, note, date) VALUES (?, ?, ?, ?, ?, ?)', e.id, e.sourceId, e.type, e.amount, e.note ?? null, e.date);
    }
  });
}
