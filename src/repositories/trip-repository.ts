import type { EntityId } from '@/domain/common/types';
import type { Trip } from '@/domain/trip/types';

export interface TripRepository {
  insert(trip: Trip): Promise<void>;
  getById(id: EntityId): Promise<Trip | null>;
  list(): Promise<Trip[]>;
  update(trip: Trip): Promise<void>;
  delete(id: EntityId): Promise<void>;
}
