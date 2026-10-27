# src/db

SQLite storage for Hisaab via `expo-sqlite` (async API). One shared connection to `hisaab.db`, opened and migrated on first use; `initDb()` just forces that early. `PRAGMA foreign_keys = ON` is set on every open.

Files: `index.ts` (the frozen API, all SQL), `logic.ts` (pure functions: v1 and v2 conversion, running balance, backup validation), tests next to them. `sqliteTestShim.ts` and `node-sqlite.d.ts` exist only for tests. The tests use Node's built-in `node:sqlite`, so `npm test` needs Node 22.5 or newer.

## Schema (user_version 3)

```sql
accounts(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL)

sources(                                   -- global, like contacts
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL
)

account_sources(                           -- which accounts use which source
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_id  INTEGER NOT NULL REFERENCES sources(id)  ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, source_id)
)

entries(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  source_id  INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK(type IN ('in','out')),
  amount     INTEGER NOT NULL CHECK(amount > 0),   -- paisa
  note       TEXT,                                 -- kept from v1, never written or shown since v1.1
  date       TEXT NOT NULL,                        -- ISO string
  FOREIGN KEY (account_id, source_id) REFERENCES account_sources(account_id, source_id) ON DELETE CASCADE
)

CREATE INDEX entries_account_source_date ON entries(account_id, source_id, date);
```

A fresh install creates this directly with no seeded rows. A database with a higher `user_version` than this app knows is refused with a clear error rather than touched.

An entry can only exist for a linked pair, so unlinking a pair, deleting a source, or deleting an account removes the entries it covers through the composite foreign key (`unlinkSource` also deletes them explicitly, in the same transaction).

## Migrations

Migrations run in order on open: a v1 database goes v1 -> v2 -> v3, a v2 database v2 -> v3. Each step is one way, runs in ONE transaction (the `user_version` bump is inside it), and verifies its result before it drops the old tables. Any mismatch throws, the transaction rolls back, and the previous version's data and `user_version` stay exactly as they were. The app then shows "Could not open the database" instead of continuing, and the next launch tries again.

Before each step, `hisaab.db` (and any `-wal` / `-shm`) is copied to `hisaab-pre-v2.db` / `hisaab-pre-v3.db` in the same directory, only if that copy does not exist yet. The sidecars are copied first and the main file last, so an existing copy means the copy is complete. If the copy fails, the migration does not run. The app never deletes these files. For a v1 database `hisaab-pre-v2.db` holds the v1 data and `hisaab-pre-v3.db` the migrated v2 data.

### v1 -> v2

1. The v1 `entries` and `sources` tables are renamed to `entries_v1` and `sources_v1`.
2. The v2 tables are created (a per-account `sources` table and `entries(source_id)`).
3. `convertV1` (in `logic.ts`) turns the old rows into v2 rows: one source per account and distinct entry source name (trimmed, case-insensitive; the first spelling wins), entries without a source go to a source named "General" in their account (created only if needed). Entry ids, type, amount, note and date are copied unchanged. A source's `created_at` is the date of its oldest entry. Old global sources that no entry used are dropped, because they belonged to no account.
4. Checks: same entry count, every copied entry still matches its old row and sits in a source of its old account, every account balance identical.
5. `entries_v1` and `sources_v1` are dropped.

### v2 -> v3

1. The v2 `entries` and `sources` tables are renamed to `entries_v2` and `sources_v2`, and the v3 tables are created.
2. `mergeV2` (in `logic.ts`) merges the old per-account sources by trimmed, case-insensitive name into one global source. The earliest created one (then the lowest old id) lends its spelling and `created_at`, and the new ids follow that order. Every old source becomes one `account_sources` row with its own `created_at`, so an empty source stays linked.
3. Every entry is copied keeping id, type, amount, note and date. Its `account_id` comes from its old source's account and its `source_id` is the merged source.
4. Checks: same entry count and every entry unchanged (including its account), every account balance identical, every (account, old source name) balance identical, same number of pairs.
5. `entries_v2` and `sources_v2` are dropped.

The same `convertV1` and `mergeV2` are used when importing a version 1 or 2 backup, so an old backup lands exactly as an old database would.

## Rules

- Balances are never stored. A pair balance is its ins minus its outs; an account balance is the sum of its entries; a source total is the sum of its entries across all accounts; the grand total is the sum of all entries.
- Orders: `getAccounts` by `created_at` then id. `getAllSources` by total desc, then name (case-insensitive). `getSourceSummary` accounts and `getAccountSources` by balance desc, then name. `getUnlinkedSources` by name. `getLedger` is newest first (date, then id); `runningBalance` is computed oldest to newest (date asc, id asc) in JS, per (account, source) pair.
- Names are trimmed. An empty name throws. A source name already used (any letter case) throws `A source named "X" already exists`.
- `linkSource` is a no-op when the pair is linked; an unknown account or source throws `Account not found` / `Source not found`.
- `addEntry` / `updateEntry` validate type, a positive integer amount and a parseable date, and link the pair if needed, in one transaction. `updateEntry` may change the source but never the account (`An entry cannot be moved to another account`); the old pair stays linked even if it is now empty. It never touches `note`.
- Deleting a source removes it from every account with all its entries. Deleting an account removes its links and entries; sources stay.
- `exportData` reads all four tables in one transaction (`version: 3`, entries include `note`).
- `importData(data: unknown)` accepts versions 1, 2 and 3 and validates the whole file before deleting anything: ids are unique positive integers, names and `createdAt` are non-empty text, dates parse, `type` is `'in'` or `'out'`, `amount` is a positive whole number, every reference points to an existing row, and source names are unique (per account in v2, globally in v3). A v3 file must also link every pair that has entries and must not repeat a link. It then replaces all rows in one transaction, keeping ids (v1 and v2 source ids are renumbered by the merge; entry and account ids are kept).
