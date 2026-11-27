import type { EntityId } from '@/domain/common/types';
import type { Trip } from '@/domain/trip/types';
import type { TripRepository } from '@/repositories/trip-repository';

export type TripMapStack =
  | Readonly<{
      mapRegion: 'china_mainland';
      renderer: 'amap';
      placeProvider: 'amap';
      coordinateSystem: 'gcj02';
    }>
  | Readonly<{
      mapRegion: 'global';
      renderer: 'google';
      placeProvider: 'google';
      coordinateSystem: 'wgs84';
    }>;

const MAINLAND_STACK: TripMapStack = Object.freeze({
  mapRegion: 'china_mainland',
  renderer: 'amap',
  placeProvider: 'amap',
  coordinateSystem: 'gcj02',
});

const GLOBAL_STACK: TripMapStack = Object.freeze({
  mapRegion: 'global',
  renderer: 'google',
  placeProvider: 'google',
  coordinateSystem: 'wgs84',
});

/** Resolve once from the saved Trip at session entry; location/viewport are not inputs. */
export function resolveTripMapStack(trip: Pick<Trip, 'mapRegion'>): TripMapStack {
  switch (trip.mapRegion) {
    case 'china_mainland':
      return MAINLAND_STACK;
    case 'global':
      return GLOBAL_STACK;
    default:
      throw new RangeError(`Invalid persisted Trip mapRegion: ${trip.mapRegion}`);
  }
}

export async function loadTripMapStack(
  tripId: EntityId,
  trips: Pick<TripRepository, 'getById'>,
): Promise<TripMapStack> {
  const trip = await trips.getById(tripId);
  if (!trip) {
    throw new RangeError(`Trip not found: ${tripId}`);
  }
  return resolveTripMapStack(trip);
}
