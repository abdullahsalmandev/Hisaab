// Pure functions behind src/db/index.ts. No SQLite here, so they are easy to test.
import type { Entry, LedgerRow, Source } from '../types';

export type EntryWithNote = Entry & { note?: string | null };
export interface Link { accountId: number; sourceId: number; createdAt: string; }

// Schema-v2 rows, as stored in the v2 tables and in version 2 backups: a source belongs to one account.
export interface V2Source { id: number; accountId: number; name: string; createdAt: string; }
export interface V2Entry { id: number; sourceId: number; type: 'in' | 'out'; amount: number; date: string; note?: string | null; }

// A schema-v1 entry, as stored in the old table and in version 1 backups.
export interface V1Entry { id: number; accountId: number; type: 'in' | 'out'; amount: number; source: string | null; note: string | null; date: string; }

const key = (accountId: number, name: string) => `${accountId}|${name.toLowerCase()}`;

// v1 -> v2: one source per distinct (account, trimmed name, case-insensitive). Entries without a source go to "General".
// Ids are assigned in order of first use by entry id, so the result is deterministic. Entry ids are kept.
// Old global sources that no entry used are dropped: they belonged to no account.
export function convertV1(entries: V1Entry[]): { sources: V2Source[]; entries: V2Entry[] } {
  const byKey = new Map<string, V2Source>();
  const out: V2Entry[] = [];
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

// v2 -> v3: old per-account sources with the same trimmed, case-insensitive name become ONE global source. The earliest created
// one (then the lowest id) lends its spelling and createdAt, and global ids follow that order. Every old source becomes one link
// (account, global source) with its own createdAt. Entries keep id, type, amount, date and note and gain the account of their old source.
export function mergeV2(sources: V2Source[], entries: V2Entry[]): { sources: Source[]; accountSources: Link[]; entries: EntryWithNote[] } {
  const oldestFirst = [...sources].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id));
  const global = new Map<string, Source>();
  const links = new Map<string, Link>();
  const linkOf = new Map<number, Link>(); // old source id -> its link
  for (const s of oldestFirst) {
    const name = s.name.trim();
    let g = global.get(name.toLowerCase());
    if (!g) global.set(name.toLowerCase(), (g = { id: global.size + 1, name, createdAt: s.createdAt }));
    let l = links.get(`${s.accountId}|${g.id}`);
    if (!l) links.set(`${s.accountId}|${g.id}`, (l = { accountId: s.accountId, sourceId: g.id, createdAt: s.createdAt }));
    linkOf.set(s.id, l);
  }
  return {
    sources: [...global.values()],
    accountSources: [...links.values()],
    entries: entries.map((e) => {
      const l = linkOf.get(e.sourceId);
      if (!l) throw new Error(`Entry ${e.id} refers to missing source ${e.sourceId}`);
      return { id: e.id, accountId: l.accountId, sourceId: l.sourceId, type: e.type, amount: e.amount, date: e.date, note: e.note ?? null };
    }),
  };
}

// Newest first. runningBalance is the ledger balance (one account and source) right after that entry, summed oldest to newest (date, then id).
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

export interface ValidBackup { accounts: { id: number; name: string; createdAt: string }[]; sources: Source[]; accountSources: Link[]; entries: EntryWithNote[]; }

// Accepts a version 1, 2 or 3 backup (as parsed JSON), returns it as v3 rows. Throws a clear Error on the first problem,
// before anything is written. The table constraints stay as a second line of defence.
export function parseBackup(data: unknown): ValidBackup {
  if (!isRecord(data)) throw new Error('Invalid backup: not a Hisaab backup file');
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) throw new Error('Invalid backup: unsupported or missing version (expected 1, 2 or 3)');
  const keys = data.version === 1 ? (['accounts', 'entries', 'sources'] as const) : data.version === 2 ? (['accounts', 'sources', 'entries'] as const) : (['accounts', 'sources', 'accountSources', 'entries'] as const);
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
    const v2 = convertV1(v1 as V1Entry[]);
    return { accounts: cleanAccounts, ...mergeV2(v2.sources, v2.entries) };
  }

  const sources = data.sources as Record<string, unknown>[];
  const sourceIds = new Set<number>();
  const names = new Set<string>();
  sources.forEach((s, i) => {
    if (!isId(s?.id)) bad('source', i, 'has an invalid id');
    if (sourceIds.has(s.id as number)) bad('source', i, `repeats id ${s.id}`);
    if (data.version === 2 && !accountIds.has(s.accountId as number)) bad('source', i, `refers to account ${s.accountId}, which is not in the backup`);
    if (!isText(s.name)) bad('source', i, 'has no name');
    if (!isText(s.createdAt)) bad('source', i, 'has no createdAt');
    // v2 names are unique per account, v3 names are unique globally
    const k = key(data.version === 2 ? (s.accountId as number) : 0, (s.name as string).trim());
    if (names.has(k)) bad('source', i, `repeats the name "${s.name}"${data.version === 2 ? ' within its account' : ''}`);
    names.add(k);
    sourceIds.add(s.id as number);
  });

  if (data.version === 2) {
    entries.forEach((e, i) => {
      common(e, i);
      noRepeat(e, i);
      if (!sourceIds.has(e.sourceId as number)) bad('entry', i, `refers to source ${e.sourceId}, which is not in the backup`);
    });
    const v2Sources = sources.map((s) => ({ id: s.id as number, accountId: s.accountId as number, name: (s.name as string).trim(), createdAt: s.createdAt as string }));
    const v2Entries = entries.map((e) => ({ id: e.id as number, sourceId: e.sourceId as number, type: e.type as 'in' | 'out', amount: e.amount as number, date: e.date as string, note: (e.note as string | null | undefined) ?? null }));
    return { accounts: cleanAccounts, ...mergeV2(v2Sources, v2Entries) };
  }

  const links = new Set<string>();
  (data.accountSources as Record<string, unknown>[]).forEach((l, i) => {
    if (!accountIds.has(l?.accountId as number)) bad('link', i, `refers to account ${l?.accountId}, which is not in the backup`);
    if (!sourceIds.has(l.sourceId as number)) bad('link', i, `refers to source ${l.sourceId}, which is not in the backup`);
    if (!isText(l.createdAt)) bad('link', i, 'has no createdAt');
    const k = `${l.accountId}|${l.sourceId}`;
    if (links.has(k)) bad('link', i, `repeats the link ${k}`);
    links.add(k);
  });
  entries.forEach((e, i) => {
    common(e, i);
    noRepeat(e, i);
    if (!accountIds.has(e.accountId as number)) bad('entry', i, `refers to account ${e.accountId}, which is not in the backup`);
    if (!sourceIds.has(e.sourceId as number)) bad('entry', i, `refers to source ${e.sourceId}, which is not in the backup`);
    if (!links.has(`${e.accountId}|${e.sourceId}`)) bad('entry', i, `uses source ${e.sourceId} in account ${e.accountId}, which are not linked`);
  });
  return {
    accounts: cleanAccounts,
    sources: sources.map((s) => ({ id: s.id as number, name: (s.name as string).trim(), createdAt: s.createdAt as string })),
    accountSources: (data.accountSources as Record<string, unknown>[]).map((l) => ({ accountId: l.accountId as number, sourceId: l.sourceId as number, createdAt: l.createdAt as string })),
    entries: entries.map((e) => ({ id: e.id as number, accountId: e.accountId as number, sourceId: e.sourceId as number, type: e.type as 'in' | 'out', amount: e.amount as number, date: e.date as string, note: (e.note as string | null | undefined) ?? null })),
  };
}
