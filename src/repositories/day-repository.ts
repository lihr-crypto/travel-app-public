import type { EntityId } from '@/domain/common/types';
import type { Day } from '@/domain/trip/types';

export interface DayRepository {
  insertMany(days: readonly Day[]): Promise<void>;
  getById(id: EntityId): Promise<Day | null>;
  listByTripId(tripId: EntityId): Promise<Day[]>;
  updateMany(days: readonly Day[]): Promise<void>;
  deleteMany(ids: readonly EntityId[]): Promise<void>;
}
