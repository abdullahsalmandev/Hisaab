// Runs the real src/db module against a real (in-memory) SQLite engine through src/db/sqliteTestShim.
import { DatabaseSync } from 'node:sqlite';

jest.mock('expo-sqlite', () => require('./sqliteTestShim'));

type Db = typeof import('./index');

function load(raw: DatabaseSync): Db {
  (globalThis as unknown as { __testDb: DatabaseSync }).__testDb = raw;
  let mod!: Db;
  jest.isolateModules(() => { mod = require('./index'); });
  return mod;
}

// The exact v1 schema that is installed on the phone.
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
const userVersion = (raw: DatabaseSync) => (raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const tables = (raw: DatabaseSync) => (raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
const D = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;

describe('migration v1 -> v2', () => {
  test('keeps every entry and every balance, splits sources per account', async () => {
    const raw = v1Db();
    const oldBalances = raw.prepare(`SELECT account_id AS id, SUM(CASE WHEN type='in' THEN amount ELSE -amount END) AS b FROM entries GROUP BY account_id`).all() as { id: number; b: number }[];
    const oldRows = raw.prepare('SELECT id, type, amount, note, date FROM entries ORDER BY id').all().map((r) => ({ ...r }));

    const db = load(raw);
    await db.initDb();

    expect(userVersion(raw)).toBe(2);
    expect(tables(raw)).toEqual(['accounts', 'entries', 'sources']); // v1 leftovers are gone
    const accounts = await db.getAccounts();
    for (const o of oldBalances) expect(accounts.find((a) => a.id === o.id)!.balance).toBe(o.b);
    expect(accounts.map((a) => [a.name, a.balance, a.sourceCount])).toEqual([['Meezan', 5900000, 3], ['JazzCash', 60000, 2], ['Empty', 0, 0]]);
    expect(await db.getTotal()).toBe(5960000);

    const meezan = await db.getSources(1);
    expect(meezan.map((s) => [s.name, s.balance, s.totalIn, s.totalOut])).toEqual([
      ['Salary', 6000000, 6000000, 0],
      ["Mamu's money", 250000, 250000, 0],
      ['General', -350000, 0, 350000],
    ]);
    expect((await db.getSources(2)).map((s) => s.name).sort()).toEqual(['General', 'Salary']);

    // ids, amounts, types, dates and notes all survive; notes are only visible through the export
    const exported = await db.exportData();
    expect(exported.entries.map(({ id, type, amount, note, date }) => ({ id, type, amount, note, date }))).toEqual(oldRows);
    expect(exported.entries.find((e) => e.id === 3)!.note).toBe('groceries');
  });

  test('unused global v1 sources are dropped, and new ids continue after the old ones', async () => {
    const raw = v1Db();
    const db = load(raw);
    const id = await db.addEntry({ sourceId: (await db.getSources(1))[0].id, type: 'in', amount: 100, date: D(10) });
    expect(id).toBe(8);
    expect((await db.getSources(3))).toEqual([]);
  });

  test('a failing migration rolls back completely: old tables, data and user_version untouched', async () => {
    // Same data, but without the CHECK constraints, so a bad old row passes v1 and trips the new table.
    const relaxed = V1_SCHEMA.replace("CHECK(type IN ('in','out'))", '').replace('CHECK(amount > 0)', '');
    const raw = v1Db(relaxed);
    raw.exec(`INSERT INTO entries (id, account_id, type, amount, source, note, date) VALUES (99, 1, 'transfer', 5, NULL, NULL, '2026-10-07T00:00:00.000Z')`);
    const before = raw.prepare('SELECT * FROM entries ORDER BY id').all().map((r) => ({ ...r }));

    const db = load(raw);
    await expect(db.initDb()).rejects.toThrow();

    expect(userVersion(raw)).toBe(1);
    expect(tables(raw)).toEqual(['accounts', 'entries', 'sources']);
    expect(raw.prepare('SELECT * FROM entries ORDER BY id').all().map((r) => ({ ...r }))).toEqual(before);
    expect(raw.prepare('PRAGMA table_info(entries)').all().map((c) => (c as { name: string }).name)).toContain('account_id');
    expect(raw.prepare('SELECT COUNT(*) AS n FROM sources').get()).toMatchObject({ n: 3 }); // the v1 global sources are back
  });

  test('refuses a database from a newer schema', async () => {
    const raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA user_version = 3');
    await expect(load(raw).initDb()).rejects.toThrow(/newer version/);
  });
});

describe('fresh install', () => {
  const fresh = () => load(new DatabaseSync(':memory:'));

  test('starts empty at schema 2 with no seeded sources', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = load(raw);
    await db.initDb();
    expect(userVersion(raw)).toBe(2);
    expect(await db.getAccounts()).toEqual([]);
    expect(await db.getTotal()).toBe(0);
    expect(raw.prepare('SELECT COUNT(*) AS n FROM sources').get()).toMatchObject({ n: 0 });
  });

  test('accounts, sources and balances', async () => {
    const db = fresh();
    const a = await db.addAccount('  Meezan ');
    const b = await db.addAccount('JazzCash');
    const salary = await db.addSource(a, ' Salary ');
    const mamu = await db.addSource(a, "Mamu's money");
    const other = await db.addSource(b, 'Salary'); // same name, other account: fine
    await db.addEntry({ sourceId: salary, type: 'in', amount: 100000, date: D(1) });
    await db.addEntry({ sourceId: salary, type: 'out', amount: 25000, date: D(2) });
    await db.addEntry({ sourceId: mamu, type: 'in', amount: 90000, date: D(3) });
    await db.addEntry({ sourceId: other, type: 'in', amount: 7000, date: D(4) });

    expect((await db.getAccount(a))).toMatchObject({ name: 'Meezan', balance: 165000, sourceCount: 2 });
    expect(await db.getTotal()).toBe(172000);
    expect((await db.getAccounts()).reduce((s, x) => s + x.balance, 0)).toBe(await db.getTotal());
    expect(await db.getAccount(999)).toBeNull();

    const sources = await db.getSources(a); // balance desc: Salary 75000, Mamu 90000 -> Mamu first
    expect(sources.map((s) => [s.name, s.balance, s.totalIn, s.totalOut, s.lastEntryDate])).toEqual([
      ["Mamu's money", 90000, 90000, 0, D(3)],
      ['Salary', 75000, 100000, 25000, D(2)],
    ]);
    expect(await db.getSource(salary)).toMatchObject({ accountId: a, name: 'Salary', balance: 75000 });
    await db.renameAccount(a, 'Meezan Bank');
    expect((await db.getAccount(a))!.name).toBe('Meezan Bank');
  });

  test('ties on balance are ordered by name; empty source has null lastEntryDate', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    await db.addSource(a, 'zed');
    await db.addSource(a, 'Alpha');
    const s = await db.getSources(a);
    expect(s.map((x) => x.name)).toEqual(['Alpha', 'zed']);
    expect(s[0]).toMatchObject({ balance: 0, totalIn: 0, totalOut: 0, lastEntryDate: null });
  });

  test('source names are unique per account, case-insensitively, with a clear error', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const s = await db.addSource(a, 'Salary');
    const t = await db.addSource(a, 'Rent');
    await expect(db.addSource(a, ' SALARY ')).rejects.toThrow('A source named "SALARY" already exists in this account');
    await expect(db.addSource(a, '   ')).rejects.toThrow(/name is required/);
    await expect(db.renameSource(t, 'salary')).rejects.toThrow(/already exists/);
    await db.renameSource(s, 'SALARY'); // changing only the case of its own name is allowed
    expect((await db.getSource(s))!.name).toBe('SALARY');
    await expect(db.renameSource(999, 'x')).rejects.toThrow(/not found/);
  });

  test('ledger: newest first with running balance; edit, move and delete update it', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const s = await db.addSource(a, 'Salary');
    const s2 = await db.addSource(a, 'Rent');
    const e1 = await db.addEntry({ sourceId: s, type: 'in', amount: 1000, date: D(1) });
    const e2 = await db.addEntry({ sourceId: s, type: 'out', amount: 300, date: D(2) });
    const e3 = await db.addEntry({ sourceId: s, type: 'in', amount: 50, date: D(3) });
    expect((await db.getLedger(s)).map((r) => [r.id, r.runningBalance])).toEqual([[e3, 750], [e2, 700], [e1, 1000]]);
    expect(await db.getEntry(e2)).toEqual({ id: e2, sourceId: s, type: 'out', amount: 300, date: D(2) });

    await db.updateEntry(e2, { sourceId: s, type: 'out', amount: 500, date: D(2) });
    expect((await db.getLedger(s)).map((r) => r.runningBalance)).toEqual([550, 500, 1000]);

    await db.updateEntry(e2, { sourceId: s2, type: 'out', amount: 500, date: D(2) }); // same account: allowed
    expect((await db.getLedger(s)).map((r) => r.runningBalance)).toEqual([1050, 1000]);
    expect((await db.getSource(s2))!.balance).toBe(-500);

    await db.deleteEntry(e1);
    expect((await db.getLedger(s)).map((r) => r.runningBalance)).toEqual([50]); // only e3 is left in s
    expect(await db.getEntry(e1)).toBeNull();
  });

  test('updateEntry rejects another account and unknown ids; entries are validated', async () => {
    const db = fresh();
    const a = await db.addAccount('A');
    const b = await db.addAccount('B');
    const s = await db.addSource(a, 'S');
    const t = await db.addSource(b, 'T');
    const e = await db.addEntry({ sourceId: s, type: 'in', amount: 100, date: D(1) });
    await expect(db.updateEntry(e, { sourceId: t, type: 'in', amount: 100, date: D(1) })).rejects.toThrow(/same account/);
    expect(await db.getEntry(e)).toMatchObject({ sourceId: s }); // unchanged
    await expect(db.updateEntry(999, { sourceId: s, type: 'in', amount: 1, date: D(1) })).rejects.toThrow(/Entry not found/);
    await expect(db.updateEntry(e, { sourceId: 999, type: 'in', amount: 1, date: D(1) })).rejects.toThrow(/Source not found/);
    for (const bad of [0, -5, 1.5, NaN]) {
      await expect(db.addEntry({ sourceId: s, type: 'in', amount: bad, date: D(1) })).rejects.toThrow(/positive whole number/);
    }
    await expect(db.addEntry({ sourceId: s, type: 'in', amount: 1, date: 'soon' })).rejects.toThrow(/date/);
    await expect(db.addEntry({ sourceId: 999, type: 'in', amount: 1, date: D(1) })).rejects.toThrow(); // foreign key
  });

  test('deleting a source or an account cascades', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = load(raw);
    const a = await db.addAccount('A');
    const s = await db.addSource(a, 'S');
    const t = await db.addSource(a, 'T');
    await db.addEntry({ sourceId: s, type: 'in', amount: 100, date: D(1) });
    await db.addEntry({ sourceId: t, type: 'in', amount: 200, date: D(1) });
    await db.deleteSource(s);
    expect(await db.getTotal()).toBe(200);
    expect(await db.getSource(s)).toBeNull();
    await db.deleteAccount(a);
    expect(raw.prepare('SELECT (SELECT COUNT(*) FROM sources) AS s, (SELECT COUNT(*) FROM entries) AS e').get()).toMatchObject({ s: 0, e: 0 });
    expect(await db.getTotal()).toBe(0);
  });

  test('export then import round-trips, keeping ids and notes', async () => {
    const raw = v1Db();
    const db = load(raw);
    const backup = await db.exportData();
    expect(backup.version).toBe(2);

    const other = load(new DatabaseSync(':memory:'));
    await other.addAccount('Will be replaced');
    await other.importData(JSON.parse(JSON.stringify(backup)));
    const again = await other.exportData();
    expect({ ...again, exportedAt: '' }).toEqual({ ...backup, exportedAt: '' });
  });

  test('imports a version 1 backup (converted) and a version 2 backup', async () => {
    const db = fresh();
    await db.importData({
      version: 1, exportedAt: 'x',
      accounts: [{ id: 1, name: 'Meezan', createdAt: D(1) }],
      sources: [{ id: 1, name: 'Salary' }],
      entries: [
        { id: 1, accountId: 1, type: 'in', amount: 5000, source: 'Salary', note: 'n', date: D(2) },
        { id: 2, accountId: 1, type: 'out', amount: 1200, source: null, note: null, date: D(3) },
      ],
    });
    expect((await db.getSources(1)).map((s) => [s.name, s.balance])).toEqual([['Salary', 5000], ['General', -1200]]);
    expect(await db.getTotal()).toBe(3800);
    expect((await db.exportData()).entries[0].note).toBe('n');

    await db.importData({
      version: 2, exportedAt: 'x',
      accounts: [{ id: 5, name: 'Cash', createdAt: D(1) }],
      sources: [{ id: 9, accountId: 5, name: 'Pocket', createdAt: D(1) }],
      entries: [{ id: 1, sourceId: 9, type: 'in', amount: 777, date: D(2) }],
    });
    expect((await db.getAccounts()).map((a) => [a.id, a.name, a.balance])).toEqual([[5, 'Cash', 777]]);
  });

  test('a bad file is rejected and the existing data is left alone', async () => {
    const db = fresh();
    const a = await db.addAccount('Keep me');
    const s = await db.addSource(a, 'S');
    await db.addEntry({ sourceId: s, type: 'in', amount: 500, date: D(1) });
    const bad = [
      null, 'nope', { version: 9 },
      { version: 2, accounts: [], sources: [], entries: [{ id: 1, sourceId: 1, type: 'in', amount: 5, date: D(1) }] },
      { version: 1, accounts: [{ id: 1, name: 'x', createdAt: D(1) }], sources: [], entries: [{ id: 1, accountId: 1, type: 'in', amount: -1, source: null, note: null, date: D(1) }] },
    ];
    for (const data of bad) await expect(db.importData(data)).rejects.toThrow(/Invalid backup/);
    expect((await db.getAccounts()).map((x) => x.name)).toEqual(['Keep me']);
    expect(await db.getTotal()).toBe(500);
  });
});
