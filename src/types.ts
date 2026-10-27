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
