import { assertCoordinate } from '@/domain/common/coordinate';
import type { EntityId } from '@/domain/common/types';
import type { Place } from '@/domain/place/types';
import type { DatabaseExecutor } from '@/infrastructure/database/runtime';
import type { PlaceRepository } from '@/repositories/place-repository';

interface PlaceRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  coordinate_system: string;
  address: string | null;
  provider: string | null;
  provider_place_id: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

const PLACE_COLUMNS = `
  id,
  name,
  latitude,
  longitude,
  coordinate_system,
  address,
  provider,
  provider_place_id,
  metadata_json,
  created_at,
  updated_at
`;

function mapPlaceRow(row: PlaceRow): Place {
  const coordinate = {
    latitude: row.latitude,
    longitude: row.longitude,
    system: row.coordinate_system,
  };
  assertCoordinate(coordinate);

  return {
    id: row.id,
    name: row.name,
    coordinate,
    address: row.address,
    provider: row.provider,
    providerPlaceId: row.provider_place_id,
    metadata: row.metadata_json === null
      ? null
      : (JSON.parse(row.metadata_json) as Record<string, unknown>),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqlitePlaceRepository implements PlaceRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async insert(place: Place) {
    assertCoordinate(place.coordinate);

    await this.database.runAsync(
      `INSERT INTO places (${PLACE_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        place.id,
        place.name,
        place.coordinate.latitude,
        place.coordinate.longitude,
        place.coordinate.system,
        place.address,
        place.provider,
        place.providerPlaceId,
        place.metadata === null ? null : JSON.stringify(place.metadata),
        place.createdAt,
        place.updatedAt,
      ],
    );
  }

  async getById(id: EntityId) {
    const row = await this.database.getFirstAsync<PlaceRow>(
      `SELECT ${PLACE_COLUMNS} FROM places WHERE id = ?;`,
      [id],
    );

    return row ? mapPlaceRow(row) : null;
  }

  async listByIds(ids: readonly EntityId[]) {
    // Distinct so a Place referenced by several Items is read once, and empty
    // input short-circuits rather than emitting an invalid `IN ()`.
    const distinct = [...new Set(ids)];
    if (distinct.length === 0) return [];

    const placeholders = distinct.map(() => '?').join(', ');
    const rows = await this.database.getAllAsync<PlaceRow>(
      `SELECT ${PLACE_COLUMNS} FROM places WHERE id IN (${placeholders});`,
      distinct,
    );

    return rows.map(mapPlaceRow);
  }
}
