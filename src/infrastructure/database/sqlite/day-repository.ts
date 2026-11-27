import type { EntityId } from '@/domain/common/types';
import type { Day } from '@/domain/trip/types';
import type { DatabaseExecutor } from '@/infrastructure/database/runtime';
import type { DayRepository } from '@/repositories/day-repository';

interface DayRow {
  id: string;
  trip_id: string;
  date: string;
  day_index: number;
  created_at: string;
  updated_at: string;
}

const DAY_COLUMNS = `
  id,
  trip_id,
  date,
  day_index,
  created_at,
  updated_at
`;

function mapDayRow(row: DayRow): Day {
  return {
    id: row.id,
    tripId: row.trip_id,
    date: row.date,
    dayIndex: row.day_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteDayRepository implements DayRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async insertMany(days: readonly Day[]) {
    for (const day of days) {
      await this.database.runAsync(
        `INSERT INTO days (${DAY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?);`,
        [
          day.id,
          day.tripId,
          day.date,
          day.dayIndex,
          day.createdAt,
          day.updatedAt,
        ],
      );
    }
  }

  async getById(id: EntityId) {
    const row = await this.database.getFirstAsync<DayRow>(
      `SELECT ${DAY_COLUMNS} FROM days WHERE id = ?;`,
      [id],
    );

    return row ? mapDayRow(row) : null;
  }

  async listByTripId(tripId: EntityId) {
    const rows = await this.database.getAllAsync<DayRow>(
      `SELECT ${DAY_COLUMNS}
       FROM days
       WHERE trip_id = ?
       ORDER BY day_index ASC, id ASC;`,
      [tripId],
    );

    return rows.map(mapDayRow);
  }

  async updateMany(days: readonly Day[]) {
    for (const [index, day] of days.entries()) {
      await this.database.runAsync(
        `UPDATE days
         SET date = ?, day_index = ?
         WHERE id = ?;`,
        [`__reconciling__${day.id}`, -(index + 1), day.id],
      );
    }

    for (const day of days) {
      await this.database.runAsync(
        `UPDATE days
         SET date = ?, day_index = ?, updated_at = ?
         WHERE id = ?;`,
        [day.date, day.dayIndex, day.updatedAt, day.id],
      );
    }
  }

  async deleteMany(ids: readonly EntityId[]) {
    for (const id of ids) {
      await this.database.runAsync('DELETE FROM days WHERE id = ?;', [id]);
    }
  }
}
