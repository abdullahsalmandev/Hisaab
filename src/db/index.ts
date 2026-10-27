import type { AccountWithBalance, BackupFile, Entry, NewEntry, Source } from '../types';

const todo = (): never => { throw new Error('not implemented'); };

export async function initDb(): Promise<void> { return todo(); }
export async function getAccounts(): Promise<AccountWithBalance[]> { return todo(); }
export async function getAccount(id: number): Promise<AccountWithBalance | null> { return todo(); }
export async function getTotal(): Promise<number> { return todo(); }
export async function addAccount(name: string): Promise<number> { return todo(); }
export async function renameAccount(id: number, name: string): Promise<void> { return todo(); }
export async function deleteAccount(id: number): Promise<void> { return todo(); }
export async function getEntries(accountId: number): Promise<Entry[]> { return todo(); }
export async function getEntry(id: number): Promise<Entry | null> { return todo(); }
export async function addEntry(e: NewEntry): Promise<number> { return todo(); }
export async function updateEntry(id: number, e: NewEntry): Promise<void> { return todo(); }
export async function deleteEntry(id: number): Promise<void> { return todo(); }
export async function getSources(): Promise<Source[]> { return todo(); }
export async function addSource(name: string): Promise<void> { return todo(); }
export async function exportData(): Promise<BackupFile> { return todo(); }
export async function importData(data: BackupFile): Promise<void> { return todo(); }
