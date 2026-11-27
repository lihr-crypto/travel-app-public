import { deviceLocalTravelDate } from '@/domain/common/travel-date';
import type { EntityId, TravelDate } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import { getMapPlaceCoordinate, getMapPlaceName } from '@/application/projections/map-place';
import type { Day } from '@/domain/trip/types';
import type { TripOverviewData } from '@/application/queries/trip-overview';
import type { MapCameraRequest, MapMarkerModel } from '@/infrastructure/map/map-models';
import { deriveTripLifecycle } from '@/domain/trip/lifecycle';

export const OVERVIEW_DAY_PREVIEW_LIMIT = 2;
/** Presentation-only threshold; it is not an itinerary/domain rule. */
export const UNSCHEDULED_MARKER_HIDE_THRESHOLD = 20;

export interface TripOverviewDaySummary {
  day: Day;
  itemCount: number;
  previewTitles: string[];
  remainingItemCount: number;
}

export interface TripOverviewProjection {
  tripId: EntityId;
  markers: MapMarkerModel[];
  unscheduledMarkers: MapMarkerModel[];
  cameraRequest: MapCameraRequest | null;
  cameraDayId: EntityId | null;
  cameraScope: 'day' | 'trip' | null;
  days: TripOverviewDaySummary[];
  unscheduledItemCount: number;
  unscheduledPlaceCount: number;
}

function coordinateKey(item: Item, data: TripOverviewData) {
  if (item.placeId === null) return null;
  const place = (data.mapPlacesById ?? data.placesById)[item.placeId];
  if (!place) {
    if (data.mapPlacesById !== undefined) return null;
    throw new RangeError(`Trip Overview Place not found for Item: ${item.id}`);
  }
  const coordinate = getMapPlaceCoordinate(place);
  return `${coordinate.system}:${coordinate.latitude}:${coordinate.longitude}`;
}

function uniqueItemCoordinates(items: readonly Item[], data: TripOverviewData) {
  const coordinates = new Map<string, Place['coordinate']>();
  for (const item of items) {
    if (item.placeId === null) continue;
    const place = (data.mapPlacesById ?? data.placesById)[item.placeId];
    if (!place) {
      if (data.mapPlacesById !== undefined) continue;
      throw new RangeError(`Trip Overview Place not found for Item: ${item.id}`);
    }
    coordinates.set(coordinateKey(item, data)!, getMapPlaceCoordinate(place));
  }
  return [...coordinates.values()];
}

/**
 * Trip-wide saved-Place projection. Exact co-located occurrences aggregate so
 * repeat visits do not obscure distribution. Proximity clustering is left to
 * a future viewport-aware renderer rather than baking one distance into both
 * compact city and long-distance road trips.
 */
export function buildTripOverviewProjection(
  data: TripOverviewData,
  today: TravelDate = deviceLocalTravelDate(),
): TripOverviewProjection {
  const itemsByCoordinate = new Map<string, Item[]>();
  const dayIds = new Set(data.days.map(({ id }) => id));

  for (const day of data.days) {
    if (day.tripId !== data.trip.id) {
      throw new RangeError(`Trip Overview Day belongs to another Trip: ${day.id}`);
    }
  }

  for (const item of data.scheduledItems) {
    if (
      item.tripId !== data.trip.id ||
      item.dayId === null ||
      !dayIds.has(item.dayId)
    ) {
      throw new RangeError(`Trip Overview scheduled Item has invalid ownership: ${item.id}`);
    }
    const key = coordinateKey(item, data);
    if (key === null) continue;
    const items = itemsByCoordinate.get(key) ?? [];
    items.push(item);
    itemsByCoordinate.set(key, items);
  }

  const markers = [...itemsByCoordinate.values()].map((items): MapMarkerModel => {
    const first = items[0];
    const place = (data.mapPlacesById ?? data.placesById)[first.placeId!];
    const coordinate = getMapPlaceCoordinate(place);
    const sourceItemIds = items.map(({ id }) => id);
    const distinctPlaceIds = new Set(items.map(({ placeId }) => placeId));
    const clusterLabel = distinctPlaceIds.size === 1
      ? `${getMapPlaceName(place)} · ${items.length}次`
      : `${distinctPlaceIds.size}个地点 · ${items.length}次`;
    return {
      id: items.length === 1 ? first.id : `overview-cluster:${sourceItemIds.join(':')}`,
      coordinate,
      label: items.length === 1 ? getMapPlaceName(place) : clusterLabel,
      variant: items.length === 1 ? 'normal' : 'cluster',
      sourceItemIds,
      placeIds: [...distinctPlaceIds] as EntityId[],
    };
  });

  const unscheduledMarkers = data.unscheduledItems.flatMap((item): MapMarkerModel[] => {
    if (item.placeId === null) return [];
    const place = (data.mapPlacesById ?? data.placesById)[item.placeId];
    if (!place) {
      if (data.mapPlacesById !== undefined) return [];
      throw new RangeError(`Trip Overview Place not found for Item: ${item.id}`);
    }
    return [{
      id: item.id,
      coordinate: getMapPlaceCoordinate(place),
      label: getMapPlaceName(place),
      variant: 'unscheduled',
      sourceItemIds: [item.id],
    }];
  });

  const itemsByDayId = new Map<EntityId, Item[]>();
  for (const item of data.scheduledItems) {
    const items = itemsByDayId.get(item.dayId!) ?? [];
    items.push(item);
    itemsByDayId.set(item.dayId!, items);
  }

  const unscheduledPlaceCount = data.unscheduledItems.reduce(
    (count, item) => {
      if (item.tripId !== data.trip.id || item.dayId !== null) {
        throw new RangeError(`Trip Overview Unscheduled Item has invalid ownership: ${item.id}`);
      }
      return count + (item.placeId === null ? 0 : 1);
    },
    0,
  );

  const orderedDays = [...data.days].sort((left, right) =>
    left.date.localeCompare(right.date) || left.dayIndex - right.dayIndex || left.id.localeCompare(right.id),
  );
  const lifecycle = deriveTripLifecycle(data.trip, today);
  let cameraDayId: EntityId | null = null;
  let cameraScope: TripOverviewProjection['cameraScope'] = null;
  let cameraCoordinates = [] as ReturnType<typeof uniqueItemCoordinates>;

  if (lifecycle === 'completed') {
    cameraCoordinates = uniqueItemCoordinates(data.scheduledItems, data);
    cameraScope = cameraCoordinates.length > 0 ? 'trip' : null;
  } else {
    const daysWithPlaces = orderedDays.flatMap((day) => {
      const coordinates = uniqueItemCoordinates(itemsByDayId.get(day.id) ?? [], data);
      return coordinates.length > 0 ? [{ day, coordinates }] : [];
    });
    const cameraDay = lifecycle === 'planned'
      ? daysWithPlaces.find(({ day }) => day.date >= today)
      : daysWithPlaces.find(({ day }) => day.date === today)
        ?? daysWithPlaces.find(({ day }) => day.date > today)
        ?? [...daysWithPlaces].reverse().find(({ day }) => day.date < today);
    if (cameraDay) {
      cameraDayId = cameraDay.day.id;
      cameraScope = 'day';
      cameraCoordinates = cameraDay.coordinates;
    }
  }

  return {
    tripId: data.trip.id,
    markers,
    unscheduledMarkers,
    cameraRequest: cameraCoordinates.length > 0
      ? { coordinates: cameraCoordinates }
      : null,
    cameraDayId,
    cameraScope,
    days: data.days.map((day) => {
      const items = itemsByDayId.get(day.id) ?? [];
      return {
        day,
        itemCount: items.length,
        previewTitles: items.slice(0, OVERVIEW_DAY_PREVIEW_LIMIT).map(({ title }) => title),
        remainingItemCount: Math.max(0, items.length - OVERVIEW_DAY_PREVIEW_LIMIT),
      };
    }),
    unscheduledItemCount: data.unscheduledItems.length,
    unscheduledPlaceCount,
  };
}
