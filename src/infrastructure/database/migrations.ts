import type {
  DatabaseConnection,
  DatabaseExecutor,
} from './runtime';

interface MigrationVersionRow {
  version: number | null;
}

const CREATE_MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`;

const MIGRATION_001_SQL = `
  CREATE TABLE trips (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    map_region TEXT NOT NULL CHECK (map_region IN ('china_mainland', 'global')),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE days (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    date TEXT NOT NULL,
    day_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    UNIQUE (trip_id, date),
    UNIQUE (trip_id, day_index)
  );

  CREATE TABLE places (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    coordinate_system TEXT NOT NULL,
    address TEXT,
    provider TEXT,
    provider_place_id TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

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

`;

const MIGRATION_002_SQL = `
  CREATE TABLE items_migration_002 (
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
    period TEXT CHECK (
      period IS NULL OR period IN ('morning', 'noon', 'afternoon', 'night')
    ),
    is_fixed INTEGER NOT NULL,
    note TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    FOREIGN KEY (day_id) REFERENCES days(id) ON DELETE SET NULL,
    FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE SET NULL
  );

  INSERT INTO items_migration_002 (
    id, trip_id, day_id, place_id, type, title, sort_order, time_mode,
    start_datetime, end_datetime, period, is_fixed, note, payload_json,
    created_at, updated_at
  )
  SELECT
    id, trip_id, day_id, place_id, type, title, sort_order, time_mode,
    start_datetime, end_datetime,
    -- This evening-to-night merge is intentional and irreversible; the old distinction cannot be reconstructed.
    CASE period WHEN 'evening' THEN 'night' ELSE period END,
    is_fixed, note, payload_json, created_at, updated_at
  FROM items;

  DROP TABLE items;
  ALTER TABLE items_migration_002 RENAME TO items;
`;

const MIGRATION_003_SQL = `
  CREATE TABLE apple_place_bindings (
    source_place_id TEXT PRIMARY KEY,
    apple_place_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_place_id) REFERENCES places(id) ON DELETE CASCADE,
    FOREIGN KEY (apple_place_id) REFERENCES places(id) ON DELETE CASCADE
  );

  CREATE INDEX apple_place_bindings_apple_place_id_idx
    ON apple_place_bindings(apple_place_id);
`;

async function applyMigration001(transaction: DatabaseExecutor) {
  await transaction.execAsync(MIGRATION_001_SQL);
  await transaction.execAsync(`
    INSERT INTO schema_migrations (version, applied_at)
    VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `);
}

async function applyMigration002(transaction: DatabaseExecutor) {
  await transaction.execAsync(MIGRATION_002_SQL);
  await transaction.execAsync(`
    INSERT INTO schema_migrations (version, applied_at)
    VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `);
}

async function applyMigration003(transaction: DatabaseExecutor) {
  await transaction.execAsync(MIGRATION_003_SQL);
  await transaction.execAsync(`
    INSERT INTO schema_migrations (version, applied_at)
    VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `);
}

async function applyMigration004(transaction: DatabaseExecutor) {
  await transaction.execAsync(`CREATE TABLE trip_imports (
    trip_id TEXT PRIMARY KEY NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    source_trip_id TEXT NOT NULL,
    source_digest TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    previous_state_json TEXT
  );
  INSERT INTO schema_migrations (version, applied_at) VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`);
}

export async function runMigrations(connection: DatabaseConnection) {
  await connection.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(CREATE_MIGRATION_TABLE_SQL);

    const row = await transaction.getFirstAsync<MigrationVersionRow>(
      'SELECT MAX(version) AS version FROM schema_migrations;',
      [],
    );
    const currentVersion = row?.version ?? 0;

    if (currentVersion < 1) {
      await applyMigration001(transaction);
    }

    if (currentVersion < 2) {
      await applyMigration002(transaction);
    }

    if (currentVersion < 3) {
      await applyMigration003(transaction);
    }
    if (currentVersion < 4) await applyMigration004(transaction);
  });
}
