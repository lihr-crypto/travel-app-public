import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme/tokens';
import {
  PLANNING_TRANSITION_TRANSLATE,
  type PlanningTransition,
} from '@/state/planning-transition';

export interface PlanningSurfaceTransitionProps {
  /** Controller returned by `usePlanningTransition`. */
  transition: PlanningTransition;
  children: ReactNode;
  testID?: string;
}

/**
 * The one presentation host shared by Home, Trip Overview and Day View.
 *
 * Only one child surface is mounted at a time, so a native AMap/Google view is
 * never overlapped with another one. The host paints a stable page background,
 * and the swap happens exactly when the outgoing surface reaches full
 * transparency — a native map's unsettled first frame therefore never flashes
 * in front of the user.
 */
export function PlanningSurfaceTransition({
  transition,
  children,
  testID = 'planning-surface-transition',
}: PlanningSurfaceTransitionProps) {
  const { direction, phase, timing } = transition;
  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);

  useEffect(() => {
    const offset = direction === 'neutral' ? 0 : PLANNING_TRANSITION_TRANSLATE;

    switch (phase) {
      case 'leaving': {
        const exit = { duration: timing.exitMs, easing: Easing.in(Easing.quad) };
        opacity.value = withTiming(0, exit);
        translateX.value = withTiming(direction === 'forward' ? -offset : offset, exit);
        return;
      }
      case 'entering': {
        const enter = { duration: timing.enterMs, easing: Easing.out(Easing.quad) };
        // Start from the entry offset without animating, then ease in.
        opacity.value = 0;
        translateX.value = direction === 'forward' ? offset : -offset;
        opacity.value = withTiming(1, enter);
        translateX.value = withTiming(0, enter);
        return;
      }
      case 'idle': {
        opacity.value = 1;
        translateX.value = 0;
        return;
      }
      default:
        // 'preparing': the source surface keeps its current appearance while
        // destination data is still being read.
        return;
    }
  }, [direction, opacity, phase, timing.enterMs, timing.exitMs, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.host} testID={`${testID}-host`}>
      <Animated.View style={[styles.surface, animatedStyle]} testID={testID}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    backgroundColor: colors.background,
    flex: 1,
  },
  surface: { flex: 1 },
});
