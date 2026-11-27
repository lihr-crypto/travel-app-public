import type { EntityId } from '@/domain/common/types';
import type { DatabaseExecutor } from '@/infrastructure/database/runtime';
import type {
  ApplePlaceBinding,
  ApplePlaceBindingRepository,
} from '@/repositories/apple-place-binding-repository';

interface ApplePlaceBindingRow {
  source_place_id: string;
  apple_place_id: string;
  created_at: string;
}

const BINDING_COLUMNS = 'source_place_id, apple_place_id, created_at';

function mapBindingRow(row: ApplePlaceBindingRow): ApplePlaceBinding {
  return {
    sourcePlaceId: row.source_place_id,
    applePlaceId: row.apple_place_id,
    createdAt: row.created_at,
  };
}

export class SqliteApplePlaceBindingRepository implements ApplePlaceBindingRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async getBySourceId(sourcePlaceId: EntityId) {
    const row = await this.database.getFirstAsync<ApplePlaceBindingRow>(
      `SELECT ${BINDING_COLUMNS}
       FROM apple_place_bindings
       WHERE source_place_id = ?;`,
      [sourcePlaceId],
    );

    return row ? mapBindingRow(row) : null;
  }

  async upsert(binding: ApplePlaceBinding) {
    await this.database.runAsync(
      `INSERT INTO apple_place_bindings (
         source_place_id, apple_place_id, created_at
       ) VALUES (?, ?, ?)
       ON CONFLICT(source_place_id) DO UPDATE SET
         apple_place_id = excluded.apple_place_id,
         created_at = excluded.created_at;`,
      [binding.sourcePlaceId, binding.applePlaceId, binding.createdAt],
    );
  }

  async listBySourceIds(sourcePlaceIds: readonly EntityId[]) {
    const distinct = [...new Set(sourcePlaceIds)];
    if (distinct.length === 0) return [];

    const placeholders = distinct.map(() => '?').join(', ');
    const rows = await this.database.getAllAsync<ApplePlaceBindingRow>(
      `SELECT ${BINDING_COLUMNS}
       FROM apple_place_bindings
       WHERE source_place_id IN (${placeholders});`,
      distinct,
    );

    return rows.map(mapBindingRow);
  }
}
