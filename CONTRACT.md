# Hisaab contract (v1.1)

Parallel sessions build against this file. Everything marked FROZEN must not change in any session.

Concept: an account holds sources (one per person or origin, like a khata). Every entry belongs to one source. A source balance is its ins minus its outs, an account balance is the sum of its sources, and the total is the sum of all accounts. All amounts are integer paisa. Entries have a date and time (ISO string) and no note in the UI; the `note` column stays in the database only so old notes are not lost.

## FROZEN: `src/types.ts`

```ts
export type EntryType = 'in' | 'out';
export interface Account { id: number; name: string; createdAt: string; }
export interface AccountWithBalance extends Account { balance: number; sourceCount: number; }
export interface Source { id: number; accountId: number; name: string; createdAt: string; }
export interface SourceWithBalance extends Source { balance: number; totalIn: number; totalOut: number; lastEntryDate: string | null; }
export interface Entry { id: number; sourceId: number; type: EntryType; amount: number; date: string; }
export interface LedgerRow extends Entry { runningBalance: number; }
export interface NewEntry { sourceId: number; type: EntryType; amount: number; date: string; }
export interface BackupFile { version: 2; exportedAt: string; accounts: Account[]; sources: Source[]; entries: (Entry & { note?: string | null })[]; }
export type RootStackParamList = {
  Home: undefined;
  Account: { accountId: number };
  Source: { sourceId: number };
  EntryForm: { sourceId: number; type: EntryType; entryId?: number };
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
getSources(accountId: number): Promise<SourceWithBalance[]>   // balance desc, then name
getSource(id: number): Promise<SourceWithBalance | null>
addSource(accountId: number, name: string): Promise<number>   // trimmed; duplicate name in the account (case-insensitive) throws a clear Error
renameSource(id: number, name: string): Promise<void>         // same duplicate rule
deleteSource(id: number): Promise<void>                       // cascades its entries
getLedger(sourceId: number): Promise<LedgerRow[]>             // newest first, runningBalance after each entry
getEntry(id: number): Promise<Entry | null>
addEntry(e: NewEntry): Promise<number>
updateEntry(id: number, e: NewEntry): Promise<void>           // may move to another source of the SAME account; another account throws
deleteEntry(id: number): Promise<void>
exportData(): Promise<BackupFile>
importData(data: unknown): Promise<void>                      // accepts parsed JSON of version 1 or 2, validates everything, throws a clear Error
```

Exactly these exports, no more, no fewer. Behaviour and schema are documented in `src/db/README.md`. Mutations throw `Error` with a message that is safe to show in an Alert.

## FROZEN: `src/theme.ts`

Light theme only. Static exports, no hook: `import { colors, accountColors, avatarTints, radius, fonts } from '../theme'`.

- `colors`: `background #F3F2EE`, `card #FFFFFF`, `cardAlt #FAF9F6`, `border #E4E2DA`, `hairline #EEECE5`, `borderStrong #D6D3C8`, `text #17181A`, `textSecondary #3A3C42`, `muted #5E6066`, `chevron #9A9CA1`, `primary #1C2B4A`, `onPrimary #FFFFFF`, `onPrimaryMuted #C7D0E3`, `primarySoft #E3EAF6`, `inColor #157A4A`, `outColor #B3261E`, `chip #F1EFE8`, `dashed #A9A69B`, `scrim rgba(23, 24, 26, 0.45)` (behind modals)
- `accountColors`: `['#F2B544', '#7FA3D9', '#E58F6B', '#8CC2A4', '#B9A3E0']`, pick by account index
- `avatarTints`: 5 `{ bg, fg }` pairs, pick by source index
- `radius`: `card 20`, `hero 24`, `button 18`, `pill 22`, `small 8`
- `fonts`: `regular Manrope_500Medium`, `semibold Manrope_600SemiBold`, `bold Manrope_700Bold`, `heavy Manrope_800ExtraBold`. Set `fontFamily` from these and do not combine with `fontWeight`.

App.tsx loads the fonts before rendering, so screens can use them directly.

## FROZEN: shared helpers

- `src/utils/money.ts`: `toPaisa(input: string): number | null`, `formatMoney(paisa: number): string`.

## Conventions

- Each screen is the default export of its file (`export default function XScreen`).
- No network calls anywhere. No dependencies beyond those already in `package.json`.
- `src/components/account/helpers.ts` (`formatDate`, `toDateInput`, `parseDateInput`, `paisaToInput`) may be imported by any session; only the Account session edits it.
- `SettingsScreen` must hand the parsed backup JSON straight to `importData` and accept versions 1 and 2. Its old check (`version !== 1`) rejects v2 files and must be replaced; `importData` does the real validation.
- Schema changes are append-only: the app is installed with real data. See `src/db/README.md`.

## File ownership (v1.1)

| Session | Owns |
| --- | --- |
| Home | `src/screens/HomeScreen.tsx`, `src/screens/SettingsScreen.tsx`, `src/components/home/**` |
| Account | `src/screens/AccountScreen.tsx`, `src/screens/SourceScreen.tsx`, `src/components/account/**` |
| Entry | `src/screens/EntryFormScreen.tsx`, `src/components/entry/**` |
| Build | `app.json`, `eas.json`, `BUILD.md`, `.gitignore` |
| Integration (last) | `App.tsx`, `README.md`, tests, and fixes anywhere |

`src/types.ts`, `src/db/**`, `src/theme.ts` and `src/utils/money.ts` are frozen: no session edits them.

Note for the Build session: `app.json` still has `userInterfaceStyle: "automatic"`, but the theme is light only.

## Parallel rules

- No installing packages.
- No git commits.
- Edit only your own files.
- No repo-wide formatters.
