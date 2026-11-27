import type { EntityId } from '@/domain/common/types';
import type { DayViewData } from '@/application/queries/day-view';
import { getMapPlaceCoordinate, getMapPlaceName } from '@/application/projections/map-place';
import type { MapCameraRequest, MapMarkerModel } from '@/infrastructure/map/map-models';

export interface DayMapProjection {
  dayId: EntityId;
  markers: MapMarkerModel[];
  cameraRequest: MapCameraRequest | null;
}

/** Current-Day spatial projection of the same ordered Items used by Timeline. */
export function buildDayMapProjection(
  data: DayViewData,
  selectedItemId: EntityId | null = null,
): DayMapProjection {
  if (data.day.tripId !== data.trip.id) {
    throw new RangeError('Day Map Day must belong to the requested Trip');
  }

  const markers: MapMarkerModel[] = [];
  const orderedItems = [...data.items].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );

  for (const item of orderedItems) {
    if (item.dayId !== data.day.id) continue;
    if (item.tripId !== data.trip.id) {
      throw new RangeError(`Day Map Item belongs to another Trip: ${item.id}`);
    }
    if (item.placeId === null) continue;

    const place = (data.mapPlacesById ?? data.placesById)[item.placeId];
    if (!place && data.mapPlacesById !== undefined) continue;
    if (!place) {
      throw new RangeError(`Day Map Place not found for Item: ${item.id}`);
    }
    const coordinate = getMapPlaceCoordinate(place);
    markers.push({
      id: item.id,
      coordinate,
      ordinal: markers.length + 1,
      label: getMapPlaceName(place),
      variant: item.id === selectedItemId ? 'selected' : 'normal',
    });
  }

  const cameraCoordinates = markers
    .map((marker) => marker.coordinate)
    .filter((coordinate, index, coordinates) =>
      coordinates.findIndex((candidate) =>
        candidate.latitude === coordinate.latitude &&
        candidate.longitude === coordinate.longitude &&
        candidate.system === coordinate.system,
      ) === index,
    );

  return {
    dayId: data.day.id,
    markers,
    cameraRequest: cameraCoordinates.length > 0
      ? { coordinates: cameraCoordinates }
      : null,
  };
}
