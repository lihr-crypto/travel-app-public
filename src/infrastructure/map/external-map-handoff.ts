import { Linking } from 'react-native';

import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Place } from '@/domain/place/types';
import type { Coordinate } from '@/domain/common/types';
import type { Trip } from '@/domain/trip/types';
import { resolveTripMapStack, type TripMapStack } from './map-provider-policy';

export type ExternalMapApp = TripMapStack['renderer'] | 'apple';

export type ExternalMapTarget = Readonly<{
  app: ExternalMapApp;
  coordinateSystem: TripMapStack['coordinateSystem'];
}>;

/** Provider source tag AMap asks callers to send for service quality. */
const AMAP_SOURCE = 'travel-app';

/**
 * The external app is the same choice the persisted Trip already made for its
 * renderer and PlaceProvider, so no new policy is introduced here.
 */
export function resolveExternalMapTarget(
  trip: Pick<Trip, 'mapRegion'>,
  coordinate?: Coordinate,
  provider?: string | null,
): ExternalMapTarget {
  if (provider === 'apple') {
    if (coordinate) assertCoordinateSystem(coordinate, 'wgs84');
    return { app: 'apple', coordinateSystem: 'wgs84' };
  }
  const stack = resolveTripMapStack(coordinate
    ? { mapRegion: coordinate.system === 'gcj02' ? 'china_mainland' : 'global' }
    : trip);
  if (coordinate) assertCoordinateSystem(coordinate, stack.coordinateSystem);
  return Object.freeze({
    app: stack.renderer,
    coordinateSystem: stack.coordinateSystem,
  });
}

/** Official iOS URI that opens the installed AMap app at a GCJ-02 coordinate. */
export function buildAmapAppUrl(
  place: Pick<Place, 'name' | 'coordinate'>,
  target: ExternalMapTarget,
): string {
  assertCoordinateSystem(place.coordinate, target.coordinateSystem);
  if (target.app !== 'amap') {
    throw new RangeError('AMap app URL requires the AMap map provider');
  }
  const { latitude, longitude } = place.coordinate;
  return `iosamap://viewMap?sourceApplication=${encodeURIComponent(AMAP_SOURCE)}`
    + `&poiname=${encodeURIComponent(place.name)}`
    + `&lat=${latitude}&lon=${longitude}&dev=0`;
}

/**
 * Build the web fallback for the saved Place.
 *
 * The saved snapshot stays provider-native: a Place whose coordinate system
 * does not match the Trip's provider fails closed instead of being converted.
 */
export function buildExternalMapUrl(
  place: Pick<Place, 'name' | 'coordinate'>,
  target: ExternalMapTarget,
): string {
  assertCoordinateSystem(place.coordinate, target.coordinateSystem);
  const { latitude, longitude } = place.coordinate;

  if (target.app === 'apple') {
    return `https://maps.apple.com/?ll=${latitude},${longitude}&q=${encodeURIComponent(place.name)}`;
  }

  if (target.app === 'amap') {
    const parameters = [
      `position=${longitude},${latitude}`,
      `name=${encodeURIComponent(place.name)}`,
      'coordinate=gaode',
      'callnative=1',
      `src=${AMAP_SOURCE}`,
    ];
    return `https://uri.amap.com/marker?${parameters.join('&')}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${latitude},${longitude}`,
  )}`;
}

export interface OpenPlaceInExternalMapInput {
  place: Pick<Place, 'name' | 'coordinate'> & Partial<Pick<Place, 'provider'>>;
  trip: Pick<Trip, 'mapRegion'>;
  /** Injected so tests never reach the operating system. */
  openUrl?: (url: string) => Promise<unknown>;
  /** Injected installation probe; required by iOS for custom-scheme detection. */
  canOpenUrl?: (url: string) => Promise<boolean>;
}

export interface ExternalMapHandoff {
  app: ExternalMapApp;
  url: string;
}

/** Hand a saved Place to its provider's app. No in-app routing is started. */
export async function openPlaceInExternalMap({
  place,
  trip,
  openUrl = (url) => Linking.openURL(url),
  canOpenUrl = (url) => Linking.canOpenURL(url),
}: OpenPlaceInExternalMapInput): Promise<ExternalMapHandoff> {
  const target = resolveExternalMapTarget(trip, place.coordinate, place.provider);

  if (target.app === 'amap') {
    const appUrl = buildAmapAppUrl(place, target);
    try {
      if (await canOpenUrl(appUrl)) {
        try {
          await openUrl(appUrl);
          return { app: target.app, url: appUrl };
        } catch {
          // An installed-app query is only a hint; retain the web fallback if
          // the app declines this particular URI.
        }
      }
    } catch {
      // A failed/unsupported scheme probe must not prevent the web fallback.
    }
  }

  const url = buildExternalMapUrl(place, target);
  await openUrl(url);
  return { app: target.app, url };
}
