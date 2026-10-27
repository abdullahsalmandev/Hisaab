import { importData } from './index';
import type { BackupFile } from '../types';

// expo-sqlite can't load under jest (expo-asset sits nested under expo); validation never reaches it anyway.
jest.mock('expo-sqlite', () => ({}));

// All of these must be rejected by validation before any SQLite call happens.
const good: BackupFile = {
  version: 1,
  exportedAt: '2026-10-27T00:00:00.000Z',
  accounts: [{ id: 1, name: 'Meezan', createdAt: '2026-10-01T00:00:00.000Z' }],
  sources: [{ id: 1, name: 'Salary' }],
  entries: [{ id: 1, accountId: 1, type: 'in', amount: 5000, source: 'Salary', note: null, date: '2026-10-02T00:00:00.000Z' }],
};
const withEntry = (patch: object) => ({ ...good, entries: [{ ...good.entries[0], ...patch }] }) as unknown as BackupFile;

test.each([
  ['wrong version', { ...good, version: 2 } as unknown as BackupFile, /version/],
  ['entries not an array', { ...good, entries: {} } as unknown as BackupFile, /"entries" must be an array/],
  ['bad type', withEntry({ type: 'transfer' }), /type "transfer"/],
  ['zero amount', withEntry({ amount: 0 }), /amount/],
  ['negative amount', withEntry({ amount: -5 }), /amount/],
  ['fractional amount', withEntry({ amount: 10.5 }), /amount/],
  ['string amount', withEntry({ amount: '100' }), /amount/],
  ['unknown account', withEntry({ accountId: 99 }), /account 99/],
  ['no date', withEntry({ date: '' }), /date/],
  ['empty account name', { ...good, accounts: [{ ...good.accounts[0], name: ' ' }] }, /account #1 has no name/],
  ['null account row', { ...good, accounts: [null] } as unknown as BackupFile, /invalid id/],
])('importData rejects: %s', async (_name, data, message) => {
  await expect(importData(data)).rejects.toThrow(message);
});
