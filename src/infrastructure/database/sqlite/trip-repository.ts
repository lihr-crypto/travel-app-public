import type { EntityId } from '@/domain/common/types';
import type { Trip, TripMapRegion } from '@/domain/trip/types';
import type { DatabaseExecutor } from '@/infrastructure/database/runtime';
import type { TripRepository } from '@/repositories/trip-repository';

interface TripRow {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  map_region: TripMapRegion;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const TRIP_COLUMNS = `
  id,
  title,
  start_date,
  end_date,
  map_region,
  note,
  created_at,
  updated_at
`;

function mapTripRow(row: TripRow): Trip {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    mapRegion: row.map_region,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteTripRepository implements TripRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async insert(trip: Trip) {
    await this.database.runAsync(
      `INSERT INTO trips (${TRIP_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        trip.id,
        trip.title,
        trip.startDate,
        trip.endDate,
        trip.mapRegion,
        trip.note,
        trip.createdAt,
        trip.updatedAt,
      ],
    );
  }

  async getById(id: EntityId) {
    const row = await this.database.getFirstAsync<TripRow>(
      `SELECT ${TRIP_COLUMNS} FROM trips WHERE id = ?;`,
      [id],
    );

    return row ? mapTripRow(row) : null;
  }

  async list() {
    const rows = await this.database.getAllAsync<TripRow>(
      `SELECT ${TRIP_COLUMNS}
       FROM trips
       ORDER BY start_date DESC, id ASC;`,
      [],
    );

    return rows.map(mapTripRow);
  }

  async update(trip: Trip) {
    await this.database.runAsync(
      `UPDATE trips
       SET title = ?,
           start_date = ?,
           end_date = ?,
           map_region = ?,
           note = ?,
           updated_at = ?
       WHERE id = ?;`,
      [
        trip.title,
        trip.startDate,
        trip.endDate,
        trip.mapRegion,
        trip.note,
        trip.updatedAt,
        trip.id,
      ],
    );
  }

  async delete(id: EntityId) {
    await this.database.runAsync('DELETE FROM trips WHERE id = ?;', [id]);
  }
}
