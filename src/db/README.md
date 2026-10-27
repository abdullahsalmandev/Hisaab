# src/db

SQLite storage for Hisaab via `expo-sqlite` (async API). One shared connection to `hisaab.db`, opened and migrated on first use; `initDb()` just forces that early. `PRAGMA foreign_keys = ON` is set on every open.

Files: `index.ts` (the frozen API, all SQL), `logic.ts` (pure functions: v1 conversion, running balance, backup validation), tests next to them. `sqliteTestShim.ts` and `node-sqlite.d.ts` exist only for tests.

## Schema (user_version 2)

```sql
accounts(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL)

sources(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (account_id, name COLLATE NOCASE)
)

entries(
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  type      TEXT NOT NULL CHECK(type IN ('in','out')),
  amount    INTEGER NOT NULL CHECK(amount > 0),   -- paisa
  note      TEXT,                                 -- kept from v1, never written or shown by v1.1
  date      TEXT NOT NULL                         -- ISO string
)

CREATE INDEX entries_source_date ON entries(source_id, date);
```

A fresh install creates this directly with no seeded sources. A database with a higher `user_version` than this app knows is refused with a clear error rather than touched.

## Migration v1 -> v2

Before anything changes, `hisaab.db` (and any `-wal` / `-shm`) is copied to `hisaab-pre-v2.db` in the same directory, only if that copy does not exist yet. The sidecars are copied first and the main file last, so an existing `hisaab-pre-v2.db` means the copy is complete. If the copy fails, the migration does not run. The app never deletes it.

Then the migration runs once, in ONE transaction (the `user_version` bump is inside it):

1. The v1 `entries` and `sources` tables are renamed to `entries_v1` and `sources_v1`.
2. The v2 `sources` and `entries` tables are created.
3. `convertV1` (in `logic.ts`) turns the old rows into v2 rows: one source per account and distinct entry source name (trimmed, case-insensitive; the first spelling wins), entries without a source go to a source named "General" in their account (created only if needed). Entry ids, type, amount, note and date are copied unchanged. A source's `created_at` is the date of its oldest entry. Old global sources that no entry used are dropped, because they belonged to no account.
4. Checks inside the transaction: same entry count, every copied entry still matches its old row and sits in a source of its old account, and every account balance is identical before and after. Any mismatch throws, the transaction rolls back, and the v1 data and `user_version = 1` stay exactly as they were. The app then shows "Could not open the database" instead of continuing.
5. Only then are `entries_v1` and `sources_v1` dropped.

The same `convertV1` is used when importing a version 1 backup.

## Rules

- Balances are never stored. A source balance is its ins minus its outs; an account balance is the sum of its sources; the total is the sum of all entries.
- Orders: `getAccounts` by `created_at` then id. `getSources` by balance desc, then name (case-insensitive). `getLedger` is newest first (date, then id); `runningBalance` is computed oldest to newest in JS.
- Names are trimmed. An empty name throws. A source name already used in the account (any letter case) throws `A source named "X" already exists in this account`.
- `addEntry` / `updateEntry` validate type, a positive integer amount and a parseable date. `updateEntry` may move an entry to another source of the same account only; a source in a different account throws. It never touches `note`.
- Deleting a source deletes its entries; deleting an account deletes its sources and their entries.
- `exportData` reads all three tables in one transaction (`version: 2`, entries include `note`).
- `importData(data: unknown)` accepts version 1 and 2 and validates the whole file before deleting anything: ids are unique positive integers, names and `createdAt` are non-empty text, dates parse, `type` is `'in'` or `'out'`, `amount` is a positive whole number, every entry points to an existing source (v1: account), every source to an existing account, and source names are unique per account. It then replaces all rows in one transaction, keeping ids.
