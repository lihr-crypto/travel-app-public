import { afterEach, expect, test } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createDatabaseRuntime,
  type DatabaseBindParams,
  type DatabaseConnection,
  type DatabaseExecutor,
} from '@/infrastructure/database/runtime';
import { runMigrations } from '@/infrastructure/database/migrations';

class NodeSqliteConnection implements DatabaseConnection {
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

function nodeParams(params: DatabaseBindParams) {
  return params.map((value) => {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  });
}

let connection: NodeSqliteConnection | undefined;
let temporaryDirectory: string | undefined;

afterEach(() => {
  connection?.close();
  connection = undefined;
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

function insertTripAndDay(database: DatabaseSync) {
  database.exec(`
    INSERT INTO trips (
      id, title, start_date, end_date, map_region, created_at, updated_at
    ) VALUES (
      'trip-1', 'Trip', '2026-09-11', '2026-09-12', 'global',
      '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z'
    );

    INSERT INTO days (
      id, trip_id, date, day_index, created_at, updated_at
    ) VALUES (
      'day-1', 'trip-1', '2026-09-11', 1,
      '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z'
    );
  `);
}

function createVersionOneDatabase(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations (version, applied_at)
      VALUES (1, '2026-09-11T00:00:00Z');
    CREATE TABLE trips (id TEXT PRIMARY KEY);
    CREATE TABLE days (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
    CREATE TABLE places (id TEXT PRIMARY KEY);
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      day_id TEXT,
      place_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      time_mode TEXT NOT NULL,
      start_datetime TEXT,
      end_datetime TEXT,
      period TEXT,
      is_fixed INTEGER NOT NULL,
      note TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (day_id) REFERENCES days(id) ON DELETE SET NULL,
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL
    );
    INSERT INTO trips (id) VALUES ('trip-1');
    INSERT INTO days (id, trip_id) VALUES ('day-1', 'trip-1');
    INSERT INTO places (id) VALUES ('place-1');
    INSERT INTO items (
      id, trip_id, day_id, place_id, type, title, sort_order, time_mode,
      start_datetime, end_datetime, period, is_fixed, note, payload_json,
      created_at, updated_at
    ) VALUES
      ('item-morning', 'trip-1', 'day-1', 'place-1', 'custom', 'Morning', 0,
       'period', NULL, NULL, 'morning', 0, 'note', '{"kind":"custom","label":"Museum"}',
       '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z'),
      ('item-afternoon', 'trip-1', 'day-1', NULL, 'food', 'Afternoon', 1,
       'period', NULL, NULL, 'afternoon', 0, NULL, NULL,
       '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z'),
      ('item-evening', 'trip-1', 'day-1', NULL, 'custom', 'Evening', 2,
       'period', NULL, NULL, 'evening', 0, NULL, NULL,
       '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z'),
      ('item-night', 'trip-1', 'day-1', NULL, 'hotel', 'Night', 3,
       'period', NULL, NULL, 'night', 0, NULL, NULL,
       '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z'),
      ('item-unset', 'trip-1', 'day-1', NULL, 'custom', 'Unset', 4,
       'none', NULL, NULL, NULL, 0, NULL, NULL,
       '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z');
  `);
}

test('Migrations 001 through 004 create the canonical tables and record each version', async () => {
  connection = new NodeSqliteConnection();

  await runMigrations(connection);

  const tables = connection.database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
  const versions = connection.database
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all();

  expect(tables).toEqual([
    'apple_place_bindings',
    'days',
    'items',
    'places',
    'schema_migrations',
    'trip_imports',
    'trips',
  ]);
  expect(versions).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
});

test('running migrations twice records each migration exactly once', async () => {
  connection = new NodeSqliteConnection();

  await runMigrations(connection);
  await runMigrations(connection);

  const rows = connection.database
    .prepare('SELECT version, COUNT(*) AS count FROM schema_migrations GROUP BY version ORDER BY version')
    .all();

  expect(rows).toEqual([
    { version: 1, count: 1 },
    { version: 2, count: 1 },
    { version: 3, count: 1 },
    { version: 4, count: 1 },
  ]);
});

test('Migration 002 preserves existing Items and maps legacy periods across reopen', async () => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'travel-migration-'));
  const databasePath = join(temporaryDirectory, 'travel.sqlite');
  connection = new NodeSqliteConnection(databasePath);
  createVersionOneDatabase(connection.database);

  await runMigrations(connection);

  const readItems = () => connection!.database.prepare(`
    SELECT id, title, sort_order, period, day_id, place_id, note, payload_json
    FROM items
    ORDER BY sort_order
  `).all();
  expect(readItems()).toEqual([
    {
      id: 'item-morning', title: 'Morning', sort_order: 0,
      period: 'morning', day_id: 'day-1', place_id: 'place-1', note: 'note',
      payload_json: '{"kind":"custom","label":"Museum"}',
    },
    {
      id: 'item-afternoon', title: 'Afternoon', sort_order: 1,
      period: 'afternoon', day_id: 'day-1', place_id: null, note: null,
      payload_json: null,
    },
    {
      id: 'item-evening', title: 'Evening', sort_order: 2,
      // This merge is intentional and irreversible; the source value cannot be reconstructed.
      period: 'night', day_id: 'day-1', place_id: null, note: null,
      payload_json: null,
    },
    {
      id: 'item-night', title: 'Night', sort_order: 3,
      period: 'night', day_id: 'day-1', place_id: null, note: null,
      payload_json: null,
    },
    {
      id: 'item-unset', title: 'Unset', sort_order: 4,
      period: null, day_id: 'day-1', place_id: null, note: null,
      payload_json: null,
    },
  ]);
  expect(connection.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(connection.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
    .toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
  expect(() => connection!.database.prepare(`
    INSERT INTO items (
      id, trip_id, type, title, sort_order, time_mode, period, is_fixed,
      created_at, updated_at
    ) VALUES ('item-invalid-period', 'trip-1', 'custom', 'Invalid', 5,
      'period', 'evening', 0, '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z')
  `).run()).toThrow();

  connection.close();
  connection = new NodeSqliteConnection(databasePath);
  await runMigrations(connection);

  expect(readItems()).toHaveLength(5);
  expect(connection.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
    .toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
  expect(connection.database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

test('Migration 002 rolls back its rebuild without losing unsupported legacy rows', async () => {
  connection = new NodeSqliteConnection();
  createVersionOneDatabase(connection.database);
  connection.database.prepare(`
    INSERT INTO items (
      id, trip_id, day_id, type, title, sort_order, time_mode, period,
      is_fixed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'item-unsupported-period', 'trip-1', 'day-1', 'custom', 'Unsupported', 5,
    'period', 'twilight', 0,
    '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z',
  );

  await expect(runMigrations(connection)).rejects.toThrow();

  expect(connection.database.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
    .toEqual([{ version: 1 }]);
  expect(connection.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_migration_002'").get())
    .toBeUndefined();
  expect(connection.database.prepare('SELECT period FROM items WHERE id = ?')
    .get('item-unsupported-period')).toEqual({ period: 'twilight' });
  expect(connection.database.prepare('SELECT COUNT(*) AS count FROM items').get())
    .toEqual({ count: 6 });
});

test('the current schema uses the corrected Trip region and Item time columns', async () => {
  connection = new NodeSqliteConnection();
  await runMigrations(connection);

  const tripColumns = connection.database
    .prepare('PRAGMA table_info(trips)')
    .all()
    .map((row) => row.name);
  const itemColumns = connection.database
    .prepare('PRAGMA table_info(items)')
    .all()
    .map((row) => row.name);

  expect(tripColumns).toContain('map_region');
  expect(itemColumns).toEqual(
    expect.arrayContaining(['start_datetime', 'end_datetime', 'period']),
  );
  expect(itemColumns).not.toContain('exact_time');

  expect(() =>
    connection?.database.exec(`
      INSERT INTO trips (
        id, title, start_date, end_date, map_region, created_at, updated_at
      ) VALUES (
        'invalid-region', 'Invalid', '2026-09-11', '2026-09-12', 'amap',
        '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z'
      );
    `),
  ).toThrow();
});

test('the migration chain preserves every required V1 foreign-key action', async () => {
  connection = new NodeSqliteConnection();
  await runMigrations(connection);

  const foreignKeysFor = (table: string) =>
    connection!.database
      .prepare(`PRAGMA foreign_key_list(${table})`)
      .all()
      .map((row) => ({
        from: row.from,
        onDelete: row.on_delete,
        table: row.table,
      }))
      .sort((left, right) => String(left.from).localeCompare(String(right.from)));

  expect(foreignKeysFor('days')).toEqual([
    { from: 'trip_id', onDelete: 'CASCADE', table: 'trips' },
  ]);
  expect(foreignKeysFor('items')).toEqual([
    { from: 'day_id', onDelete: 'SET NULL', table: 'days' },
    { from: 'place_id', onDelete: 'SET NULL', table: 'places' },
    { from: 'trip_id', onDelete: 'CASCADE', table: 'trips' },
  ]);
  expect(foreignKeysFor('legs')).toEqual([]);
});

test('the migration chain contains no Leg or routing geometry schema', async () => {
  connection = new NodeSqliteConnection();
  await runMigrations(connection);

  const schema = connection.database
    .prepare(
      `SELECT GROUP_CONCAT(sql, ' ') AS sql
       FROM sqlite_master
       WHERE type = 'table'`,
    )
    .get() as { sql: string };

  expect(schema.sql).not.toMatch(/\blegs?\b/i);
  expect(schema.sql).not.toMatch(/geometry|polyline/i);
});

test('deleting a Trip cascades to its Days', async () => {
  connection = new NodeSqliteConnection();
  await runMigrations(connection);
  insertTripAndDay(connection.database);

  connection.database.exec("DELETE FROM trips WHERE id = 'trip-1';");

  expect(
    connection.database.prepare('SELECT COUNT(*) AS count FROM days').get(),
  ).toEqual({ count: 0 });
});

test('deleting a Day moves its Items to Unscheduled by setting day_id to null', async () => {
  connection = new NodeSqliteConnection();
  await runMigrations(connection);
  insertTripAndDay(connection.database);
  connection.database.exec(`
    INSERT INTO items (
      id, trip_id, day_id, type, title, sort_order, time_mode, is_fixed,
      created_at, updated_at
    ) VALUES (
      'item-1', 'trip-1', 'day-1', 'custom', 'Item', 1, 'none', 0,
      '2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z'
    );
  `);

  connection.database.exec("DELETE FROM days WHERE id = 'day-1';");

  expect(
    connection.database
      .prepare("SELECT day_id FROM items WHERE id = 'item-1'")
      .get(),
  ).toEqual({ day_id: null });
});

test('exclusive semantic transaction rolls back real SQLite writes', async () => {
  connection = new NodeSqliteConnection();
  const runtime = createDatabaseRuntime(async () => connection!);
  await runtime.initialize();
  connection.database.exec('CREATE TABLE rollback_probe (value TEXT NOT NULL);');

  await expect(
    runtime.runInExclusiveTransaction(async (transaction) => {
      await transaction.execAsync(
        "INSERT INTO rollback_probe (value) VALUES ('should-not-commit');",
      );
      throw new Error('rollback requested');
    }),
  ).rejects.toThrow('rollback requested');

  expect(
    connection.database
      .prepare('SELECT COUNT(*) AS count FROM rollback_probe')
      .get(),
  ).toEqual({ count: 0 });
});
