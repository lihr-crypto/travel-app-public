import { assertCoordinateSystem, assertCoordinate } from '@/domain/common/coordinate';
import type { Place } from './types';

/** Mixed Trips preserve each saved Place's own provider-native CRS. */
export function assertPlaceCoordinateSource(place: Pick<Place, 'provider' | 'coordinate'>): void {
  assertCoordinate(place.coordinate);
  if (place.provider === 'amap') assertCoordinateSystem(place.coordinate, 'gcj02');
  if (place.provider === 'google') assertCoordinateSystem(place.coordinate, 'wgs84');
  if (place.provider === 'apple') assertCoordinateSystem(place.coordinate, 'wgs84');
}
