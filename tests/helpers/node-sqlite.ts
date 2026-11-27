import { DatabaseSync } from 'node:sqlite';

import {
  createDatabaseRuntime,
  type DatabaseBindParams,
  type DatabaseConnection,
  type DatabaseExecutor,
} from '@/infrastructure/database/runtime';
import { runMigrations } from '@/infrastructure/database/migrations';

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

/**
 * In-memory SQLite that satisfies the app's connection contract.
 *
 * Trip date changes are only meaningful against real constraints — the Day table
 * is `UNIQUE (trip_id, date)` and `UNIQUE (trip_id, day_index)` — so these tests
 * run the real migrations rather than a stub repository.
 */
export class NodeSqliteConnection implements DatabaseConnection {
  readonly database: DatabaseSync;

  constructor(filename = ':memory:') {
    this.database = new DatabaseSync(filename);
    this.database.exec('PRAGMA foreign_keys = ON;');
  }

  async execAsync(source: string) {
    this.database.exec(source);
  }

  async runAsync(source: string, params: DatabaseBindParams = []) {
    const result = this.database.prepare(source).run(...nodeParams(params));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(
    source: string,
    params: DatabaseBindParams = [],
  ): Promise<T | null> {
    return (
      (this.database.prepare(source).get(...nodeParams(params)) as T | undefined) ??
      null
    );
  }

  async getAllAsync<T>(
    source: string,
    params: DatabaseBindParams = [],
  ): Promise<T[]> {
    return this.database.prepare(source).all(...nodeParams(params)) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: DatabaseExecutor) => Promise<void>,
  ) {
    this.database.exec('BEGIN EXCLUSIVE;');
    try {
      await task(this);
      this.database.exec('COMMIT;');
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

export function createNodeSqliteRuntime(connection: NodeSqliteConnection) {
  return createDatabaseRuntime(async () => connection, {
    initializeConnection: runMigrations,
  });
}
