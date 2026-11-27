import { isAmapSearchConfigured } from '../../../modules/expo-amap-search/src/ExpoAmapSearchModule';
import { initializeGooglePlaces } from '../../../modules/expo-google-places/src/ExpoGooglePlacesModule';

import type { CoordinateSystem } from '@/domain/common/types';
import type { Trip, TripMapRegion } from '@/domain/trip/types';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';
import { AmapPlaceProvider } from './amap-place-provider';
import { AutomaticPlaceProvider } from './automatic-place-provider';
import { GooglePlaceProvider } from './google-place-provider';
import { ApplePlaceProvider } from './apple-place-provider';
import { initializeApplePlaces } from '../../../modules/expo-apple-places/src/ExpoApplePlacesModule';
import type { PlaceProvider, PlaceProviderId } from './place-provider';

export interface PlaceProviderSession {
  readonly mapRegion: TripMapRegion;
  readonly providerId: PlaceProviderId;
  readonly coordinateSystem: CoordinateSystem;
  readonly provider: PlaceProvider;
  /** Present only for the mixed-region composite session. */
  readonly automatic?: true;
}

export interface PlaceProviderSessionDependencies {
  readonly amapProvider: PlaceProvider;
  readonly googleProvider: PlaceProvider;
  readonly isAmapReady: () => boolean;
  readonly initializeGoogle: () => Promise<boolean>;
}

export class PlaceProviderSessionError extends Error {
  readonly code = 'provider_not_ready';

  constructor(public readonly providerId: PlaceProviderId) {
    super(`${providerId} PlaceProvider is not ready.`);
    this.name = 'PlaceProviderSessionError';
  }
}

const productionDependencies: PlaceProviderSessionDependencies = {
  amapProvider: new AmapPlaceProvider(),
  googleProvider: new GooglePlaceProvider(),
  isAmapReady: isAmapSearchConfigured,
  initializeGoogle: initializeGooglePlaces,
};

/** The production app uses Apple for search and map picking in every region. */
export async function resolveApplePlaceProviderSession(
  _trip: Pick<Trip, 'mapRegion'>,
  dependencies: { initialize: () => Promise<boolean>; provider: PlaceProvider } = {
    initialize: initializeApplePlaces,
    provider: new ApplePlaceProvider(),
  },
): Promise<PlaceProviderSession> {
  if (!await dependencies.initialize()) throw new PlaceProviderSessionError('apple');
  return { mapRegion: 'global', providerId: 'apple', coordinateSystem: 'wgs84', provider: dependencies.provider };
}

/**
 * Resolve once from persisted Trip.mapRegion. Phone location and map viewport
 * are deliberately absent from this boundary and cannot change the session.
 */
export async function resolvePlaceProviderSession(
  trip: Pick<Trip, 'mapRegion'>,
  dependencies: PlaceProviderSessionDependencies = productionDependencies,
): Promise<PlaceProviderSession> {
  const stack = resolveTripMapStack(trip);
  if (stack.placeProvider === 'amap') {
    if (!dependencies.isAmapReady()) {
      throw new PlaceProviderSessionError('amap');
    }
    return Object.freeze({
      mapRegion: stack.mapRegion,
      providerId: stack.placeProvider,
      coordinateSystem: stack.coordinateSystem,
      provider: dependencies.amapProvider,
    });
  }

  if (!await dependencies.initializeGoogle()) {
    throw new PlaceProviderSessionError('google');
  }
  return Object.freeze({
    mapRegion: stack.mapRegion,
    providerId: stack.placeProvider,
    coordinateSystem: stack.coordinateSystem,
    provider: dependencies.googleProvider,
  });
}

/**
 * Resolve a mixed-region search session while retaining the persisted Trip
 * map stack as the default picker context. Unlike the legacy resolver, this
 * function does not probe or initialize either provider: readiness is checked
 * by the composite at request time, after the caller has had an opportunity to
 * complete AMap privacy setup.
 */
export async function resolveAutomaticPlaceProviderSession(
  trip: Pick<Trip, 'mapRegion'>,
  dependencies: PlaceProviderSessionDependencies = productionDependencies,
): Promise<PlaceProviderSession> {
  const stack = resolveTripMapStack(trip);
  const provider = new AutomaticPlaceProvider({
    amapProvider: dependencies.amapProvider,
    googleProvider: dependencies.googleProvider,
    isAmapReady: dependencies.isAmapReady,
    initializeGoogle: dependencies.initializeGoogle,
  });
  return Object.freeze({
    mapRegion: stack.mapRegion,
    providerId: stack.placeProvider,
    coordinateSystem: stack.coordinateSystem,
    automatic: true as const,
    provider,
  });
}
