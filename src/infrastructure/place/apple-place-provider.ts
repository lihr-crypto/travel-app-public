import {
  reverseGeocodeAppleCoordinate,
  searchApplePlaces,
  type NativeApplePlaceResult,
  type NativeApplePlacesPage,
  type NativeApplePlacesSearchQuery,
  type NativeAppleReverseGeocodeQuery,
  type NativeAppleReverseGeocodeResult,
} from '../../../modules/expo-apple-places/src/ExpoApplePlacesModule';

import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate } from '@/domain/common/types';
import type {
  PlaceProvider,
  PlaceSearchQuery,
  PlaceSearchResult,
  ReverseGeocodeQuery,
  ReverseGeocodeResult,
} from './place-provider';
import { PlaceProviderError } from './place-provider';

export interface ApplePlacesNativeClient {
  search(query: NativeApplePlacesSearchQuery): Promise<NativeApplePlacesPage>;
  reverseGeocode(
    query: NativeAppleReverseGeocodeQuery,
  ): Promise<NativeAppleReverseGeocodeResult | null>;
}

const nativeClient: ApplePlacesNativeClient = {
  search: searchApplePlaces,
  reverseGeocode: reverseGeocodeAppleCoordinate,
};

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function providerError(error: unknown, operation: string): PlaceProviderError {
  const nativeCode = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  const code = nativeCode === 'ERR_APPLE_PLACES_INVALID_QUERY'
    ? 'invalid_query'
    : nativeCode === 'ERR_APPLE_PLACES_THROTTLED'
      ? 'rate_limited'
    : 'provider_error';
  const message = error instanceof Error ? error.message : `Apple Places ${operation} failed.`;
  return new PlaceProviderError('apple', code, message, {
    cause: error instanceof Error ? error : undefined,
  });
}

function mapNativeResult(result: NativeApplePlaceResult): PlaceSearchResult | null {
  const name = optionalString(result.name);
  if (
    !name
    || typeof result.latitude !== 'number' || !Number.isFinite(result.latitude)
    || typeof result.longitude !== 'number' || !Number.isFinite(result.longitude)
    || result.latitude < -90 || result.latitude > 90
    || result.longitude < -180 || result.longitude > 180
  ) return null;

  const coordinate: Coordinate = {
    latitude: result.latitude,
    longitude: result.longitude,
    system: 'wgs84',
  };
  try {
    assertCoordinateSystem(coordinate, 'wgs84');
  } catch (error) {
    throw new PlaceProviderError(
      'apple',
      'invalid_response',
      'Apple MapKit returned an invalid WGS84 coordinate.',
      { cause: error },
    );
  }

  const types = Array.isArray(result.types)
    ? result.types.filter((type): type is string => typeof type === 'string' && type.trim().length > 0)
    : [];
  const countryCode = optionalString(result.countryCode);
  const metadata: Record<string, unknown> = {};
  if (types.length > 0) metadata.types = types;
  if (countryCode) metadata.countryCode = countryCode;

  return {
    name,
    address: optionalString(result.address),
    coordinate,
    provider: 'apple',
    providerPlaceId: optionalString(result.providerPlaceId),
    regionLabel: optionalString(result.regionLabel) ?? countryCode,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

function normalizeQuery(query: PlaceSearchQuery): NativeApplePlacesSearchQuery {
  const keyword = query.keyword.trim();
  if (!keyword) {
    throw new PlaceProviderError('apple', 'invalid_query', 'Search keyword is required.');
  }
  if (query.cursor !== undefined && query.cursor.length > 0) {
    throw new PlaceProviderError(
      'apple',
      'invalid_query',
      'Apple MapKit search does not support continuation cursors.',
    );
  }

  if (query.center) {
    try {
      assertCoordinateSystem(query.center, 'wgs84');
    } catch (error) {
      throw new PlaceProviderError(
        'apple',
        'invalid_query',
        'ApplePlaceProvider requires a WGS84 search center.',
        { cause: error },
      );
    }
  }

  const requestedLimit = query.limit ?? 10;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new PlaceProviderError(
      'apple',
      'invalid_query',
      'Search limit must be a positive integer.',
    );
  }

  const city = optionalString(query.region?.city);
  return {
    keyword: city && !keyword.includes(city) ? `${keyword}, ${city}` : keyword,
    center: query.center
      ? { latitude: query.center.latitude, longitude: query.center.longitude }
      : undefined,
    limit: Math.min(requestedLimit, 25),
  };
}

export class ApplePlaceProvider implements PlaceProvider {
  constructor(private readonly native: ApplePlacesNativeClient = nativeClient) {}

  async search(query: PlaceSearchQuery) {
    const normalized = normalizeQuery(query);
    let page: NativeApplePlacesPage;
    try {
      page = await this.native.search(normalized);
    } catch (error) {
      throw providerError(error, 'search');
    }
    const results = page.results
      .map(mapNativeResult)
      .filter((result): result is PlaceSearchResult => result !== null);
    return {
      results,
      nextCursor: null,
      suggestions: Array.isArray(page.suggestions)
        ? page.suggestions.filter((suggestion): suggestion is string => typeof suggestion === 'string')
        : [],
    };
  }

  async reverseGeocode(query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> {
    try {
      assertCoordinateSystem(query.coordinate, 'wgs84');
    } catch (error) {
      throw new PlaceProviderError(
        'apple',
        'invalid_query',
        'ApplePlaceProvider requires a WGS84 reverse-geocode coordinate.',
        { cause: error },
      );
    }
    if (query.radiusMeters !== undefined
      && (!Number.isFinite(query.radiusMeters) || query.radiusMeters <= 0)) {
      throw new PlaceProviderError(
        'apple',
        'invalid_query',
        'Reverse-geocode radius must be a positive finite number.',
      );
    }

    let result: NativeAppleReverseGeocodeResult | null;
    try {
      result = await this.native.reverseGeocode({
        latitude: query.coordinate.latitude,
        longitude: query.coordinate.longitude,
      });
    } catch (error) {
      throw providerError(error, 'reverse geocode');
    }
    if (result === null) return null;

    const name = optionalString(result.name);
    const address = optionalString(result.formattedAddress);
    const countryCode = optionalString(result.countryCode);
    const regionLabel = optionalString(result.regionLabel) ?? countryCode;
    if (!name && !address && !regionLabel) {
      throw new PlaceProviderError(
        'apple',
        'invalid_response',
        'Apple MapKit returned no reverse-geocode details.',
      );
    }

    return {
      provider: 'apple',
      coordinate: {
        latitude: query.coordinate.latitude,
        longitude: query.coordinate.longitude,
        system: 'wgs84',
      },
      name,
      address,
      regionLabel,
      providerPlaceId: optionalString(result.providerPlaceId),
      metadata: countryCode ? { countryCode } : null,
    };
  }
}
