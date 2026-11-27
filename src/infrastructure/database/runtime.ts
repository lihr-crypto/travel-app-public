export type DatabaseBindValue =
  | string
  | number
  | null
  | boolean
  | Uint8Array
  | ArrayBuffer;

export type DatabaseBindParams = DatabaseBindValue[];

export interface DatabaseRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface DatabaseExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    params: DatabaseBindParams,
  ): Promise<DatabaseRunResult>;
  getFirstAsync<T>(
    source: string,
    params: DatabaseBindParams,
  ): Promise<T | null>;
  getAllAsync<T>(source: string, params: DatabaseBindParams): Promise<T[]>;
}

export interface DatabaseConnection extends DatabaseExecutor {
  withExclusiveTransactionAsync(
    task: (transaction: DatabaseExecutor) => Promise<void>,
  ): Promise<void>;
}

export interface DatabaseRuntime {
  initialize(): Promise<void>;
  runInReadContext<T>(
    task: (database: DatabaseExecutor) => Promise<T>,
  ): Promise<T>;
  runInExclusiveTransaction<T>(
    task: (transaction: DatabaseExecutor) => Promise<T>,
  ): Promise<T>;
}

interface DatabaseRuntimeOptions {
  initializeConnection?: (connection: DatabaseConnection) => Promise<void>;
}

interface ForeignKeysRow {
  foreign_keys: number;
}

export function createDatabaseRuntime(
  openConnection: () => Promise<DatabaseConnection>,
  options: DatabaseRuntimeOptions = {},
): DatabaseRuntime {
  let connectionPromise: Promise<DatabaseConnection> | undefined;

  const getConnection = () => {
    if (!connectionPromise) {
      connectionPromise = openConnection()
        .then(async (connection) => {
          await connection.execAsync('PRAGMA foreign_keys = ON;');
          await connection.execAsync('PRAGMA journal_mode = WAL;');

          const row = await connection.getFirstAsync<ForeignKeysRow>(
            'PRAGMA foreign_keys;',
            [],
          );

          if (row?.foreign_keys !== 1) {
            throw new Error('SQLite foreign key enforcement is not enabled.');
          }

          await options.initializeConnection?.(connection);

          return connection;
        })
        .catch((error: unknown) => {
          connectionPromise = undefined;
          throw error;
        });
    }

    return connectionPromise;
  };

  return {
    async initialize() {
      await getConnection();
    },

    async runInReadContext<T>(task: (database: DatabaseExecutor) => Promise<T>) {
      return task(await getConnection());
    },

    async runInExclusiveTransaction<T>(
      task: (transaction: DatabaseExecutor) => Promise<T>,
    ) {
      const connection = await getConnection();
      let completed = false;
      let result: T | undefined;

      await connection.withExclusiveTransactionAsync(async (transaction) => {
        result = await task(transaction);
        completed = true;
      });

      if (!completed) {
        throw new Error('Exclusive SQLite transaction did not complete.');
      }

      return result as T;
    },
  };
}
