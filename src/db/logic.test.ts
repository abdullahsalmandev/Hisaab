import { convertV1, parseBackup, withRunningBalance, type V1Entry } from './logic';

const e1 = (id: number, accountId: number, type: 'in' | 'out', amount: number, source: string | null, date: string, note: string | null = null): V1Entry =>
  ({ id, accountId, type, amount, source, note, date });

const sample: V1Entry[] = [
  e1(1, 1, 'in', 5000000, 'Salary', '2026-10-01T05:00:00.000Z'),
  e1(2, 1, 'in', 1000000, ' salary ', '2026-10-03T05:00:00.000Z', 'bonus'),
  e1(3, 1, 'out', 300000, null, '2026-10-04T05:00:00.000Z', 'groceries'),
  e1(4, 1, 'in', 250000, "Mamu's money", '2026-10-05T05:00:00.000Z'),
  e1(5, 2, 'in', 100000, 'Salary', '2026-10-02T05:00:00.000Z'),
  e1(6, 2, 'out', 40000, '  ', '2026-10-06T05:00:00.000Z'),
  e1(7, 1, 'out', 50000, null, '2026-09-30T05:00:00.000Z'),
];

describe('convertV1', () => {
  const r = convertV1(sample);
  const name = (id: number) => r.sources.find((s) => s.id === id)!;

  test('one source per account and distinct trimmed, case-insensitive name', () => {
    expect(r.sources.map((s) => [s.accountId, s.name])).toEqual([
      [1, 'Salary'], [1, 'General'], [1, "Mamu's money"], [2, 'Salary'], [2, 'General'],
    ]);
  });

  test('"General" exists only for accounts that have unsourced entries', () => {
    const noGeneral = convertV1([e1(1, 1, 'in', 100, 'Salary', '2026-10-01T00:00:00.000Z')]);
    expect(noGeneral.sources.map((s) => s.name)).toEqual(['Salary']);
    expect(convertV1([]).sources).toEqual([]);
  });

  test('entries keep id, type, amount, date and note; sourceId points into the same account', () => {
    expect(r.entries).toHaveLength(sample.length);
    for (const o of sample) {
      const n = r.entries.find((x) => x.id === o.id)!;
      expect([n.type, n.amount, n.date, n.note]).toEqual([o.type, o.amount, o.date, o.note]);
      expect(name(n.sourceId).accountId).toBe(o.accountId);
    }
  });

  test('balances per account are unchanged', () => {
    const signed = (x: { type: string; amount: number }) => (x.type === 'in' ? x.amount : -x.amount);
    for (const acc of [1, 2]) {
      const before = sample.filter((o) => o.accountId === acc).reduce((s, o) => s + signed(o), 0);
      const after = r.entries.filter((n) => name(n.sourceId).accountId === acc).reduce((s, n) => s + signed(n), 0);
      expect(after).toBe(before);
    }
  });

  test('a source is as old as its oldest entry; same name in two accounts stays separate', () => {
    expect(r.sources.find((s) => s.accountId === 1 && s.name === 'General')!.createdAt).toBe('2026-09-30T05:00:00.000Z');
    expect(r.sources.filter((s) => s.name === 'Salary')).toHaveLength(2);
  });
});

describe('withRunningBalance', () => {
  const en = (id: number, type: 'in' | 'out', amount: number, date: string) => ({ id, sourceId: 1, type, amount, date });

  test('newest first, balance right after each entry', () => {
    const rows = withRunningBalance([
      en(2, 'out', 300, '2026-10-02T00:00:00.000Z'),
      en(1, 'in', 1000, '2026-10-01T00:00:00.000Z'),
      en(3, 'in', 50, '2026-10-03T00:00:00.000Z'),
    ]);
    expect(rows.map((r) => [r.id, r.runningBalance])).toEqual([[3, 750], [2, 700], [1, 1000]]);
  });

  test('same timestamp is ordered by id; can go negative; empty is empty', () => {
    const t = '2026-10-01T00:00:00.000Z';
    const rows = withRunningBalance([en(2, 'out', 500, t), en(1, 'in', 200, t)]);
    expect(rows.map((r) => [r.id, r.runningBalance])).toEqual([[2, -300], [1, 200]]);
    expect(withRunningBalance([])).toEqual([]);
  });

  test('does not depend on input order and does not mutate it', () => {
    const input = [en(1, 'in', 10, '2026-10-01T00:00:00.000Z'), en(2, 'in', 5, '2026-10-02T00:00:00.000Z')];
    const copy = [...input];
    expect(withRunningBalance(input.reverse()).map((r) => r.runningBalance)).toEqual([15, 10]);
    expect(input).toEqual(copy.reverse());
  });
});

describe('parseBackup', () => {
  const v1 = {
    version: 1, exportedAt: 'x',
    accounts: [{ id: 1, name: 'Meezan', createdAt: '2026-10-01T00:00:00.000Z' }],
    sources: [{ id: 1, name: 'Salary' }],
    entries: [
      { id: 1, accountId: 1, type: 'in', amount: 5000, source: 'Salary', note: 'n', date: '2026-10-02T00:00:00.000Z' },
      { id: 2, accountId: 1, type: 'out', amount: 100, source: null, note: null, date: '2026-10-03T00:00:00.000Z' },
    ],
  };
  const v2 = {
    version: 2, exportedAt: 'x',
    accounts: [{ id: 1, name: 'Meezan', createdAt: '2026-10-01T00:00:00.000Z' }],
    sources: [{ id: 7, accountId: 1, name: 'Salary', createdAt: '2026-10-01T00:00:00.000Z' }],
    entries: [{ id: 1, sourceId: 7, type: 'in', amount: 5000, date: '2026-10-02T00:00:00.000Z' }],
  };

  test('v1 is converted to v2 rows, notes kept', () => {
    const r = parseBackup(v1);
    expect(r.sources.map((s) => s.name)).toEqual(['Salary', 'General']);
    expect(r.entries.map((e) => [e.id, e.sourceId, e.note])).toEqual([[1, 1, 'n'], [2, 2, null]]);
  });

  test('v2 is accepted as is (note optional)', () => {
    const r = parseBackup(v2);
    expect(r.sources).toEqual(v2.sources);
    expect(r.entries[0]).toMatchObject({ id: 1, sourceId: 7, note: null });
  });

  const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
  const mut = (base: object, f: (b: any) => void) => { const b = clone(base); f(b); return b; };

  test.each([
    ['null', null, /not a Hisaab backup/],
    ['a string', 'hello', /not a Hisaab backup/],
    ['wrong version', mut(v2, (b) => { b.version = 3; }), /version/],
    ['v2 entries not an array', mut(v2, (b) => { b.entries = {}; }), /"entries" must be an array/],
    ['v1 bad type', mut(v1, (b) => { b.entries[0].type = 'transfer'; }), /type "transfer"/],
    ['v1 zero amount', mut(v1, (b) => { b.entries[0].amount = 0; }), /amount/],
    ['v1 unknown account', mut(v1, (b) => { b.entries[0].accountId = 9; }), /account 9/],
    ['v2 negative amount', mut(v2, (b) => { b.entries[0].amount = -5; }), /amount/],
    ['v2 fractional amount', mut(v2, (b) => { b.entries[0].amount = 10.5; }), /amount/],
    ['v2 string amount', mut(v2, (b) => { b.entries[0].amount = '100'; }), /amount/],
    ['v2 unknown source', mut(v2, (b) => { b.entries[0].sourceId = 99; }), /source 99/],
    ['v2 source of unknown account', mut(v2, (b) => { b.sources[0].accountId = 5; }), /account 5/],
    ['v2 duplicate source name in account', mut(v2, (b) => { b.sources.push({ id: 8, accountId: 1, name: ' salary ', createdAt: 'x' }); }), /repeats the name/],
    ['v2 bad date', mut(v2, (b) => { b.entries[0].date = 'yesterday'; }), /date/],
    ['v2 repeated entry id', mut(v2, (b) => { b.entries.push({ ...b.entries[0] }); }), /repeats id 1/],
    ['empty account name', mut(v2, (b) => { b.accounts[0].name = ' '; }), /account #1 has no name/],
    ['null account row', mut(v2, (b) => { b.accounts = [null]; }), /invalid id/],
  ])('rejects: %s', (_n, data, message) => {
    expect(() => parseBackup(data)).toThrow(message);
  });
});
