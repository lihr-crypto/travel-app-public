import {
  reverseGeocodeAmapCoordinate,
  getAmapInputTips,
  searchAmapPlaces,
  type NativeAmapReGeocodeQuery,
  type NativeAmapReGeocodeResult,
  type NativeAmapSearchQuery,
  type NativeAmapSearchPage,
  type NativeAmapSearchResult,
} from '../../../modules/expo-amap-search/src/ExpoAmapSearchModule';

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

export interface AmapSearchNativeClient {
  search(query: NativeAmapSearchQuery): Promise<NativeAmapSearchPage>;
  inputTips(query: NativeAmapSearchQuery): Promise<NativeAmapSearchResult[]>;
  reverseGeocode(
    query: NativeAmapReGeocodeQuery,
  ): Promise<NativeAmapReGeocodeResult | null>;
}

const nativeClient: AmapSearchNativeClient = {
  search: searchAmapPlaces,
  inputTips: getAmapInputTips,
  reverseGeocode: reverseGeocodeAmapCoordinate,
};

/** AMap documents a 0-3000 m radius and defaults to 1000 m. */
const DEFAULT_REVERSE_GEOCODE_RADIUS = 1000;
const MAX_REVERSE_GEOCODE_RADIUS = 3000;

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function mapNativeResult(result: NativeAmapSearchResult): PlaceSearchResult | null {
  const name = optionalString(result.name);
  const providerPlaceId = optionalString(result.uid);
  if (
    !name || !providerPlaceId
    || typeof result.latitude !== 'number' || !Number.isFinite(result.latitude)
    || typeof result.longitude !== 'number' || !Number.isFinite(result.longitude)
    || result.latitude < -90 || result.latitude > 90
    || result.longitude < -180 || result.longitude > 180
  ) return null;
  const coordinate = {
    latitude: result.latitude,
    longitude: result.longitude,
    system: 'gcj02' as const,
  };

  try {
    assertCoordinateSystem(coordinate, 'gcj02');
  } catch (error) {
    throw new PlaceProviderError(
      'amap',
      'invalid_response',
      'AMap returned an invalid GCJ-02 coordinate.',
      { cause: error },
    );
  }

  const metadataEntries = [
    ['province', optionalString(result.province)],
    ['city', optionalString(result.city)],
    ['district', optionalString(result.district)],
    ['type', optionalString(result.type)],
    ['typeCode', optionalString(result.typeCode)],
  ].filter((entry): entry is [string, string] => entry[1] !== null);

  return {
    name,
    address: optionalString(result.address),
    coordinate,
    provider: 'amap',
    providerPlaceId,
    regionLabel:
      optionalString(result.district)
      ?? optionalString(result.city)
      ?? optionalString(result.province),
    metadata: metadataEntries.length > 0
      ? Object.fromEntries(metadataEntries)
      : null,
  };
}

function normalizeQuery(query: PlaceSearchQuery): NativeAmapSearchQuery {
  const keyword = query.keyword.trim();
  if (!keyword) {
    throw new PlaceProviderError('amap', 'invalid_query', 'Search keyword is required.');
  }

  const countryCode = query.region?.countryCode?.trim().toUpperCase();
  if (countryCode && countryCode !== 'CN' && countryCode !== 'CHN') {
    throw new PlaceProviderError(
      'amap',
      'invalid_query',
      'AmapPlaceProvider only accepts mainland-China search regions.',
    );
  }

  if (query.center) {
    try {
      assertCoordinateSystem(query.center, 'gcj02');
    } catch (error) {
      throw new PlaceProviderError(
        'amap',
        'invalid_query',
        'AmapPlaceProvider requires a GCJ-02 search center.',
        { cause: error },
      );
    }
  }

  const requestedLimit = query.limit ?? 10;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new PlaceProviderError(
      'amap',
      'invalid_query',
      'Search limit must be a positive integer.',
    );
  }

  const city = optionalString(query.region?.city) ?? undefined;
  const center = query.center
    ? {
        latitude: query.center.latitude,
        longitude: query.center.longitude,
      }
    : undefined;
  const limit = Math.min(requestedLimit, 25);
  const continuationShape = { keyword, city: city ?? null, center: center ?? null, limit };
  return {
    keyword,
    city,
    center,
    limit,
    page: parseCursor(query.cursor, continuationShape),
  };
}

type AmapContinuationShape = {
  keyword: string;
  city: string | null;
  center: { latitude: number; longitude: number } | null;
  limit: number;
};

function parseCursor(cursor: string | undefined, shape: AmapContinuationShape): number {
  if (cursor === undefined) return 1;
  const match = /^amap:(\d{1,3}):(.+)$/.exec(cursor);
  const page = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(page) || page < 2 || page > 100) {
    throw new PlaceProviderError('amap', 'invalid_query', 'Invalid AMap search cursor.');
  }
  let cursorShape: string;
  try {
    cursorShape = decodeURIComponent(match![2]);
  } catch {
    throw new PlaceProviderError('amap', 'invalid_query', 'Invalid AMap search cursor.');
  }
  if (cursorShape !== JSON.stringify(shape)) {
    throw new PlaceProviderError('amap', 'invalid_query', 'AMap search cursor belongs to another query.');
  }
  return page;
}

function makeCursor(page: number, query: NativeAmapSearchQuery): string {
  const shape: AmapContinuationShape = {
    keyword: query.keyword,
    city: query.city ?? null,
    center: query.center ?? null,
    limit: query.limit,
  };
  return `amap:${page}:${encodeURIComponent(JSON.stringify(shape))}`;
}

function normalizeReverseQuery(
  query: ReverseGeocodeQuery,
): NativeAmapReGeocodeQuery {
  try {
    assertCoordinateSystem(query.coordinate, 'gcj02');
  } catch (error) {
    throw new PlaceProviderError(
      'amap',
      'invalid_query',
      'AmapPlaceProvider requires a GCJ-02 reverse-geocode coordinate.',
      { cause: error },
    );
  }

  const requestedRadius = query.radiusMeters ?? DEFAULT_REVERSE_GEOCODE_RADIUS;
  if (!Number.isFinite(requestedRadius) || requestedRadius <= 0) {
    throw new PlaceProviderError(
      'amap',
      'invalid_query',
      'Reverse-geocode radius must be a positive number of metres.',
    );
  }

  return {
    latitude: query.coordinate.latitude,
    longitude: query.coordinate.longitude,
    radius: Math.min(Math.round(requestedRadius), MAX_REVERSE_GEOCODE_RADIUS),
  };
}

/**
 * AMap answers a re-geocode request with an address and the POIs inside the
 * radius; it does not echo a coordinate, so the requested provider-native
 * coordinate is the one reported back.
 */
function mapNativeReGeocode(
  result: NativeAmapReGeocodeResult,
  coordinate: Coordinate,
): ReverseGeocodeResult {
  const address = optionalString(result.formattedAddress);
  const name = optionalString(result.poiName);
  const regionLabel =
    optionalString(result.district)
    ?? optionalString(result.city)
    ?? optionalString(result.province);

  if (address === null && name === null && regionLabel === null) {
    throw new PlaceProviderError(
      'amap',
      'invalid_response',
      'AMap returned a re-geocode result without an address or place name.',
    );
  }

  const metadataEntries = [
    ['province', optionalString(result.province)],
    ['city', optionalString(result.city)],
    ['district', optionalString(result.district)],
    ['township', optionalString(result.township)],
    ['neighborhood', optionalString(result.neighborhood)],
    ['building', optionalString(result.building)],
    ['adcode', optionalString(result.adcode)],
    ['poiType', optionalString(result.poiType)],
  ].filter((entry): entry is [string, string] => entry[1] !== null);

  return {
    provider: 'amap',
    coordinate,
    name,
    address,
    regionLabel,
    providerPlaceId: optionalString(result.poiUid),
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
  if (code === 'ERR_AMAP_NOT_CONFIGURED') {
    return new PlaceProviderError(
      'amap',
      'not_configured',
      'AMap Search is not configured.',
      { cause: error },
    );
  }
  if (code === 'ERR_AMAP_INVALID_QUERY') {
    return new PlaceProviderError(
      'amap',
      'invalid_query',
      'AMap rejected the search query.',
      { cause: error },
    );
  }
  return new PlaceProviderError(
    'amap',
    'provider_error',
    'AMap Search failed.',
    { cause: error },
  );
}

export class AmapPlaceProvider implements PlaceProvider {
  constructor(private readonly client: AmapSearchNativeClient = nativeClient) {}

  async search(query: PlaceSearchQuery) {
    const nativeQuery = normalizeQuery(query);
    let page: NativeAmapSearchPage;
    try {
      page = await this.client.search(nativeQuery);
    } catch (error) {
      throw mapNativeError(error);
    }
    let tips: NativeAmapSearchResult[] = [];
    if (nativeQuery.page === 1 && !query.cursor) {
      try {
        tips = await this.client.inputTips(nativeQuery);
      } catch {
        // Input Tips improves known-place matching, while keyword POI search
        // remains the durable fallback when suggestions are unavailable.
      }
    }
    const unique = new Map<string, PlaceSearchResult>();
    for (const result of [...tips, ...page.results]) {
      const mapped = mapNativeResult(result);
      if (mapped && mapped.providerPlaceId && !unique.has(mapped.providerPlaceId)) {
        unique.set(mapped.providerPlaceId, mapped);
      }
    }
    return {
      results: [...unique.values()],
      nextCursor: page.count >= nativeQuery.limit && (nativeQuery.page ?? 1) < 100
        ? makeCursor((nativeQuery.page ?? 1) + 1, nativeQuery)
        : null,
      suggestions: page.suggestions,
    };
  }

  async reverseGeocode(
    query: ReverseGeocodeQuery,
  ): Promise<ReverseGeocodeResult | null> {
    const nativeQuery = normalizeReverseQuery(query);
    let result: NativeAmapReGeocodeResult | null;
    try {
      result = await this.client.reverseGeocode(nativeQuery);
    } catch (error) {
      throw mapNativeError(error);
    }
    if (result === null || result === undefined) return null;

    return mapNativeReGeocode(result, {
      latitude: nativeQuery.latitude,
      longitude: nativeQuery.longitude,
      system: 'gcj02',
    });
  }
}
