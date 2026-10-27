// Test double for the slice of expo-sqlite that src/db uses, backed by Node's built-in SQLite (real engine, in memory).
// The test sets globalThis.__testDb before loading src/db, because jest.resetModules would wipe module-level state.
import type { DatabaseSync } from 'node:sqlite';

const args = (p: unknown[]) => (p.length === 1 && Array.isArray(p[0]) ? p[0] : p);
const plain = (r: unknown) => ({ ...(r as object) });

function wrap(db: DatabaseSync) {
  return {
    execAsync: async (sql: string) => { db.exec(sql); },
    runAsync: async (sql: string, ...p: unknown[]) => {
      const r = db.prepare(sql).run(...(args(p) as never[]));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllAsync: async (sql: string, ...p: unknown[]) => db.prepare(sql).all(...(args(p) as never[])).map(plain),
    getFirstAsync: async (sql: string, ...p: unknown[]) => {
      const r = db.prepare(sql).get(...(args(p) as never[]));
      return r ? plain(r) : null;
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      db.exec('BEGIN');
      try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

export const openDatabaseAsync = async () => wrap((globalThis as unknown as { __testDb: DatabaseSync }).__testDb);
