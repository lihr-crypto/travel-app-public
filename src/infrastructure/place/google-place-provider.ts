import {
  reverseGeocodeGoogleCoordinate,
  searchGooglePlaces,
  type NativeGoogleReverseGeocodeQuery,
  type NativeGoogleReverseGeocodeResult,
  type NativeGooglePlacesSearchQuery,
  type NativeGooglePlacesSearchPage,
  type NativeGooglePlacesSearchResult,
} from '../../../modules/expo-google-places/src/ExpoGooglePlacesModule';

import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type {
  PlaceProvider,
  PlaceSearchPage,
  PlaceSearchQuery,
  PlaceSearchResult,
  ReverseGeocodeQuery,
  ReverseGeocodeResult,
} from './place-provider';
import { PlaceProviderError } from './place-provider';

export interface GooglePlacesNativeClient {
  search(
    query: NativeGooglePlacesSearchQuery,
  ): Promise<NativeGooglePlacesSearchPage>;
  reverseGeocode(
    query: NativeGoogleReverseGeocodeQuery,
  ): Promise<NativeGoogleReverseGeocodeResult | null>;
}

const nativeClient: GooglePlacesNativeClient = {
  search: searchGooglePlaces,
  reverseGeocode: reverseGeocodeGoogleCoordinate,
};

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function mapNativeResult(
  result: NativeGooglePlacesSearchResult,
): PlaceSearchResult {
  const name = optionalString(result.name);
  const placeId = optionalString(result.placeId);
  const coordinate = {
    latitude: result.latitude,
    longitude: result.longitude,
    system: 'wgs84' as const,
  };
  if (!name || !placeId) {
    throw new PlaceProviderError(
      'google',
      'invalid_response',
      'Google Places returned a place without a name or Place ID.',
    );
  }
  try {
    assertCoordinateSystem(coordinate, 'wgs84');
  } catch (error) {
    throw new PlaceProviderError(
      'google',
      'invalid_response',
      'Google Places returned an invalid WGS84 coordinate.',
      { cause: error },
    );
  }

  const types = result.types
    .map(optionalString)
    .filter((value): value is string => value !== null);
  const attributions = (result.attributions ?? []).flatMap((attribution) => {
    const text = optionalString(attribution.text);
    if (!text) return [];
    const url = optionalString(attribution.url);
    return [{ text, ...(url ? { url } : {}) }];
  });
  return {
    name,
    address: optionalString(result.address),
    coordinate,
    provider: 'google',
    providerPlaceId: placeId,
    regionLabel: optionalString(result.regionLabel),
    metadata: types.length > 0 || attributions.length > 0
      ? {
          ...(types.length > 0 ? { types } : {}),
          ...(attributions.length > 0 ? { attributions } : {}),
        }
      : null,
  };
}

function normalizeQuery(
  query: PlaceSearchQuery,
): NativeGooglePlacesSearchQuery {
  const keyword = query.keyword.trim();
  if (!keyword) {
    throw new PlaceProviderError(
      'google', 'invalid_query', 'Search keyword is required.',
    );
  }

  const countryCode = query.region?.countryCode?.trim().toUpperCase();
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new PlaceProviderError(
      'google',
      'invalid_query',
      'Google Places countryCode must be an ISO 3166-1 alpha-2 code.',
    );
  }
  if (countryCode === 'CN') {
    throw new PlaceProviderError(
      'google',
      'invalid_query',
      'GooglePlaceProvider does not serve mainland-China Trip sessions.',
    );
  }

  if (query.center) {
    try {
      assertCoordinateSystem(query.center, 'wgs84');
    } catch (error) {
      throw new PlaceProviderError(
        'google',
        'invalid_query',
        'GooglePlaceProvider requires a WGS84 search center.',
        { cause: error },
      );
    }
  }

  const requestedLimit = query.limit ?? 10;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new PlaceProviderError(
      'google',
      'invalid_query',
      'Search limit must be a positive integer.',
    );
  }

  return {
    keyword,
    city: optionalString(query.region?.city) ?? undefined,
    countryCode,
    center: query.center
      ? {
          latitude: query.center.latitude,
          longitude: query.center.longitude,
        }
      : undefined,
    limit: Math.min(requestedLimit, 20),
    cursor: query.cursor,
  };
}

function normalizeReverseQuery(
  query: ReverseGeocodeQuery,
): NativeGoogleReverseGeocodeQuery {
  try {
    assertCoordinateSystem(query.coordinate, 'wgs84');
  } catch (error) {
    throw new PlaceProviderError(
      'google',
      'invalid_query',
      'GooglePlaceProvider requires a WGS84 reverse-geocode coordinate.',
      { cause: error },
    );
  }
  if (
    query.radiusMeters !== undefined
    && (!Number.isFinite(query.radiusMeters) || query.radiusMeters <= 0)
  ) {
    throw new PlaceProviderError(
      'google',
      'invalid_query',
      'Reverse-geocode radius must be a positive number of metres.',
    );
  }
  return {
    latitude: query.coordinate.latitude,
    longitude: query.coordinate.longitude,
  };
}

function mapNativeReverseGeocode(
  result: NativeGoogleReverseGeocodeResult,
  coordinate: ReverseGeocodeQuery['coordinate'],
): ReverseGeocodeResult {
  const address = optionalString(result.formattedAddress);
  const name = null;
  const regionLabel =
    optionalString(result.subLocality)
    ?? optionalString(result.locality)
    ?? optionalString(result.administrativeArea)
    ?? optionalString(result.country);
  if (address === null && name === null && regionLabel === null) {
    throw new PlaceProviderError(
      'google',
      'invalid_response',
      'Google Maps returned a reverse-geocode result without an address or region.',
    );
  }
  const metadataEntries = [
    ['thoroughfare', optionalString(result.thoroughfare)],
    ['locality', optionalString(result.locality)],
    ['subLocality', optionalString(result.subLocality)],
    ['administrativeArea', optionalString(result.administrativeArea)],
    ['postalCode', optionalString(result.postalCode)],
    ['country', optionalString(result.country)],
  ].filter((entry): entry is [string, string] => entry[1] !== null);
  return {
    provider: 'google',
    coordinate,
    name,
    address,
    regionLabel,
    providerPlaceId: null,
    metadata: metadataEntries.length > 0
      ? Object.fromEntries(metadataEntries)
      : null,
  };
}

function mapNativeError(error: unknown): PlaceProviderError {
  if (error instanceof PlaceProviderError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  if (code === 'ERR_GOOGLE_PLACES_NOT_CONFIGURED') {
    return new PlaceProviderError(
      'google',
      'not_configured',
      'Google Places is not configured.',
      { cause: error },
    );
  }
  if (code === 'ERR_GOOGLE_PLACES_INVALID_QUERY') {
    return new PlaceProviderError(
      'google',
      'invalid_query',
      'Google Places rejected the search query.',
      { cause: error },
    );
  }
  return new PlaceProviderError(
    'google',
    'provider_error',
    'Google Places search failed.',
    { cause: error },
  );
}

export class GooglePlaceProvider implements PlaceProvider {
  constructor(private readonly client: GooglePlacesNativeClient = nativeClient) {}

  async search(query: PlaceSearchQuery): Promise<PlaceSearchPage> {
    const nativeQuery = normalizeQuery(query);
    let page: NativeGooglePlacesSearchPage;
    try {
      page = await this.client.search(nativeQuery);
    } catch (error) {
      throw mapNativeError(error);
    }
    return {
      results: page.results.map(mapNativeResult),
      nextCursor: page.nextCursor,
      suggestions: page.suggestions,
    };
  }

  async reverseGeocode(
    query: ReverseGeocodeQuery,
  ): Promise<ReverseGeocodeResult | null> {
    const nativeQuery = normalizeReverseQuery(query);
    let result: NativeGoogleReverseGeocodeResult | null;
    try {
      result = await this.client.reverseGeocode(nativeQuery);
    } catch (error) {
      throw mapNativeError(error);
    }
    if (result === null || result === undefined) return null;
    return mapNativeReverseGeocode(result, {
      latitude: nativeQuery.latitude,
      longitude: nativeQuery.longitude,
      system: 'wgs84',
    });
  }
}
