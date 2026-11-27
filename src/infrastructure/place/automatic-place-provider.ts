import type { CoordinateSystem } from '@/domain/common/types';
import { assertCoordinate } from '@/domain/common/coordinate';
import type {
  PlaceProvider,
  PlaceSearchPage,
  PlaceSearchQuery,
  PlaceSearchResult,
  PlaceProviderId,
  ReverseGeocodeQuery,
  ReverseGeocodeResult,
} from './place-provider';

type AutomaticProviderId = Extract<PlaceProviderId, 'amap' | 'google'>;

export interface AutomaticPlaceProviderDependencies {
  readonly amapProvider: PlaceProvider;
  readonly googleProvider: PlaceProvider;
  /** Readiness is checked for every search/reverse-geocode request. */
  readonly isAmapReady: () => boolean;
  /** Initialization is deliberately deferred until a request needs Google. */
  readonly initializeGoogle: () => Promise<boolean>;
}

export type AutomaticPlaceProviderErrorCode =
  | 'invalid_query'
  | 'provider_not_ready'
  | 'provider_error';

export class AutomaticPlaceProviderError extends Error {
  constructor(
    public readonly code: AutomaticPlaceProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AutomaticPlaceProviderError';
  }
}

interface AutomaticCursor {
  version: 1;
  queryShape: string;
  amap: string | null;
  google: string | null;
}

interface ProviderFailure {
  provider: AutomaticProviderId;
  error: unknown;
}

const providerCoordinateSystems: Record<AutomaticProviderId, CoordinateSystem> = {
  amap: 'gcj02',
  google: 'wgs84',
};

function providerFor(
  dependencies: AutomaticPlaceProviderDependencies,
  provider: AutomaticProviderId,
): PlaceProvider {
  return provider === 'amap' ? dependencies.amapProvider : dependencies.googleProvider;
}

function queryShape(query: PlaceSearchQuery): string {
  return JSON.stringify({
    keyword: query.keyword.trim(),
    center: query.center === undefined
      ? null
      : {
          latitude: query.center.latitude,
          longitude: query.center.longitude,
          system: query.center.system,
        },
    region: query.region === undefined
      ? null
      : {
          countryCode: query.region.countryCode ?? null,
          city: query.region.city ?? null,
        },
    limit: query.limit ?? null,
  });
}

function encodeCursor(
  query: PlaceSearchQuery,
  cursors: Pick<AutomaticCursor, 'amap' | 'google'>,
): string {
  const value: AutomaticCursor = {
    version: 1,
    queryShape: queryShape(query),
    amap: cursors.amap,
    google: cursors.google,
  };
  return `automatic:v1:${encodeURIComponent(JSON.stringify(value))}`;
}

function parseCursor(query: PlaceSearchQuery): AutomaticCursor | null {
  if (query.cursor === undefined) return null;
  const prefix = 'automatic:v1:';
  if (!query.cursor.startsWith(prefix)) {
    throw new AutomaticPlaceProviderError(
      'invalid_query',
      'Invalid automatic PlaceProvider continuation cursor. Start the search again.',
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(query.cursor.slice(prefix.length)));
  } catch (error) {
    throw new AutomaticPlaceProviderError(
      'invalid_query',
      'Invalid automatic PlaceProvider continuation cursor. Start the search again.',
      { cause: error },
    );
  }

  if (
    typeof value !== 'object'
    || value === null
    || (value as { version?: unknown }).version !== 1
    || typeof (value as { queryShape?: unknown }).queryShape !== 'string'
    || !('amap' in value)
    || !('google' in value)
    || (
      (value as { amap?: unknown }).amap !== null
      && typeof (value as { amap?: unknown }).amap !== 'string'
    )
    || (
      (value as { google?: unknown }).google !== null
      && typeof (value as { google?: unknown }).google !== 'string'
    )
  ) {
    throw new AutomaticPlaceProviderError(
      'invalid_query',
      'Invalid automatic PlaceProvider continuation cursor. Start the search again.',
    );
  }

  const cursor = value as AutomaticCursor;
  if (cursor.queryShape !== queryShape(query)) {
    throw new AutomaticPlaceProviderError(
      'invalid_query',
      'This PlaceProvider continuation belongs to another keyword or search context. Start the search again.',
    );
  }
  return cursor;
}

function providerQuery(
  query: PlaceSearchQuery,
  provider: AutomaticProviderId,
  cursor: string | null,
): PlaceSearchQuery {
  const next: PlaceSearchQuery = {
    keyword: query.keyword,
    ...(query.region === undefined ? {} : { region: query.region }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
  if (query.center?.system === providerCoordinateSystems[provider]) {
    next.center = query.center;
  }
  if (cursor !== null) next.cursor = cursor;
  return next;
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failureMessage(failures: readonly ProviderFailure[]): string {
  const detail = failures
    .map(({ provider, error }) => `${provider}: ${describeFailure(error)}`)
    .join('; ');
  return `No PlaceProvider could answer this search. Check map privacy/configuration and retry. ${detail}`;
}

function combineSuggestions(pages: readonly PlaceSearchPage[]): string[] | undefined {
  const suggestions = [...new Set(pages.flatMap((page) => page.suggestions ?? []))];
  return suggestions.length > 0 ? suggestions : undefined;
}

function combineResults(pages: readonly PlaceSearchPage[]): PlaceSearchResult[] {
  return pages.flatMap((page) => page.results);
}

/**
 * A provider facade for a Trip that may contain both mainland-China and
 * overseas Items. The facade never changes a provider result's identity or
 * coordinate system; it only multiplexes provider requests and cursors.
 */
export class AutomaticPlaceProvider implements PlaceProvider {
  constructor(private readonly dependencies: AutomaticPlaceProviderDependencies) {}

  private async checkReady(provider: AutomaticProviderId): Promise<boolean> {
    if (provider === 'amap') {
      return this.dependencies.isAmapReady();
    }
    return this.dependencies.initializeGoogle();
  }

  private async readyProviders(
    providers: readonly AutomaticProviderId[],
  ): Promise<{ ready: AutomaticProviderId[]; failures: ProviderFailure[] }> {
    const checks = await Promise.all(providers.map(async (provider) => {
      try {
        return {
          provider,
          ready: await this.checkReady(provider),
          error: null,
        };
      } catch (error) {
        return { provider, ready: false, error };
      }
    }));
    const ready = checks.filter(({ ready }) => ready).map(({ provider }) => provider);
    const failures = checks
      .filter(({ ready, error }) => !ready || error !== null)
      .map(({ provider, error }) => ({
        provider,
        error: error ?? new Error(`${provider} PlaceProvider is not ready.`),
      }));
    return { ready, failures };
  }

  async search(query: PlaceSearchQuery): Promise<PlaceSearchPage> {
    const keyword = query.keyword.trim();
    if (!keyword) {
      throw new AutomaticPlaceProviderError(
        'invalid_query',
        'Search keyword is required.',
      );
    }

    const cursor = parseCursor(query);
    const requested: readonly { provider: AutomaticProviderId; cursor: string | null }[] =
      cursor === null
        ? [
            { provider: 'amap', cursor: null },
            { provider: 'google', cursor: null },
          ]
        : [
            ...(cursor.amap === null ? [] : [{ provider: 'amap' as const, cursor: cursor.amap }]),
            ...(cursor.google === null ? [] : [{ provider: 'google' as const, cursor: cursor.google }]),
          ];

    if (requested.length === 0) {
      return { results: [], nextCursor: null };
    }

    const { ready, failures: readinessFailures } = await this.readyProviders(
      requested.map(({ provider }) => provider),
    );
    if (ready.length === 0) {
      throw new AutomaticPlaceProviderError(
        'provider_not_ready',
        'No PlaceProvider is ready. Enable AMap privacy consent or configure Google Places, then retry.',
        { cause: readinessFailures[0]?.error },
      );
    }

    const pages = await Promise.all(ready.map(async (provider) => {
      const request = requested.find((entry) => entry.provider === provider)!;
      try {
        return {
          provider,
          page: await providerFor(this.dependencies, provider).search(
            providerQuery(query, provider, request.cursor),
          ),
          error: null,
        };
      } catch (error) {
        return { provider, page: null, error };
      }
    }));
    const successfulPages = pages.filter((entry): entry is {
      provider: AutomaticProviderId;
      page: PlaceSearchPage;
      error: null;
    } => entry.page !== null);
    if (successfulPages.length === 0) {
      throw new AutomaticPlaceProviderError(
        'provider_error',
        failureMessage([
          ...readinessFailures,
          ...pages.map(({ provider, error }) => ({
            provider,
            error: error ?? new Error('Provider returned no page.'),
          })),
        ]),
      );
    }

    const pageByProvider = new Map(successfulPages.map(({ provider, page }) => [provider, page]));
    const continuation = (provider: AutomaticProviderId) => pageByProvider.has(provider)
      ? pageByProvider.get(provider)!.nextCursor
      : requested.find((entry) => entry.provider === provider)?.cursor ?? null;
    const nextCursors = {
      amap: continuation('amap'),
      google: continuation('google'),
    };
    return {
      results: combineResults(successfulPages.map(({ page }) => page)),
      nextCursor: nextCursors.amap !== null || nextCursors.google !== null
        ? encodeCursor(query, nextCursors)
        : null,
      suggestions: combineSuggestions(successfulPages.map(({ page }) => page)),
      unavailableProviders: [...new Set([
        ...readinessFailures.map(({ provider }) => provider),
        ...pages.filter(({ page }) => page === null).map(({ provider }) => provider),
      ])],
    };
  }

  async reverseGeocode(query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> {
    assertCoordinate(query.coordinate);
    const provider: AutomaticProviderId = query.coordinate.system === 'gcj02'
      ? 'amap'
      : 'google';
    let ready: boolean;
    try {
      ready = await this.checkReady(provider);
    } catch (error) {
      throw new AutomaticPlaceProviderError(
        'provider_not_ready',
        `${provider} PlaceProvider is not ready. Initialize it before reverse geocoding.`,
        { cause: error },
      );
    }
    if (!ready) {
      throw new AutomaticPlaceProviderError(
        'provider_not_ready',
        `${provider} PlaceProvider is not ready. Initialize it before reverse geocoding.`,
      );
    }

    const reverseGeocode = providerFor(this.dependencies, provider).reverseGeocode;
    if (reverseGeocode === undefined) {
      throw new AutomaticPlaceProviderError(
        'provider_error',
        `${provider} PlaceProvider does not support reverse geocoding.`,
      );
    }
    return reverseGeocode.call(providerFor(this.dependencies, provider), query);
  }
}
