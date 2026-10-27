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
