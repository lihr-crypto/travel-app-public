import type { EntityId } from '@/domain/common/types';
import type { Place } from '@/domain/place/types';

/** Persist and read confirmed, provider-native Place snapshots. */
export interface PlaceRepository {
  insert(place: Place): Promise<void>;
  getById(id: EntityId): Promise<Place | null>;
  /**
   * Bulk read for the cross-Trip Home surface, which needs the Places of every
   * Trip at once. `getById` in a loop would be one round trip per Place.
   * Unknown ids are simply absent from the result; the caller decides whether a
   * dangling reference is corruption.
   */
  listByIds(ids: readonly EntityId[]): Promise<Place[]>;
}
