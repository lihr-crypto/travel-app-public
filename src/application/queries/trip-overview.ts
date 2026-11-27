import type { MapPlace } from '@/application/projections/map-place';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day, Trip } from '@/domain/trip/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { ItemRepository } from '@/repositories/item-repository';
import type { PlaceRepository } from '@/repositories/place-repository';
import type { TripRepository } from '@/repositories/trip-repository';
import { tripKeys } from './query-keys';

export interface TripOverviewData {
  trip: Trip;
  days: Day[];
  scheduledItems: Item[];
  placesById: Record<EntityId, Place>;
  mapPlacesById?: Record<EntityId, MapPlace>;
  unscheduledItems: Item[];
}

export interface TripOverviewQuerySource {
  getTripOverview(tripId: EntityId): Promise<TripOverviewData>;
}

export interface TripOverviewReadContext {
  trips: Pick<TripRepository, 'getById'>;
  days: Pick<DayRepository, 'listByTripId'>;
  items: Pick<ItemRepository, 'listByDayId' | 'listUnscheduledByTripId'>;
  places: Pick<PlaceRepository, 'getById'>;
}

function compareDays(left: Day, right: Day) {
  return left.dayIndex - right.dayIndex || left.id.localeCompare(right.id);
}

function compareItems(left: Item, right: Item) {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

export function buildTripOverviewData({
  trip,
  days,
  scheduledItems,
  placesById = {},
  unscheduledItems,
}: {
  trip: Trip;
  days: readonly Day[];
  scheduledItems: readonly Item[];
  placesById?: Record<EntityId, Place>;
  unscheduledItems: readonly Item[];
}): TripOverviewData {
  const orderedDays = [...days].sort(compareDays);
  const dayIds = new Set(orderedDays.map(({ id }) => id));

  for (const day of orderedDays) {
    if (day.tripId !== trip.id) {
      throw new RangeError(`Trip Overview Day belongs to another Trip: ${day.id}`);
    }
  }
  for (const item of scheduledItems) {
    if (item.tripId !== trip.id || item.dayId === null || !dayIds.has(item.dayId)) {
      throw new RangeError(`Trip Overview scheduled Item has invalid ownership: ${item.id}`);
    }
  }
  for (const item of unscheduledItems) {
    if (item.tripId !== trip.id || item.dayId !== null) {
      throw new RangeError(`Trip Overview Unscheduled Item has invalid ownership: ${item.id}`);
    }
  }

  const dayIndexById = new Map(orderedDays.map((day) => [day.id, day.dayIndex]));
  const orderedScheduledItems = [...scheduledItems].sort((left, right) =>
    (dayIndexById.get(left.dayId!) ?? 0) - (dayIndexById.get(right.dayId!) ?? 0)
      || compareItems(left, right),
  );

  return {
    trip,
    days: orderedDays,
    scheduledItems: orderedScheduledItems,
    placesById,
    unscheduledItems: [...unscheduledItems].sort(compareItems),
  };
}

export async function getTripOverviewData(
  tripId: EntityId,
  context: TripOverviewReadContext,
): Promise<TripOverviewData> {
  const trip = await context.trips.getById(tripId);
  if (!trip) throw new RangeError(`Trip not found: ${tripId}`);

  const days = await context.days.listByTripId(tripId);
  const [scheduledCollections, unscheduledItems] = await Promise.all([
    Promise.all(days.map((day) => context.items.listByDayId(day.id))),
    context.items.listUnscheduledByTripId(tripId),
  ]);
  const scheduledItems = scheduledCollections.flat();
  const referencedPlaceIds = [...new Set(
    [...scheduledItems, ...unscheduledItems].flatMap((item) =>
      item.placeId === null ? [] : [item.placeId],
    ),
  )];
  const places = await Promise.all(referencedPlaceIds.map(async (placeId) => {
    const place = await context.places.getById(placeId);
    if (!place) throw new RangeError(`Place not found: ${placeId}`);
    return place;
  }));

  return buildTripOverviewData({
    trip,
    days,
    scheduledItems,
    placesById: Object.fromEntries(places.map((place) => [place.id, place])),
    unscheduledItems,
  });
}

export function useTripOverview(
  source: TripOverviewQuerySource,
  tripId: EntityId,
): UseQueryResult<TripOverviewData, Error> {
  return useQuery({
    queryKey: tripKeys.overview(tripId),
    queryFn: () => source.getTripOverview(tripId),
  });
}
