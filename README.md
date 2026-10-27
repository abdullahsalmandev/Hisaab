# Hisaab
Nothing just needed an app my way.....

Hisaab is a small personal money tracker for Android. You keep several accounts (a bank, a mobile wallet, cash). Each account holds sources, one per person or origin of money, and each source is its own khata with its own balance. Amounts are stored as whole paisa, so there are no rounding errors.

## Features

- Multiple accounts; an account balance is the sum of its sources, and the home screen shows the total across all accounts
- Per-account sources (Salary, Allowance, Mamu's money, or your own), each with its own balance, total in and total out
- Khata-style ledger per source: date, time, money out and money in columns, with the running balance after every entry
- Money in and money out recorded per source; edit an entry, move it to another source of the same account, or delete it
- Rename or delete sources and accounts
- Backup v2 export and import as a JSON file; backups from v1 are still accepted and converted

All data stays on your phone. No internet, no account, no server.

To build the APK yourself, see [BUILD.md](BUILD.md).
