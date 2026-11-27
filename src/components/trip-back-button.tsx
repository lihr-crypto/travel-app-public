import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTripFocus } from '@/state/trip-focus';
import { colors } from '@/theme/tokens';

/**
 * UX-C — the right-swipe back gesture, for surfaces whose sheets have no
 * Day-style swipe of their own (Trip Overview, Unscheduled).
 *
 * It is right-only (`activeOffsetX`) and fails on any real vertical drift
 * (`failOffsetY`), so list scrolling and sheet drags keep their native owner
 * and a horizontal map pan is never claimed — the detector is attached to
 * non-scrolling chrome (a hoisted fixed header or the content root), never
 * inside a scrollable, for the same activation-race reason the Day swipe lives
 * on its fixed header.
 */
export const BACK_SWIPE_ACTIVATION_X = 50;
export const BACK_SWIPE_FAIL_Y = 30;

/** Pure half of the gesture, so the threshold is testable without RNGH. */
export function shouldTriggerBackSwipe(translationX: number): boolean {
  return translationX > BACK_SWIPE_ACTIVATION_X;
}

/**
 * A right-swipe pan that emits `onBack`, or `null` when there is no back seam
 * ("no seam, no action" — the caller then skips the detector entirely).
 */
export function useBackSwipeGesture(onBack?: () => void): GestureType | null {
  return useMemo(() => {
    if (!onBack) return null;
    // `runOnJS` for the same reason as the Day row drag: the worklet thread
    // cannot call this JS closure. The hit slop widens the thin handle strip
    // the gesture usually sits on, without reaching the map above.
    return Gesture.Pan()
      .runOnJS(true)
      .hitSlop({ bottom: 12, left: 0, right: 0, top: 12 })
      .activeOffsetX(BACK_SWIPE_ACTIVATION_X)
      .failOffsetY([-BACK_SWIPE_FAIL_Y, BACK_SWIPE_FAIL_Y])
      .onEnd((event) => {
        if (shouldTriggerBackSwipe(event.translationX)) onBack();
      });
  }, [onBack]);
}

export interface TripBackButtonProps {
  onHome?: () => void;
  /**
   * Owning-surface back intent. When provided it replaces the built-in
   * one-level focus change, so a parent can route Back through the shared
   * presentation transition instead of swapping surfaces instantly.
   */
  onBack?: () => void;
  testID?: string;
}

/** One-level Trip back intent; a Home callback is emitted only when leaving Overview. */
export function TripBackButton({
  onHome,
  onBack,
  testID = 'trip-back-button',
}: TripBackButtonProps) {
  const insets = useSafeAreaInsets();
  const tripId = useTripFocus((state) => state.tripId);
  const focus = useTripFocus((state) => state.focus);
  const handleBack = useTripFocus((state) => state.handleBack);

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (tripId === null) return;
    const leavesTrip = focus.type === 'overview';
    handleBack();
    if (leavesTrip) onHome?.();
  }

  return (
    <Pressable
      accessibilityLabel="返回"
      accessibilityRole="button"
      disabled={tripId === null}
      onPress={goBack}
      style={[styles.button, { top: insets.top + 8 }]}
      testID={testID}
    >
      <Text style={styles.icon}>‹</Text>
      <Text style={styles.label}>返回</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    elevation: 2,
    flexDirection: 'row',
    left: 12,
    minHeight: 36,
    paddingHorizontal: 10,
    position: 'absolute',
    shadowColor: colors.text,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    zIndex: 10,
  },
  icon: { color: colors.text, fontSize: 26, lineHeight: 28 },
  label: { color: colors.textSecondary, fontSize: 13, marginLeft: 3 },
});
