import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { EntityId } from '@/domain/common/types';
import type { Place } from '@/domain/place/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { ItemRepository } from '@/repositories/item-repository';
import type { PlaceRepository } from '@/repositories/place-repository';
import type { TripRepository } from '@/repositories/trip-repository';
import type { HomeMapData, HomeTripData } from '../projections/home-map';
import { homeKeys } from './query-keys';

/**
 * The Home Footprint read model.
 *
 * Home is the only surface that spans every Trip, so it is the only read model
 * with no Trip argument. It exists because nothing else could feed
 * `buildHomeMapProjection`: `TripQuerySource` loads Trips and Days but no Items
 * or Places at all, and `PlaceRepository` had no bulk read — `getById` in a loop
 * would be one round trip per Place.
 *
 * It deliberately carries no clock. Lifecycle is `today`-dependent, and `today`
 * belongs to the projection call so this read stays a pure function of stored
 * data and its tests need no fake timers.
 */

export interface HomeMapQuerySource {
  getHomeMap(): Promise<HomeMapData>;
}

export interface HomeMapReadRepositories {
  trips: Pick<TripRepository, 'list'>;
  days: Pick<DayRepository, 'listByTripId'>;
  items: Pick<ItemRepository, 'listByDayId' | 'listUnscheduledByTripId'>;
  places: Pick<PlaceRepository, 'listByIds'>;
}

export async function getHomeMapData(
  repositories: HomeMapReadRepositories,
): Promise<HomeMapData> {
  const trips = await repositories.trips.list();
  const tripsWithItems: { trip: HomeMapData['trips'][number]['trip']; days: HomeTripData['days']; items: HomeTripData['items'] }[] = [];
  /** Every Place id any Trip references, so the bulk read asks once. */
  const referencedPlaceIds = new Set<EntityId>();

  for (const trip of trips) {
    const days = await repositories.days.listByTripId(trip.id);
    const scheduled = (
      await Promise.all(days.map((day) => repositories.items.listByDayId(day.id)))
    ).flat();
    const unscheduled = await repositories.items.listUnscheduledByTripId(trip.id);
    const items = [...scheduled, ...unscheduled];

    for (const item of items) {
      if (item.placeId !== null) referencedPlaceIds.add(item.placeId);
    }
    tripsWithItems.push({ days, items, trip });
  }

  const places = await repositories.places.listByIds([...referencedPlaceIds]);
  const placesById: Record<EntityId, Place> = {};
  for (const place of places) {
    placesById[place.id] = place;
  }

  /*
   * Each Trip gets its own lookup containing only the Places its own Items
   * reference. A shared table would let a dangling reference resolve through
   * another Trip's Place; this way the projection sees a missing Place and the
   * read fails closed, like the Day and Overview read models.
   */
  return {
    trips: tripsWithItems.map(({ days, items, trip }) => {
      const scoped: Record<EntityId, Place> = {};
      for (const item of items) {
        if (item.placeId === null) continue;
        const place = placesById[item.placeId];
        if (!place) {
          throw new RangeError(`Home Place not found for Item: ${item.id}`);
        }
        scoped[item.placeId] = place;
      }
      return { days, items, placesById: scoped, trip };
    }),
  };
}

export function useHomeMap(
  source: HomeMapQuerySource,
): UseQueryResult<HomeMapData, Error> {
  return useQuery({
    queryKey: homeKeys.map,
    queryFn: () => source.getHomeMap(),
  });
}
