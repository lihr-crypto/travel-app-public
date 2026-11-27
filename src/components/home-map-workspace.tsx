import { lazy, Suspense, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EntityId, TravelDate } from '@/domain/common/types';
import type { Place } from '@/domain/place/types';
import type { Trip } from '@/domain/trip/types';
import { getMapPlaceCoordinate, type MapPlace } from '@/application/projections/map-place';
import { DEFAULT_SHEET_SNAP, type TripSheetSnap } from '@/state/trip-focus';
import { deviceLocalTravelDate } from '@/domain/common/travel-date';
import {
  buildHomeMapProjection,
  type HomeTripData,
  type HomeTripFilter,
} from '@/application/projections/home-map';
import { distinctPlaceKeys } from '@/application/projections/home-recap';
import {
  clusterHomeMarkers,
  type HomeClusterMarker,
} from '@/application/projections/home-clusters';
import type { HomeMarkerModel } from '@/application/projections/home-markers';
import {
  useHomeMap,
  type HomeMapQuerySource,
} from '@/application/queries/home-map';
import { dayKeys, homeKeys, tripKeys, unscheduledKeys } from '@/application/queries/query-keys';
import {
  AppleMapRenderer,
  type AppleMapRendererProps,
} from '@/infrastructure/map/apple-map-renderer';
import { useApplePlaceResolution } from '@/state/apple-place-resolution';
import { colors } from '@/theme/tokens';
import { CreateTripForm } from './create-trip-form';
import { HomeActiveTripCard } from './home-active-trip-card';
import { HomeTripListSheet } from './home-trip-list-sheet';
import { TripManagementSheet } from './trip-management-sheet';
import { TripBottomSheet } from './trip-bottom-sheet';
import {
  HomeTripPreviewCard,
  type HomeTripPreview,
  type HomeTripPreviewEntry,
} from './home-trip-preview-card';

const TripImportSheet=lazy(()=>import('./trip-import-sheet').then(module=>({default:module.TripImportSheet})));

/**
 * M10-T3b — the Home Footprint map surface.
 *
 * This is the composition point the whole M10 map chain was built for:
 * the cross-Trip read model → the footprint projection (which applies the
 * M10-T0 CRS plan) → the viewport-aware clusterer → the Apple MapKit adapter.
 * Each of those is already tested on its own; this file only wires them, so it
 * deliberately holds no product logic of its own.
 *
 * Stage-03 §3.6: the first tap on a marker only selects. Entering a Trip is an
 * explicit action, which is why this surface takes `onSelectTrip` and never
 * navigates.
 */

export type HomeMapRendererComponent = (
  props: AppleMapRendererProps,
) => ReactElement | null;

/**
 * The span Home starts at before the map has reported its viewport. It matches
 * the adapter's own empty-map default, and it is the spec's "低缩放层级" case —
 * the zoom at which region groups are expected to show.
 */
export const HOME_INITIAL_LATITUDE_DELTA = 120;

export interface HomeMapWorkspaceProps {
  source: HomeMapQuerySource;
  /** Injected so component tests render without the native map. */
  mapRenderer?: HomeMapRendererComponent;
  /** Injected rather than read from the clock, so lifecycle stays testable. */
  today?: TravelDate;
  /** Controlled filter when defined; otherwise the surface owns it. */
  filter?: HomeTripFilter;
  /** Controlled selection when defined; otherwise the surface owns it. */
  selectedTripId?: EntityId | null;
  onSelectTrip?: (tripId: EntityId) => void;
  /** Absent means this build cannot enter a Trip from the map — no seam, no action. */
  onOpenTrip?: (trip: Trip) => void;
  /**
   * Stage-03 §3.4 `继续今天的行程`, handed the Trip itself for the same reason
   * `onOpenTrip` is: the destination needs the entity, not just its id.
   * Absent means the card shows no action.
   */
  onContinueToday?: (trip: Trip, dayId: EntityId) => void;
}

function isCluster(marker: HomeMarkerModel): marker is HomeClusterMarker {
  return marker.variant === 'cluster';
}

export function HomeMapWorkspace({
  source,
  mapRenderer: MapRendererComponent = AppleMapRenderer,
  today = deviceLocalTravelDate(),
  filter,
  selectedTripId,
  onSelectTrip,
  onOpenTrip,
  onContinueToday,
}: HomeMapWorkspaceProps) {
  const query = useHomeMap(source);
  const queryClient = useQueryClient();
  const rawPlaces = useMemo(() => {
    const places: Record<EntityId, Place> = {};
    for (const entry of query.data?.trips ?? []) {
      Object.assign(places, entry.placesById);
    }
    return places;
  }, [query.data]);
  const {
    mapPlacesById,
    unresolved: unresolvedApplePlaces,
  } = useApplePlaceResolution(rawPlaces, false);
  const mapHomeData = useMemo(() => {
    if (!query.data) return undefined;
    return {
      trips: query.data.trips.map((entry): HomeTripData => {
        const mapped: Record<EntityId, MapPlace> = {};
        for (const sourcePlaceId of Object.keys(entry.placesById)) {
          const place = mapPlacesById[sourcePlaceId];
          if (place) mapped[sourcePlaceId] = place;
        }
        return { ...entry, mapPlacesById: mapped };
      }),
    };
  }, [mapPlacesById, query.data]);
  const appleCoordinates = Object.values(mapPlacesById).every(
    (place) => getMapPlaceCoordinate(place).system === 'wgs84',
  );
  const [internalSelectedTripId, setInternalSelectedTripId] = useState<EntityId | null>(null);
  const [internalFilter, setInternalFilter] = useState<HomeTripFilter>('all');
  /** The requested start year; the projection reports the one actually applied. */
  const [requestedYear, setRequestedYear] = useState<number | null>(null);
  /** Home-local sheet geometry; the Trip surfaces own theirs in the focus store. */
  const [sheetSnap, setSheetSnap] = useState<TripSheetSnap>(DEFAULT_SHEET_SNAP);
  /** Stage-03 §3.7: creating a Trip takes over the sheet rather than stacking one. */
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  /** Reported by the map; drives the cluster radius, so zooming splits groups. */
  const [latitudeDelta, setLatitudeDelta] = useState(HOME_INITIAL_LATITUDE_DELTA);
  /** Which marker the floating preview is open for, if any. */
  const [preview, setPreview] = useState<HomeTripPreview | null>(null);
  const [isImportingTrip,setIsImportingTrip]=useState(false);
  const [managedTripId, setManagedTripId] = useState<EntityId | null>(null);
  const insets = useSafeAreaInsets();

  /*
   * UX-C: while the create form is open, the keyboard lifts the sheet to its
   * expanded snap — the gorhom keyboardBehavior proved unreliable with a
   * controlled snap, so the keyboard events drive the same controlled state
   * everything else uses.
   */
  useEffect(() => {
    if (!isCreatingTrip) return;
    const show = Keyboard.addListener('keyboardWillShow', () => {
      setSheetSnap('expanded');
    });
    return () => show.remove();
  }, [isCreatingTrip]);

  const selected = selectedTripId === undefined ? internalSelectedTripId : selectedTripId;
  const effectiveFilter = filter === undefined ? internalFilter : filter;

  /*
   * Built before the query resolves so the hooks stay unconditional. The
   * projection is only meaningful with data, so `markers` stays empty until the
   * read arrives rather than rendering a half-built map.
   */
  const projection = mapHomeData
    ? buildHomeMapProjection(mapHomeData, {
      filter: effectiveFilter,
      year: requestedYear,
      selectedTripId: selected,
      today,
      appleCoordinates,
    })
    : null;
  const markers = projection
    ? clusterHomeMarkers(projection.markers, { latitudeDelta })
    : [];
  /** §3.7's first-use state is about the whole Footprint, not the current filter. */
  const isFirstUse = query.data !== undefined && query.data.trips.length === 0;
  const managedTrip = managedTripId === null
    ? null
    : query.data?.trips.find(({ trip }) => trip.id === managedTripId)?.trip ?? null;

  /** The card shows dates, which the marker model deliberately does not carry. */
  const entryFor = (tripId: EntityId): HomeTripPreviewEntry | null => {
    const found = query.data?.trips.find((candidate) => candidate.trip.id === tripId);
    return found
      ? {
        dayCount: found.days.length,
        endDate: found.trip.endDate,
        placeCount: distinctPlaceKeys(found).size,
        startDate: found.trip.startDate,
        title: found.trip.title,
        tripId: found.trip.id,
      }
      : null;
  };

  const handleEnterTrip = (tripId: EntityId) => {
    const trip = query.data?.trips.find((candidate) => candidate.trip.id === tripId)?.trip;
    if (trip) onOpenTrip?.(trip);
  };

  const handleContinueToday = (tripId: EntityId, dayId: EntityId) => {
    const trip = query.data?.trips.find((candidate) => candidate.trip.id === tripId)?.trip;
    if (trip) onContinueToday?.(trip, dayId);
  };

  const handleManageTrip = (tripId: EntityId) => {
    if (!query.data?.trips.some(({ trip }) => trip.id === tripId)) return;
    setPreview(null);
    setManagedTripId(tripId);
  };

  const invalidateAfterTripRename = (trip: Trip) => {
    setManagedTripId(null);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: homeKeys.map }),
      queryClient.invalidateQueries({ queryKey: tripKeys.all }),
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(trip.id) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.overview(trip.id) }),
    ]);
  };

  const invalidateAfterTripDelete = (tripId: EntityId) => {
    setManagedTripId(null);
    setPreview(null);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: homeKeys.map }),
      queryClient.invalidateQueries({ queryKey: tripKeys.all }),
      queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.days(tripId) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.overview(tripId) }),
      queryClient.invalidateQueries({ queryKey: dayKeys.all }),
      queryClient.invalidateQueries({ queryKey: unscheduledKeys.byTrip(tripId) }),
    ]);
  };

  const select = (tripId: EntityId) => {
    if (selectedTripId === undefined) setInternalSelectedTripId(tripId);
    onSelectTrip?.(tripId);
  };

  /**
   * Stage-03 §3.6: selecting and previewing never navigates. Both a map marker
   * and a 我的旅行 row go through here, which is what §3.2 means by "the same
   * Trip identity and preview/entry semantics".
   */
  const previewTrip = (tripId: EntityId) => {
    const entry = entryFor(tripId);
    if (!entry) return;
    select(tripId);
    setPreview({ kind: 'trip', trip: entry });
  };

  const handleMarkerPress = (markerId: EntityId) => {
    const marker = markers.find((candidate) => candidate.id === markerId);
    if (!marker) return;

    if (isCluster(marker)) {
      const trips = marker.clusterTripIds
        .map(entryFor)
        .filter((entry): entry is HomeTripPreviewEntry => entry !== null);
      // A cluster opens the list form; entry waits for the user's choice (§3.6).
      setPreview(trips.length > 0 ? { kind: 'cluster', label: marker.label, trips } : null);
      return;
    }

    previewTrip(marker.id);
  };

  return (
    <View style={styles.container} testID="home-map-workspace">
      {query.isPending ? (
        <Text style={styles.status} testID="home-map-loading">旅行足迹加载中…</Text>
      ) : query.error ? (
        <Text style={styles.error} testID="home-map-error">{query.error.message}</Text>
      ) : (
        <>
          <MapRendererComponent
            appleCoordinates={appleCoordinates}
            cameraRequest={projection?.cameraRequest ? {
              ...projection.cameraRequest,
              scopeKey: `home:${effectiveFilter}:${projection.year ?? 'all'}`,
              animated: false,
            } : null}
            followUserLocationOnce={markers.length === 0}
            markers={markers}
            onMapPress={() => setPreview(null)}
            onMarkerPress={handleMarkerPress}
            onViewportChange={(viewport) => setLatitudeDelta(viewport.latitudeDelta)}
            showsUserLocation={markers.length === 0}
          />
          {unresolvedApplePlaces.length > 0 ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.legacyPrompt, { top: insets.top + 8 }]}
              testID="home-legacy-place-confirm"
            >
              打开旅行以确认旧地点（{unresolvedApplePlaces.length}）
            </Text>
          ) : null}
          {markers.length === 0 ? (
            <Text
              style={[styles.status, {
                top: insets.top + (unresolvedApplePlaces.length > 0 ? 46 : 8),
              }]}
              testID="home-map-empty"
            >
              还没有可以显示在地图上的地点
            </Text>
          ) : null}
          {/*
           * Stage-03 §3.2: the 我的旅行 sheet is the direct list alternative to
           * the markers, and §3.3's "floating" filter is pinned at its top
           * rather than scrolling away with the rows.
           */}
          <TripBottomSheet onSnapChange={setSheetSnap} scrollable snap={sheetSnap}>
            {isCreatingTrip ? (
              <View style={styles.createTrip} testID="home-create-trip-sheet">
                <View style={styles.createTripHeading}>
                  <Text style={styles.createTripTitle}>新建旅行</Text>
                  <Pressable
                    accessibilityLabel="关闭新建旅行"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => {
                      setIsCreatingTrip(false);
                      setSheetSnap(DEFAULT_SHEET_SNAP);
                    }}
                    testID="home-create-trip-close"
                  >
                    <Text style={styles.createTripClose}>✕</Text>
                  </Pressable>
                </View>
                {/* A successful create invalidates the Footprint read, so the map
                    and the list refresh behind this sheet. */}
                <KeyboardAvoidingView behavior="padding">
                  <CreateTripForm
                    onTripCreated={() => {
                      setIsCreatingTrip(false);
                      setSheetSnap(DEFAULT_SHEET_SNAP);
                    }}
                  />
                </KeyboardAvoidingView>
              </View>
            ) : (
              <HomeTripListSheet
                filter={effectiveFilter}
                isFirstUse={isFirstUse}
                onCreateTrip={() => {
                  setIsCreatingTrip(true);
                  // UX-C: the form needs the full height for the keyboard.
                  setSheetSnap('expanded');
                }}
                availableYears={projection?.availableYears}
                onFilterChange={(next) => {
                  setPreview(null);
                  // The year row is built from the lifecycle filter's Trips, so a
                  // year chosen under one filter must not resurface under another.
                  setRequestedYear(null);
                  if (filter === undefined) setInternalFilter(next);
                }}
                onYearChange={(next) => {
                  setPreview(null);
                  setRequestedYear(next);
                }}
                recap={projection?.recap}
                year={projection?.year ?? null}
                onImportTrip={()=>setIsImportingTrip(true)}
                onManageTrip={handleManageTrip}
                onOpenTrip={onOpenTrip ? handleEnterTrip : undefined}
                trips={projection?.visibleTrips ?? []}
              />
            )}
          </TripBottomSheet>
          {isImportingTrip&&<Suspense fallback={null}><TripImportSheet visible onClose={()=>setIsImportingTrip(false)} onImported={()=>{void queryClient.invalidateQueries({queryKey:homeKeys.map});void queryClient.invalidateQueries({queryKey:tripKeys.all});}}/></Suspense>}
          {managedTrip ? (
            <TripManagementSheet
              onClose={() => setManagedTripId(null)}
              onTripDeleted={invalidateAfterTripDelete}
              onTripRenamed={invalidateAfterTripRename}
              trip={managedTrip}
              visible
            />
          ) : null}
          {/*
           * Stage-03 §3.4: the Active Trip Card sits above the map's lower edge
           * and stays compact until opened, so it never obscures the footprint.
           */}
          {projection?.activeTrip ? (
            <View style={styles.activeTrip}>
              <HomeActiveTripCard
                onContinueToday={onContinueToday ? handleContinueToday : undefined}
                trip={projection.activeTrip}
              />
            </View>
          ) : null}
          {preview ? (
            <HomeTripPreviewCard
              onClose={() => setPreview(null)}
              onEnterTrip={onOpenTrip ? handleEnterTrip : undefined}
              onSelectTrip={select}
              preview={preview}
              selectedTripId={selected}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.background, flex: 1 },
  activeTrip: { left: 16, position: 'absolute', right: 16, top: 96 },
  createTrip: { gap: 12 },
  createTripClose: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  createTripHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  createTripTitle: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, padding: 16 },
  legacyPrompt: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  status: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    color: colors.textMuted,
    fontSize: 13,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: 'absolute',
  },
});
