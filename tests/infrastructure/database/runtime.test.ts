import { expect, test } from '@jest/globals';

import {
  createDatabaseRuntime,
  type DatabaseBindParams,
  type DatabaseConnection,
  type DatabaseExecutor,
} from '@/infrastructure/database/runtime';

class FakeDatabaseConnection implements DatabaseConnection {
  foreignKeysEnabled = false;
  readonly initializationStatements: string[] = [];
  values: string[] = [];

  async execAsync(source: string) {
    this.initializationStatements.push(source);

    if (source === 'PRAGMA foreign_keys = ON;') {
      this.foreignKeysEnabled = true;
    }
  }

  async getFirstAsync<T>(source: string): Promise<T | null> {
    if (source === 'PRAGMA foreign_keys;') {
      return {
        foreign_keys: this.foreignKeysEnabled ? 1 : 0,
      } as T;
    }

    return null;
  }

  async getAllAsync<T>(): Promise<T[]> {
    return [];
  }

  async runAsync(_source: string, _params?: DatabaseBindParams) {
    return { changes: 0, lastInsertRowId: 0 };
  }

  async withExclusiveTransactionAsync(
    task: (transaction: DatabaseExecutor) => Promise<void>,
  ) {
    const pendingValues = [...this.values];
    const transaction: DatabaseExecutor = {
      execAsync: async (source) => {
        const value = source.match(/^INSERT VALUE (.+)$/)?.[1];

        if (value) {
          pendingValues.push(value);
        }
      },
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
      runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    };

    await task(transaction);
    this.values = pendingValues;
  }
}

test('initialization enables and verifies SQLite foreign keys', async () => {
  const connection = new FakeDatabaseConnection();
  const runtime = createDatabaseRuntime(async () => connection);

  await runtime.initialize();

  expect(connection.foreignKeysEnabled).toBe(true);
  expect(connection.initializationStatements).toEqual([
    'PRAGMA foreign_keys = ON;',
    'PRAGMA journal_mode = WAL;',
  ]);
});

test('initialization runs the supplied database setup once', async () => {
  const connection = new FakeDatabaseConnection();
  let setupCalls = 0;
  const runtime = createDatabaseRuntime(async () => connection, {
    initializeConnection: async () => {
      setupCalls += 1;
    },
  });

  await runtime.initialize();
  await runtime.initialize();

  expect(setupCalls).toBe(1);
});

test('read context reuses the initialized database without an exclusive transaction', async () => {
  const connection = new FakeDatabaseConnection();
  const runtime = createDatabaseRuntime(async () => connection);
  const task = async (database: DatabaseExecutor) => database === connection;

  await expect(runtime.runInReadContext(task)).resolves.toBe(true);
  expect(connection.initializationStatements).toEqual([
    'PRAGMA foreign_keys = ON;',
    'PRAGMA journal_mode = WAL;',
  ]);
});

test('exclusive transaction commits its writes and result', async () => {
  const connection = new FakeDatabaseConnection();
  const runtime = createDatabaseRuntime(async () => connection);

  const result = await runtime.runInExclusiveTransaction(async (transaction) => {
    await transaction.execAsync('INSERT VALUE committed');
    return 'complete';
  });

  expect(result).toBe('complete');
  expect(connection.values).toEqual(['committed']);
});

test('exclusive transaction rolls back writes when the task throws', async () => {
  const connection = new FakeDatabaseConnection();
  const runtime = createDatabaseRuntime(async () => connection);

  await expect(
    runtime.runInExclusiveTransaction(async (transaction) => {
      await transaction.execAsync('INSERT VALUE rolled-back');
      throw new Error('transaction failed');
    }),
  ).rejects.toThrow('transaction failed');

  expect(connection.values).toEqual([]);
});
