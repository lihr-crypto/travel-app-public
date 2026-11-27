import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, type GestureStateManager, type GestureType } from 'react-native-gesture-handler';

import { colors } from '@/theme/tokens';

import type {
  TimelineItemModel,
  TimelineProjection,
} from '@/application/projections/timeline';
import type { TimelineScrollRequest } from '@/state/day-focus-effects';
import { DAY_SWIPE_DOMINANCE, DAY_SWIPE_THRESHOLD } from './day-header';
import {
  useDaySwipeGuard,
  useSwipeExclusion,
} from './day-swipe-guard';
import { EmptyHint } from './ui/empty-hint';
import {
  buildDisplacementUpdates,
  buildDragPreview,
  DEFAULT_ROW_HEIGHT,
  DRAG_ACTIVATION_MS,
  DRAG_SLOP,
  resolveDragTarget,
  resolveDropIntent,
  type ReorderDropIntent,
} from './timeline-drag';

/** Gap between flow rows; part of the slot a dragged card vacates. */
const ROW_GAP = 8;

/** Day-timeline outer padding; rows measure inside the inner list. */
const LIST_PADDING = 16;

/** UX-C: whether two id sequences arrange their items identically. */
function sameOrder(
  left: readonly { id: string }[],
  right: readonly { id: string }[],
): boolean {
  return left.length === right.length
    && left.every((item, index) => item.id === right[index].id);
}

export interface DayTimelineProps {
  projection: TimelineProjection;
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string) => void;
  /**
   * UX-C: a second tap on the same row within `ITEM_DOUBLE_TAP_MS` opens the
   * Item detail directly (the same surface as ⋯ → 编辑详情). The first tap of
   * the pair still selects, so the map follows the double-tap's first half.
   */
  onOpenItemDetails?: (itemId: string) => void;
  /**
   * Opens the Item's action menu (change place / edit details). The menu is a
   * sibling of row selection, so opening it never needs a prior selection tap.
   */
  onOpenItemActions?: (itemId: string) => void;
  onMoveItem?: (itemId: string, direction: 'up' | 'down') => void;
  onRequestMoveItem?: (itemId: string) => void;
  isReordering?: boolean;
  /**
   * M6: emits the drop intent exactly once per drag, only on drop — the local
   * preview is pure component state and never reaches the repository.
   */
  onReorderDrop?: (itemId: string, position: ReorderDropIntent) => void;
  /** Raised while a long-press drag is live, so the sheet can hold scrolling. */
  onDragActiveChange?: (active: boolean) => void;
  /**
   * UX-C: the row pan owns touches on rows, so it is also how rows scroll and
   * swipe. `onPanScrollStart` anchors the sheet scroll; every later
   * `onPanScrollDelta` scrolls by that much (positive = towards the end);
   * `onPanSwipe` reports a dominant horizontal drift. Absent handlers keep the
   * rows inert to those movements (tests, minimal hosts).
   */
  onPanScrollStart?: () => void;
  onPanScrollDelta?: (deltaY: number) => void;
  onPanScrollEnd?: () => void;
  /** Coordinate the enclosing sheet gesture without competing with the row hold. */
  gestureRef?: RefObject<GestureType | undefined>;
  onGestureTouchChange?: (active: boolean) => void;
  onPanSwipe?: (direction: 'left' | 'right') => void;
  /**
   * A2: the empty surface explains and points at the next action instead of a
   * bare grey word. Default keeps the original one-liner.
   */
  emptyState?: { title: string; hint?: string };
  scrollRequest?: TimelineScrollRequest | null;
  onScrollToOffset?: (offset: number) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  /**
   * Identity of the content being listed. The Timeline stays mounted while a
   * persistent Day View swaps Days, so a changed key clears the measured row
   * offsets and any pending marker-to-row scroll from the previous Day.
   */
  resetKey?: string;
}

const periodLabels: Record<Extract<TimelineItemModel['time'], { mode: 'period' }>['period'], string> = {
  morning: '上午',
  noon: '中午',
  afternoon: '下午',
  night: '晚上',
};

/** UX-C: two taps on the same row within this window open the detail. */
export const ITEM_DOUBLE_TAP_MS = 300;

/** Mutable double-tap bookkeeping for one list instance. Never rendered state. */
interface TapMemory {
  id: string | null;
  at: number;
}

/**
 * Module scope on purpose: `Date.now` is impure, and the react-hooks purity
 * rule rightly keeps impure calls out of component scope. The memory object is
 * event state held by a ref, read and written only from press handlers.
 */
function consumeDoubleTap(memory: TapMemory, itemId: string): boolean {
  const now = Date.now();
  const isDouble = memory.id === itemId && now - memory.at <= ITEM_DOUBLE_TAP_MS;
  memory.id = itemId;
  memory.at = now;
  return isDouble;
}

function formatLocalTime(value: string) {
  return value.slice(11);
}

function formatTime(item: TimelineItemModel) {
  switch (item.time.mode) {
    case 'none':
      return '待定';
    case 'period':
      return periodLabels[item.time.period];
    case 'exact': {
      const start = item.time.startDateTime === null
        ? null
        : formatLocalTime(item.time.startDateTime);
      const end = item.time.endDateTime === null
        ? null
        : formatLocalTime(item.time.endDateTime);
      if (start !== null && end !== null) return `${start}–${end}`;
      return start ?? end ?? '待定';
    }
  }
}

/**
 * Day Overview is a compact schedule, so every row carries exactly one
 * secondary line. Type is always shown; the Place outranks the note, and a
 * title that already names its Place suppresses that duplicate. A note appears
 * when there is no Place to name. The line is truncated, so long text cannot
 * change the list rhythm.
 */
function normalizeSubtitle(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function formatSecondaryLine(item: TimelineItemModel) {
  const placeName = item.placeName;
  const hasPlace = placeName !== null && placeName.trim().length > 0;
  if (
    placeName !== null
    && placeName.trim().length > 0
    && normalizeSubtitle(item.title) === normalizeSubtitle(placeName)
  ) {
    return item.typeLabel;
  }
  const detail = hasPlace ? placeName : item.note;
  return detail ? `${item.typeLabel} · ${detail}` : item.typeLabel;
}

/**
 * Mutable touch bookkeeping for the list container's gesture. Never rendered
 * state.
 *
 * UX-C (2026-10-05, fifth device round): this gesture lives on the LIST
 * CONTAINER, not on the rows. The previous per-row gesture died the moment its
 * row unmounted — and arming a drag unmounts exactly that row (the row leaves
 * the flow and becomes the floating card's empty slot), so the touch stream
 * was destroyed by the arm itself. A container gesture survives every row
 * reorder, remount and preview swap; the touched row is identified by hit-test
 * against the measured row slots.
 */
interface ListGestureHold {
  touchId: number | null;
  /**
   * The live row-geometry maps, shared with the component's refs. Assigned
   * from the first layout event so the module-scope hit-test never has to
   * touch a React ref (refs are invisible to render-created closures).
   */
  layoutOffsets: Map<string, number> | null;
  layoutHeights: Map<string, number> | null;
  /** The workspace swipe guard, stamped alongside the layout maps. */
  swipeGuard: { startedOnControl: { current: boolean } } | null;
  /** Touch position in the list container's own coordinates. */
  startX: number;
  startY: number;
  startAbsoluteY: number;
  /** The touch position the previous move event reported (for scroll deltas). */
  lastX: number;
  lastY: number;
  moved: boolean;
  activated: boolean;
  /** The row the touch landed on, if any — only a row touch can arm a drag. */
  hitItemId: string | null;
  mode: 'undecided' | 'scroll' | 'swipe';
  timer: ReturnType<typeof setTimeout> | null;
  stateManager: GestureStateManager | null;
}

/** Wipe every scrap of touch state, so no gesture notion survives a session. */
function resetListGestureHold(hold: ListGestureHold): void {
  if (hold.timer !== null) clearTimeout(hold.timer);
  hold.timer = null;
  hold.touchId = null;
  hold.moved = false;
  hold.activated = false;
  hold.hitItemId = null;
  hold.mode = 'undecided';
  hold.stateManager = null;
}

function createListGestureHold(): ListGestureHold {
  return {
    touchId: null,
    layoutOffsets: null,
    layoutHeights: null,
    swipeGuard: null,
    startX: 0,
    startY: 0,
    startAbsoluteY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    activated: false,
    hitItemId: null,
    mode: 'undecided',
    timer: null,
    stateManager: null,
  };
}

/** The handlers the container gesture calls for the current render. */
export interface ListGestureHandlers {
  onDragStart?: (itemId: string) => void;
  onDragUpdate?: (itemId: string, translationY: number) => void;
  onDragEnd?: (itemId: string, cancelled: boolean) => void;
  /** UX-C: the touch became a scroll; anchor the sheet scroll now. */
  onPanScrollStart?: () => void;
  /** UX-C: scroll by `deltaY` (positive = towards the list's end). */
  onPanScrollDelta?: (deltaY: number) => void;
  onPanScrollEnd?: () => void;
  onGestureTouchChange?: (active: boolean) => void;
  /** UX-C: a dominant horizontal drift on the list. */
  onPanSwipe?: (direction: 'left' | 'right') => void;
}

/**
 * The list container's pan, built once.
 *
 * One gesture owns every touch on the list and classifies it: a 500 ms hold on
 * a row arms that row's drag; vertical drift becomes synthetic scrolling; a
 * dominant horizontal drift becomes a Day/Back swipe. The callbacks run on the
 * JS thread (see the crash fix below) and drive the drag from the raw touch
 * stream — never from gesture activation, which the native scroll pan always
 * used to win during the hold.
 */
/**
 * The row whose slot contains this container-relative y, if any. Reads the
 * geometry through the hold, so no React ref is touched from render-created
 * closures; the maps themselves are event-mutated component state.
 */
function hitTestRow(hold: ListGestureHold, y: number): string | null {
  const offsets = hold.layoutOffsets;
  const heights = hold.layoutHeights;
  if (offsets === null || heights === null) return null;
  for (const [itemId, top] of offsets) {
    const height = heights.get(itemId) ?? DEFAULT_ROW_HEIGHT;
    // A little slop covers the inter-row gaps.
    if (y >= top - 4 && y <= top + height + 4) return itemId;
  }
  return null;
}

function buildListGesture(
  hold: ListGestureHold,
  handlers: ListGestureHandlers,
  gestureRef: RefObject<GestureType | undefined>,
) {
  const clearHold = () => {
    if (hold.timer !== null) clearTimeout(hold.timer);
    hold.timer = null;
  };

  return Gesture.Pan()
    .withRef(gestureRef)
    .manualActivation(true)
    /*
     * CRASH FIX (2026-10-04 device pass): GestureDetector callbacks are
     * auto-workletized, and the worklet thread has no setTimeout/Date.now —
     * the arming timer threw the moment a finger touched a row and aborted the
     * app. `.runOnJS(true)` pins every callback to the JS thread, where the
     * hold bookkeeping lives.
     */
    .runOnJS(true)
    .onTouchesDown((event, stateManager) => {
      const touch = event.allTouches[0];
      if (touch === undefined) return;
      /*
       * UX-C (2026-10-06 device pass): a previous surface's gesture could be
       * torn down mid-drag (leaving Day while a card was floating), and RNGH's
       * activation flag does not reset with the component. A zombie
       * `activated` made the resurrected gesture swallow every touch — taps
       * included — which is why ⋯ died after re-entering the Day. Every new
       * touch starts from a wiped hold.
       */
      resetListGestureHold(hold);
      handlers.onGestureTouchChange?.(true);
      hold.touchId = touch.id;
      hold.startX = touch.x;
      hold.startY = touch.y;
      hold.startAbsoluteY = touch.absoluteY ?? touch.y;
      hold.lastX = touch.x;
      hold.lastY = touch.absoluteY ?? touch.y;
      hold.moved = false;
      hold.activated = false;
      hold.mode = 'undecided';
      hold.hitItemId = hitTestRow(hold, touch.y);
      hold.stateManager = stateManager;
      clearHold();
      hold.timer = setTimeout(() => {
        if (!hold.moved && !hold.activated && hold.hitItemId !== null) {
          hold.activated = true;
          // Best effort only: nothing downstream depends on the native
          // activation succeeding — the drag is driven by the touch stream.
          hold.stateManager?.activate();
          handlers.onDragStart?.(hold.hitItemId);
        }
      }, DRAG_ACTIVATION_MS);
    })
    .onTouchesMove((event) => {
      const touch = event.allTouches.find(({ id }) => id === hold.touchId)
        ?? event.allTouches[0];
      if (touch === undefined) return;

      /*
       * An armed drag follows the raw touch stream — travel since touch-down
       * equals travel since the arm, because the arm fires with the finger
       * still. `onUpdate` is deliberately not used: it only fires for a
       * gesture that activated, and activation always lost the race.
       */
      if (hold.activated && hold.hitItemId !== null) {
        handlers.onDragUpdate?.(hold.hitItemId, touch.y - hold.startY);
        return;
      }

      const absoluteY = touch.absoluteY ?? touch.y;
      const deltaY = hold.lastY - absoluteY;
      hold.lastX = touch.x;
      hold.lastY = absoluteY;

      /*
       * A decided touch keeps reporting regardless of the start distance — a
       * scroll wiggles back towards its start all the time, so the drift gate
       * below must only govern the *undecided* phase.
       */
      if (hold.mode === 'scroll') {
        if (deltaY !== 0) handlers.onPanScrollDelta?.(deltaY);
        return;
      }
      if (hold.mode === 'swipe') return;

      const drift = Math.hypot(touch.x - hold.startX, absoluteY - hold.startAbsoluteY);
      if (drift > DRAG_SLOP) {
        hold.moved = true;
        clearHold();
      } else {
        return;
      }

      /*
       * Axis decision by dominance, not by the first slop crossing: a
       * horizontal flick is already past the slop while |dx| is still far
       * under the swipe threshold, so the swipe stays undecided (and
       * un-scrolling) until the threshold is met, while a vertical drift
       * commits to scrolling immediately.
       */
      const dx = touch.x - hold.startX;
      const dy = absoluteY - hold.startAbsoluteY;
      if (Math.abs(dy) > DAY_SWIPE_DOMINANCE * Math.abs(dx)) {
        hold.mode = 'scroll';
        handlers.onPanScrollStart?.();
        if (deltaY !== 0) handlers.onPanScrollDelta?.(deltaY);
        return;
      }
      if (
        Math.abs(dx) > DAY_SWIPE_THRESHOLD
        && Math.abs(dx) > DAY_SWIPE_DOMINANCE * Math.abs(dy)
        && !(hold.swipeGuard?.startedOnControl.current ?? false)
      ) {
        hold.mode = 'swipe';
        handlers.onPanSwipe?.(dx < 0 ? 'left' : 'right');
      }
    })
    /*
     * The drag ends where its touch stream ends — not in `onEnd`/`onFinalize`,
     * which only run for gestures that activated.
     */
    .onTouchesUp(() => {
      if (hold.mode === 'scroll') handlers.onPanScrollEnd?.();
      handlers.onGestureTouchChange?.(false);
      const wasDragging = hold.activated && hold.hitItemId !== null;
      const draggedId = hold.hitItemId;
      resetListGestureHold(hold);
      if (wasDragging && draggedId !== null) {
        handlers.onDragEnd?.(draggedId, false);
      }
    })
    .onTouchesCancelled(() => {
      if (hold.mode === 'scroll') handlers.onPanScrollEnd?.();
      handlers.onGestureTouchChange?.(false);
      const wasDragging = hold.activated && hold.hitItemId !== null;
      const draggedId = hold.hitItemId;
      resetListGestureHold(hold);
      if (wasDragging && draggedId !== null) {
        handlers.onDragEnd?.(draggedId, true);
      }
    });
}

/** The row's own content — shared by the flow row and the floating drag card. */
function RowContent({ item }: { item: TimelineItemModel }) {
  return (
    <View style={styles.row} testID={`timeline-item-${item.id}`}>
      <Text style={styles.time}>{formatTime(item)}</Text>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.metaText}
          testID={`timeline-secondary-${item.id}`}
        >
          {formatSecondaryLine(item)}
        </Text>
      </View>
    </View>
  );
}

function TimelineRow({
  item,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRequestMove,
  onOpenItemActions,
  isReordering,
  onLayout,
  displacement,
}: {
  item: TimelineItemModel;
  isSelected: boolean;
  onSelect?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRequestMove?: () => void;
  onOpenItemActions?: () => void;
  isReordering: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  /** UX-C: the room-making offset this row is animating out of, if any. */
  displacement?: Animated.Value;
}) {
  /**
   * `⋯` was the control that most often swallowed a tap: a touch that drifted
   * a little let the Day swipe claim the responder and cancel the press.
   */
  const excludeActions = useSwipeExclusion();

  const row = (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.itemLine,
        isSelected ? styles.selectedRow : null,
        displacement ? { transform: [{ translateY: displacement }] } : null,
      ]}
      testID={`timeline-row-${item.id}`}
      aria-selected={Platform.OS === 'web' ? isSelected : undefined}
    >
      {onSelect ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSelect}
          style={styles.selectableRow}
          testID={`timeline-select-${item.id}`}
        >
          <RowContent item={item} />
        </Pressable>
      ) : (
        <View style={styles.selectableRow}>
          <RowContent item={item} />
        </View>
      )}
      {/*
       * The action menu is a sibling of the row-selection target, never nested
       * inside it, so tapping ⋯ never selects the Item first.
       */}
      {onOpenItemActions ? (
        <Pressable
          accessibilityLabel={`${item.title} 的操作`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenItemActions}
          style={styles.actionsButton}
          testID={`timeline-actions-${item.id}`}
          {...excludeActions}
        >
          <Text style={styles.actionsLabel}>⋯</Text>
        </Pressable>
      ) : null}
      {onMoveUp || onMoveDown ? (
        <View style={styles.reorderControls}>
          <Pressable
            accessibilityLabel={`上移 ${item.title}`}
            accessibilityRole="button"
            disabled={!onMoveUp || isReordering}
            onPress={onMoveUp}
            testID={`timeline-move-up-${item.id}`}
          >
            <Text style={!onMoveUp || isReordering ? styles.disabledControl : styles.control}>↑</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`下移 ${item.title}`}
            accessibilityRole="button"
            disabled={!onMoveDown || isReordering}
            onPress={onMoveDown}
            testID={`timeline-move-down-${item.id}`}
          >
            <Text style={!onMoveDown || isReordering ? styles.disabledControl : styles.control}>↓</Text>
          </Pressable>
        </View>
      ) : null}
      {onRequestMove ? (
        <Pressable
          accessibilityLabel={`移动 ${item.title}`}
          accessibilityRole="button"
          onPress={onRequestMove}
          testID={`timeline-request-move-${item.id}`}
        >
          <Text style={styles.moveControl}>移动</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );

  return row;
}

export function DayTimeline({
  projection,
  selectedItemId = null,
  onSelectItem,
  onOpenItemDetails,
  onOpenItemActions,
  onMoveItem,
  onRequestMoveItem,
  isReordering = false,
  onReorderDrop,
  onDragActiveChange,
  onPanScrollStart,
  onPanScrollDelta,
  onPanScrollEnd,
  gestureRef,
  onGestureTouchChange,
  onPanSwipe,
  emptyState,
  scrollRequest = null,
  onScrollToOffset,
  onLayout,
  resetKey,
}: DayTimelineProps) {
  const localGestureRef = useRef<GestureType | undefined>(undefined);
  const itemOffsets = useRef(new Map<string, number>());
  const itemHeights = useRef(new Map<string, number>());
  /**
   * The drag resolves a target by Item id, while `itemOffsets` is keyed by
   * `contentKey:itemId` so a persistent Day View cannot reuse the previous
   * Day's measurements for a scroll. Two maps rather than one keyed shape: the
   * drag helper stays a plain id lookup, and the scroll stays Day-scoped.
   */
  const dragOffsets = useRef(new Map<string, number>());
  const pendingScroll = useRef<{ key: string; itemId: string } | null>(null);
  /**
   * M6: the drag preview is pure component state. Nothing here writes — the
   * drop intent is emitted once, through `onReorderDrop`, by the caller's
   * Application Command.
   */
  const [dragPreview, setDragPreview] = useState<readonly TimelineItemModel[] | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const dragPreviewRef = useRef<readonly TimelineItemModel[] | null>(null);
  const dragEnabled = onReorderDrop !== undefined;

  /*
   * UX-C: the dragged row leaves the flow and floats. The card's transform is
   * driven imperatively (one setValue per move event, no re-render), the arm
   * look is a scale spring, and every row the card crosses gets a one-slot
   * displacement that springs back to zero — the "pushed aside" motion.
   * The values and the map are render-stable identities (useMemo, not refs),
   * so rows can read them while rendering.
   */
  const dragTranslate = useMemo(() => new Animated.Value(0), []);
  const dragScale = useMemo(() => new Animated.Value(1), []);
  const [dragGeometry, setDragGeometry] = useState<{ height: number; originY: number } | null>(null);
  /*
   * Held in a memo-stable holder and mutated only from gesture handlers — the
   * same pattern as the swipe guard's flag (render only reads the values).
   */
  const rowDisplacements = useMemo(() => ({ values: new Map<string, Animated.Value>() }), []);

  /*
   * UX-C: ONE gesture on the list container owns every touch. The previous
   * per-row gesture died the moment its row unmounted — and arming a drag
   * unmounts exactly that row (it leaves the flow and becomes the floating
   * card's empty slot), so the arm destroyed its own touch stream. The
   * container survives every reorder; the touched row comes from a hit-test.
   */
  const hold = useMemo(() => createListGestureHold(), []);
  /** Resting geometry frozen at arm time, so preview swaps cannot skew it. */
  const dragOffsetsSnapshot = useRef(new Map<string, number>());
  const dragHeightsSnapshot = useRef(new Map<string, number>());
  const swipeGuard = useDaySwipeGuard();

  /**
   * Measured offsets and a queued marker-to-row intent are scoped to the content
   * they were produced for. A persistent Day View swaps the rows in place, so
   * the previous Day's measurements and intents must not be reused — keying them
   * avoids both a stale scroll and an effect that would clear fresh data.
   */
  const contentKey = resetKey ?? '';
  const offsetKey = (itemId: string) => `${contentKey}:${itemId}`;

  useEffect(() => {
    if (!scrollRequest) return;
    const offset = itemOffsets.current.get(offsetKey(scrollRequest.itemId));
    if (offset === undefined) {
      pendingScroll.current = { key: contentKey, itemId: scrollRequest.itemId };
    } else {
      pendingScroll.current = null;
      onScrollToOffset?.(offset);
    }
    // `offsetKey`/`contentKey` are derived from `resetKey`, which is listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onScrollToOffset, scrollRequest, resetKey]);

  /**
   * No explicit reset on `resetKey`: a Day swap mid-drag leaves a preview whose
   * Item IDs cannot resolve in the next Day's projection, so `resolveDropIntent`
   * returns null and the stale drag is dropped without a write; the next drag
   * start overwrites the preview outright.
   */

  /** UX-C: the double-tap bookkeeping, stable for the list's life. */
  const tapMemory = useRef<TapMemory>({ id: null, at: 0 });
  const handleSelectTap = (itemId: string) => {
    if (onOpenItemDetails && consumeDoubleTap(tapMemory.current, itemId)) {
      onOpenItemDetails(itemId);
      return;
    }
    onSelectItem?.(itemId);
  };


  const handleDragStart = (itemId: string) => {
    // A stale hit (a row that has left the list) never starts a drag.
    if (!projection.items.some(({ id }) => id === itemId)) return;
    dragOffsetsSnapshot.current = new Map(dragOffsets.current);
    dragHeightsSnapshot.current = new Map(itemHeights.current);
    setDragGeometry({
      height: itemHeights.current.get(itemId) ?? DEFAULT_ROW_HEIGHT,
      originY: dragOffsets.current.get(itemId) ?? 0,
    });
    dragTranslate.setValue(0);
    dragScale.setValue(1);
    Animated.spring(dragScale, {
      friction: 7,
      toValue: 1.03,
      useNativeDriver: true,
    }).start();
    setDraggedId(itemId);
    setDragPreview([...projection.items]);
    dragPreviewRef.current = [...projection.items];
    onDragActiveChange?.(true);
  };

  const handleDragUpdate = (itemId: string, translationY: number) => {
    dragTranslate.setValue(translationY);
    const targetId = resolveDragTarget(
      itemId,
      translationY,
      projection.items,
      dragOffsetsSnapshot.current,
      dragHeightsSnapshot.current,
    );
    if (targetId === null) return;
    const previous = dragPreviewRef.current;
    const preview = buildDragPreview(projection.items, itemId, targetId);
    if (preview === previous) return;
    dragPreviewRef.current = preview;
    /*
     * Every row the card crossed starts exactly one slot away from its new
     * home and springs into it — the card reads as pushing the others aside.
     */
    const slot = (dragHeightsSnapshot.current.get(itemId) ?? DEFAULT_ROW_HEIGHT) + ROW_GAP;
    const updates = buildDisplacementUpdates(previous ?? projection.items, preview, itemId, slot);
    for (const [rowId, offset] of Object.entries(updates)) {
      let value = rowDisplacements.values.get(rowId);
      if (value === undefined) {
        value = new Animated.Value(offset);
        rowDisplacements.values.set(rowId, value);
      } else {
        value.setValue(offset);
      }
      Animated.spring(value, {
        friction: 9,
        tension: 110,
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
    setDragPreview(preview);
  };

  const handleDragEnd = (itemId: string, cancelled: boolean) => {
    const preview = dragPreviewRef.current;
    if (preview === null) return;
    dragPreviewRef.current = null;
    setDraggedId(null);
    onDragActiveChange?.(false);
    Animated.spring(dragScale, {
      friction: 9,
      toValue: 1,
      useNativeDriver: true,
    }).start();
    if (cancelled) {
      // A cancelled drag snaps back to the real order at once.
      setDragPreview(null);
      return;
    }
    /*
     * A completed drop HOLDS the preview: the rows stay where the user left
     * them until the refetched projection agrees (or the failsafe below gives
     * up), so the list never snaps back through the old order mid-write.
     */
    const intent = resolveDropIntent(itemId, preview, projection.items);
    if (intent !== null) onReorderDrop?.(itemId, intent);
  };

  useEffect(() => {
    if (dragPreview === null || draggedId !== null) return;
    const settle = () => {
      setDragPreview(null);
      for (const value of rowDisplacements.values.values()) {
        Animated.timing(value, { duration: 120, toValue: 0, useNativeDriver: true }).start();
      }
    };
    if (sameOrder(dragPreview, projection.items)) {
      settle();
      return;
    }
    // A failed or dropped write must not hold the list in the preview forever.
    const failsafe = setTimeout(settle, 1200);
    return () => clearTimeout(failsafe);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the holder is memo-stable
  }, [dragPreview, draggedId, projection.items]);

  /*
   * UX-C (2026-10-06 device pass): the geometry maps are never pruned by
   * themselves, so after a Day switch the previous Day's row slots survive in
   * them and the hit-test can return a stale row id — the arm's membership
   * guard then rejects it and the drag silently never arms ("drags fail after
   * switching Days"). Prune everything the current Day does not contain.
   */
  useEffect(() => {
    const currentIds = new Set(projection.items.map(({ id }) => id));
    for (const id of [...dragOffsets.current.keys()]) {
      if (!currentIds.has(id)) dragOffsets.current.delete(id);
    }
    for (const id of [...itemHeights.current.keys()]) {
      if (!currentIds.has(id)) itemHeights.current.delete(id);
    }
    const prefix = `${contentKey}:`;
    for (const key of [...itemOffsets.current.keys()]) {
      if (!key.startsWith(prefix)) itemOffsets.current.delete(key);
    }
  }, [contentKey, projection.items]);

  const displayedItems = dragPreview ?? projection.items;
  const draggedItem = draggedId === null
    ? undefined
    : displayedItems.find(({ id }) => id === draggedId) ?? projection.items.find(({ id }) => id === draggedId);


  const listInteractive = dragEnabled
    || onPanScrollStart !== undefined
    || onPanScrollDelta !== undefined
    || onPanSwipe !== undefined;
  /*
   * Built fresh every render with the current closures; GestureDetector
   * updates the existing native handler in place, so an in-flight touch
   * stream survives these rebuilds. Rebuilding per render is what keeps the
   * callbacks in sync without a mutable holder the compiler lint would
   * reject.
   */
  const listGesture = listInteractive
    ? // The handlers close over refs, but they run only from touch events —
      // the same event-context pattern the swipe guard's mutations use. The
      // compiler lint cannot see that across the builder boundary.
      // eslint-disable-next-line react-hooks/refs
      buildListGesture(hold, {
      onDragEnd: handleDragEnd,
      onDragStart: handleDragStart,
      onDragUpdate: handleDragUpdate,
      onPanScrollDelta,
      onPanScrollEnd,
      onPanScrollStart,
      onPanSwipe,
      onGestureTouchChange,
    // RNGH assigns this handler ref when attaching the gesture.
    // eslint-disable-next-line react-hooks/refs
    }, gestureRef ?? localGestureRef)
    : null;
  const listContent = displayedItems.length === 0 ? null : (
    <View style={styles.list}>
      {displayedItems.map((item, index) => (
        item.id === draggedId ? (
          /* The card's vacated slot keeps the list height honest. */
          <View
            key={item.id}
            style={[styles.dragSlot, { height: dragGeometry?.height }]}
            testID={`timeline-drag-slot-${item.id}`}
          />
        ) : (
          <TimelineRow
            item={item}
            isSelected={item.id === selectedItemId}
            isReordering={isReordering}
            key={item.id}
            displacement={rowDisplacements.values.get(item.id)}
            onLayout={(event) => {
              const yInList = event.nativeEvent.layout.y;
              // The container gesture reads geometry and the swipe guard
              // through the hold — never through React refs.
              if (hold.layoutOffsets !== dragOffsets.current || hold.swipeGuard !== swipeGuard) {
                hold.layoutOffsets = dragOffsets.current;
                hold.layoutHeights = itemHeights.current;
                hold.swipeGuard = swipeGuard ?? null;
              }
              dragOffsets.current.set(item.id, yInList);
              itemOffsets.current.set(offsetKey(item.id), LIST_PADDING + yInList);
              itemHeights.current.set(item.id, event.nativeEvent.layout.height);
              if (
                pendingScroll.current?.itemId === item.id
                && pendingScroll.current.key === contentKey
              ) {
                pendingScroll.current = null;
                onScrollToOffset?.(LIST_PADDING + yInList);
              }
            }}
            onMoveDown={
              onMoveItem && index < displayedItems.length - 1
                ? () => onMoveItem(item.id, 'down')
                : undefined
            }
            onOpenItemActions={
              onOpenItemActions ? () => onOpenItemActions(item.id) : undefined
            }
            onMoveUp={
              onMoveItem && index > 0
                ? () => onMoveItem(item.id, 'up')
                : undefined
            }
            onRequestMove={
              onRequestMoveItem ? () => onRequestMoveItem(item.id) : undefined
            }
            onSelect={
              onSelectItem || onOpenItemDetails ? () => handleSelectTap(item.id) : undefined
            }
          />
        )
      ))}
      {/*
       * UX-C: the floating card. It is finger-anchored (its vacated slot is
       * the spacer above), never intercepts a touch, and carries the
       * selected look the long-press arm springs in.
       */}
      {draggedId !== null && draggedItem !== undefined && dragGeometry !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragCard,
            {
              height: dragGeometry.height,
              top: dragGeometry.originY,
              transform: [
                { translateY: dragTranslate },
                { scale: dragScale },
              ],
            },
          ]}
          testID={`timeline-drag-overlay-${draggedId}`}
        >
          <RowContent item={draggedItem} />
        </Animated.View>
      ) : null}
    </View>
  );

  /*
   * The gesture lives on the list container — see `buildListGesture`. Without
   * any gesture consumer (tests, minimal hosts) the list renders bare.
   */
  return (
    <View
      onLayout={onLayout}
      style={styles.container}
      testID="day-timeline"
    >
      {listContent === null ? (
        <EmptyHint
          hint={emptyState?.hint}
          testID="day-timeline-empty"
          title={emptyState?.title ?? '暂无行程'}
        />
      ) : listGesture !== null ? (
        <GestureDetector gesture={listGesture}>{listContent}</GestureDetector>
      ) : (
        listContent
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Always-visible, never squeezed: 44 × 44 pt minimum touch target. */
  actionsButton: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  actionsLabel: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  body: {
    flex: 1,
    flexShrink: 1,
    gap: 4,
  },
  container: {
    padding: LIST_PADDING,
  },
  /** The coordinate space rows and the floating card share. */
  list: { gap: ROW_GAP },
  dragCard: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 8,
    position: 'absolute',
    right: 0,
    shadowColor: colors.backdropLayer,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    zIndex: 10,
  },
  dragSlot: { borderRadius: 12 },
  empty: {
    color: colors.textSubtle,
    paddingVertical: 20,
    textAlign: 'center',
  },
  control: {
    color: colors.primary,
    fontSize: 22,
    paddingHorizontal: 8,
  },
  disabledControl: {
    color: colors.textDisabled,
    fontSize: 22,
    paddingHorizontal: 8,
  },
  itemLine: {
    alignItems: 'center',
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  moveControl: {
    color: colors.primary,
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  metaText: {
    color: colors.textSubtle,
    flexShrink: 1,
    fontSize: 12,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  reorderControls: {
    alignItems: 'center',
    gap: 4,
  },
  selectableRow: {
    flex: 1,
  },
  selectedRow: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
  },
  time: {
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    minWidth: 72,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
