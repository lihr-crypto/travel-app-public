import type { MapPlace } from '@/application/projections/map-place';
import {
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { ItemRepository } from '@/repositories/item-repository';
import type { PlaceRepository } from '@/repositories/place-repository';
import type { TripRepository } from '@/repositories/trip-repository';
import { dayKeys } from './query-keys';

export interface DayViewData {
  trip: Trip;
  day: Day;
  items: Item[];
  placesById: Record<EntityId, Place>;
  /** Map display values keyed by the canonical Item Place ID; saved sources remain intact. */
  mapPlacesById?: Record<EntityId, MapPlace>;
}

export interface DayViewQuerySource {
  getDayView(dayId: EntityId): Promise<DayViewData>;
}

export interface DayViewReadContext {
  trips: Pick<TripRepository, 'getById'>;
  days: Pick<DayRepository, 'getById'>;
  items: Pick<ItemRepository, 'listByDayId'>;
  places: Pick<PlaceRepository, 'getById'>;
}

function compareItems(left: Item, right: Item) {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

export function buildDayViewData({
  trip,
  day,
  items,
  placesById = {},
}: {
  trip: Trip;
  day: Day;
  items: readonly Item[];
  placesById?: Record<EntityId, Place>;
}): DayViewData {
  if (day.tripId !== trip.id) {
    throw new RangeError('Day View Day must belong to the requested Trip');
  }

  return {
    trip,
    day,
    items: [...items].sort(compareItems),
    placesById,
  };
}

export async function getDayViewData(
  dayId: EntityId,
  context: DayViewReadContext,
): Promise<DayViewData> {
  const day = await context.days.getById(dayId);

  if (!day) {
    throw new RangeError(`Day not found: ${dayId}`);
  }

  const trip = await context.trips.getById(day.tripId);

  if (!trip) {
    throw new RangeError(`Trip not found: ${day.tripId}`);
  }

  const items = await context.items.listByDayId(day.id);
  const placeIds = [...new Set(items.flatMap((item) =>
    item.placeId === null ? [] : [item.placeId],
  ))];
  const places = await Promise.all(placeIds.map(async (placeId) => {
    const place = await context.places.getById(placeId);
    if (!place) {
      throw new RangeError(`Place not found: ${placeId}`);
    }
    return place;
  }));
  const placesById = Object.fromEntries(
    places.map((place) => [place.id, place]),
  );

  return buildDayViewData({ trip, day, items, placesById });
}

export function getDayView(source: DayViewQuerySource, dayId: EntityId) {
  return source.getDayView(dayId);
}

export function useDayView(
  source: DayViewQuerySource,
  dayId: EntityId,
): UseQueryResult<DayViewData, Error> {
  return useQuery({
    queryKey: dayKeys.view(dayId),
    queryFn: () => getDayView(source, dayId),
  });
}
