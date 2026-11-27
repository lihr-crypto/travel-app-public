import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { dayKeys, homeKeys, tripKeys, unscheduledKeys } from '@/application/queries/query-keys';
import {
  getDayView,
  useDayView,
  type DayViewQuerySource,
} from '@/application/queries/day-view';
import type { UnscheduledQuerySource } from '@/application/queries/unscheduled';
import {
  useTripOverview,
  type TripOverviewData,
  type TripOverviewQuerySource,
} from '@/application/queries/trip-overview';
import { getMapPlaceCoordinate, type MapPlace } from '@/application/projections/map-place';
import { regionalTripMapPlaces } from '@/application/projections/regional-trip-places';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';
import { AmapMapRenderer } from '@/infrastructure/map/amap-map-renderer';
import { GoogleMapRenderer } from '@/infrastructure/map/google-map-renderer';
import { AmapPrivacyGate } from './amap-privacy-gate';
import type { Trip } from '@/domain/trip/types';
import type { Coordinate, EntityId } from '@/domain/common/types';
import {
  hotelContextsByDayId,
  type HotelContext,
} from '@/application/projections/hotel-context';
import { PlanningSurfaceTransition } from '@/components/planning-surface-transition';
import { DayViewWorkspace } from './day-view-workspace';
import { TripOverviewWorkspace } from './trip-overview-workspace';
import { SkeletonList } from './ui/skeleton-list';
import { UnscheduledWorkspace } from './unscheduled-workspace';
import { useTripEntry } from '@/state/day-selection';
import { tripFocusStore, useTripFocus } from '@/state/trip-focus';
import {
  describeTransitionError,
  PLANNING_TRANSITION_TIMING,
  resolveDayTransitionDirection,
  usePlanningTransition,
} from '@/state/planning-transition';
import { colors } from '@/theme/tokens';
import { resolvePlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import {
  changeItemPlaceCommand,
  confirmMapPickerPlaceCommand,
  confirmPlaceSearchResultCommand,
  deleteItemCommand,
  moveItemToDayCommand,
  moveItemToUnscheduledCommand,
  reorderItemCommand,
  restoreDeletedItemCommand,
  updateItemDetailsCommand,
} from '@/infrastructure/database/item-command';
import {
  changeTripDateRangeCommand,
  deleteTripDayCommand,
  insertTripDayCommand,
  renameTripCommand,
  deleteTripCommand,
} from '@/infrastructure/database/trip-command';

export interface TripPlanningWorkspaceProps {
  trip: Trip;
  overviewSource: TripOverviewQuerySource;
  dayViewSource: DayViewQuerySource;
  /** Read model behind the Unscheduled surface; see `UnscheduledWorkspace`. */
  unscheduledSource: UnscheduledQuerySource;
  onHome?: () => void;
  /**
   * Stage-03 §3.4 `继续今天的行程`: open at this Day instead of the Overview.
   *
   * It has to be applied *inside* this shell, after `useTripEntry` — that entry
   * effect resets the focus to Overview on every mount, so a caller that set the
   * focus before mounting would simply be overwritten.
   */
  initialDayId?: EntityId;
}

interface DayNavigationError {
  dayId: EntityId;
  message: string;
}

function compareDays(left: { dayIndex: number; id: string }, right: { dayIndex: number; id: string }) {
  return left.dayIndex - right.dayIndex || left.id.localeCompare(right.id);
}

function DayPlanningView({
  dayId,
  days,
  hotelContexts,
  source,
  trip,
  onHome,
  onSelectDay,
  onBack,
  initialCoordinate,
  mapPlacesById,
}: {
  dayId: string;
  days: TripOverviewData['days'];
  /** Per-Day cross-day Hotel cards, derived from the Overview read model. */
  hotelContexts?: ReadonlyMap<string, HotelContext>;
  source: DayViewQuerySource;
  trip: Trip;
  onHome?: () => void;
  onSelectDay?: (dayId: EntityId) => void;
  onBack?: () => void;
  initialCoordinate?: Coordinate;
  mapPlacesById: Record<string, MapPlace>;
}) {
  const query = useDayView(source, dayId);
  const queryClient = useQueryClient();
  const MapRenderer = resolveTripMapStack(trip).renderer === 'amap' ? AmapMapRenderer : GoogleMapRenderer;

  /**
   * Every itinerary write inside a Day invalidates the same two read models:
   * this Day's projection and the Trip Overview that summarises it.
   */
  const invalidateItineraryReads = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dayKeys.view(dayId) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.overview(trip.id) }),
    ]);

  /**
   * A move changes more than this Day: the Item leaves the source Day, joins the
   * target Day, the Overview counts it differently and Unscheduled may gain or
   * lose it. All Day keys are invalidated because a move to another Day renumbers
   * the target collection as well.
   */
  const invalidateAfterItemMove = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dayKeys.all }),
      queryClient.invalidateQueries({ queryKey: tripKeys.overview(trip.id) }),
      queryClient.invalidateQueries({ queryKey: unscheduledKeys.byTrip(trip.id) }),
    ]);

  // The shell only commits a Day after its read model is ready, so this branch
  // is a fallback for a cache eviction, not a user-visible transition frame.
  if (query.isPending) return <SkeletonList rows={4} testID="trip-planning-day-loading" />;
  if (query.error) {
    return <Text style={styles.error} testID="trip-planning-day-error">{query.error.message}</Text>;
  }
  if (!query.data) return null;

  return (
    <DayViewWorkspace
      data={{ ...query.data, mapPlacesById }}
      days={days}
      mapRenderer={MapRenderer}
      onBack={onBack}
      onHome={onHome}
      onItemSaved={() => {
        void invalidateItineraryReads();
      }}
      onSelectDay={onSelectDay}
      placeEntry={{
        changeItemPlace: changeItemPlaceCommand,
        confirmMapPicker: confirmMapPickerPlaceCommand,
        confirmSearch: confirmPlaceSearchResultCommand,
        initialCoordinate,
        onConfirmed: () => {
          void invalidateItineraryReads();
        },
        resolveSession: resolvePlaceProviderSession,
      }}
      hotelContext={hotelContexts?.get(dayId) ?? null}
      moveItemToDay={moveItemToDayCommand}
      moveItemToUnscheduled={moveItemToUnscheduledCommand}
      onItemMoved={() => {
        void invalidateAfterItemMove();
      }}
      deleteItemCommand={deleteItemCommand}
      restoreDeletedItemCommand={restoreDeletedItemCommand}
      onItemDeleted={() => {
        void invalidateAfterItemMove();
      }}
      reorderItemCommand={reorderItemCommand}
      onItemReordered={() => {
        void invalidateAfterItemMove();
      }}
      updateItemDetailsCommand={updateItemDetailsCommand}
    />
  );
}

/** Production Trip shell: one saved region/provider, with all canonical Items preserved. */
export function TripPlanningWorkspace({
  trip,
  overviewSource,
  dayViewSource,
  unscheduledSource,
  onHome,
  initialDayId,
}: TripPlanningWorkspaceProps) {
  useTripEntry(trip.id);
  const focus = useTripFocus((state) => state.focus);

  /*
   * Declared after `useTripEntry`, and effects run in declaration order, so this
   * always lands on top of the entry reset. It runs once per Trip entry.
   */
  useEffect(() => {
    if (initialDayId === undefined) return;
    tripFocusStore.getState().continueToday(trip.id, initialDayId);
  }, [initialDayId, trip.id]);
  const overviewQuery = useTripOverview(overviewSource, trip.id);
  const rawPlaces = useMemo(() => overviewQuery.data?.placesById ?? {}, [overviewQuery.data?.placesById]);
  const mapPlacesById = useMemo(() => regionalTripMapPlaces(trip, rawPlaces), [trip, rawPlaces]);
  const historicalOutOfRegionCount = Object.keys(rawPlaces).length - Object.keys(mapPlacesById).length;
  const queryClient = useQueryClient();
  const transition = usePlanningTransition(PLANNING_TRANSITION_TIMING.day);
  const insets = useSafeAreaInsets();
  const [navigationError, setNavigationError] = useState<DayNavigationError | null>(null);
  const stack = resolveTripMapStack(trip);
  const MapRenderer = stack.renderer === 'amap' ? AmapMapRenderer : GoogleMapRenderer;
  const runTransition = transition.run;

  const orderedDays = useMemo(
    () => [...(overviewQuery.data?.days ?? [])].sort(compareDays),
    [overviewQuery.data?.days],
  );
  const selectedDayId: EntityId | null = focus.type === 'day'
    ? focus.dayId
    : focus.type === 'item' && focus.dayId !== null
      ? focus.dayId
      : null;
  const selectedDayIndex = orderedDays.find(({ id }) => id === selectedDayId)?.dayIndex ?? null;
  const isUnscheduled = focus.type === 'unscheduled';
  const neighbourKey = useMemo(() => {
    const index = orderedDays.findIndex(({ id }) => id === selectedDayId);
    if (index < 0) return '';
    return [orderedDays[index - 1]?.id, orderedDays[index + 1]?.id]
      .filter((id): id is string => typeof id === 'string')
      .join(',');
  }, [orderedDays, selectedDayId]);

  /**
   * One Day-entry path for the Overview Day List, the occurrence Preview, the
   * header arrows/swipe and the Day Jump. The source surface stays visible while
   * the destination read runs, and a failed read keeps it in place.
   *
   * Coming from Overview this is a page-level swap, so the shared transition
   * animates it. Coming from another Day it is the *same* persistent Day View
   * receiving new content, so it swaps in place: the map, the Bottom Sheet and
   * the Day-local state stay mounted and only the props change.
   */
  const requestDay = useCallback((dayId: EntityId) => {
    if (dayId === selectedDayId) return;
    setNavigationError(null);
    const targetIndex = orderedDays.find(({ id }) => id === dayId)?.dayIndex ?? null;
    runTransition({
      direction: resolveDayTransitionDirection(selectedDayIndex, targetIndex),
      inPlace: selectedDayId !== null,
      prepare: () => queryClient.fetchQuery({
        queryKey: dayKeys.view(dayId),
        queryFn: () => getDayView(dayViewSource, dayId),
      }),
      commit: () => tripFocusStore.getState().selectDay(dayId),
      onError: (error) => setNavigationError({
        dayId,
        message: describeTransitionError(error),
      }),
    });
  }, [dayViewSource, orderedDays, queryClient, runTransition, selectedDayId, selectedDayIndex]);

  /** Back keeps the same motion language: Day → Overview, Overview → Home. */
  const handleBack = useCallback(() => {
    if (focus.type === 'overview') {
      onHome?.();
      return;
    }
    setNavigationError(null);
    runTransition({
      direction: 'backward',
      commit: () => tripFocusStore.getState().enterOverview(),
    });
  }, [focus.type, onHome, runTransition]);

  /**
   * Adjacent Days are prefetched while the current Day is open, so a header
   * arrow or swipe has nothing left to wait for. Prefetch failures are ignored
   * here; the explicit navigation path reports them.
   */
  useEffect(() => {
    if (neighbourKey === '') return;
    for (const dayId of neighbourKey.split(',')) {
      void queryClient.prefetchQuery({
        queryKey: dayKeys.view(dayId),
        queryFn: () => getDayView(dayViewSource, dayId),
      });
    }
  }, [dayViewSource, neighbourKey, queryClient]);

  /**
   * A Trip date-range change is the widest invalidation in the app: every Day is
   * re-dated, renumbered, created or deleted, the Trip entity itself changes,
   * and shrinking pushes Items into Unscheduled. Narrowing this to one Day key
   * would leave a deleted Day's projection in the cache.
   */
  const invalidateAfterDateRangeChange = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tripKeys.all }),
      queryClient.invalidateQueries({ queryKey: tripKeys.overview(trip.id) }),
      queryClient.invalidateQueries({ queryKey: dayKeys.all }),
      queryClient.invalidateQueries({ queryKey: unscheduledKeys.byTrip(trip.id) }),
    ]);

  /** An Item put back into a Day leaves Unscheduled and joins that Day. */
  const invalidateAfterMoveToDay = (dayId: EntityId) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dayKeys.view(dayId) }),
      queryClient.invalidateQueries({ queryKey: tripKeys.overview(trip.id) }),
      queryClient.invalidateQueries({ queryKey: unscheduledKeys.byTrip(trip.id) }),
    ]);

  if (overviewQuery.isPending) {
    return <SkeletonList rows={4} testID="trip-planning-loading" />;
  }
  if (overviewQuery.error) {
    return <Text style={styles.error} testID="trip-planning-error">{overviewQuery.error.message}</Text>;
  }
  if (!overviewQuery.data) return null;

  /*
   * Stage-02 §11.3 cross-day Hotel cards, derived once from the Overview read
   * model: the hotel Item lives on its check-in Day, later Days show a card.
   */
  const hotelContexts = hotelContextsByDayId(
    overviewQuery.data.days,
    overviewQuery.data.scheduledItems,
  );

  /*
   * `未安排` is a fourth focus state, not a variant of Overview. Rendering the
   * Overview whenever no Day is selected is what made the Overview's 未安排
   * entry a dead button: it set the focus and changed nothing on screen.
   */
  const content = isUnscheduled ? (
    <UnscheduledWorkspace
      trip={trip}
      placesById={rawPlaces}
      mapRenderer={MapRenderer}
      placePickerServices={{ resolveSession: resolvePlaceProviderSession,
        confirmSearch: confirmPlaceSearchResultCommand, confirmMapPicker: confirmMapPickerPlaceCommand }}
      days={overviewQuery.data.days}
      moveItemToDayCommand={moveItemToDayCommand}
      onBack={handleBack}
      onHome={onHome}
      onItemMoved={(dayId) => {
        void invalidateAfterMoveToDay(dayId);
      }}
      updateItemDetailsCommand={updateItemDetailsCommand}
      deleteItemCommand={deleteItemCommand}
      onItemsChanged={() => {
        void invalidateAfterDateRangeChange();
      }}
      source={unscheduledSource}
      tripId={trip.id}
    />
  ) : selectedDayId === null ? (
    <TripOverviewWorkspace
      renameTripCommand={renameTripCommand}
      deleteTripCommand={deleteTripCommand}
      onTripRenamed={(updated) => {
        queryClient.setQueryData<TripOverviewData>(tripKeys.overview(trip.id), (current) =>
          current ? { ...current, trip: updated } : current);
        queryClient.setQueryData(tripKeys.detail(trip.id), updated);
        void queryClient.invalidateQueries({ queryKey: homeKeys.map });
        void queryClient.invalidateQueries({ queryKey: tripKeys.all });
      }}
      onTripDeleted={() => {
        tripFocusStore.setState({ tripId: null, focus: { type: 'overview' }, sheetSnap: 'half' });
        onHome?.();
        // Keep the outgoing Overview intact during its Home exit animation.
        queryClient.removeQueries({ queryKey: tripKeys.detail(trip.id), type: 'inactive' });
        void queryClient.invalidateQueries({ queryKey: homeKeys.map });
        void queryClient.invalidateQueries({ queryKey: tripKeys.all, refetchType: 'none' });
        void queryClient.invalidateQueries({ queryKey: dayKeys.all });
        void queryClient.invalidateQueries({ queryKey: unscheduledKeys.byTrip(trip.id) });
      }}
      changeTripDateRange={changeTripDateRangeCommand}
      data={{ ...overviewQuery.data, mapPlacesById: mapPlacesById }}
      deleteTripDay={deleteTripDayCommand}
      insertTripDay={insertTripDayCommand}
      mapRenderer={MapRenderer}
      onBack={handleBack}
      onDateRangeChanged={() => {
        void invalidateAfterDateRangeChange();
      }}
      onHome={onHome}
      onSelectDay={requestDay}
    />
  ) : (
    /*
     * Deliberately no `key`: the Day surface is one persistent instance. A Day
     * change must update this instance in place, not remount the map, the
     * Bottom Sheet and the Day-local state.
     */
    <DayPlanningView
      dayId={selectedDayId}
      days={overviewQuery.data.days}
      hotelContexts={hotelContexts}
      initialCoordinate={Object.values(mapPlacesById)[0]
        ? getMapPlaceCoordinate(Object.values(mapPlacesById)[0]) : undefined}
      mapPlacesById={mapPlacesById}
      onBack={handleBack}
      onHome={onHome}
      onSelectDay={requestDay}
      source={dayViewSource}
      trip={trip}
    />
  );

  return (
    <View style={styles.container} testID="trip-planning-workspace">
      <PlanningSurfaceTransition transition={transition}>
        {stack.renderer === 'amap' ? <AmapPrivacyGate>{content}</AmapPrivacyGate> : content}
      </PlanningSurfaceTransition>
      {historicalOutOfRegionCount > 0 ? (
        <View style={[styles.legacyPrompt, { top: insets.top + 58 }]} testID="trip-historical-other-region">
          <Text style={styles.legacyPromptText}>{historicalOutOfRegionCount} 个历史跨地区地点已保留，地图仅显示本旅行地区</Text>
        </View>
      ) : null}
      {navigationError ? (
        <View
          style={[styles.navigationError, { top: insets.top + 56 }]}
          testID="trip-navigation-error"
        >
          <Text style={styles.navigationErrorText}>
            无法打开该 Day：{navigationError.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => requestDay(navigationError.dayId)}
            testID="trip-navigation-error-retry"
          >
            <Text style={styles.navigationErrorAction}>重试</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  error: { color: colors.danger },
  legacyPrompt: { position: 'absolute', left: 12, right: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 10, zIndex: 10 },
  legacyPromptText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  navigationError: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    left: 12,
    padding: 12,
    position: 'absolute',
    right: 12,
    zIndex: 20,
  },
  navigationErrorAction: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  navigationErrorText: { color: colors.danger, fontSize: 14 },
});
