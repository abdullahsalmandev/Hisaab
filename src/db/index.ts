import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import type { AccountSourceBalance, AccountWithBalance, BackupFile, Entry, LedgerRow, NewEntry, Source, SourceSummary, SourceWithTotal } from '../types';
import { convertV1, mergeV2, parseBackup, withRunningBalance, type V1Entry, type V2Entry, type V2Source } from './logic';

const SCHEMA_VERSION = 3;

const ACCOUNTS_DDL = `
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`;

// v2 tables, only used to build the v1 -> v2 step of the migration chain.
const V2_DDL = `
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

// Sources are global; account_sources links them to accounts; every entry belongs to one linked (account, source) pair.
// note stays in the table so notes written by v1 are never lost; nothing reads it except exportData.
const V3_DDL = `
  CREATE TABLE sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE account_sources (
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (account_id, source_id)
  );
  CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in','out')),
    amount INTEGER NOT NULL CHECK(amount > 0),
    note TEXT,
    date TEXT NOT NULL,
    FOREIGN KEY (account_id, source_id) REFERENCES account_sources(account_id, source_id) ON DELETE CASCADE
  );
  CREATE INDEX entries_account_source_date ON entries(account_id, source_id, date);`;

const SIGNED = `CASE WHEN type = 'in' THEN amount ELSE -amount END`;

// Before a one-way migration, copy hisaab.db (and any -wal / -shm) next to it as `copyName`, once.
// Sidecars go first and the main file last, so an existing copy means the copy is complete. The app never deletes it.
async function backupBefore(copyName: string): Promise<void> {
  const dir = String(SQLite.defaultDatabaseDirectory).replace(/\/+$/, '');
  const at = (name: string) => new File(`${dir.startsWith('file:') ? dir : `file://${dir}`}/${name}`);
  if (at(copyName).exists) return;
  for (const suffix of ['-wal', '-shm', '']) {
    const src = at(`hisaab.db${suffix}`);
    if (src.exists) await src.copy(at(`${copyName}${suffix}`), { overwrite: true }); // overwrite only replaces leftovers of an interrupted copy
  }
}

// v1 -> v2 in ONE transaction. The v1 tables are renamed aside, v2 is built and filled, balances are checked against v1,
// and only then are the v1 tables dropped. Any throw rolls everything back, including the user_version bump.
async function migrateV1(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync('ALTER TABLE entries RENAME TO entries_v1; ALTER TABLE sources RENAME TO sources_v1;');
    await db.execAsync(V2_DDL);

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

    await db.execAsync(`DROP TABLE entries_v1; DROP TABLE sources_v1; PRAGMA user_version = 2;`);
  });
}

// Per-(account, source name) balances, folded by trimmed lowercase name the same way mergeV2 folds the names.
function foldBalances(rows: { accountId: number; name: string; balance: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.accountId}|${r.name.trim().toLowerCase()}`;
    m.set(k, (m.get(k) ?? 0) + r.balance);
  }
  return m;
}

// v2 -> v3 in ONE transaction. The v2 tables are renamed aside, v3 is built and filled by mergeV2, and the result is checked
// against v2 (entry count and content, every account balance, every (account, source name) balance) before the v2 tables
// are dropped. Any throw rolls everything back, including the user_version bump, so the v2 data stays exactly as it was.
async function migrateV2(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync('ALTER TABLE entries RENAME TO entries_v2; ALTER TABLE sources RENAME TO sources_v2;');
    await db.execAsync(V3_DDL);

    const oldSources = await db.getAllAsync<V2Source>('SELECT id, account_id AS accountId, name, created_at AS createdAt FROM sources_v2');
    const oldEntries = await db.getAllAsync<V2Entry>('SELECT id, source_id AS sourceId, type, amount, note, date FROM entries_v2 ORDER BY id');
    const plan = mergeV2(oldSources, oldEntries);
    for (const s of plan.sources) {
      await db.runAsync('INSERT INTO sources (id, name, created_at) VALUES (?, ?, ?)', s.id, s.name, s.createdAt);
    }
    for (const l of plan.accountSources) {
      await db.runAsync('INSERT INTO account_sources (account_id, source_id, created_at) VALUES (?, ?, ?)', l.accountId, l.sourceId, l.createdAt);
    }
    for (const e of plan.entries) {
      await db.runAsync('INSERT INTO entries (id, account_id, source_id, type, amount, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)', e.id, e.accountId, e.sourceId, e.type, e.amount, e.note ?? null, e.date);
    }

    const counts = await db.getFirstAsync<{ oldCount: number; newCount: number; changed: number }>(
      `SELECT (SELECT COUNT(*) FROM entries_v2) AS oldCount,
              (SELECT COUNT(*) FROM entries) AS newCount,
              (SELECT COUNT(*) FROM entries_v2 o LEFT JOIN sources_v2 os ON os.id = o.source_id LEFT JOIN entries e ON e.id = o.id
                WHERE e.id IS NULL OR e.account_id <> os.account_id OR e.amount <> o.amount OR e.type <> o.type OR e.date <> o.date OR e.note IS NOT o.note) AS changed`,
    );
    if (!counts || counts.oldCount !== counts.newCount || counts.changed !== 0) {
      throw new Error(`Migration check failed: entries differ (${counts?.oldCount} before, ${counts?.newCount} after, ${counts?.changed} changed)`);
    }
    const balances = await db.getAllAsync<{ id: number; oldBalance: number; newBalance: number }>(
      `SELECT a.id,
         COALESCE((SELECT SUM(${SIGNED}) FROM entries_v2 WHERE source_id IN (SELECT id FROM sources_v2 WHERE account_id = a.id)), 0) AS oldBalance,
         COALESCE((SELECT SUM(${SIGNED}) FROM entries WHERE account_id = a.id), 0) AS newBalance
       FROM accounts a`,
    );
    const wrong = balances.find((b) => b.oldBalance !== b.newBalance);
    if (wrong) throw new Error(`Migration check failed: account ${wrong.id} balance was ${wrong.oldBalance} paisa, would become ${wrong.newBalance}`);

    const before = foldBalances(await db.getAllAsync(
      `SELECT os.account_id AS accountId, os.name, COALESCE(SUM(${SIGNED}), 0) AS balance
       FROM sources_v2 os LEFT JOIN entries_v2 ON entries_v2.source_id = os.id GROUP BY os.id`,
    ));
    const after = foldBalances(await db.getAllAsync(
      `SELECT l.account_id AS accountId, s.name, COALESCE(SUM(${SIGNED}), 0) AS balance
       FROM account_sources l JOIN sources s ON s.id = l.source_id
       LEFT JOIN entries ON entries.account_id = l.account_id AND entries.source_id = l.source_id GROUP BY l.account_id, l.source_id`,
    ));
    for (const [k, b] of before) {
      if (after.get(k) !== b) throw new Error(`Migration check failed: balance of "${k}" was ${b} paisa, would become ${after.get(k)}`);
    }
    if (after.size !== before.size) throw new Error(`Migration check failed: ${before.size} account/source pairs before, ${after.size} after`);

    await db.execAsync(`DROP TABLE entries_v2; DROP TABLE sources_v2; PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('hisaab.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  let version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (version === 0) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`${ACCOUNTS_DDL} ${V3_DDL} PRAGMA user_version = ${SCHEMA_VERSION};`);
    });
    return db;
  }
  if (version === 1) {
    await backupBefore('hisaab-pre-v2.db');
    await migrateV1(db);
    version = 2;
  }
  if (version === 2) {
    await backupBefore('hisaab-pre-v3.db'); // for a v1 database this holds the migrated v2 data; hisaab-pre-v2.db holds v1
    await migrateV2(db);
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
    COALESCE((SELECT SUM(${SIGNED}) FROM entries WHERE account_id = a.id), 0) AS balance,
    (SELECT COUNT(*) FROM account_sources WHERE account_id = a.id) AS sourceCount
  FROM accounts a`;

const SOURCES = `
  SELECT s.id, s.name, s.created_at AS createdAt,
    COALESCE(SUM(${SIGNED}), 0) AS total,
    (SELECT COUNT(*) FROM account_sources WHERE source_id = s.id) AS accountCount,
    MAX(e.date) AS lastEntryDate
  FROM sources s LEFT JOIN entries e ON e.source_id = s.id`;

// One row per linked (account, source) pair; its entries are the ones with both ids.
const PAIRS = `
  SELECT l.account_id AS accountId, a.name AS accountName, l.source_id AS sourceId, s.name AS sourceName,
    COALESCE(SUM(CASE WHEN e.type = 'in' THEN e.amount END), 0) - COALESCE(SUM(CASE WHEN e.type = 'out' THEN e.amount END), 0) AS balance,
    COALESCE(SUM(CASE WHEN e.type = 'in' THEN e.amount END), 0) AS totalIn,
    COALESCE(SUM(CASE WHEN e.type = 'out' THEN e.amount END), 0) AS totalOut,
    MAX(e.date) AS lastEntryDate
  FROM account_sources l
  JOIN accounts a ON a.id = l.account_id
  JOIN sources s ON s.id = l.source_id
  LEFT JOIN entries e ON e.account_id = l.account_id AND e.source_id = l.source_id`;

const ENTRIES = `SELECT id, account_id AS accountId, source_id AS sourceId, type, amount, date FROM entries`;

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

// Links the pair if it is not linked yet. Unknown ids get a clear message instead of a raw foreign key error.
async function ensureLink(db: SQLite.SQLiteDatabase, accountId: number, sourceId: number): Promise<void> {
  const found = await db.getFirstAsync<{ a: number | null; s: number | null }>(
    'SELECT (SELECT 1 FROM accounts WHERE id = ?) AS a, (SELECT 1 FROM sources WHERE id = ?) AS s', accountId, sourceId,
  );
  if (!found?.a) throw new Error('Account not found');
  if (!found.s) throw new Error('Source not found');
  await db.runAsync('INSERT OR IGNORE INTO account_sources (account_id, source_id, created_at) VALUES (?, ?, ?)', accountId, sourceId, new Date().toISOString());
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
  await db.runAsync('DELETE FROM accounts WHERE id = ?', id); // cascades to its links and entries; sources stay
}

export async function getAllSources(): Promise<SourceWithTotal[]> {
  const db = await getDb();
  return db.getAllAsync<SourceWithTotal>(`${SOURCES} GROUP BY s.id ORDER BY total DESC, s.name COLLATE NOCASE, s.id`);
}

export async function getSourceSummary(sourceId: number): Promise<SourceSummary | null> {
  const db = await getDb();
  const source = await db.getFirstAsync<Source>('SELECT id, name, created_at AS createdAt FROM sources WHERE id = ?', sourceId);
  if (!source) return null;
  const accounts = await db.getAllAsync<AccountSourceBalance>(`${PAIRS} WHERE l.source_id = ? GROUP BY l.account_id ORDER BY balance DESC, a.name COLLATE NOCASE, l.account_id`, sourceId);
  const totalIn = accounts.reduce((n, p) => n + p.totalIn, 0);
  const totalOut = accounts.reduce((n, p) => n + p.totalOut, 0);
  return { source, total: totalIn - totalOut, totalIn, totalOut, accounts };
}

// Rejects a name already used by another source (case-insensitive) with a clear message.
async function assertNameFree(db: SQLite.SQLiteDatabase, name: string, exceptId: number): Promise<void> {
  const dup = await db.getFirstAsync<{ id: number }>('SELECT id FROM sources WHERE name = ? COLLATE NOCASE AND id <> ?', name, exceptId);
  if (dup) throw new Error(`A source named "${name}" already exists`);
}

export async function addSource(name: string): Promise<number> {
  const db = await getDb();
  const clean = cleanName(name, 'Source');
  let id = 0;
  await db.withTransactionAsync(async () => {
    await assertNameFree(db, clean, 0);
    const r = await db.runAsync('INSERT INTO sources (name, created_at) VALUES (?, ?)', clean, new Date().toISOString());
    id = r.lastInsertRowId;
  });
  return id;
}

export async function renameSource(id: number, name: string): Promise<void> {
  const db = await getDb();
  const clean = cleanName(name, 'Source');
  await db.withTransactionAsync(async () => {
    if (!(await db.getFirstAsync('SELECT 1 FROM sources WHERE id = ?', id))) throw new Error('Source not found');
    await assertNameFree(db, clean, id);
    await db.runAsync('UPDATE sources SET name = ? WHERE id = ?', clean, id);
  });
}

export async function deleteSource(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM sources WHERE id = ?', id); // cascades to every link and, through them, every entry
}

export async function getAccountSources(accountId: number): Promise<AccountSourceBalance[]> {
  const db = await getDb();
  return db.getAllAsync<AccountSourceBalance>(`${PAIRS} WHERE l.account_id = ? GROUP BY l.source_id ORDER BY balance DESC, s.name COLLATE NOCASE, l.source_id`, accountId);
}

export async function getAccountSource(accountId: number, sourceId: number): Promise<AccountSourceBalance | null> {
  const db = await getDb();
  return db.getFirstAsync<AccountSourceBalance>(`${PAIRS} WHERE l.account_id = ? AND l.source_id = ? GROUP BY l.account_id`, accountId, sourceId);
}

export async function getUnlinkedSources(accountId: number): Promise<Source[]> {
  const db = await getDb();
  return db.getAllAsync<Source>(
    'SELECT id, name, created_at AS createdAt FROM sources WHERE id NOT IN (SELECT source_id FROM account_sources WHERE account_id = ?) ORDER BY name COLLATE NOCASE, id',
    accountId,
  );
}

export async function linkSource(accountId: number, sourceId: number): Promise<void> {
  const db = await getDb();
  await ensureLink(db, accountId, sourceId);
}

export async function unlinkSource(accountId: number, sourceId: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM entries WHERE account_id = ? AND source_id = ?', accountId, sourceId);
    await db.runAsync('DELETE FROM account_sources WHERE account_id = ? AND source_id = ?', accountId, sourceId);
  });
}

export async function getLedger(accountId: number, sourceId: number): Promise<LedgerRow[]> {
  const db = await getDb();
  return withRunningBalance(await db.getAllAsync<Entry>(`${ENTRIES} WHERE account_id = ? AND source_id = ?`, accountId, sourceId));
}

export async function getEntry(id: number): Promise<Entry | null> {
  const db = await getDb();
  return db.getFirstAsync<Entry>(`${ENTRIES} WHERE id = ?`, id);
}

export async function addEntry(e: NewEntry): Promise<number> {
  checkEntry(e);
  const db = await getDb();
  let id = 0;
  await db.withTransactionAsync(async () => {
    await ensureLink(db, e.accountId, e.sourceId);
    const r = await db.runAsync('INSERT INTO entries (account_id, source_id, type, amount, date) VALUES (?, ?, ?, ?, ?)', e.accountId, e.sourceId, e.type, e.amount, e.date);
    id = r.lastInsertRowId;
  });
  return id;
}

// The entry may move to another source (linked to its account on the way), never to another account. note is left untouched.
export async function updateEntry(id: number, e: NewEntry): Promise<void> {
  checkEntry(e);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const cur = await db.getFirstAsync<{ accountId: number }>('SELECT account_id AS accountId FROM entries WHERE id = ?', id);
    if (!cur) throw new Error('Entry not found');
    if (cur.accountId !== e.accountId) throw new Error('An entry cannot be moved to another account');
    await ensureLink(db, e.accountId, e.sourceId);
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
      version: 3,
      exportedAt: new Date().toISOString(),
      accounts: await db.getAllAsync('SELECT id, name, created_at AS createdAt FROM accounts ORDER BY id'),
      sources: await db.getAllAsync('SELECT id, name, created_at AS createdAt FROM sources ORDER BY id'),
      accountSources: await db.getAllAsync('SELECT account_id AS accountId, source_id AS sourceId, created_at AS createdAt FROM account_sources ORDER BY account_id, source_id'),
      entries: await db.getAllAsync('SELECT id, account_id AS accountId, source_id AS sourceId, type, amount, date, note FROM entries ORDER BY id'),
    };
  });
  return backup;
}

// Accepts a version 1, 2 or 3 backup. The whole file is validated before anything is deleted.
export async function importData(data: unknown): Promise<void> {
  const { accounts, sources, accountSources, entries } = parseBackup(data);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM entries');
    await db.runAsync('DELETE FROM account_sources');
    await db.runAsync('DELETE FROM sources');
    await db.runAsync('DELETE FROM accounts');
    for (const a of accounts) {
      await db.runAsync('INSERT INTO accounts (id, name, created_at) VALUES (?, ?, ?)', a.id, a.name, a.createdAt);
    }
    for (const s of sources) {
      await db.runAsync('INSERT INTO sources (id, name, created_at) VALUES (?, ?, ?)', s.id, s.name, s.createdAt);
    }
    for (const l of accountSources) {
      await db.runAsync('INSERT INTO account_sources (account_id, source_id, created_at) VALUES (?, ?, ?)', l.accountId, l.sourceId, l.createdAt);
    }
    for (const e of entries) {
      await db.runAsync('INSERT INTO entries (id, account_id, source_id, type, amount, note, date) VALUES (?, ?, ?, ?, ?, ?, ?)', e.id, e.accountId, e.sourceId, e.type, e.amount, e.note ?? null, e.date);
    }
  });
}
