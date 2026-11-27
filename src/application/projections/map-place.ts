import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate } from '@/domain/common/types';
import { assertPlaceCoordinateSource } from '@/domain/place/coordinate-policy';
import type { Place } from '@/domain/place/types';

/** A canonical Place with optional, presentation-only map values. */
export type MapPlace = Place & {
  readonly displayCoordinate?: Coordinate;
  readonly displayName?: string;
};

/** Resolve a map coordinate while keeping its source CRS explicit and checked. */
export function getMapPlaceCoordinate(place: MapPlace): Coordinate {
  if (place.displayCoordinate === undefined) {
    assertPlaceCoordinateSource(place);
    return place.coordinate;
  }

  if (place.provider !== 'amap') {
    throw new RangeError('A display coordinate can only project an AMap Place');
  }
  assertPlaceCoordinateSource(place);
  assertCoordinateSystem(place.coordinate, 'gcj02');
  assertCoordinateSystem(place.displayCoordinate, 'wgs84');
  return place.displayCoordinate;
}

/** Return a trimmed map label without writing it back to the canonical Place. */
export function getMapPlaceName(place: MapPlace): string {
  const displayName = typeof place.displayName === 'string'
    ? place.displayName.trim()
    : '';
  const sourceName = typeof place.name === 'string' ? place.name.trim() : '';
  const name = displayName || sourceName;
  if (!name) throw new RangeError(`Map Place name must not be empty: ${place.id}`);
  return name;
}

/** Add a WGS84 map projection to an AMap Place without changing its source fields. */
export function projectAmapPlaceForMap(
  place: Place,
  displayCoordinate: Coordinate,
): MapPlace {
  if (place.provider !== 'amap') {
    throw new RangeError('Only an AMap Place can receive a display coordinate');
  }
  assertPlaceCoordinateSource(place);
  assertCoordinateSystem(place.coordinate, 'gcj02');
  assertCoordinateSystem(displayCoordinate, 'wgs84');
  return {
    ...place,
    displayCoordinate: { ...displayCoordinate },
  };
}

/** Keep a saved Google or Apple WGS84 Place as-is for map display. */
export function projectSavedWgs84PlaceForMap(place: Place): MapPlace {
  if (place.provider !== 'google' && place.provider !== 'apple') {
    throw new RangeError('Only a saved Google or Apple Place can use this map projection');
  }
  assertPlaceCoordinateSource(place);
  assertCoordinateSystem(place.coordinate, 'wgs84');
  return place;
}
