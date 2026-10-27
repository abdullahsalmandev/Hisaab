# Hisaab
Nothing just needed an app my way.....

Hisaab is a small personal money tracker for Android. You keep several accounts (a bank, a mobile wallet, cash) and a list of sources, one per person or origin of money. A source is global, like a contact: it can be used in many accounts, and each account has its own khata and balance for it. Amounts are stored as whole paisa, so there are no rounding errors.

## Features

- Multiple accounts; an account balance is the sum of its entries, and the home screen shows the total across all accounts
- Global sources (Salary, Allowance, Mamu's money, or your own) created once and added to as many accounts as you like
- Source totals across accounts: a Sources tab and a source page show the total, money in and money out for a source, and its balance in each account
- Khata-style ledger for each account and source: date, time, money out and money in columns, with the running balance after every entry
- Money in and money out recorded per account and source; edit an entry, move it to another source of the same account, or delete it
- Rename a source everywhere at once, remove it from one account, or delete it entirely; rename or delete accounts (their sources stay)
- Backup v3 export and import as a JSON file; backups from v1 and v2 are still accepted and converted

All data stays on your phone. No internet, no account, no server.

To build the APK yourself, see [BUILD.md](BUILD.md).
