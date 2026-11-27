import type { EntityId } from '@/domain/common/types';
import type {
  DayPeriod,
  Item,
  ItemPayload,
  ItemType,
  TimeMode,
} from '@/domain/item/types';
import { assertItemType, normalizeItemPayload } from '@/domain/item/validation';
import type { DatabaseExecutor } from '@/infrastructure/database/runtime';
import type { ItemRepository } from '@/repositories/item-repository';

interface ItemRow {
  id: string;
  trip_id: string;
  day_id: string | null;
  place_id: string | null;
  type: ItemType;
  title: string;
  sort_order: number;
  time_mode: TimeMode;
  start_datetime: string | null;
  end_datetime: string | null;
  period: DayPeriod | null;
  is_fixed: number;
  note: string | null;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
}

const ITEM_COLUMNS = `
  id,
  trip_id,
  day_id,
  place_id,
  type,
  title,
  sort_order,
  time_mode,
  start_datetime,
  end_datetime,
  period,
  is_fixed,
  note,
  payload_json,
  created_at,
  updated_at
`;

function serializePayload(type: ItemType, payload: ItemPayload | null) {
  const normalized = normalizeItemPayload(type, payload);
  return normalized === null ? null : JSON.stringify(normalized);
}

function deserializePayload(
  type: ItemType,
  payload: string | null,
): ItemPayload | null {
  if (payload === null) {
    return null;
  }

  const parsed: unknown = JSON.parse(payload);
  return normalizeItemPayload(type, parsed);
}

function mapItemRow(row: ItemRow): Item {
  assertItemType(row.type);

  return {
    id: row.id,
    tripId: row.trip_id,
    dayId: row.day_id,
    placeId: row.place_id,
    type: row.type,
    title: row.title,
    sortOrder: row.sort_order,
    timeMode: row.time_mode,
    startDateTime: row.start_datetime,
    endDateTime: row.end_datetime,
    period: row.period,
    isFixed: row.is_fixed !== 0,
    note: row.note,
    payload: deserializePayload(row.type, row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemBindParams(item: Item) {
  return [
    item.id,
    item.tripId,
    item.dayId,
    item.placeId,
    item.type,
    item.title,
    item.sortOrder,
    item.timeMode,
    item.startDateTime,
    item.endDateTime,
    item.period,
    item.isFixed,
    item.note,
    serializePayload(item.type, item.payload),
    item.createdAt,
    item.updatedAt,
  ];
}

export class SqliteItemRepository implements ItemRepository {
  constructor(private readonly database: DatabaseExecutor) {}

  async insert(item: Item) {
    await this.database.runAsync(
      `INSERT INTO items (${ITEM_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      itemBindParams(item),
    );
  }

  async getById(id: EntityId) {
    const row = await this.database.getFirstAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE id = ?;`,
      [id],
    );

    return row ? mapItemRow(row) : null;
  }

  async listByDayId(dayId: EntityId) {
    const rows = await this.database.getAllAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE day_id = ?
       ORDER BY sort_order ASC, id ASC;`,
      [dayId],
    );

    return rows.map(mapItemRow);
  }

  async listUnscheduledByTripId(tripId: EntityId) {
    const rows = await this.database.getAllAsync<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE trip_id = ? AND day_id IS NULL
       ORDER BY sort_order ASC, id ASC;`,
      [tripId],
    );

    return rows.map(mapItemRow);
  }

  async update(item: Item) {
    await this.database.runAsync(
      `UPDATE items
       SET trip_id = ?,
           day_id = ?,
           place_id = ?,
           type = ?,
           title = ?,
           sort_order = ?,
           time_mode = ?,
           start_datetime = ?,
           end_datetime = ?,
           period = ?,
           is_fixed = ?,
           note = ?,
           payload_json = ?,
           updated_at = ?
       WHERE id = ?;`,
      [
        item.tripId,
        item.dayId,
        item.placeId,
        item.type,
        item.title,
        item.sortOrder,
        item.timeMode,
        item.startDateTime,
        item.endDateTime,
        item.period,
        item.isFixed,
        item.note,
        serializePayload(item.type, item.payload),
        item.updatedAt,
        item.id,
      ],
    );
  }

  async updateMany(items: readonly Item[]) {
    for (const item of items) {
      await this.update(item);
    }
  }

  async delete(id: EntityId) {
    await this.database.runAsync('DELETE FROM items WHERE id = ?;', [id]);
  }
}
