// Runs the real src/db module against a real (in-memory) SQLite engine through src/db/sqliteTestShim.
import { DatabaseSync } from 'node:sqlite';

jest.mock('expo-sqlite', () => require('./sqliteTestShim'));

// In-memory stand-in for the slice of expo-file-system that src/db uses: File.exists and File.copy.
const mockFs = { files: new Set<string>(), copies: [] as string[], failCopy: false };
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    get exists() { return mockFs.files.has(this.uri); }
    async copy(dest: { uri: string }) {
      if (mockFs.failCopy) throw new Error('disk full');
      mockFs.files.add(dest.uri);
      mockFs.copies.push(`${this.uri} -> ${dest.uri}`);
    }
  },
}));
const DIR = 'file:///data/SQLite';
beforeEach(() => {
  mockFs.files = new Set([`${DIR}/hisaab.db`, `${DIR}/hisaab.db-wal`]); // no -shm: only files that exist are copied
  mockFs.copies = [];
  mockFs.failCopy = false;
});

type Db = typeof import('./index');

function load(raw: DatabaseSync): Db {
  (globalThis as unknown as { __testDb: DatabaseSync }).__testDb = raw;
  let mod!: Db;
  jest.isolateModules(() => { mod = require('./index'); });
  return mod;
}

// The exact v1 schema that was installed on the phone first.
const V1_SCHEMA = `
  CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('in','out')),
    amount INTEGER NOT NULL CHECK(amount > 0),
    source TEXT, note TEXT, date TEXT NOT NULL
  );
  CREATE TABLE sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
  CREATE INDEX entries_account_date ON entries(account_id, date);
  INSERT INTO sources (name) VALUES ('Salary'), ('Allowance'), ('Mamu''s money');
  PRAGMA user_version = 1;`;

function v1Db(schema = V1_SCHEMA): DatabaseSync {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(schema);
  raw.exec(`
    INSERT INTO accounts (id, name, created_at) VALUES (1, 'Meezan', '2026-09-01T00:00:00.000Z'), (2, 'JazzCash', '2026-09-02T00:00:00.000Z'), (3, 'Empty', '2026-09-03T00:00:00.000Z');
    INSERT INTO entries (id, account_id, type, amount, source, note, date) VALUES
      (1, 1, 'in', 5000000, 'Salary', NULL, '2026-10-01T05:00:00.000Z'),
      (2, 1, 'in', 1000000, ' salary ', 'bonus', '2026-10-03T05:00:00.000Z'),
      (3, 1, 'out', 300000, NULL, 'groceries', '2026-10-04T05:00:00.000Z'),
      (4, 1, 'in', 250000, 'Mamu''s money', NULL, '2026-10-05T05:00:00.000Z'),
      (5, 2, 'in', 100000, 'Salary', NULL, '2026-10-02T05:00:00.000Z'),
      (6, 2, 'out', 40000, NULL, NULL, '2026-10-06T05:00:00.000Z'),
      (7, 1, 'out', 50000, NULL, NULL, '2026-09-30T05:00:00.000Z');`);
  return raw;
}

// The exact v2 schema that is installed on the phone now.
const V2_SCHEMA = `
  CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL);
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
  CREATE INDEX entries_source_date ON entries(source_id, date);
  PRAGMA user_version = 2;`;

// "General" lives in accounts 1 and 2 (spelled differently), "Salary" in 1, 2 and 3 (3 has no entries).
function v2Db(schema = V2_SCHEMA): DatabaseSync {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(schema);
  raw.exec(`
    INSERT INTO accounts (id, name, created_at) VALUES (1, 'Meezan', '2026-09-01T00:00:00.000Z'), (2, 'JazzCash', '2026-09-02T00:00:00.000Z'), (3, 'Empty', '2026-09-03T00:00:00.000Z');
    INSERT INTO sources (id, account_id, name, created_at) VALUES
      (1, 1, 'Salary', '2026-10-01T05:00:00.000Z'),
      (2, 1, 'General', '2026-09-30T05:00:00.000Z'),
      (3, 1, 'Mamu''s money', '2026-10-05T05:00:00.000Z'),
      (4, 2, 'Salary', '2026-10-02T05:00:00.000Z'),
      (5, 2, 'GENERAL', '2026-10-06T05:00:00.000Z'),
      (6, 3, 'Salary', '2026-10-07T05:00:00.000Z');
    INSERT INTO entries (id, source_id, type, amount, note, date) VALUES
      (1, 1, 'in', 5000000, NULL, '2026-10-01T05:00:00.000Z'),
      (2, 1, 'in', 1000000, 'bonus', '2026-10-03T05:00:00.000Z'),
      (3, 2, 'out', 300000, 'groceries', '2026-10-04T05:00:00.000Z'),
      (4, 3, 'in', 250000, NULL, '2026-10-05T05:00:00.000Z'),
      (5, 4, 'in', 100000, NULL, '2026-10-02T05:00:00.000Z'),
      (6, 5, 'out', 40000, NULL, '2026-10-06T05:00:00.000Z'),
      (7, 2, 'out', 50000, NULL, '2026-09-30T05:00:00.000Z');`);
  return raw;
}

const userVersion = (raw: DatabaseSync) => (raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const tables = (raw: DatabaseSync) => (raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
const rows = (raw: DatabaseSync, sql: string) => raw.prepare(sql).all().map((r) => ({ ...r }));
const D = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;
const V3_TABLES = ['account_sources', 'accounts', 'entries', 'sources'];

describe('migration v2 -> v3', () => {
  test('merges "General" of two accounts into one source; every entry and balance is unchanged', async () => {
    const raw = v2Db();
    const oldRows = rows(raw, 'SELECT id, type, amount, note, date FROM entries ORDER BY id');
    const oldAccountBalances = rows(raw, `SELECT s.account_id AS id, SUM(CASE WHEN e.type='in' THEN e.amount ELSE -e.amount END) AS b FROM entries e JOIN sources s ON s.id = e.source_id GROUP BY s.account_id`) as { id: number; b: number }[];
    const oldPairBalances = rows(raw, `SELECT s.account_id AS a, LOWER(s.name) AS n, SUM(CASE WHEN e.type='in' THEN e.amount ELSE -e.amount END) AS b FROM entries e JOIN sources s ON s.id = e.source_id GROUP BY s.id ORDER BY a, n`);

    const db = load(raw);
    await db.initDb();

    expect(userVersion(raw)).toBe(3);
    expect(tables(raw)).toEqual(V3_TABLES); // v2 leftovers are gone

    const accounts = await db.getAccounts();
    for (const o of oldAccountBalances) expect(accounts.find((a) => a.id === o.id)!.balance).toBe(o.b);
    expect(accounts.map((a) => [a.name, a.balance, a.sourceCount])).toEqual([['Meezan', 5900000, 3], ['JazzCash', 60000, 2], ['Empty', 0, 1]]);
    expect(await db.getTotal()).toBe(5960000);

    // one global "General" (earliest spelling and date) and one "Salary" shared by three accounts
    const all = await db.getAllSources();
    expect(all.map((s) => [s.name, s.total, s.accountCount])).toEqual([['Salary', 6100000, 3], ["Mamu's money", 250000, 1], ['General', -390000, 2]]);
    expect(await db.getSourceSummary(all[2].id)).toMatchObject({ source: { name: 'General', createdAt: '2026-09-30T05:00:00.000Z' }, total: -390000 });

    // every (account, source name) balance is the same as before
    const newPairBalances = [];
    for (const a of accounts) for (const p of await db.getAccountSources(a.id)) if (p.totalIn + p.totalOut > 0) newPairBalances.push({ a: p.accountId, n: p.sourceName.toLowerCase(), b: p.balance });
    expect(newPairBalances.sort((x, y) => x.a - y.a || (x.n < y.n ? -1 : 1))).toEqual(oldPairBalances);
    expect((await db.getAccountSources(3)).map((p) => [p.sourceName, p.balance])).toEqual([['Salary', 0]]); // the empty link survives

    // ids, amounts, types, dates and notes all survive; notes are only visible through the export
    const exported = await db.exportData();
    expect(exported.entries.map(({ id, type, amount, note, date }) => ({ id, type, amount, note, date }))).toEqual(oldRows);
    expect(exported.entries.find((e) => e.id === 3)!.note).toBe('groceries');
  });

  test('new ids continue after the old ones', async () => {
    const db = load(v2Db());
    const id = await db.addEntry({ accountId: 1, sourceId: (await db.getAccountSources(1))[0].sourceId, type: 'in', amount: 100, date: D(10) });
    expect(id).toBe(8);
  });

  test('a failing migration rolls back completely: v2 tables, data and user_version untouched', async () => {
    // Same data, but without the CHECK constraints, so a bad old row passes v2 and trips the new table.
    const relaxed = V2_SCHEMA.replace("CHECK(type IN ('in','out'))", '').replace('CHECK(amount > 0)', '');
    const raw = v2Db(relaxed);
    raw.exec(`INSERT INTO entries (id, source_id, type, amount, note, date) VALUES (99, 1, 'in', 0, NULL, '2026-10-07T00:00:00.000Z')`);
    const before = { e: rows(raw, 'SELECT * FROM entries ORDER BY id'), s: rows(raw, 'SELECT * FROM sources ORDER BY id') };

    const db = load(raw);
    await expect(db.initDb()).rejects.toThrow();

    expect(userVersion(raw)).toBe(2);
    expect(tables(raw)).toEqual(['accounts', 'entries', 'sources']); // no account_sources, no *_v2 leftovers
    expect(rows(raw, 'SELECT * FROM entries ORDER BY id')).toEqual(before.e);
    expect(rows(raw, 'SELECT * FROM sources ORDER BY id')).toEqual(before.s);
    expect(raw.prepare('PRAGMA table_info(sources)').all().map((c) => (c as { name: string }).name)).toContain('account_id');
  });

  test('a database that fails once migrates fine after the data is fixed', async () => {
    const raw = v2Db(V2_SCHEMA.replace('CHECK(amount > 0)', ''));
    raw.exec(`INSERT INTO entries (id, source_id, type, amount, note, date) VALUES (99, 1, 'in', 0, NULL, '2026-10-07T00:00:00.000Z')`);
    await expect(load(raw).initDb()).rejects.toThrow();
    raw.exec('DELETE FROM entries WHERE id = 99');
    await load(raw).initDb();
    expect(userVersion(raw)).toBe(3);
  });

  test('copies hisaab.db and its -wal/-shm files to hisaab-pre-v3.db before migrating, db file last', async () => {
    const raw = v2Db();
    await load(raw).initDb();
    expect(mockFs.copies).toEqual([
      `${DIR}/hisaab.db-wal -> ${DIR}/hisaab-pre-v3.db-wal`,
      `${DIR}/hisaab.db -> ${DIR}/hisaab-pre-v3.db`,
    ]);
    expect(userVersion(raw)).toBe(3);
  });

  test('does not copy again when hisaab-pre-v3.db already exists, and never deletes it', async () => {
    mockFs.files.add(`${DIR}/hisaab-pre-v3.db`);
    await load(v2Db()).initDb();
    expect(mockFs.copies).toEqual([]);
    expect(mockFs.files.has(`${DIR}/hisaab-pre-v3.db`)).toBe(true);
  });

  test('no copy on a fresh install or an already migrated database', async () => {
    await load(new DatabaseSync(':memory:')).initDb();
    const raw = v2Db();
    await load(raw).initDb();
    mockFs.copies = [];
    mockFs.files.delete(`${DIR}/hisaab-pre-v3.db`);
    await load(raw).initDb(); // user_version is already 3
    expect(mockFs.copies).toEqual([]);
  });

  test('a failed copy stops the migration and leaves v2 untouched', async () => {
    mockFs.failCopy = true;
    const raw = v2Db();
    await expect(load(raw).initDb()).rejects.toThrow(/disk full/);
    expect(userVersion(raw)).toBe(2);
    expect(tables(raw)).toEqual(['accounts', 'entries', 'sources']);
  });

  test('refuses a database from a newer schema', async () => {
    const raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA user_version = 4');
    await expect(load(raw).initDb()).rejects.toThrow(/newer version/);
  });
});

describe('migration v1 -> v2 -> v3', () => {
  test('a v1 database goes all the way to v3 with every entry and balance kept', async () => {
    const raw = v1Db();
    const oldBalances = rows(raw, `SELECT account_id AS id, SUM(CASE WHEN type='in' THEN amount ELSE -amount END) AS b FROM entries GROUP BY account_id`) as { id: number; b: number }[];
    const oldRows = rows(raw, 'SELECT id, type, amount, note, date FROM entries ORDER BY id');

    const db = load(raw);
    await db.initDb();

    expect(userVersion(raw)).toBe(3);
    expect(tables(raw)).toEqual(V3_TABLES); // v1 and v2 leftovers are gone
    const accounts = await db.getAccounts();
    for (const o of oldBalances) expect(accounts.find((a) => a.id === o.id)!.balance).toBe(o.b);
    expect(accounts.map((a) => [a.name, a.balance, a.sourceCount])).toEqual([['Meezan', 5900000, 3], ['JazzCash', 60000, 2], ['Empty', 0, 0]]);
    expect(await db.getTotal()).toBe(5960000);

    // "Salary" and "General" exist in both accounts, as one source each
    expect((await db.getAllSources()).map((s) => [s.name, s.total, s.accountCount])).toEqual([['Salary', 6100000, 2], ["Mamu's money", 250000, 1], ['General', -390000, 2]]);
    expect((await db.getAccountSources(1)).map((p) => [p.sourceName, p.balance, p.totalIn, p.totalOut])).toEqual([
      ['Salary', 6000000, 6000000, 0],
      ["Mamu's money", 250000, 250000, 0],
      ['General', -350000, 0, 350000],
    ]);
    const exported = await db.exportData();
    expect(exported.entries.map(({ id, type, amount, note, date }) => ({ id, type, amount, note, date }))).toEqual(oldRows);
    expect(await db.getTotal()).toBe(5960000);
  });

  test('copies both hisaab-pre-v2.db (v1 data) and hisaab-pre-v3.db (v2 data), in that order', async () => {
    await load(v1Db()).initDb();
    expect(mockFs.copies).toEqual([
      `${DIR}/hisaab.db-wal -> ${DIR}/hisaab-pre-v2.db-wal`,
      `${DIR}/hisaab.db -> ${DIR}/hisaab-pre-v2.db`,
      `${DIR}/hisaab.db-wal -> ${DIR}/hisaab-pre-v3.db-wal`,
      `${DIR}/hisaab.db -> ${DIR}/hisaab-pre-v3.db`,
    ]);
  });

  test('a failing v1 migration rolls back completely: old tables, data and user_version untouched', async () => {
    // Same data, but without the CHECK constraints, so a bad old row passes v1 and trips the new table.
    const relaxed = V1_SCHEMA.replace("CHECK(type IN ('in','out'))", '').replace('CHECK(amount > 0)', '');
    const raw = v1Db(relaxed);
    raw.exec(`INSERT INTO entries (id, account_id, type, amount, source, note, date) VALUES (99, 1, 'transfer', 5, NULL, NULL, '2026-10-07T00:00:00.000Z')`);
    const before = rows(raw, 'SELECT * FROM entries ORDER BY id');

    await expect(load(raw).initDb()).rejects.toThrow();

    expect(userVersion(raw)).toBe(1);
    expect(tables(raw)).toEqual(['accounts', 'entries', 'sources']);
    expect(rows(raw, 'SELECT * FROM entries ORDER BY id')).toEqual(before);
    expect(raw.prepare('PRAGMA table_info(entries)').all().map((c) => (c as { name: string }).name)).toContain('account_id');
    expect(raw.prepare('SELECT COUNT(*) AS n FROM sources').get()).toMatchObject({ n: 3 }); // the v1 global sources are back
  });
});

describe('fresh install', () => {
  const fresh = () => load(new DatabaseSync(':memory:'));

  test('starts empty at schema 3', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = load(raw);
    await db.initDb();
    expect(userVersion(raw)).toBe(3);
    expect(tables(raw)).toEqual(V3_TABLES);
    expect(await db.getAccounts()).toEqual([]);
    expect(await db.getAllSources()).toEqual([]);
    expect(await db.getTotal()).toBe(0);
  });

  test('accounts: balance is the sum of its entries, rename, unknown id', async () => {
    const db = fresh();
    const a = await db.addAccount('  Meezan ');
    const b = await db.addAccount('JazzCash');
    const s = await db.addSource('Salary');
    await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 100000, date: D(1) });
    await db.addEntry({ accountId: a, sourceId: s, type: 'out', amount: 25000, date: D(2) });
    await db.addEntry({ accountId: b, sourceId: s, type: 'in', amount: 7000, date: D(3) });

    expect(await db.getAccount(a)).toMatchObject({ name: 'Meezan', balance: 75000, sourceCount: 1 });
    expect(await db.getTotal()).toBe(82000);
    expect((await db.getAccounts()).reduce((sum, x) => sum + x.balance, 0)).toBe(await db.getTotal());
    expect(await db.getAccount(999)).toBeNull();
    await expect(db.addAccount('  ')).rejects.toThrow(/name is required/);
    await db.renameAccount(a, 'Meezan Bank');
    expect((await db.getAccount(a))!.name).toBe('Meezan Bank');
  });

  test('sources are global: trimmed, unique case-insensitively with a clear error; rename', async () => {
    const db = fresh();
    const s = await db.addSource(' Salary ');
    const t = await db.addSource('Rent');
    expect((await db.getAllSources()).map((x) => x.name)).toEqual(['Rent', 'Salary']); // no accounts needed
    await expect(db.addSource(' SALARY ')).rejects.toThrow('A source named "SALARY" already exists');
    await expect(db.addSource('   ')).rejects.toThrow(/name is required/);
    await expect(db.renameSource(t, 'salary')).rejects.toThrow(/already exists/);
    await db.renameSource(s, 'SALARY'); // changing only the case of its own name is allowed
    expect((await db.getSourceSummary(s))!.source.name).toBe('SALARY');
    await expect(db.renameSource(999, 'x')).rejects.toThrow(/not found/);
  });

  test('source totals add up across accounts; the summary lists accounts by balance desc', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const b = await db.addAccount('B');
    const c = await db.addAccount('C');
    const salary = await db.addSource('Salary');
    const mamu = await db.addSource('Mamu');
    const idle = await db.addSource('Idle');
    await db.addEntry({ accountId: a, sourceId: salary, type: 'in', amount: 1000, date: D(1) });
    await db.addEntry({ accountId: a, sourceId: salary, type: 'out', amount: 200, date: D(2) });
    await db.addEntry({ accountId: b, sourceId: salary, type: 'in', amount: 5000, date: D(3) });
    await db.addEntry({ accountId: c, sourceId: salary, type: 'out', amount: 300, date: D(4) });
    await db.addEntry({ accountId: a, sourceId: mamu, type: 'in', amount: 400, date: D(5) });
    await db.linkSource(c, idle);

    const summary = (await db.getSourceSummary(salary))!;
    expect(summary).toMatchObject({ source: { id: salary, name: 'Salary' }, total: 5500, totalIn: 6000, totalOut: 500 });
    expect(summary.accounts.map((x) => [x.accountName, x.balance, x.totalIn, x.totalOut, x.lastEntryDate])).toEqual([
      ['B', 5000, 5000, 0, D(3)],
      ['A', 800, 1000, 200, D(2)],
      ['C', -300, 0, 300, D(4)],
    ]);
    expect(await db.getSourceSummary(999)).toBeNull();

    // ordered by total desc, then name; an unused source is 0 with no date
    const all = await db.getAllSources();
    expect(all.map((s) => [s.name, s.total, s.accountCount, s.lastEntryDate])).toEqual([['Salary', 5500, 3, D(4)], ['Mamu', 400, 1, D(5)], ['Idle', 0, 1, null]]);
    // grand total is unchanged by how it is grouped
    expect(all.reduce((sum, s) => sum + s.total, 0)).toBe(await db.getTotal());
    expect((await db.getAccounts()).reduce((sum, x) => sum + x.balance, 0)).toBe(await db.getTotal());
  });

  test('getAccountSources: only linked sources, balance desc then name; getAccountSource; getUnlinkedSources', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const [zed, alpha, big, other] = [await db.addSource('zed'), await db.addSource('Alpha'), await db.addSource('Big'), await db.addSource('Other')];
    await db.linkSource(a, zed);
    await db.linkSource(a, alpha);
    await db.linkSource(a, big);
    await db.addEntry({ accountId: a, sourceId: big, type: 'in', amount: 10, date: D(1) });

    expect((await db.getAccountSources(a)).map((p) => [p.accountName, p.sourceName, p.balance])).toEqual([['A', 'Big', 10], ['A', 'Alpha', 0], ['A', 'zed', 0]]);
    expect(await db.getAccountSource(a, big)).toEqual({ accountId: a, accountName: 'A', sourceId: big, sourceName: 'Big', balance: 10, totalIn: 10, totalOut: 0, lastEntryDate: D(1) });
    expect(await db.getAccountSource(a, other)).toBeNull(); // not linked
    expect((await db.getUnlinkedSources(a)).map((s) => s.name)).toEqual(['Other']);
  });

  test('linkSource is a no-op when already linked and rejects unknown ids', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const s = await db.addSource('S');
    await db.linkSource(a, s);
    await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 5, date: D(1) });
    await db.linkSource(a, s);
    expect((await db.getAccountSources(a)).map((p) => p.balance)).toEqual([5]); // entries untouched
    await expect(db.linkSource(999, s)).rejects.toThrow(/Account not found/);
    await expect(db.linkSource(a, 999)).rejects.toThrow(/Source not found/);
  });

  test('ledger: each pair has its own, newest first with running balance oldest to newest; edit and delete update it', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const b = await db.addAccount('B');
    const s = await db.addSource('Salary');
    const e1 = await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 1000, date: D(1) });
    const e2 = await db.addEntry({ accountId: a, sourceId: s, type: 'out', amount: 300, date: D(2) });
    const e3 = await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 50, date: D(3) });
    const other = await db.addEntry({ accountId: b, sourceId: s, type: 'in', amount: 9999, date: D(2) });
    expect((await db.getLedger(a, s)).map((r) => [r.id, r.runningBalance])).toEqual([[e3, 750], [e2, 700], [e1, 1000]]);
    expect((await db.getLedger(b, s)).map((r) => [r.id, r.runningBalance])).toEqual([[other, 9999]]);
    expect(await db.getEntry(e2)).toEqual({ id: e2, accountId: a, sourceId: s, type: 'out', amount: 300, date: D(2) });
    expect(await db.getLedger(a, 999)).toEqual([]);

    // entries added out of date order are still summed oldest to newest; same date breaks ties by id
    const early = await db.addEntry({ accountId: a, sourceId: s, type: 'out', amount: 100, date: D(1) });
    expect((await db.getLedger(a, s)).map((r) => [r.id, r.runningBalance])).toEqual([[e3, 650], [e2, 600], [early, 900], [e1, 1000]]);

    await db.updateEntry(e2, { accountId: a, sourceId: s, type: 'out', amount: 500, date: D(2) });
    expect((await db.getLedger(a, s)).map((r) => r.runningBalance)).toEqual([450, 400, 900, 1000]);
    await db.deleteEntry(e1);
    expect((await db.getLedger(a, s)).map((r) => r.runningBalance)).toEqual([-550, -600, -100]);
    expect(await db.getEntry(e1)).toBeNull();
  });

  test('addEntry links the pair automatically, in one transaction, and rejects bad input', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const b = await db.addAccount('B');
    const s = await db.addSource('S');
    expect(await db.getAccountSource(a, s)).toBeNull();
    await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 100, date: D(1) });
    expect(await db.getAccountSource(a, s)).toMatchObject({ balance: 100 }); // linked now
    expect(await db.getAccountSource(b, s)).toBeNull(); // only that account
    expect((await db.getUnlinkedSources(a))).toEqual([]);
    expect((await db.getUnlinkedSources(b)).map((x) => x.name)).toEqual(['S']);

    for (const bad of [0, -5, 1.5, NaN]) {
      await expect(db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: bad, date: D(1) })).rejects.toThrow(/positive whole number/);
    }
    await expect(db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 1, date: 'soon' })).rejects.toThrow(/date/);
    await expect(db.addEntry({ accountId: a, sourceId: s, type: 'x' as never, amount: 1, date: D(1) })).rejects.toThrow(/type/);
    await expect(db.addEntry({ accountId: a, sourceId: 999, type: 'in', amount: 1, date: D(1) })).rejects.toThrow(/Source not found/);
    await expect(db.addEntry({ accountId: 999, sourceId: s, type: 'in', amount: 1, date: D(1) })).rejects.toThrow(/Account not found/);
    expect(await db.getTotal()).toBe(100); // nothing was half-written
  });

  test('updateEntry may change the source (auto-link) but rejects another account', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const b = await db.addAccount('B');
    const s = await db.addSource('S');
    const t = await db.addSource('T');
    const e = await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 100, date: D(1) });

    await expect(db.updateEntry(e, { accountId: b, sourceId: s, type: 'in', amount: 100, date: D(1) })).rejects.toThrow(/another account/);
    expect(await db.getEntry(e)).toMatchObject({ accountId: a, sourceId: s }); // unchanged
    expect(await db.getAccountSource(b, s)).toBeNull(); // and no stray link

    await db.updateEntry(e, { accountId: a, sourceId: t, type: 'out', amount: 70, date: D(2) });
    expect(await db.getEntry(e)).toEqual({ id: e, accountId: a, sourceId: t, type: 'out', amount: 70, date: D(2) });
    expect(await db.getAccountSource(a, t)).toMatchObject({ balance: -70 }); // linked automatically
    expect(await db.getAccountSource(a, s)).toMatchObject({ balance: 0 }); // the old link stays

    await expect(db.updateEntry(999, { accountId: a, sourceId: s, type: 'in', amount: 1, date: D(1) })).rejects.toThrow(/Entry not found/);
    await expect(db.updateEntry(e, { accountId: a, sourceId: 999, type: 'in', amount: 1, date: D(1) })).rejects.toThrow(/Source not found/);
    await expect(db.updateEntry(e, { accountId: a, sourceId: s, type: 'in', amount: 0, date: D(1) })).rejects.toThrow(/positive whole number/);
  });

  test('unlinkSource removes only its own pair: entries and link', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = load(raw);
    const a = await db.addAccount('A');
    const b = await db.addAccount('B');
    const s = await db.addSource('S');
    const t = await db.addSource('T');
    await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 100, date: D(1) });
    await db.addEntry({ accountId: a, sourceId: t, type: 'in', amount: 20, date: D(1) });
    await db.addEntry({ accountId: b, sourceId: s, type: 'in', amount: 3, date: D(1) });

    await db.unlinkSource(a, s);
    expect(await db.getAccountSource(a, s)).toBeNull();
    expect(await db.getLedger(a, s)).toEqual([]);
    expect((await db.getLedger(a, t)).map((r) => r.amount)).toEqual([20]); // same account, other source
    expect((await db.getLedger(b, s)).map((r) => r.amount)).toEqual([3]); // same source, other account
    expect(await db.getTotal()).toBe(23);
    expect((await db.getUnlinkedSources(a)).map((x) => x.name)).toEqual(['S']);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM sources').get()).toMatchObject({ n: 2 }); // the source itself stays
    await db.unlinkSource(a, s); // already gone: harmless
  });

  test('deleteSource removes it from every account with all its entries', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = load(raw);
    const a = await db.addAccount('A');
    const b = await db.addAccount('B');
    const s = await db.addSource('S');
    const t = await db.addSource('T');
    await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 100, date: D(1) });
    await db.addEntry({ accountId: b, sourceId: s, type: 'in', amount: 5, date: D(1) });
    await db.addEntry({ accountId: a, sourceId: t, type: 'in', amount: 200, date: D(1) });

    await db.deleteSource(s);
    expect(await db.getSourceSummary(s)).toBeNull();
    expect((await db.getAllSources()).map((x) => x.name)).toEqual(['T']);
    expect(await db.getTotal()).toBe(200);
    expect(await db.getAccount(a)).toMatchObject({ balance: 200, sourceCount: 1 });
    expect(await db.getAccount(b)).toMatchObject({ balance: 0, sourceCount: 0 });
    expect(raw.prepare('SELECT (SELECT COUNT(*) FROM account_sources) AS l, (SELECT COUNT(*) FROM entries) AS e').get()).toMatchObject({ l: 1, e: 1 });
  });

  test('deleteAccount removes its links and entries but the sources stay', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = load(raw);
    const a = await db.addAccount('A');
    const b = await db.addAccount('B');
    const s = await db.addSource('S');
    const idle = await db.addSource('Idle');
    await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 100, date: D(1) });
    await db.addEntry({ accountId: b, sourceId: s, type: 'in', amount: 5, date: D(1) });
    await db.linkSource(a, idle);

    await db.deleteAccount(a);
    expect(await db.getAccount(a)).toBeNull();
    expect((await db.getAllSources()).map((x) => [x.name, x.total, x.accountCount])).toEqual([['S', 5, 1], ['Idle', 0, 0]]);
    expect(await db.getTotal()).toBe(5);
    expect(raw.prepare('SELECT (SELECT COUNT(*) FROM account_sources) AS l, (SELECT COUNT(*) FROM entries) AS e').get()).toMatchObject({ l: 1, e: 1 });
    expect((await db.getUnlinkedSources(b)).map((x) => x.name)).toEqual(['Idle']);
  });

  test('export then import round-trips as version 3, keeping ids, links and notes', async () => {
    const db = load(v2Db());
    const backup = await db.exportData();
    expect(backup.version).toBe(3);
    expect(backup.accountSources).toHaveLength(6);

    const other = fresh();
    await other.addAccount('Will be replaced');
    await other.importData(JSON.parse(JSON.stringify(backup)));
    const again = await other.exportData();
    expect({ ...again, exportedAt: '' }).toEqual({ ...backup, exportedAt: '' });
  });

  test('imports version 1, 2 and 3 backups', async () => {
    const db = fresh();
    await db.importData({
      version: 1, exportedAt: 'x',
      accounts: [{ id: 1, name: 'Meezan', createdAt: D(1) }, { id: 2, name: 'Cash', createdAt: D(1) }],
      sources: [{ id: 1, name: 'Salary' }],
      entries: [
        { id: 1, accountId: 1, type: 'in', amount: 5000, source: 'Salary', note: 'n', date: D(2) },
        { id: 2, accountId: 1, type: 'out', amount: 1200, source: null, note: null, date: D(3) },
        { id: 3, accountId: 2, type: 'in', amount: 800, source: 'salary', note: null, date: D(3) },
      ],
    });
    expect((await db.getAllSources()).map((s) => [s.name, s.total, s.accountCount])).toEqual([['Salary', 5800, 2], ['General', -1200, 1]]);
    expect(await db.getTotal()).toBe(4600);
    expect((await db.exportData()).entries[0].note).toBe('n');

    await db.importData({
      version: 2, exportedAt: 'x',
      accounts: [{ id: 5, name: 'Cash', createdAt: D(1) }, { id: 6, name: 'Bank', createdAt: D(1) }],
      sources: [{ id: 9, accountId: 5, name: 'Pocket', createdAt: D(4) }, { id: 10, accountId: 6, name: ' pocket', createdAt: D(2) }],
      entries: [{ id: 1, sourceId: 9, type: 'in', amount: 777, date: D(2) }, { id: 2, sourceId: 10, type: 'in', amount: 3, date: D(2) }],
    });
    expect((await db.getAccounts()).map((a) => [a.id, a.name, a.balance])).toEqual([[5, 'Cash', 777], [6, 'Bank', 3]]);
    expect((await db.getAllSources()).map((s) => [s.name, s.total, s.accountCount])).toEqual([['pocket', 780, 2]]); // earliest spelling wins

    await db.importData({
      version: 3, exportedAt: 'x',
      accounts: [{ id: 5, name: 'Cash', createdAt: D(1) }, { id: 6, name: 'Bank', createdAt: D(1) }],
      sources: [{ id: 9, name: 'Pocket', createdAt: D(1) }, { id: 12, name: 'Idle', createdAt: D(1) }],
      accountSources: [{ accountId: 5, sourceId: 9, createdAt: D(1) }, { accountId: 6, sourceId: 9, createdAt: D(1) }, { accountId: 6, sourceId: 12, createdAt: D(1) }],
      entries: [{ id: 4, accountId: 6, sourceId: 9, type: 'out', amount: 50, date: D(2), note: 'kept' }],
    });
    expect((await db.getAccountSources(6)).map((p) => [p.sourceId, p.sourceName, p.balance])).toEqual([[12, 'Idle', 0], [9, 'Pocket', -50]]);
    expect((await db.getAccountSources(5)).map((p) => [p.sourceId, p.balance])).toEqual([[9, 0]]);
    expect((await db.exportData()).entries[0]).toMatchObject({ id: 4, note: 'kept' });
  });

  test('a bad file is rejected and the existing data is left alone', async () => {
    const db = fresh();
    const a = await db.addAccount('Keep me');
    const s = await db.addSource('S');
    await db.addEntry({ accountId: a, sourceId: s, type: 'in', amount: 500, date: D(1) });
    const bad = [
      null, 'nope', { version: 9 },
      { version: 2, accounts: [], sources: [], entries: [{ id: 1, sourceId: 1, type: 'in', amount: 5, date: D(1) }] },
      { version: 3, accounts: [], sources: [], accountSources: [], entries: [{ id: 1, accountId: 1, sourceId: 1, type: 'in', amount: 5, date: D(1) }] },
      { version: 1, accounts: [{ id: 1, name: 'x', createdAt: D(1) }], sources: [], entries: [{ id: 1, accountId: 1, type: 'in', amount: -1, source: null, note: null, date: D(1) }] },
    ];
    for (const data of bad) await expect(db.importData(data)).rejects.toThrow(/Invalid backup/);
    expect((await db.getAccounts()).map((x) => x.name)).toEqual(['Keep me']);
    expect(await db.getTotal()).toBe(500);
  });
});
