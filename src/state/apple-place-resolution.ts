import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Place } from '@/domain/place/types';
import { projectAmapPlaceForMap, projectSavedWgs84PlaceForMap, type MapPlace } from '@/application/projections/map-place';
import { convertAmapCoordinatesToWgs84 } from '../../modules/expo-amap-search/src/ExpoAmapSearchModule';
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';
import { ApplePlaceProvider } from '@/infrastructure/place/apple-place-provider';
import { chooseLegacyAppleMatch } from '@/application/place/legacy-apple-match';
import { buildLegacyAppleQuery } from '@/application/place/legacy-apple-query';
import { PlaceProviderError } from '@/infrastructure/place/place-provider';
import { bindApplePlaceCommand } from '@/infrastructure/database/apple-place-command';
import { applePlaceBindingSource } from '@/infrastructure/database';

export const applePlaceResolutionKeys = {
  all: ['apple-place-bindings'] as const,
  places: (ids: readonly string[]) => ['apple-place-bindings', ...ids] as const,
};

const LEGACY_LOOKUP_INTERVAL_MS = 2_000;
const THROTTLE_RETRY_DELAY_MS = 60_000;

/** Saved names/native points stay immutable; display coordinates are separate. */
export function useApplePlaceResolution(
  rawPlaces: Readonly<Record<string, Place>>,
  autoResolve = true,
) {
  const queryClient = useQueryClient();
  const originals = useMemo(() => Object.values(rawPlaces), [rawPlaces]);
  const amapPlaces = useMemo(() => originals.filter(({ provider }) => provider === 'amap').sort((a, b) => a.id.localeCompare(b.id)), [originals]);
  const legacy = useMemo(() => originals.filter(({ provider }) => provider !== 'apple' && provider !== 'amap' && provider !== 'google'), [originals]);
  const projection = useQuery({
    queryKey: ['amap-display-coordinates', ...amapPlaces.map(({ id, coordinate }) => [id, coordinate.latitude, coordinate.longitude, coordinate.system])],
    enabled: amapPlaces.length > 0,
    queryFn: async () => {
      const coordinates = await convertAmapCoordinatesToWgs84(amapPlaces.map(({ coordinate }) => coordinate));
      if (coordinates.length !== amapPlaces.length) throw new RangeError('AMap display coordinate count mismatch');
      return Object.fromEntries(amapPlaces.map((place, index) => [place.id, coordinates[index]]));
    },
    staleTime: Infinity,
    retry: false,
  });
  const ids = useMemo(() => legacy.map(({ id }) => id).sort(), [legacy]);
  const query = useQuery({
    queryKey: applePlaceResolutionKeys.places(ids),
    queryFn: () => applePlaceBindingSource.getBindings(ids),
    retry: false,
  });
  const attempted = useRef(new Set<string>());
  const nextLookupAt = useRef(0);
  const lookupGeneration = useRef(0);
  const [activeLookup, setActiveLookup] = useState<{ placeId: string; generation: number } | null>(null);
  const [cycle, setCycle] = useState(0);
  const [manualVisible, setManualVisible] = useState(false);
  const mapPlacesById = useMemo(() => {
    const mapped: Record<string, MapPlace> = Object.fromEntries(
      originals.filter(({ provider }) => provider === 'apple' || provider === 'google').map((place) => [place.id, projectSavedWgs84PlaceForMap(place)]),
    );
    for (const place of amapPlaces) {
      const coordinate = projection.data?.[place.id];
      if (coordinate) mapped[place.id] = projectAmapPlaceForMap(place, coordinate);
    }
    for (const place of legacy) {
      const binding = query.data?.[place.id];
      if (binding) mapped[place.id] = { ...binding, displayName: place.name };
    }
    return mapped;
  }, [amapPlaces, legacy, originals, projection.data, query.data]);
  const unresolved = useMemo(() => legacy.filter(({ id }) => !mapPlacesById[id]), [legacy, mapPlacesById]);
  const confirm = useCallback(async (sourcePlaceId: string, result: PlaceSearchResult) => {
    await bindApplePlaceCommand({ sourcePlaceId, result });
    await queryClient.invalidateQueries({ queryKey: applePlaceResolutionKeys.all });
  }, [queryClient]);

  useEffect(() => {
    if (!autoResolve || !query.isSuccess || manualVisible) return;
    const place = unresolved.find(({ id }) => !attempted.current.has(id));
    if (!place) return;
    let cancelled = false;
    const generation = ++lookupGeneration.current;
    const provider = new ApplePlaceProvider();
    const timer = setTimeout(() => { void (async () => {
      setActiveLookup({ placeId: place.id, generation });
      attempted.current.add(place.id);
      nextLookupAt.current = Date.now() + LEGACY_LOOKUP_INTERVAL_MS;
      try {
        const page = await provider.search(buildLegacyAppleQuery(place));
        const candidate = chooseLegacyAppleMatch(place, page.results);
        if (!cancelled && candidate) await confirm(place.id, candidate);
      } catch (error) {
        if (error instanceof PlaceProviderError && error.code === 'rate_limited') {
          // Stop the batch during a cooldown; this Place remains eligible later.
          attempted.current.delete(place.id);
          nextLookupAt.current = Date.now() + THROTTLE_RETRY_DELAY_MS;
        }
        // The explicit confirmation surface owns unknown or unavailable matches.
      }
      if (cancelled) attempted.current.delete(place.id);
      setActiveLookup((current) => current?.generation === generation ? null : current);
      if (!cancelled) setCycle((value) => value + 1);
    })(); }, Math.max(0, nextLookupAt.current - Date.now()));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [autoResolve, confirm, cycle, manualVisible, query.isSuccess, unresolved]);

  return { mapPlacesById, unresolved,
    resolving: activeLookup !== null && autoResolve && !manualVisible && query.isSuccess,
    error: projection.error ?? query.error,
    manualVisible, setManualVisible, confirm, retry: () => Promise.all([
      query.refetch(), ...(amapPlaces.length > 0 ? [projection.refetch()] : []),
    ]) };
}
