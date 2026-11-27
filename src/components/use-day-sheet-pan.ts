import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { TRIP_SHEET_SNAP_PERCENTAGES, type TripSheetSnap } from '@/state/trip-focus';
import {
  TRIP_SHEET_SNAP_INDEX,
  TRIP_SHEET_SNAP_STATES,
  type SheetScrollViewMethods,
  type TripBottomSheetRef,
} from './trip-bottom-sheet';

/** Share one resize/scroll path between Timeline touches and the rest of the sheet. */
export function useDaySheetPan(snap: TripSheetSnap, resetKey: string) {
  const sheetRef = useRef<TripBottomSheetRef | null>(null);
  const scrollRef = useRef<SheetScrollViewMethods | null>(null);
  const timelineGestureRef = useRef<GestureType | undefined>(undefined);
  const position = useSharedValue(Number.POSITIVE_INFINITY);
  const containerHeight = useRef(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const scrollY = useRef(0);
  const timelineTouchActive = useRef(false);
  const pan = useRef({ height: 0, scrollY: 0, movedSheet: false });

  const onPanStart = useCallback(() => {
    const reportedHeight = containerHeight.current - position.value;
    pan.current = {
      height: Number.isFinite(reportedHeight) && reportedHeight > 0
        ? reportedHeight
        : containerHeight.current * TRIP_SHEET_SNAP_PERCENTAGES[snap] / 100,
      scrollY: Math.max(0, scrollY.current),
      movedSheet: false,
    };
  }, [position, snap]);

  const onPanDelta = useCallback((deltaY: number) => {
    const state = pan.current;
    const maxHeight = containerHeight.current * TRIP_SHEET_SNAP_PERCENTAGES.expanded / 100;
    const minHeight = containerHeight.current * TRIP_SHEET_SNAP_PERCENTAGES.collapsed / 100;
    let remaining = deltaY;
    // Downward movement first returns a scrolled list to its top.
    if (remaining < 0 && state.scrollY > 0) {
      const consumed = Math.min(state.scrollY, -remaining);
      state.scrollY -= consumed;
      remaining += consumed;
    }
    // Like Overview, upward movement expands the panel before scrolling the list.
    const nextHeight = Math.max(minHeight, Math.min(maxHeight, state.height + remaining));
    if (nextHeight !== state.height) {
      remaining -= nextHeight - state.height;
      state.height = nextHeight;
      state.movedSheet = true;
      // A public sheet method keeps the background, handle and header together.
      sheetRef.current?.snapToPosition(nextHeight, { duration: 0 });
    }
    if (remaining > 0) {
      const extent = Math.max(0, contentHeight.current - viewportHeight.current);
      state.scrollY = Math.min(extent, state.scrollY + remaining);
    }
    if (state.scrollY !== scrollY.current) {
      scrollY.current = state.scrollY;
      scrollRef.current?.scrollTo({ y: state.scrollY, animated: false });
    }
  }, []);

  const onPanEnd = useCallback(() => {
    if (!pan.current.movedSheet || containerHeight.current <= 0) return;
    const height = pan.current.height;
    const nearest = TRIP_SHEET_SNAP_STATES.reduce((best, candidate) => {
      const target = containerHeight.current * TRIP_SHEET_SNAP_PERCENTAGES[candidate] / 100;
      const bestTarget = containerHeight.current * TRIP_SHEET_SNAP_PERCENTAGES[best] / 100;
      return Math.abs(target - height) < Math.abs(bestTarget - height) ? candidate : best;
    }, snap);
    pan.current.movedSheet = false;
    // Always settle, including a short pull returning to the original snap.
    sheetRef.current?.snapToIndex(TRIP_SHEET_SNAP_INDEX[nearest]);
  }, [snap]);

  const bodyTouch = useRef({
    id: null as number | null, startX: 0, startY: 0, lastY: 0, panning: false,
  });
  type Touch = { id: number; x: number; y: number; absoluteX?: number; absoluteY?: number };
  const onTouchesDown = useCallback((event: { allTouches: Touch[] }) => {
    const touch = event.allTouches[0];
    if (!touch) return;
    bodyTouch.current = {
      id: touch.id, startX: touch.absoluteX ?? touch.x,
      startY: touch.absoluteY ?? touch.y, lastY: touch.absoluteY ?? touch.y, panning: false,
    };
  }, []);
  const onTouchesMove = useCallback((
    event: { allTouches: Touch[] },
    manager: { activate: () => void },
  ) => {
    // Timeline owns its hold, swipe and scroll; never process a delta twice.
    if (timelineTouchActive.current) return;
    const state = bodyTouch.current;
    const touch = event.allTouches.find(({ id }) => id === state.id);
    if (!touch) return;
    const y = touch.absoluteY ?? touch.y;
    const dx = (touch.absoluteX ?? touch.x) - state.startX;
    const dy = y - state.startY;
    if (!state.panning) {
      if (Math.abs(dy) <= 8 || Math.abs(dy) <= Math.abs(dx) * 1.2) return;
      state.panning = true;
      onPanStart();
      manager.activate();
    }
    onPanDelta(state.lastY - y);
    state.lastY = y;
  }, [onPanDelta, onPanStart]);
  const onTouchesEnd = useCallback(() => {
    if (bodyTouch.current.panning) onPanEnd();
    bodyTouch.current.id = null;
    bodyTouch.current.panning = false;
  }, [onPanEnd]);
  // RNGH registers callbacks and refs here; it invokes them only on touch events.
  /* eslint-disable react-hooks/refs */
  const contentGesture = useMemo(() => Gesture.Pan()
    .manualActivation(true)
    .runOnJS(true)
    .simultaneousWithExternalGesture(timelineGestureRef)
    .onTouchesDown(onTouchesDown)
    .onTouchesMove(onTouchesMove)
    .onTouchesUp(onTouchesEnd)
    .onTouchesCancelled(onTouchesEnd), [onTouchesDown, onTouchesEnd, onTouchesMove]);
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    scrollY.current = 0;
    timelineTouchActive.current = false;
    bodyTouch.current.id = null;
    bodyTouch.current.panning = false;
    pan.current.movedSheet = false;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [resetKey]);

  return {
    sheetRef,
    scrollRef,
    position,
    contentGesture,
    timelineGestureRef,
    onPanStart,
    onPanDelta,
    onPanEnd,
    onTimelineTouchChange: useCallback((active: boolean) => {
      timelineTouchActive.current = active;
    }, []),
    onScroll: useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollY.current = Math.max(0, event.nativeEvent.contentOffset.y);
    }, []),
    onContainerLayout: useCallback((event: LayoutChangeEvent) => {
      containerHeight.current = event.nativeEvent.layout.height;
    }, []),
    onScrollLayout: useCallback((height: number) => { viewportHeight.current = height; }, []),
    onContentSizeChange: useCallback((height: number) => { contentHeight.current = height; }, []),
  };
}
