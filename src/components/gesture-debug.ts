/**
 * TEMPORARY gesture diagnostics for the 2026-10-05/06 device pass (UX-C drag).
 *
 * console.log does not carry message bodies in the Release build (the native
 * bridge prints `(null)`), so the events go into a dedicated SQLite database
 * (`gesture-debug.db`, sibling of the app DB) that the host copies out of the
 * app container after a repro. Completely separate from the business state.
 * Remove once the drag settles.
 */
import * as SQLite from 'expo-sqlite';

const startedAt = Date.now();
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise === null) {
    dbPromise = SQLite.openDatabaseAsync('gesture-debug.db').then(async (db) => {
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, line TEXT)',
      );
      return db;
    });
  }
  return dbPromise;
}

export function glog(line: string): void {
  const t = Date.now() - startedAt;
  void getDb()
    .then((db) => db.runAsync('INSERT INTO log (t, line) VALUES (?, ?)', t, line))
    .catch(() => undefined);
}
