// Only what the db tests use of Node's built-in SQLite (src/db/sqliteTestShim.ts, src/db/db.test.ts).
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
      all(...params: unknown[]): Record<string, unknown>[];
      get(...params: unknown[]): Record<string, unknown> | undefined;
    };
  }
}
