import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ComponentRef,
  type ReactNode,
  type Ref,
} from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetProps,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_SHEET_SNAP,
  TRIP_SHEET_SNAP_PERCENTAGES,
  type TripSheetSnap,
} from '@/state/trip-focus';
import { colors } from '@/theme/tokens';

/**
 * The scroll handle both scroll implementations satisfy: only the synthetic
 * scroll and the onScroll tracker need it.
 */
export interface SheetScrollViewMethods {
  scrollTo: (options: { animated?: boolean; x?: number; y?: number }) => void;
}

export { TRIP_SHEET_SNAP_PERCENTAGES };

export type { TripSheetSnap };

/**
 * Snap targets from Stage 04 §43 Bottom Sheet Architecture.
 * Percentages are relative to the sheet container, so they stay device-aware.
 */
/** Ascending order; a native sheet index is a position in this list. */
export const TRIP_SHEET_SNAP_STATES: readonly TripSheetSnap[] = [
  'collapsed',
  'half',
  'expanded',
];

export const TRIP_SHEET_SNAP_POINTS: readonly string[] =
  TRIP_SHEET_SNAP_STATES.map((snap) => `${TRIP_SHEET_SNAP_PERCENTAGES[snap]}%`);

export const TRIP_SHEET_SNAP_INDEX = Object.fromEntries(
  TRIP_SHEET_SNAP_STATES.map((snap, index) => [snap, index]),
) as Record<TripSheetSnap, number>;

/** Half is the default planning state. */
export const TRIP_SHEET_DEFAULT_SNAP: TripSheetSnap = DEFAULT_SHEET_SNAP;

export const TRIP_SHEET_DEFAULT_SNAP_INDEX =
  TRIP_SHEET_SNAP_INDEX[TRIP_SHEET_DEFAULT_SNAP];

/** Maps a native sheet index back to durable state; unknown indexes select nothing. */
export function sheetIndexToSnap(index: number): TripSheetSnap | undefined {
  return TRIP_SHEET_SNAP_STATES[index];
}

export type TripBottomSheetRef = ComponentRef<typeof BottomSheet>;

export interface TripBottomSheetProps {
  children: ReactNode;
  /**
   * Fixed content rendered above the scrollable body, inside the sheet.
   *
   * It exists for gestures that cannot live inside `BottomSheetScrollView`:
   * that scroll view is wrapped in an RNGH `Gesture.Native()` handler whose
   * recognizer is the UIScrollView's own pan, and an RNGH gesture nested below
   * it is never declared simultaneous with it, so it loses the activation race
   * on device. Chrome rendered here is a sibling of the scrollable instead, so
   * its gestures only compete with the sheet's content pan — which the root
   * `simultaneousHandlers` already coordinates.
   */
  header?: ReactNode;
  /**
   * Gesture attached to the fixed header region. Pass the same gesture ref to
   * `simultaneousHandlers` so it composes with the sheet's own content pan.
   */
  headerGesture?: GestureType;
  /**
   * UX-C: gesture for the fixed handle strip — the other sibling-of-scrollable
   * zone a native gesture can own. The Overview's right-swipe back lives here:
   * like `headerGesture` it only competes with the sheet's content pan, never
   * with the scroll view's native pan.
   */
  handleGesture?: GestureType;
  /** Optional gesture spanning the fixed header and the entire scroll viewport. */
  contentGesture?: GestureType;
  animatedPosition?: BottomSheetProps['animatedPosition'];
  /** Durable snap state. Omit to start on the Half planning state. */
  snap?: TripSheetSnap;
  onSnapChange?: (snap: TripSheetSnap) => void;
  /** Use the Bottom Sheet gesture-aware scroll container for long content. */
  scrollable?: boolean;
  /** Optional imperative handle for content that scrolls items into view. */
  scrollViewRef?: Ref<SheetScrollViewMethods>;
  /**
   * UX-C (2026-10-06 device log): gorhom's scrollable force-disables its inner
   * scroll view whenever the sheet is not expanded, which silently no-ops the
   * row-gestures' programmatic scrollTo. Surfaces that scroll through their
   * own gestures render a plain RN ScrollView instead — no gorhom scroll
   * management to fight.
   */
  unmanagedScroll?: boolean;
  /**
   * UX-C: the scroll position tracker the row-pan synthetic scrolling anchors
   * to. Forwarded to the inner scroll view untouched.
   */
  onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
  /**
   * UX-C (2026-10-05 device pass): the two native vertical pans over the sheet
   * content — the scroll view's own pan and the sheet's content-drag pan — both
   * activate on a few points of drift and win the mutual-exclusion race against
   * the row drag's 500 ms hold, no matter how the hold is implemented. Surfaces
   * that scroll through their own row gestures turn both off here; the handle
   * keeps dragging the sheet.
   */
  contentPanningGesture?: boolean;
  scrollEnabled?: boolean;
  /**
   * UX-C (2026-10-05 device pass): when false the scroll view may never cancel
   * a touch that began in the content, so a surface that drives its own
   * gestures from the raw touch stream cannot have that stream cut off by the
   * scroll view's pan recognizer mid-gesture.
   */
  cancelContentTouches?: boolean;
  /** UX-C: the scroll content height, for boundary handoff math. */
  onContentSizeChange?: (height: number) => void;
  onScrollLayout?: (height: number) => void;
  /**
   * Gesture handler refs that must run at the same time as the sheet's own
   * content/drag pan. The Day swipe pan is registered here so a horizontal
   * swipe switches Day while the vertical scroll keeps its native owner.
   *
   * Routing it to the root `BottomSheet` (not `BottomSheetScrollView`) matters:
   * the scrollable strips unknown props, so the ref would otherwise be dropped.
   * The root sheet feeds `simultaneousHandlers` into its content pan gesture
   * (`BottomSheetDraggableView`), which is the handler that wraps all content
   * including the scrollable.
   */
  simultaneousHandlers?: React.ComponentProps<typeof BottomSheet>['simultaneousHandlers'];
  testID?: string;
}

/**
 * Trip planning sheet shell: MapCanvas stays visible behind it and keeps
 * expanded map context, so no backdrop is mounted and the sheet never closes
 * by panning down. Stage 04 §44 keeps vertical drag ownership on the handle.
 *
 * `snap` is a controlled value. A user drag reports through `onSnapChange`,
 * and an externally changed `snap` snaps the sheet once.
 */
export const TripBottomSheet = forwardRef<
  TripBottomSheetRef,
  TripBottomSheetProps
>(function TripBottomSheet(
  {
    children,
    header,
    headerGesture,
    handleGesture,
    contentGesture,
    animatedPosition,
    snap = TRIP_SHEET_DEFAULT_SNAP,
    onSnapChange,
    scrollable = false,
    scrollViewRef,
    onScroll,
    contentPanningGesture = true,
    scrollEnabled = true,
    unmanagedScroll = false,
    onContentSizeChange,
    onScrollLayout,
    cancelContentTouches = true,
    simultaneousHandlers,
    testID = 'trip-bottom-sheet',
  },
  ref,
) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<TripBottomSheetRef | null>(null);
  const appliedIndex = useRef(TRIP_SHEET_SNAP_INDEX[snap]);

  const attachRef = useCallback(
    (node: TripBottomSheetRef | null) => {
      sheetRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  useEffect(() => {
    const target = TRIP_SHEET_SNAP_INDEX[snap];
    if (target === appliedIndex.current) return;
    appliedIndex.current = target;
    sheetRef.current?.snapToIndex(target);
  }, [snap]);

  const handleSnapChange = useCallback<
    NonNullable<BottomSheetProps['onChange']>
  >(
    (index) => {
      const next = sheetIndexToSnap(index);
      // Continuous body pulls can report a temporary, non-detent position.
      if (!next) return;
      // Record first so the effect above does not snap the sheet back.
      appliedIndex.current = index;
      onSnapChange?.(next);
    },
    [onSnapChange],
  );

  const renderHandle = useCallback(
    () => {
      const handle = (
        <View style={styles.handleArea} testID={`${testID}-handle`}>
          <View style={styles.handleGrabber} />
        </View>
      );
      return handleGesture ? (
        <GestureDetector gesture={handleGesture}>{handle}</GestureDetector>
      ) : handle;
    },
    [handleGesture, testID],
  );

  const headerNode =
    header === undefined ? null : (
      <View style={styles.header} testID={`${testID}-header`}>
        {header}
      </View>
    );
  const content = (
    <>
      {/*
       * The fixed header is deliberately a sibling of the scrollable, not a
       * child of it: see `TripBottomSheetProps.header`.
       */}
      {headerGesture !== undefined && headerNode !== null ? (
        <GestureDetector gesture={headerGesture}>{headerNode}</GestureDetector>
      ) : (
        headerNode
      )}
      {scrollable && unmanagedScroll ? (
        <ScrollView
          ref={scrollViewRef as Ref<ScrollView>}
          canCancelContentTouches={cancelContentTouches}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
          onContentSizeChange={(_, height) => onContentSizeChange?.(height)}
          onLayout={(event) => onScrollLayout?.(event.nativeEvent.layout.height)}
          onScroll={onScroll}
          scrollEnabled={scrollEnabled}
          scrollEventThrottle={16}
          style={styles.scroll}
          testID={`${testID}-content`}
        >
          {children}
        </ScrollView>
      ) : scrollable ? (
        <BottomSheetScrollView
          ref={scrollViewRef as Ref<BottomSheetScrollViewMethods>}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
          canCancelContentTouches={cancelContentTouches}
          onContentSizeChange={(_, height) => onContentSizeChange?.(height)}
          onLayout={(event) => onScrollLayout?.(event.nativeEvent.layout.height)}
          onScroll={onScroll}
          scrollEnabled={scrollEnabled}
          style={styles.scroll}
          testID={`${testID}-content`}
        >
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView
          style={[styles.content, { paddingBottom: insets.bottom + 16 }]}
          testID={`${testID}-content`}
        >
          {children}
        </BottomSheetView>
      )}
    </>
  );

  return (
    <BottomSheet
      ref={attachRef}
      index={appliedIndex.current}
      snapPoints={[...TRIP_SHEET_SNAP_POINTS]}
      animatedPosition={animatedPosition}
      enableDynamicSizing={false}
      enablePanDownToClose={false}
      enableContentPanningGesture={contentPanningGesture}
      handleComponent={renderHandle}
      backgroundStyle={styles.background}
      simultaneousHandlers={simultaneousHandlers}
      onChange={handleSnapChange}
    >
      {contentGesture ? (
        <GestureDetector gesture={contentGesture}>
          <View style={styles.scroll} testID={`${testID}-gesture-content`}>
            {content}
          </View>
        </GestureDetector>
      ) : content}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  background: {
    backgroundColor: Platform.OS === 'web' ? '#FFFEFB' : colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  /**
   * The scrollable body must yield to the fixed header: the sheet container has
   * a definite height, so `flex: 1` gives the header its natural height and the
   * body the remainder.
   */
  scroll: {
    flex: 1,
  },
  /** Keeps the fixed header aligned with the scroll content it used to sit in. */
  header: {
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  handleArea: {
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 10,
  },
  handleGrabber: {
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 4,
    width: 40,
  },
});
