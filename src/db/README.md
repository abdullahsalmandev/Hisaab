# src/db

SQLite storage for Hisaab via `expo-sqlite` (async API). One shared connection to `hisaab.db`, opened and migrated on first use; `initDb()` just forces that early. `PRAGMA foreign_keys = ON` is set on every open.

## Schema (user_version 1)

```sql
accounts(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL            -- ISO string
)

entries(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK(type IN ('in','out')),
  amount     INTEGER NOT NULL CHECK(amount > 0),   -- paisa
  source     TEXT,                    -- only for 'in'; null for 'out'
  note       TEXT,
  date       TEXT NOT NULL            -- ISO string
)

sources(
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
)

CREATE INDEX entries_account_date ON entries(account_id, date);
```

`sources` is seeded once, in migration 1, with Salary, Allowance, Mamu's money.

## Migrations

`MIGRATIONS` in `index.ts` is an ordered array of SQL strings. On open, every migration at index >= `PRAGMA user_version` runs in its own transaction together with the `user_version` bump. To change the schema, append a new string; never edit an existing one.

## Rules

- Balances are never stored: `SUM(CASE WHEN type='in' THEN amount ELSE -amount END)`. An account with no entries has balance 0.
- `getAccounts`: `created_at` ascending (id as tiebreak). `getEntries`: `date` descending, then `id` descending. `getSources`: by name.
- `addEntry` / `updateEntry`: the source insert and the entry write run in one transaction. For type `in`, the source is trimmed and also `INSERT OR IGNORE`d into `sources`; for type `out`, source is stored as null. Notes are trimmed, empty becomes null.
- Account and source names are trimmed. `addSource` ignores an empty name.
- snake_case columns are aliased to the camelCase fields in `src/types.ts`.
- `exportData` reads all three tables inside one transaction (a consistent snapshot) and sets `version: 1` and `exportedAt` to now.
- `importData` validates the whole backup before touching the database and throws a clear `Error` on the first problem: `version === 1`, arrays present, ids are positive integers, names and dates are non-empty text, entry `type` is `'in'` or `'out'`, `amount` is a positive whole number, and every entry's `accountId` exists in the backup's accounts. It then deletes all rows and inserts the backup rows, keeping ids, in one transaction; table constraints roll the import back as a second line of defence.
