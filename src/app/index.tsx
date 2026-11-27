import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HomeMapWorkspace } from '@/components/home-map-workspace';
import { PlanningSurfaceTransition } from '@/components/planning-surface-transition';
import { TripPlanningWorkspace } from '@/components/trip-planning-workspace';
import {
  dayViewQuerySource,
  homeMapQuerySource,
  tripOverviewQuerySource,
  unscheduledQuerySource,
} from '@/infrastructure/database';
import { dayKeys, tripKeys } from '@/application/queries/query-keys';
import { getDayView } from '@/application/queries/day-view';
import type { HomeMapQuerySource } from '@/application/queries/home-map';
import type { DayViewQuerySource } from '@/application/queries/day-view';
import type { TripOverviewQuerySource } from '@/application/queries/trip-overview';
import type { UnscheduledQuerySource } from '@/application/queries/unscheduled';
import type { EntityId } from '@/domain/common/types';
import type { Trip } from '@/domain/trip/types';
import {
  describeTransitionError,
  PLANNING_TRANSITION_TIMING,
  usePlanningTransition,
} from '@/state/planning-transition';
import { colors, spacing } from '@/theme/tokens';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface IndexRouteProps {
  daySource?: DayViewQuerySource;
  overviewSource?: TripOverviewQuerySource;
  unscheduledSource?: UnscheduledQuerySource;
  /** The cross-Trip Footprint read; Home is the only surface that needs it. */
  homeMapSource?: HomeMapQuerySource;
}

export default function IndexRoute({
  daySource = dayViewQuerySource,
  overviewSource = tripOverviewQuerySource,
  unscheduledSource = unscheduledQuerySource,
  homeMapSource = homeMapQuerySource,
}: IndexRouteProps) {
  /**
   * The open Trip, plus the Day it should open at when the user asked to
   * continue today rather than just enter.
   */
  const [openedTrip, setOpenedTrip] = useState<{ trip: Trip; initialDayId?: EntityId } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const transition = usePlanningTransition(PLANNING_TRANSITION_TIMING.home);
  const insets = useSafeAreaInsets();

  /**
   * Home → Trip Overview. The Overview read model is fetched into the same
   * query key the Trip shell uses, so Home stays on screen until the destination
   * is readable and the planning shell never has to show a loading frame.
   */
  function openTrip(trip: Trip) {
    setOpenError(null);
    transition.run({
      direction: 'forward',
      prepare: () => queryClient.fetchQuery({
        queryKey: tripKeys.overview(trip.id),
        queryFn: () => overviewSource.getTripOverview(trip.id),
      }),
      commit: () => setOpenedTrip({ trip }),
      onError: (error) => setOpenError(describeTransitionError(error)),
    });
  }

  /**
   * Stage-03 §3.4 `继续今天的行程`: open the Trip **at today's Day**, not the
   * Overview. Both reads are prepared before the swap, so the destination never
   * shows a loading frame, and the focus is committed with the surface — if the
   * read fails, nothing is left pointing at a Trip that is not open.
   */
  function continueToday(trip: Trip, dayId: EntityId) {
    setOpenError(null);
    transition.run({
      direction: 'forward',
      prepare: () => Promise.all([
        queryClient.fetchQuery({
          queryKey: tripKeys.overview(trip.id),
          queryFn: () => overviewSource.getTripOverview(trip.id),
        }),
        queryClient.fetchQuery({
          queryKey: dayKeys.view(dayId),
          queryFn: () => getDayView(daySource, dayId),
        }),
      ]),
      // The Day intent travels with the surface; the shell applies it after its
      // own entry effect, which would otherwise reset the focus to Overview.
      commit: () => setOpenedTrip({ initialDayId: dayId, trip }),
      onError: (error) => setOpenError(describeTransitionError(error)),
    });
  }

  /** Trip Overview → Home. Home is local, so the reverse swap needs no read. */
  function closeTrip() {
    setOpenError(null);
    transition.run({
      direction: 'backward',
      commit: () => setOpenedTrip(null),
    });
  }

  return (
    <View style={styles.container} testID="home-placeholder">
      <PlanningSurfaceTransition transition={transition}>
        {openedTrip ? (
          <TripPlanningWorkspace
            dayViewSource={daySource}
            initialDayId={openedTrip.initialDayId}
            onHome={closeTrip}
            overviewSource={overviewSource}
            trip={openedTrip.trip}
            unscheduledSource={unscheduledSource}
          />
        ) : (
          <View style={styles.home}>
            {/*
             * Stage-03 §3.1: Home is a Travel Footprint Map and nothing else —
             * the map, its overlays and the 我的旅行 sheet. Markers, clusters and
             * list rows all enter a Trip through the same `openTrip`, so the map
             * can never bypass destination readiness.
             */}
            <HomeMapWorkspace
              onContinueToday={continueToday}
              onOpenTrip={openTrip}
              source={homeMapSource}
            />
            {/*
             * A failed Trip open has to stay actionable, and Home has no list to
             * fall back on any more, so the notice floats over the map.
             */}
            {openError ? (
              <Text
                style={[styles.error, { top: insets.top + 8 }]}
                testID="home-open-trip-error"
              >
                无法打开旅行：{openError}
              </Text>
            ) : null}
          </View>
        )}
      </PlanningSurfaceTransition>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },
  /** The failed-open notice floats over the map, clear of the status bar. */
  error: {
    backgroundColor: colors.background,
    color: colors.danger,
    left: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.lg,
  },
  /** Home is the Footprint map, full-bleed. */
  home: {
    flex: 1,
  },
});
