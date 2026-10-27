// Pure functions behind src/db/index.ts. No SQLite here, so they are easy to test.
import type { Entry, LedgerRow, Source } from '../types';

export type EntryWithNote = Entry & { note?: string | null };

// A schema-v1 entry, as stored in the old table and in version 1 backups.
export interface V1Entry { id: number; accountId: number; type: 'in' | 'out'; amount: number; source: string | null; note: string | null; date: string; }

const key = (accountId: number, name: string) => `${accountId}|${name.toLowerCase()}`;

// v1 -> v2: one source per distinct (account, trimmed name, case-insensitive). Entries without a source go to "General".
// Ids are assigned in order of first use by entry id, so the result is deterministic. Entry ids are kept.
// Old global sources that no entry used are dropped: they belonged to no account.
export function convertV1(entries: V1Entry[]): { sources: Source[]; entries: EntryWithNote[] } {
  const byKey = new Map<string, Source>();
  const out: EntryWithNote[] = [];
  for (const e of [...entries].sort((a, b) => a.id - b.id)) {
    const name = e.source?.trim() || 'General';
    const k = key(e.accountId, name);
    let s = byKey.get(k);
    if (!s) {
      s = { id: byKey.size + 1, accountId: e.accountId, name, createdAt: e.date };
      byKey.set(k, s);
    } else if (e.date < s.createdAt) {
      s.createdAt = e.date; // a source is as old as its oldest entry
    }
    out.push({ id: e.id, sourceId: s.id, type: e.type, amount: e.amount, date: e.date, note: e.note });
  }
  return { sources: [...byKey.values()], entries: out };
}

// Newest first. runningBalance is the source balance right after that entry, summed oldest to newest (date, then id).
export function withRunningBalance(entries: Entry[]): LedgerRow[] {
  const asc = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  let balance = 0;
  return asc
    .map((e) => ({ ...e, runningBalance: (balance += e.type === 'in' ? e.amount : -e.amount) }))
    .reverse();
}

const isId = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;
const isText = (s: unknown): s is string => typeof s === 'string' && s.trim() !== '';
const isDate = (s: unknown): s is string => isText(s) && !Number.isNaN(Date.parse(s));
const isTextOrNull = (s: unknown) => s == null || typeof s === 'string';
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export interface ValidBackup { accounts: { id: number; name: string; createdAt: string }[]; sources: Source[]; entries: EntryWithNote[]; }

// Accepts a version 1 or version 2 backup (as parsed JSON), returns it as v2 rows. Throws a clear Error on the first problem,
// before anything is written. The table constraints stay as a second line of defence.
export function parseBackup(data: unknown): ValidBackup {
  if (!isRecord(data)) throw new Error('Invalid backup: not a Hisaab backup file');
  if (data.version !== 1 && data.version !== 2) throw new Error('Invalid backup: unsupported or missing version (expected 1 or 2)');
  const keys = data.version === 1 ? (['accounts', 'entries', 'sources'] as const) : (['accounts', 'sources', 'entries'] as const);
  for (const k of keys) {
    if (!Array.isArray(data[k])) throw new Error(`Invalid backup: "${k}" must be an array`);
  }
  const bad = (what: string, i: number, why: string): never => {
    throw new Error(`Invalid backup: ${what} #${i + 1} ${why}`);
  };

  const accounts = data.accounts as Record<string, unknown>[];
  const accountIds = new Set<number>();
  accounts.forEach((a, i) => {
    if (!isId(a?.id)) bad('account', i, 'has an invalid id');
    if (accountIds.has(a.id as number)) bad('account', i, `repeats id ${a.id}`);
    if (!isText(a.name)) bad('account', i, 'has no name');
    if (!isText(a.createdAt)) bad('account', i, 'has no createdAt');
    accountIds.add(a.id as number);
  });
  const cleanAccounts = accounts.map((a) => ({ id: a.id as number, name: a.name as string, createdAt: a.createdAt as string }));

  const entries = data.entries as Record<string, unknown>[];
  const common = (e: Record<string, unknown>, i: number) => {
    if (!isId(e?.id)) bad('entry', i, 'has an invalid id');
    if (e.type !== 'in' && e.type !== 'out') bad('entry', i, `has type "${String(e.type)}" (expected "in" or "out")`);
    if (!isId(e.amount)) bad('entry', i, 'amount must be a positive whole number of paisa');
    if (!isDate(e.date)) bad('entry', i, 'has no valid date');
    if (!isTextOrNull(e.note)) bad('entry', i, 'has a non-text note');
  };
  const entryIds = new Set<number>();
  const noRepeat = (e: Record<string, unknown>, i: number) => {
    if (entryIds.has(e.id as number)) bad('entry', i, `repeats id ${e.id}`);
    entryIds.add(e.id as number);
  };

  if (data.version === 1) {
    entries.forEach((e, i) => {
      common(e, i);
      noRepeat(e, i);
      if (!accountIds.has(e.accountId as number)) bad('entry', i, `refers to account ${e.accountId}, which is not in the backup`);
      if (!isTextOrNull(e.source)) bad('entry', i, 'has a non-text source');
    });
    const v1 = entries.map((e) => ({ id: e.id, accountId: e.accountId, type: e.type, amount: e.amount, source: e.source ?? null, note: e.note ?? null, date: e.date }));
    return { accounts: cleanAccounts, ...convertV1(v1 as V1Entry[]) };
  }

  const sources = data.sources as Record<string, unknown>[];
  const sourceIds = new Set<number>();
  const names = new Set<string>();
  sources.forEach((s, i) => {
    if (!isId(s?.id)) bad('source', i, 'has an invalid id');
    if (sourceIds.has(s.id as number)) bad('source', i, `repeats id ${s.id}`);
    if (!accountIds.has(s.accountId as number)) bad('source', i, `refers to account ${s.accountId}, which is not in the backup`);
    if (!isText(s.name)) bad('source', i, 'has no name');
    if (!isText(s.createdAt)) bad('source', i, 'has no createdAt');
    const k = key(s.accountId as number, (s.name as string).trim());
    if (names.has(k)) bad('source', i, `repeats the name "${s.name}" within its account`);
    names.add(k);
    sourceIds.add(s.id as number);
  });
  entries.forEach((e, i) => {
    common(e, i);
    noRepeat(e, i);
    if (!sourceIds.has(e.sourceId as number)) bad('entry', i, `refers to source ${e.sourceId}, which is not in the backup`);
  });
  return {
    accounts: cleanAccounts,
    sources: sources.map((s) => ({ id: s.id as number, accountId: s.accountId as number, name: (s.name as string).trim(), createdAt: s.createdAt as string })),
    entries: entries.map((e) => ({ id: e.id as number, sourceId: e.sourceId as number, type: e.type as 'in' | 'out', amount: e.amount as number, date: e.date as string, note: (e.note as string | null | undefined) ?? null })),
  };
}
