export type EntryType = 'in' | 'out';
export interface Account { id: number; name: string; createdAt: string; }
export interface AccountWithBalance extends Account { balance: number; sourceCount: number; }
export interface Source { id: number; name: string; createdAt: string; }
export interface SourceWithTotal extends Source { total: number; accountCount: number; lastEntryDate: string | null; }
export interface AccountSourceBalance { accountId: number; accountName: string; sourceId: number; sourceName: string; balance: number; totalIn: number; totalOut: number; lastEntryDate: string | null; }
export interface SourceSummary { source: Source; total: number; totalIn: number; totalOut: number; accounts: AccountSourceBalance[]; }
export interface Entry { id: number; accountId: number; sourceId: number; type: EntryType; amount: number; date: string; }
export interface LedgerRow extends Entry { runningBalance: number; }
export interface NewEntry { accountId: number; sourceId: number; type: EntryType; amount: number; date: string; }
export interface BackupFile { version: 3; exportedAt: string; accounts: Account[]; sources: Source[]; accountSources: { accountId: number; sourceId: number; createdAt: string }[]; entries: (Entry & { note?: string | null })[]; }
export type RootStackParamList = {
  Home: undefined;
  Account: { accountId: number };
  Ledger: { accountId: number; sourceId: number };
  SourceDetail: { sourceId: number };
  EntryForm: { accountId: number; sourceId: number; type: EntryType; entryId?: number };
  Settings: undefined;
};
