import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';

export interface ItemRepository {
  insert(item: Item): Promise<void>;
  getById(id: EntityId): Promise<Item | null>;
  listByDayId(dayId: EntityId): Promise<Item[]>;
  listUnscheduledByTripId(tripId: EntityId): Promise<Item[]>;
  update(item: Item): Promise<void>;
  updateMany(items: readonly Item[]): Promise<void>;
  delete(id: EntityId): Promise<void>;
}
