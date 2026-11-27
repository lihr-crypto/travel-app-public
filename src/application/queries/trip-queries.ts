import type { QueryClient } from '@tanstack/react-query';

import type { EntityId } from '@/domain/common/types';
import type { Day, Trip } from '@/domain/trip/types';
import { homeKeys, tripKeys } from './query-keys';

export interface TripQuerySource {
  getTrips(): Promise<Trip[]>;
  getTrip(tripId: EntityId): Promise<Trip | null>;
  getTripDays(tripId: EntityId): Promise<Day[]>;
}

export function getTrips(source: TripQuerySource) {
  return source.getTrips();
}

export function getTrip(source: TripQuerySource, tripId: EntityId) {
  return source.getTrip(tripId);
}

export function getTripDays(source: TripQuerySource, tripId: EntityId) {
  return source.getTripDays(tripId);
}

/**
 * Invalidates all read models affected by a successful Trip creation.
 *
 * `homeKeys.map` belongs here: Home is cross-Trip, so a new Trip changes the
 * Footprint map and the 我的旅行 list even though neither is keyed by the new
 * Trip's id. Omitting it left a Trip created from Home invisible until the next
 * unrelated refetch.
 */
export async function invalidateCreatedTripQueries(
  queryClient: QueryClient,
  tripId: EntityId,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: tripKeys.all }),
    queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
    queryClient.invalidateQueries({ queryKey: tripKeys.days(tripId) }),
    queryClient.invalidateQueries({ queryKey: homeKeys.map }),
  ]);
}
