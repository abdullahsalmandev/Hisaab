# Hisaab contract

Parallel sessions build against this file. Everything marked FROZEN must not change in any session.

## FROZEN: `src/types.ts`

```ts
export type EntryType = 'in' | 'out';
export interface Account { id: number; name: string; createdAt: string; }
export interface AccountWithBalance extends Account { balance: number; } // paisa
export interface Entry { id: number; accountId: number; type: EntryType; amount: number; source: string | null; note: string | null; date: string; } // amount in paisa, date ISO
export interface NewEntry { accountId: number; type: EntryType; amount: number; source: string | null; note: string | null; date: string; }
export interface Source { id: number; name: string; }
export interface BackupFile { version: 1; exportedAt: string; accounts: Account[]; entries: Entry[]; sources: Source[]; }
export type RootStackParamList = {
  Home: undefined;
  Account: { accountId: number };
  EntryForm: { accountId: number; type: EntryType; entryId?: number };
  Settings: undefined;
};
```

## FROZEN: `src/db/index.ts` exports

```ts
initDb(): Promise<void>
getAccounts(): Promise<AccountWithBalance[]>
getAccount(id: number): Promise<AccountWithBalance | null>
getTotal(): Promise<number>
addAccount(name: string): Promise<number>
renameAccount(id: number, name: string): Promise<void>
deleteAccount(id: number): Promise<void>
getEntries(accountId: number): Promise<Entry[]>
getEntry(id: number): Promise<Entry | null>
addEntry(e: NewEntry): Promise<number>
updateEntry(id: number, e: NewEntry): Promise<void>
deleteEntry(id: number): Promise<void>
getSources(): Promise<Source[]>
addSource(name: string): Promise<void>
exportData(): Promise<BackupFile>
importData(data: BackupFile): Promise<void>
```

Exactly these exports, no more, no fewer. The scaffold bodies throw `not implemented` until the Database session fills them in.

## FROZEN: shared helpers

- `src/utils/money.ts`: `toPaisa(input: string): number | null`, `formatMoney(paisa: number): string`. Fully written, with `src/utils/money.test.ts`.
- `src/theme.ts`: `useTheme()` returns `{ colors, spacing }`. Colors: `background`, `card`, `text`, `muted`, `border`, `primary`, `inColor`, `outColor`.

## Conventions

- All money is integer paisa. Dates are ISO strings.
- Each screen is the default export of its file (`export default function XScreen`).
- No network calls anywhere. No dependencies beyond those already in `package.json`.

## File ownership

| Session | Owns |
| --- | --- |
| Database | `src/db/**` |
| Home | `src/screens/HomeScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/components/home/**` |
| Account | `src/screens/AccountScreen.tsx`, `src/screens/EntryFormScreen.tsx`, `src/components/account/**` |
| Build | `app.json`, `eas.json`, `BUILD.md`, `.gitignore` |
| Integration (last) | `App.tsx`, `README.md`, tests, and fixes anywhere |

## Parallel rules

- No installing packages.
- No git commits.
- No editing files outside your ownership.
- No repo-wide formatters.
