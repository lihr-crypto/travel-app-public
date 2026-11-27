import type { Coordinate } from '@/domain/common/types';

export type PlaceProviderId = 'amap' | 'google' | 'apple';

export interface PlaceSearchQuery {
  keyword: string;
  center?: Coordinate;
  /** Opaque continuation token returned by the same provider/query. */
  cursor?: string;
  region?: {
    countryCode?: string;
    city?: string;
  };
  limit?: number;
}

export interface PlaceSearchPage {
  results: PlaceSearchResult[];
  nextCursor: string | null;
  /** Provider-suggested alternate query strings, when available. */
  suggestions?: string[];
  /** An automatic search may return one healthy source while the other fails. */
  unavailableProviders?: PlaceProviderId[];
}

/** Transient provider-neutral data. Persistence happens only after Preview confirmation. */
export interface PlaceSearchResult {
  name: string;
  address: string | null;
  coordinate: Coordinate;
  provider: PlaceProviderId;
  providerPlaceId: string | null;
  regionLabel: string | null;
  metadata: Record<string, unknown> | null;
}

export type PlaceProviderErrorCode =
  | 'invalid_query'
  | 'not_configured'
  | 'provider_error'
  | 'rate_limited'
  | 'invalid_response';

export class PlaceProviderError extends Error {
  constructor(
    public readonly provider: PlaceProviderId,
    public readonly code: PlaceProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PlaceProviderError';
  }
}

export interface ReverseGeocodeQuery {
  /** Provider-native coordinate picked in the Map Picker. */
  coordinate: Coordinate;
  /** Optional search radius in metres; providers clamp it to their own limits. */
  radiusMeters?: number;
}

/**
 * Transient enrichment for a picked coordinate. It is never persisted on its
 * own: a confirmed Map Picker result still has to pass through the ordinary
 * Place confirmation command.
 */
export interface ReverseGeocodeResult {
  provider: PlaceProviderId;
  /** Provider-native coordinate echoed back so a caller can reject stale answers. */
  coordinate: Coordinate;
  /** Nearest POI or place name, when the provider reports one. */
  name: string | null;
  address: string | null;
  regionLabel: string | null;
  providerPlaceId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PlaceProvider {
  search(query: PlaceSearchQuery): Promise<PlaceSearchPage>;
  /**
   * Optional capability. A provider that cannot resolve an address for a
   * coordinate simply omits this method, and callers must keep working with the
   * coordinate alone. A `null` result means the provider answered but had
   * nothing to report; a rejected promise means the lookup failed.
   */
  reverseGeocode?(
    query: ReverseGeocodeQuery,
  ): Promise<ReverseGeocodeResult | null>;
}
