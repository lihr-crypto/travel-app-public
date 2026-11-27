import { useEffect, useRef, useState, type ReactNode } from 'react';
import { glog } from '../gesture-debug';
import {
  Animated,
  Easing,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type KeyboardEvent,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useReduceMotionPreference } from '@/state/reduce-motion';

/** Resting opacity of the sheet backdrop; the sheet itself never tints it. */
export const SHEET_BACKDROP_OPACITY = 0.28;
/** Backdrop fade only — the backdrop never translates, scales or resizes. */
export const SHEET_BACKDROP_FADE_MS = 180;
/** Sheet slide. Longer than the fade, so the dimming reads as "behind" it. */
export const SHEET_SLIDE_MS = 280;
/** Bounded sheet height; longer lists scroll inside instead of growing. */
export const SHEET_MAX_HEIGHT_RATIO = 0.8;

type KeyboardFrame = { screenY: number; height: number };

export interface AnimatedSheetModalProps {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  /** Optional heading row; the grabber is always rendered. */
  title?: string;
  /** Use the sheet's own scroll container for content taller than the sheet. */
  scrollable?: boolean;
  /** Move and constrain the whole sheet above a docked soft keyboard. */
  avoidKeyboard?: boolean;
  maxHeightRatio?: number;
  /**
   * Identity of the content the sheet is showing. A change while the sheet is
   * hidden clears it immediately instead of playing the exit animation, so a
   * surface that swapped underneath never keeps showing the old content.
   */
  resetKey?: string;
  testID?: string;
}

/**
 * The one sheet presentation used by the Day selector, the Item action menu and
 * the Item date picker.
 *
 * Backdrop and sheet are siblings animated independently: the backdrop is one
 * full-viewport layer that only fades (opacity 0 → 0.28), while the white sheet
 * only translates. Translating a combined container is what produced the "dark
 * layer rising from the bottom" effect, so the two are never one view.
 *
 * The overlay is rendered in place rather than through `Modal`: the Item editor
 * is itself a full-screen Modal, and a sheet nested inside it has to live in the
 * same native layer as its parent instead of presenting a second one.
 */
export function AnimatedSheetModal({
  visible,
  onRequestClose,
  children,
  title,
  scrollable = false,
  avoidKeyboard = false,
  maxHeightRatio = SHEET_MAX_HEIGHT_RATIO,
  resetKey,
  testID = 'animated-sheet',
}: AnimatedSheetModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReduceMotionPreference();
  const [mounted, setMounted] = useState(visible);
  const [lastVisible, setLastVisible] = useState(visible);
  const [appliedResetKey, setAppliedResetKey] = useState(resetKey);
  const keyboardScope = avoidKeyboard && visible;
  const [keyboardState, setKeyboardState] = useState<{
    scope: boolean;
    frame: KeyboardFrame | null;
  }>(() => ({ scope: keyboardScope, frame: null }));
  if (keyboardState.scope !== keyboardScope) {
    setKeyboardState({ scope: keyboardScope, frame: null });
  }
  const keyboardFrame = keyboardState.scope === keyboardScope ? keyboardState.frame : null;
  const previousVisible = useRef(visible);
  /** Travel distance of the closed sheet; the sheet is bounded by this height. */
  const travel = Math.max(1, Math.round(windowHeight * maxHeightRatio));
  const keyboardOverlap = avoidKeyboard && visible && keyboardFrame
    ? dockedKeyboardOverlap(windowHeight, keyboardFrame)
    : 0;
  const availableHeight = Math.max(1, windowHeight - keyboardOverlap);
  /*
   * UX-C (2026-10-07 device log): the sheet mounted with `visible` and correct
   * state while staying INVISIBLE on screen — the Reanimated UI-thread timing
   * never ran, leaving progress (and the backdrop opacity) at 0 and the sheet
   * translated fully off-screen. The presentation now runs on the JS thread
   * via RN's Animated, which has no UI-thread dependency; the same reasoning
   * that moved the drag to the raw touch stream.
   */
  /*
   * A lazily-created `Animated.Value`, so it survives every re-render. `useMemo`
   * would need `visible` in its deps to satisfy the lint rule, and recreating the
   * value on a visibility change is exactly what must not happen: the sheet would
   * jump to its new position instead of sliding to it.
   */
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  /** Read by the exit timer, which must judge the visibility *now*, not then. */
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    const wasVisible = previousVisible.current;
    previousVisible.current = visible;
    if (!avoidKeyboard || !visible) {
      if (avoidKeyboard && wasVisible && !visible) Keyboard.dismiss();
      return undefined;
    }

    const applyKeyboardFrame = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardState({
        scope: true,
        frame: {
          height: event.endCoordinates.height,
          screenY: event.endCoordinates.screenY,
        },
      });
    };
    const clearKeyboardFrame = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardState({ scope: true, frame: null });
    };
    const subscriptions = [
      Keyboard.addListener('keyboardWillChangeFrame', applyKeyboardFrame),
      Keyboard.addListener('keyboardDidShow', applyKeyboardFrame),
      Keyboard.addListener('keyboardWillHide', clearKeyboardFrame),
      Keyboard.addListener('keyboardDidHide', clearKeyboardFrame),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [avoidKeyboard, visible]);

  /*
   * Mounting is a render-phase decision, not an effect: an effect would commit a
   * frame with `visible` already true and nothing on screen yet.
   */
  if (lastVisible !== visible) {
    setLastVisible(visible);
    if (visible) setMounted(true);
    // Reduce Motion has no exit animation, so the sheet goes in the same commit.
    else if (reduceMotion) setMounted(false);
  }

  /*
   * 2026-10-08 device log (gesture-debug.db): the sheet logged
   * `mounted=true visible=true` and, 7 ms later, `mounted=false visible=true` —
   * and then stayed that way for the rest of the session. The exit timer from an
   * earlier closed state had survived into the open one, so the sheet unmounted
   * itself: `mounted === false` returns `null`, which is why nothing appeared.
   *
   * The invariant is simply "an open sheet is mounted", so it is enforced on
   * every render rather than only on the `visible` transition. That also makes a
   * stale unmount self-healing instead of terminal.
   */
  if (visible && !mounted) setMounted(true);

  if (resetKey !== appliedResetKey) {
    setAppliedResetKey(resetKey);
    if (!visible) setMounted(false);
  }

  useEffect(() => {
    const target = visible ? 1 : 0;
    if (reduceMotion) {
      progress.setValue(target);
      return undefined;
    }
    /*
     * `useNativeDriver: false` is the point of this rework, not a compromise:
     * the device log showed the presentation stalling while the animated value
     * sat at 0, so the animation must not depend on the native animated module.
     * It runs on the JS thread, which is also what makes the settled value
     * observable from the component tests.
     */
    const animation = Animated.timing(progress, {
      duration: SHEET_SLIDE_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      toValue: target,
      useNativeDriver: false,
    });
    animation.start();
    /*
     * A JS-thread timing keeps ticking on `requestAnimationFrame`, so one that
     * outlives its component writes into a torn-down environment and would fight
     * the next animation. Stopping it is the cleanup for both directions.
     */
    const stop = () => animation.stop();
    if (visible) return stop;
    /*
     * The exit is closed by a plain timer rather than the animation callback:
     * the unmount must not depend on the animation driver still reporting
     * completion, and a sheet that outlives its own close would keep an
     * invisible full-screen layer over the surface below it.
     */
    /*
     * Guarded by the visibility *at fire time*: a close that a re-open superseded
     * must not unmount the sheet, and the callback closes over the `visible` of
     * the render that scheduled it, not the current one.
     */
    const timer = setTimeout(() => {
      if (!visibleRef.current) setMounted(false);
    }, SHEET_SLIDE_MS);
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [progress, reduceMotion, visible]);

  const backdropStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, SHEET_BACKDROP_OPACITY],
    }),
  };

  const sheetStyle = {
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [travel, 0],
        }),
      },
    ],
  };

  glog(`modal ${testID} mounted=${mounted} visible=${visible}`);

  if (!mounted) return null;

  return (
    <View
      accessibilityViewIsModal
      pointerEvents={visible ? 'auto' : 'none'}
      style={styles.host}
      testID={`${testID}-host`}
    >
      <Animated.View style={[styles.backdrop, backdropStyle]} testID={`${testID}-backdrop`}>
        <Pressable
          accessibilityLabel="关闭"
          accessibilityRole="button"
          onPress={onRequestClose}
          style={styles.backdropPress}
          testID={`${testID}-backdrop-press`}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          sheetStyle,
          avoidKeyboard
            ? {
              bottom: keyboardOverlap,
              left: 0,
              maxHeight: Math.min(travel, availableHeight),
              position: 'absolute' as const,
              right: 0,
            }
            : { maxHeight: travel },
        ]}
        testID={testID}
      >
        <View style={styles.grabberArea}>
          <View style={styles.grabber} />
        </View>
        {title === undefined ? null : (
          <View style={styles.header}>
            <Text style={styles.title} testID={`${testID}-title`}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onRequestClose}
              style={styles.close}
              testID={`${testID}-close`}
            >
              <Text style={styles.closeLabel}>关闭</Text>
            </Pressable>
          </View>
        )}
        {scrollable ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            testID={`${testID}-scroll`}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={styles.content}>{children}</View>
        )}
      </Animated.View>
    </View>
  );
}

function dockedKeyboardOverlap(
  windowHeight: number,
  frame: { screenY: number; height: number },
) {
  const frameBottom = frame.screenY + frame.height;
  if (frame.height <= 0 || frameBottom < windowHeight - 1) return 0;
  return Math.max(0, Math.min(windowHeight, windowHeight - frame.screenY));
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors.backdropLayer,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  backdropPress: { flex: 1 },
  close: { justifyContent: 'center', minHeight: 44, minWidth: 56 },
  closeLabel: { ...typography.caption, color: colors.primary },
  content: { gap: spacing.xs, paddingBottom: spacing.xl, paddingHorizontal: spacing.xl },
  grabber: {
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 4,
    width: 40,
  },
  grabberArea: { alignItems: 'center', paddingBottom: spacing.sm, paddingTop: 10 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  host: {
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 40,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  title: { ...typography.sectionTitle, color: colors.text },
});
