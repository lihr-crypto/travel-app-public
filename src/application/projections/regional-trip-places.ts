import type { EntityId } from '@/domain/common/types';
import type { Place } from '@/domain/place/types';
import type { Trip } from '@/domain/trip/types';
import { assertPlaceCoordinateSource } from '@/domain/place/coordinate-policy';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';

/** Keep all canonical Items; only this fixed-region map lookup is filtered. */
export function regionalTripMapPlaces(
  trip: Pick<Trip, 'mapRegion'>,
  places: Readonly<Record<EntityId, Place>>,
): Record<EntityId, Place> {
  const stack = resolveTripMapStack(trip);
  return Object.fromEntries(Object.entries(places).filter(([, place]) => {
    assertPlaceCoordinateSource(place);
    return place.coordinate.system === stack.coordinateSystem
      && (place.provider === stack.placeProvider || place.provider === null);
  }));
}
