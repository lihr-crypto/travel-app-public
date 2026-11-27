import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import type { LayoutChangeEvent } from 'react-native';

import { colors } from '@/theme/tokens';

import type { ConfirmMapPickerPlaceCommand } from '@/application/place/confirm-map-picker-place';
import { getMapPlaceCoordinate } from '@/application/projections/map-place';
import type {
  ConfirmedPlaceItem,
  ConfirmPlaceSearchResultCommand,
} from '@/application/place/confirm-place-search-result';

import type {
  ChangeItemPlaceCommand,
  ChangedItemPlace,
} from '@/application/item/change-item-place';
import type { CommandResult } from '@/application/command-result';
import type { ItemDraft } from '@/application/item/item-draft';
import type { DeletedItemSnapshot } from '@/application/item/deleted-item-snapshot';
import type { DeleteItemCommand } from '@/application/item/delete-item';
import {
  describeDeleteFailure,
  describeUndoFailure,
} from '@/application/item/delete-feedback';
import type { ReorderItemCommand } from '@/application/item/reorder-item';
import type { ItemPosition } from '@/application/item/position';
import type { RestoreDeletedItemCommand } from '@/application/item/restore-deleted-item';
import type { UpdateItemDetailsCommand } from '@/application/item/update-item-details';
import type { MoveItemToDayCommand } from '@/application/item/move-item-to-day';
import type { MoveItemToUnscheduledCommand } from '@/application/item/move-item-to-unscheduled';
import { buildDayMapProjection } from '@/application/projections/day-map';
import type { HotelContext } from '@/application/projections/hotel-context';
import { buildTimelineProjection } from '@/application/projections/timeline';
import type { DayViewData } from '@/application/queries/day-view';
import type { Coordinate, EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import { openPlaceInExternalMap } from '@/infrastructure/map/external-map-handoff';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';
import { useMapViewportPadding } from '@/infrastructure/map/map-viewport-insets';
import { useDayFocusEffects, type TimelineScrollRequest } from '@/state/day-focus-effects';
import { useSelectDay } from '@/state/day-selection';
import { useTripFocus } from '@/state/trip-focus';
import {
  DAY_SWIPE_DOMINANCE,
  DAY_SWIPE_THRESHOLD,
  DayHeader,
  DayJumpSheet,
  resolveDaySwipeIntent,
} from './day-header';
import {
  DaySwipeGuardProvider,
  useDaySwipeGuardState,
  useSwipeExclusion,
} from './day-swipe-guard';
import { DayTimeline } from './day-timeline';
import { glog } from './gesture-debug';
import { HotelContextCard } from './hotel-context-card';
import { ItemActionSheet } from './item-action-sheet';
import { ItemEditorModal } from './item-editor-modal';
import { EditorPlacePicker, selectedPlaceSummary } from './editor-place-picker';
import type { PlaceSelectionTarget } from '@/application/place/place-selection';
import { pendingPlaceName } from '@/application/place/place-selection';
import { ItemMoveSheet } from './item-move-sheet';
import { PlaceSearch } from './place-search';
import { TripBackButton } from './trip-back-button';
import { UndoSnackbar } from './undo-snackbar';
import { TripBottomSheet } from './trip-bottom-sheet';
import { useDaySheetPan } from './use-day-sheet-pan';

export interface DayViewWorkspaceProps {
  data: DayViewData;
  mapRenderer: MapRenderer;
  /** Optional seams for callers that already own selection/effect orchestration. */
  selectedItemId?: EntityId | null;
  onMarkerPress?: (itemId: EntityId) => void;
  onSelectItem?: (itemId: EntityId) => void;
  scrollRequest?: TimelineScrollRequest | null;
  days?: readonly DayViewData['day'][];
  onHome?: () => void;
  /**
   * Day-entry intent shared by the header arrows, the swipe and the Day Jump.
   * The production shell supplies the transition controller so every Day entry
   * prepares its destination before the surface swaps.
   */
  onSelectDay?: (dayId: EntityId) => void;
  /** Shared presentation transition owner; see `TripBackButton`. */
  onBack?: () => void;
  placeEntry?: DayPlaceEntryConfig;
  /**
   * Item editing seam. `onItemSaved` is where the caller invalidates the Day and
   * Overview read models; the workspace itself owns no cache.
   */
  updateItemDetailsCommand?: UpdateItemDetailsCommand;
  onItemSaved?: (item: Item) => void;
  /** Moves an Item into another Day from the row menu's 更改日期. */
  moveItemToDay?: MoveItemToDayCommand;
  /**
   * Takes an Item out of this Day into Unscheduled, from the same 更改日期
   * sheet. Absent means the sheet offers no such action, so an Item can never
   * be orphaned by a build that has nowhere to put it.
   */
  moveItemToUnscheduled?: MoveItemToUnscheduledCommand;
  /**
   * Invalidates the reads an Item move changes. A move to another Day touches
   * two Days plus the Overview; a move out of the Day also touches Unscheduled.
   */
  onItemMoved?: () => void;
  /**
   * Deletes an Item from the row menu. Present together with
   * `restoreDeletedItemCommand` and the Undo Snackbar, so a user-facing delete
   * always ships with its restore path (the locked Stage-03 §6.11 rule).
   */
  deleteItemCommand?: DeleteItemCommand;
  /** Restores the snapshot a delete returned, from the Snackbar's 撤销. */
  restoreDeletedItemCommand?: RestoreDeletedItemCommand;
  /**
   * Invalidates the reads a delete or restore changes — the same structural
   * set as a move: Day views, Unscheduled and the Trip Overview (Stage-06 C-08).
   */
  onItemDeleted?: () => void;
  /**
   * Stage-02 §11.3 cross-day Hotel card for this Day, resolved by the caller
   * from the Overview read model. Absent/null renders no card.
   */
  hotelContext?: HotelContext | null;
  /**
   * M6: drops a drag onto the reorder command. Absent means the Timeline
   * renders no drag behaviour at all (no seam, no gesture).
   */
  reorderItemCommand?: ReorderItemCommand;
  /** Invalidates the reads an Item reorder changes (same structural set). */
  onItemReordered?: () => void;
}

export interface DayPlaceEntryConfig {
  resolveSession: (
    trip: DayViewData['trip'],
  ) => Promise<PlaceProviderSession>;
  confirmSearch: ConfirmPlaceSearchResultCommand;
  confirmMapPicker: ConfirmMapPickerPlaceCommand;
  onConfirmed: (value: ConfirmedPlaceItem) => void;
  initialCoordinate?: Coordinate;
  /**
   * Repoints an existing Item at a new Place snapshot, or at none. Absent means
   * the editor exposes no Place action at all, matching the "no seam, no action"
   * rule the external-map handoff already follows.
   */
  changeItemPlace?: ChangeItemPlaceCommand;
}

/**
 * Why the Place flow is open: a new Item, or an existing Item's Place.
 *
 * An existing Item's Place is reached from two places that want two different
 * things, so the intent says which:
 *
 * - `immediate` — the Day row menu. There is no draft to join, so picking
 *   commits the Place and the user lands back on the Day.
 * - `pending` — the editor's 地点 row. The pick joins the editor's draft and is
 *   written by 保存, so abandoning the editor changes nothing.
 */
type PlaceEntryIntent =
  | Readonly<{ kind: 'create' }>
  | Readonly<{
    kind: 'change-place';
    itemId: EntityId;
    commit: 'immediate' | 'pending';
  }>;

type PlaceEntryState =
  | Readonly<{ status: 'closed' }>
  | Readonly<{ status: 'loading'; intent: PlaceEntryIntent }>
  | Readonly<{
      status: 'ready';
      intent: PlaceEntryIntent;
      session: PlaceProviderSession;
    }>
  | Readonly<{ status: 'error'; intent: PlaceEntryIntent; message: string }>;

/**
 * The whole Item editing session, owned here rather than by the editor itself.
 *
 * The Location Search flow replaces the entire Day surface, so the editor is
 * unmounted while the user is picking. Keeping the session — including the
 * location the user has chosen but not saved — one level up is what makes
 * "Item Detail → Location Search → Item Detail" resume the same edit instead of
 * silently discarding it.
 */
interface EditorSession {
  itemId: EntityId;
  /**
   * The last draft the editor reported. The editor is unmounted while Location
   * Search is open, so this is the only copy of the user's unsaved edits.
   */
  draft: ItemDraft | null;
  pendingPlace?: PlaceSelectionTarget;
}

/**
 * `changeItemPlace` only reports a null Place for the `none` target, which this
 * flow never sends through the adapter. The Place pickers are typed against the
 * create commands, so the adapter makes that guarantee explicit instead of
 * casting.
 */
function requirePlaceSnapshot(
  result: CommandResult<ChangedItemPlace>,
): CommandResult<ConfirmedPlaceItem> {
  const place = result.data.place;
  if (place === null) {
    throw new RangeError('更换地点必须产生一个 Place 快照');
  }
  return { ...result, data: { item: result.data.item, place } };
}

function fallbackPickerCoordinate(
  data: DayViewData,
  expectedSystem?: Coordinate['system'],
): Coordinate {
  const saved = Object.values(data.mapPlacesById ?? data.placesById)
    .map(getMapPlaceCoordinate)
    .find((coordinate) => expectedSystem === undefined || coordinate.system === expectedSystem);
  if (saved) return saved;
  if (expectedSystem === 'wgs84') {
    return { latitude: 0, longitude: 0, system: 'wgs84' };
  }
  if (expectedSystem === 'gcj02') {
    return { latitude: 39.9042, longitude: 116.4074, system: 'gcj02' };
  }
  if (data.mapPlacesById !== undefined) {
    return { latitude: 0, longitude: 0, system: 'wgs84' };
  }
  return data.trip.mapRegion === 'china_mainland'
    ? { latitude: 39.9042, longitude: 116.4074, system: 'gcj02' }
    : { latitude: 0, longitude: 0, system: 'wgs84' };
}

/** MapPlace display projections never cross the Trip's fixed provider CRS. */
function sourceCoordinateDayData(data: DayViewData): DayViewData {
  if (data.mapPlacesById === undefined) return data;
  const mapPlacesById = Object.fromEntries(
    Object.entries(data.mapPlacesById).map(([sourcePlaceId, place]) => [
      sourcePlaceId,
      Object.fromEntries(
        Object.entries(place).filter(([key]) => key !== 'displayCoordinate'),
      ) as DayViewData['placesById'][EntityId],
    ]),
  ) as NonNullable<DayViewData['mapPlacesById']>;
  return { ...data, mapPlacesById };
}

/** Current-Day Place map over the complete, ordered Timeline projection. */
export function DayViewWorkspace({
  data,
  mapRenderer: MapRendererComponent,
  selectedItemId,
  onMarkerPress,
  onSelectItem,
  scrollRequest,
  days = [data.day],
  onHome,
  onSelectDay,
  onBack,
  placeEntry,
  updateItemDetailsCommand,
  onItemSaved,
  moveItemToDay,
  moveItemToUnscheduled,
  onItemMoved,
  deleteItemCommand,
  restoreDeletedItemCommand,
  onItemDeleted,
  hotelContext,
  reorderItemCommand,
  onItemReordered,
}: DayViewWorkspaceProps) {
  const stack = resolveTripMapStack(data.trip);
  const mapData = sourceCoordinateDayData(data);
  const [hasUserMapInteraction, setHasUserMapInteraction] = useState(false);
  const [userMapInteractionDayId, setUserMapInteractionDayId] = useState(data.day.id);
  const hasUserMapInteractionForCurrentDay =
    userMapInteractionDayId === data.day.id && hasUserMapInteraction;
  if (userMapInteractionDayId !== data.day.id) {
    setUserMapInteractionDayId(data.day.id);
    setHasUserMapInteraction(false);
  }

  const effects = useDayFocusEffects(mapData, selectedItemId, hasUserMapInteractionForCurrentDay);
  const effectiveSelectedItemId = selectedItemId === undefined
    ? effects.selectedItemId
    : selectedItemId;
  const effectiveCameraRequest = effects.cameraRequest;
  const effectiveScrollRequest = scrollRequest === undefined
    ? effects.scrollRequest
    : scrollRequest;
  const effectiveMarkerPress = onMarkerPress ?? effects.selectFromMap;
  const effectiveSelectItem = onSelectItem ?? effects.selectFromTimeline;
  const map = buildDayMapProjection(mapData, effectiveSelectedItemId);
  const timeline = buildTimelineProjection(data);
  const mapSystem = stack.coordinateSystem;
  const sheetSnap = useTripFocus((state) => state.sheetSnap);
  const setSheetSnap = useTripFocus((state) => state.setSheetSnap);
  const cameraPadding = useMapViewportPadding(sheetSnap);
  const selectDayFromStore = useSelectDay();
  const selectDay = onSelectDay ?? selectDayFromStore;
  /**
   * UX-C: true while a row drag is live. The sheet scroll view is disabled
   * for the drag only — a plain prop update, never the ScrollView↔View swap
   * whose remount killed the M6 drag on device.
   */
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [isDayJumpVisible, setIsDayJumpVisible] = useState(false);
  const [itemActionsItemId, setItemActionsItemId] = useState<EntityId | null>(null);
  useEffect(() => {
    glog(`d-sheet visible=${itemActionsItemId !== null}`);
  }, [itemActionsItemId]);
  const [dayMoveItemId, setDayMoveItemId] = useState<EntityId | null>(null);
  const [isDayMoving, setIsDayMoving] = useState(false);
  const [dayMoveError, setDayMoveError] = useState<string | null>(null);
  const [editorSession, setEditorSession] = useState<EditorSession | null>(null);
  const [editorPlacePickerVisible, setEditorPlacePickerVisible] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<DeletedItemSnapshot | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lastViewportCenter, setLastViewportCenter] = useState<Coordinate | null>(null);
  const [placeEntryState, setPlaceEntryState] = useState<PlaceEntryState>({ status: 'closed' });
  const placeEntryRequestId = useRef(0);
  const {
    sheetRef, scrollRef: sheetScrollRef, position: sheetPosition, contentGesture,
    timelineGestureRef, onPanStart, onPanDelta, onPanEnd, onTimelineTouchChange,
    onScroll: onSheetScroll, onContainerLayout, onScrollLayout, onContentSizeChange,
  } = useDaySheetPan(sheetSnap, data.day.id);
  const sheetContentTop = useRef(0);
  const timelineTop = useRef(0);
  const scrollTimelineToOffset = useCallback((offset: number) => {
    sheetScrollRef.current?.scrollTo({
      y: sheetContentTop.current + timelineTop.current + offset,
      animated: true,
    });
  }, [sheetScrollRef]);

  /**
   * The Day surface stays mounted across a Day change, so nothing unmounts the
   * Day-local transient state for us. Everything that belonged to the previous
   * Day is dropped in the same render that receives the new one.
   */
  const [activeDayId, setActiveDayId] = useState(data.day.id);
  if (activeDayId !== data.day.id) {
    setActiveDayId(data.day.id);
    setItemActionsItemId(null);
    setDayMoveItemId(null);
    setDayMoveError(null);
    setEditorSession(null);
    setEditorPlacePickerVisible(false);
    setIsDayJumpVisible(false);
    setLastViewportCenter(null);
    setPlaceEntryState({ status: 'closed' });
    setUndoSnapshot(null);
    setDeleteError(null);
  }

  // Invalidate any in-flight Place provider initialization from the old Day.
  // Ref-only, so it does not need to be part of the render-time reset above.
  useEffect(() => {
    placeEntryRequestId.current += 1;
  }, [data.day.id]);

  const orderedDays = [...days].sort((left, right) => left.dayIndex - right.dayIndex || left.id.localeCompare(right.id));
  const currentIndex = orderedDays.findIndex(({ id }) => id === data.day.id);
  const previousDay = currentIndex > 0 ? orderedDays[currentIndex - 1] : undefined;
  const nextDay = currentIndex >= 0 ? orderedDays[currentIndex + 1] : undefined;

  /**
   * The Day swipe: the only horizontal gesture in the sheet, and the only one
   * that may take a touch away from a control.
   *
   * Two rules keep it off the taps and the scrolling:
   *
   * 1. It never claims a movement that started on a control (see
   *    `day-swipe-guard`), so the row menu and the arrows keep their presses.
   * 2. It claims only movements that already qualify as a swipe by distance and
   *    by dominance over the vertical one, so a drifting tap is never cancelled
   *    and a vertical scroll is never intercepted.
   *
   * The map is outside this subtree entirely, so its pan and pinch are theirs.
   */
  const swipeGuard = useDaySwipeGuardState();
  /** 添加行程 renders above the provider, so it passes the guard explicitly. */
  const addPlaceExclusion = useSwipeExclusion(swipeGuard);
  /**
   * Handle for the Day swipe pan, registered with the Bottom Sheet's content pan
   * via `simultaneousHandlers` so the two run at once. Without it the sheet's own
   * content pan is the only handler that sees the touch and the swipe never fires.
   */
  const swipeGestureRef = useRef<GestureType | undefined>(undefined);
  /**
   * The Day swipe is an RNGH native gesture, the same gesture system the Bottom
   * Sheet itself uses. `activeOffsetX` arms it only after a clear horizontal move
   * (|dx| > threshold), and `failOffsetY` fails it the moment the touch turns
   * vertical (|dy| > threshold / dominance). So vertical scrolling and the sheet's
   * vertical drag keep their native owner and are never intercepted, and a plain
   * tap — where neither axis reaches its offset — never activates the swipe, so
   * the title, the arrows and the ⋯ keep their presses.
   *
   * It is attached to the sheet's **fixed header**, not to the scrollable body.
   * That placement is the whole fix: `BottomSheetScrollView` is wrapped in an RNGH
   * `Gesture.Native()` handler, and RNGH only grants simultaneous recognition to
   * handlers whose relation is declared in its own registry (see
   * `RNGestureHandler.shouldRecognizeSimultaneouslyWithGestureRecognizer`). The
   * scroll view's native gesture is a plain `UIScrollView` pan that declares no
   * relation with a nested pan, so a swipe nested inside the scrollable lost the
   * activation race on device — and the same uncoordinated pair is what made the
   * title's own press unreliable. As a sibling of the scrollable the swipe only
   * competes with the sheet's content pan, which `simultaneousHandlers` does
   * coordinate.
   */
  const daySwipeGesture = useMemo(() => {
    const guard = swipeGuard;
    return Gesture.Pan()
      // `withRef` is RNGH's documented way to expose this gesture to the Bottom
      // Sheet's `simultaneousHandlers`; it must be attached at build time.
      // eslint-disable-next-line react-hooks/refs
      .withRef(swipeGestureRef)
      .activeOffsetX([-DAY_SWIPE_THRESHOLD, DAY_SWIPE_THRESHOLD])
      .failOffsetY([
        -Math.round(DAY_SWIPE_THRESHOLD / DAY_SWIPE_DOMINANCE),
        Math.round(DAY_SWIPE_THRESHOLD / DAY_SWIPE_DOMINANCE),
      ])
      .onEnd((event) => {
        // A touch that started on a control (title, arrows, ⋯, 添加行程) is not a
        // Day swipe. The flag was raised on touch-down; read it before
        // `onFinalize` clears it so drags from a control are dropped.
        if (guard.startedOnControl.current) return;
        const intent = resolveDaySwipeIntent(event.translationX, {
          canBack: onBack !== undefined,
          nextDay,
          previousDay,
        });
        if (intent === null) return;
        if (intent.kind === 'day') selectDay(intent.day.id);
      })
      .onFinalize(() => {
        // Cleared here rather than in `onEnd`: `onEnd` only runs for a gesture
        // that actually activated, so a failed swipe would otherwise leave the
        // flag set and silently swallow the next one.
        // eslint-disable-next-line react-hooks/immutability
        guard.startedOnControl.current = false;
      });
  }, [nextDay, onBack, previousDay, selectDay, swipeGuard, swipeGestureRef]);

  /**
   * `useDayFocusEffects` is the single source of the Day camera request: it
   * reports `null` while it has not yet produced one for the Day on screen, so
   * the previous Day's coordinates are never sent under the new Day's scope.
   */
  const cameraRequest = effectiveCameraRequest;
  const paddedCameraRequest = cameraRequest
    ? { ...cameraRequest, padding: cameraPadding, scopeKey: data.day.id }
    : null;
  const handleMapViewportChange = ({ center }: { center: Coordinate }) => {
    setLastViewportCenter(center);
  };
  const editorItem = editorSession === null
    ? undefined
    : data.items.find(({ id }) => id === editorSession.itemId);
  const actionsItem = itemActionsItemId === null
    ? undefined
    : data.items.find(({ id }) => id === itemActionsItemId);
  /** UX-C: the ⋯ sheet's 在地图中查看 handoff, only for Items with a Place. */
  const actionsPlace = actionsItem !== undefined && actionsItem.placeId !== null
    ? data.placesById[actionsItem.placeId] ?? undefined
    : undefined;
  /**
   * An Item on its way to another Day. It leaves the Day's list on the next
   * read, which is also what hides the sheet — no navigation needed.
   */
  const dayMoveItem = dayMoveItemId === null
    ? undefined
    : data.items.find(({ id }) => id === dayMoveItemId);

  /** An Item that left the Day while its editor was open ends the session. */
  if (editorSession !== null && editorItem === undefined) {
    setEditorSession(null);
  }


  const openEditor = (itemId: EntityId) => {
    setEditorPlacePickerVisible(false);
    setEditorSession({ itemId, draft: null });
  };

  /**
   * Changing an Item's Day belongs to the Day surface, not to the editor, so
   * the user stays on the Day they were reading. A failure keeps the sheet open
   * with the reason instead of dropping the user back with nothing changed.
   */
  const runDayMove = async (
    move: (itemId: EntityId) => Promise<unknown>,
  ) => {
    const itemId = dayMoveItemId;
    if (itemId === null) return;
    setDayMoveError(null);
    setIsDayMoving(true);
    try {
      await move(itemId);
      setDayMoveItemId(null);
      if (editorSession?.itemId === itemId) setEditorSession(null);
      onItemMoved?.();
    } catch (cause: unknown) {
      setDayMoveError(cause instanceof Error ? cause.message : '移动行程失败，请重试。');
    } finally {
      setIsDayMoving(false);
    }
  };

  const handleMoveToDay = (targetDayId: EntityId) => {
    if (!moveItemToDay) return Promise.resolve();
    return runDayMove((itemId) => moveItemToDay({ itemId, targetDayId }));
  };

  const handleMoveToUnscheduled = () => {
    if (!moveItemToUnscheduled) return Promise.resolve();
    return runDayMove((itemId) => moveItemToUnscheduled({ itemId }));
  };

  /**
   * Stage-03 §6.11: the delete lands immediately and the Undo Snackbar is its
   * only restore path. A failure leaves nothing to undo, so it shows in the
   * Snackbar's error slot instead of inventing a snapshot.
   */
  const handleDeleteItem = () => {
    if (!deleteItemCommand || !actionsItem) return;
    setDeleteError(null);
    deleteItemCommand({ itemId: actionsItem.id }).then(
      (result) => {
        setUndoSnapshot(result.data);
        onItemDeleted?.();
      },
      (cause: unknown) => {
        setDeleteError(describeDeleteFailure(cause));
      },
    );
  };

  /**
   * Restores the held snapshot. A retryable failure keeps the snapshot so 撤销
   * can be tried again; a hopeless one (the snapshot's Day is gone, the Item is
   * already back) drops it — the error then expires like any other snackbar.
   */
  const handleUndoDelete = () => {
    const snapshot = undoSnapshot;
    if (!restoreDeletedItemCommand || !snapshot) return;
    restoreDeletedItemCommand({ snapshot }).then(
      () => {
        setUndoSnapshot(null);
        setDeleteError(null);
        onItemDeleted?.();
      },
      (cause: unknown) => {
        const feedback = describeUndoFailure(cause);
        if (!feedback.retryable) setUndoSnapshot(null);
        setDeleteError(feedback.message);
      },
    );
  };

  const expireUndo = useCallback(() => {
    setUndoSnapshot(null);
    setDeleteError(null);
  }, []);

  /** M6: the only SQLite write happens on drop, inside the command. */
  const handleReorderDrop = (itemId: string, position: ItemPosition) => {
    if (!reorderItemCommand) return;
    reorderItemCommand({ itemId, position }).then(
      () => onItemReordered?.(),
      () => undefined,
    );
  };

  const openPlaceEntry = (intent: PlaceEntryIntent = { kind: 'create' }) => {
    if (!placeEntry || placeEntryState.status === 'loading') return;
    const requestId = ++placeEntryRequestId.current;
    setPlaceEntryState({ status: 'loading', intent });
    void placeEntry.resolveSession(data.trip).then(
      (session) => {
        if (requestId === placeEntryRequestId.current) {
          setPlaceEntryState({ status: 'ready', intent, session });
        }
      },
      (cause: unknown) => {
        if (requestId === placeEntryRequestId.current) {
          setPlaceEntryState({
            status: 'error',
            intent,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      },
    );
  };

  const closePlaceEntry = () => {
    placeEntryRequestId.current += 1;
    setPlaceEntryState({ status: 'closed' });
  };

  const commitEditorDraft = async (draft: ItemDraft): Promise<Item> => {
    const session = editorSession;
    const current = session === null
      ? undefined
      : data.items.find(({ id }) => id === session.itemId);
    if (session === null || current === undefined) {
      throw new RangeError('正在编辑的行程已不存在');
    }
    if (!updateItemDetailsCommand) {
      throw new RangeError('当前构建无法保存行程');
    }

    /*
     * The name is optional, and the Overview title falls back to the location
     * name when it is empty. `title` is NOT NULL and must never be blank, so the
     * fallback is resolved here before the write. A pending editor Place choice
     * joins this same exclusive save; the row menu keeps its immediate action.
     */
    const currentPlaceName = current.placeId === null
      ? null
      : data.placesById[current.placeId]?.name ?? null;
    const saved = await updateItemDetailsCommand({
      itemId: current.id,
      ...draft,
      title: draft.title.trim() || pendingPlaceName(session.pendingPlace ?? null) || currentPlaceName || current.title,
      ...(session.pendingPlace ? { placeTarget: session.pendingPlace } : {}),
    });
    onItemSaved?.(saved.data);
    return saved.data;
  };

  /**
   * The Location Picker, as an overlay.
   *
   * It used to replace the whole Day surface. That made the picker the thing
   * that decided what came next: opening it from the editor unmounted the
   * editor underneath, so the Day page flashed back for a frame before the
   * editor returned. Presented on top of whatever is already open it has no
   * opinion about navigation — it picks a location, reports it and closes, and
   * the surface that opened it is simply still there.
   */
  const placeEntryOverlay = (() => {
    if (!placeEntry || placeEntryState.status === 'closed') return null;

    if (placeEntryState.status === 'loading') {
      return (
        <View style={styles.entryStatus} testID="day-place-entry-loading">
          <Text>地点服务初始化中…</Text>
          <Pressable onPress={closePlaceEntry} testID="day-place-entry-cancel">
            <Text style={styles.action}>取消</Text>
          </Pressable>
        </View>
      );
    }
    if (placeEntryState.status === 'error') {
      return (
        <View style={styles.entryStatus} testID="day-place-entry-error">
          <Text style={styles.error}>{placeEntryState.message}</Text>
          <Pressable
            onPress={() => openPlaceEntry(placeEntryState.intent)}
            testID="day-place-entry-retry"
          >
            <Text style={styles.action}>重试</Text>
          </Pressable>
          <Pressable onPress={closePlaceEntry} testID="day-place-entry-cancel">
            <Text style={styles.action}>取消</Text>
          </Pressable>
        </View>
      );
    }

    const intent = placeEntryState.intent;
    const changePlaceCommand = placeEntry.changeItemPlace;
    const targetItemId = intent.kind === 'change-place' ? intent.itemId : null;
    const targetItem = targetItemId === null
      ? undefined
      : data.items.find(({ id }) => id === targetItemId);
    /** From the row menu the pick *is* the action; from the editor it is a draft. */
    const commitsImmediately = intent.kind === 'change-place'
      && intent.commit === 'immediate';

    /*
     * A change starts from where the Item already is, so the picker opens on its
     * current Place rather than wherever the map happened to be left.
     */
    const targetPlaceCoordinate = targetItem?.placeId
      ? (() => {
        const place = (mapData.mapPlacesById ?? mapData.placesById)[targetItem.placeId!];
        return place ? getMapPlaceCoordinate(place) : undefined;
      })()
      : undefined;
    const pickerSystem = placeEntryState.session.coordinateSystem;
    const initialCoordinate = (
      targetPlaceCoordinate?.system === pickerSystem ? targetPlaceCoordinate : undefined
    ) ?? (
      lastViewportCenter?.system === pickerSystem ? lastViewportCenter : null
    ) ?? (
      placeEntry.initialCoordinate?.system === pickerSystem ? placeEntry.initialCoordinate : undefined
    ) ?? fallbackPickerCoordinate(mapData, pickerSystem);

    const handleConfirmed = (value: ConfirmedPlaceItem) => {
      if (commitsImmediately) {
        /*
         * The command already wrote the Place. This only refreshes the reads and
         * reselects the Item, so the marker lands on the new snapshot.
         */
        placeEntry.onConfirmed(value);
      } else {
        placeEntry.onConfirmed(value);
        effects.selectFromTimeline(value.item.id);
      }
      closePlaceEntry();
    };

    const isChangePlace = targetItemId !== null && changePlaceCommand !== undefined;

    const confirmation = isChangePlace
      ? {
          command: (input: Parameters<ConfirmPlaceSearchResultCommand>[0]) =>
            changePlaceCommand({
              itemId: targetItemId,
              target: { kind: 'search', result: input.result },
            }).then(requirePlaceSnapshot),
          dayId: data.day.id,
          onConfirmed: handleConfirmed,
          pickOnly: true,
          tripId: data.trip.id,
        }
      : {
          command: placeEntry.confirmSearch,
          dayId: data.day.id,
          onConfirmed: handleConfirmed,
          tripId: data.trip.id,
        };
    const pickerConfirmation = isChangePlace
      ? {
          command: (input: Parameters<ConfirmMapPickerPlaceCommand>[0]) =>
            changePlaceCommand({
              itemId: targetItemId,
              target: {
              kind: 'map-picker',
              coordinate: input.coordinate,
              provider: input.provider,
              enrichment: input.enrichment,
              },
            }).then(requirePlaceSnapshot),
          dayId: data.day.id,
          onConfirmed: handleConfirmed,
          pickOnly: true,
          tripId: data.trip.id,
        }
      : {
          command: placeEntry.confirmMapPicker,
          dayId: data.day.id,
          onConfirmed: handleConfirmed,
          tripId: data.trip.id,
        };

    const searchContent = (
      <View style={styles.container} testID="day-place-entry">
        <PlaceSearch
          confirmation={confirmation}
          initialQuery={{ center: initialCoordinate }}
          initialDate={data.day.date}
          targetDayIndex={data.day.dayIndex}
          mapPicker={{
            confirmation: pickerConfirmation,
            initialCoordinate,
            mapRenderer: MapRendererComponent,
            onCoordinateChange: setLastViewportCenter,
            onUseCoordinate: () => undefined,
          }}
          onCancel={closePlaceEntry}
          onOpenInExternalMap={(result) => openPlaceInExternalMap({
            place: result,
            trip: data.trip,
          })}
          onOpenMapPicker={() => undefined}
          session={placeEntryState.session}
          title={isChangePlace ? '更换地点' : '添加行程'}
        />
      </View>
    );
    return searchContent;
  })();

  return (
    <View onLayout={onContainerLayout} style={styles.container} testID="day-view-workspace">
      <TripBackButton onBack={onBack} onHome={onHome} testID="day-view-back" />
      <View style={styles.map} testID="day-view-map">
        <MapRendererComponent
          cameraRequest={paddedCameraRequest}
          markers={map.markers}
          onMarkerPress={effectiveMarkerPress}
          onMapInteraction={() => setHasUserMapInteraction(true)}
          onViewportChange={handleMapViewportChange}
          system={mapSystem}
        />
      </View>
      <TripBottomSheet
        ref={sheetRef}
        animatedPosition={sheetPosition}
        contentGesture={contentGesture}
        header={(
          <DaySwipeGuardProvider guard={swipeGuard}>
            <DayHeader
              day={data.day}
              nextDay={nextDay}
              onOpenJump={() => setIsDayJumpVisible(true)}
              onSelectDay={selectDay}
              previousDay={previousDay}
            />
          </DaySwipeGuardProvider>
        )}
        headerGesture={daySwipeGesture}
        /*
         * The shared touch-stream gesture resizes and scrolls continuously.
         * Keep gorhom's competing content pan off so the row's hold can still
         * arm reorder; the handle retains its native pan.
         */
        cancelContentTouches={false}
        contentPanningGesture={false}
        onContentSizeChange={onContentSizeChange}
        onScrollLayout={onScrollLayout}
        onScroll={onSheetScroll}
        unmanagedScroll
        onSnapChange={setSheetSnap}
        /*
         * scrollEnabled must stay TRUE for the synthetic scroll to work at
         * all: with it false, iOS ignores programmatic scrollTo entirely
         * (the device log showed every delta arriving with contentOffset
         * stuck at 0). It flips off only for the duration of a drag, so the
         * native scroll pan cannot scroll underneath the floating card.
         */
        scrollEnabled={!isDraggingItem}
        scrollable
        scrollViewRef={sheetScrollRef}
        simultaneousHandlers={swipeGestureRef}
        snap={sheetSnap}
      >
        <DaySwipeGuardProvider guard={swipeGuard}>
          <View
            onLayout={(event: LayoutChangeEvent) => {
              sheetContentTop.current = event.nativeEvent.layout.y;
            }}
            style={styles.content}
            testID="day-view-sheet-content"
          >
            {hotelContext !== null && hotelContext !== undefined ? (
              <HotelContextCard context={hotelContext} />
            ) : null}
            {placeEntry ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => openPlaceEntry()}
                style={styles.addPlace}
                testID="day-add-place"
                {...addPlaceExclusion}
              >
                <Text style={styles.action}>＋ 添加行程</Text>
              </Pressable>
            ) : null}
            <DayTimeline
              emptyState={placeEntry
                ? {
                  hint: '点上方「＋ 添加行程」，把想去的地方排进来',
                  title: '这一天还没有安排',
                }
                : { title: '暂无行程' }}
              onOpenItemActions={
                updateItemDetailsCommand
                  ? (itemId) => {
                    glog(`d-actions-open ${itemId}`);
                    setItemActionsItemId(itemId);
                  }
                  : undefined
              }
              onDragActiveChange={setIsDraggingItem}
              onOpenItemDetails={updateItemDetailsCommand ? openEditor : undefined}
              gestureRef={timelineGestureRef}
              onGestureTouchChange={onTimelineTouchChange}
              onPanScrollDelta={onPanDelta}
              onPanScrollStart={onPanStart}
              onPanScrollEnd={onPanEnd}
              /* Rows and the header share the same adjacent-Day gesture. */
              onPanSwipe={(direction) => {
                if (direction === 'right') {
                  if (previousDay) selectDay(previousDay.id);
                  return;
                }
                if (nextDay) selectDay(nextDay.id);
              }}
              onSelectItem={effectiveSelectItem}
              projection={timeline}
              resetKey={data.day.id}
              scrollRequest={effectiveScrollRequest}
              selectedItemId={effectiveSelectedItemId}
              onReorderDrop={reorderItemCommand ? handleReorderDrop : undefined}
              onLayout={(event) => {
                timelineTop.current = event.nativeEvent.layout.y;
              }}
              onScrollToOffset={scrollTimelineToOffset}
            />
          </View>
        </DaySwipeGuardProvider>
      </TripBottomSheet>
      <DayJumpSheet
        currentDayId={data.day.id}
        days={orderedDays}
        onClose={() => setIsDayJumpVisible(false)}
        onSelectDay={selectDay}
        resetKey={data.day.id}
        visible={isDayJumpVisible}
      />
      <ItemActionSheet
        hasPlace={actionsItem !== undefined && actionsItem.placeId !== null}
        itemTitle={actionsItem?.title ?? ''}
        onChangePlace={placeEntry?.changeItemPlace && actionsItem
          ? () => {
            /*
             * 更换地点 from the Day is its own task, so it commits the pick and
             * returns here. Opening the editor as well is what used to push the
             * user into Edit Detail for an action they never asked for.
             */
            openPlaceEntry({
              kind: 'change-place',
              itemId: actionsItem.id,
              commit: 'immediate',
            });
          }
          : undefined}
        onChangeDate={moveItemToDay && actionsItem
          ? () => { setDayMoveError(null); setDayMoveItemId(actionsItem.id); }
          : undefined}
        onClose={() => setItemActionsItemId(null)}
        onDelete={deleteItemCommand && actionsItem ? handleDeleteItem : undefined}
        onEditDetails={actionsItem && updateItemDetailsCommand
          ? () => openEditor(actionsItem.id)
          : undefined}
        onOpenInExternalMap={actionsPlace
          ? () => openPlaceInExternalMap({ place: actionsPlace, trip: data.trip })
          : undefined}
        resetKey={data.day.id}
        visible={actionsItem !== undefined}
      />
      <UndoSnackbar
        error={deleteError}
        message={undoSnapshot !== null
          ? `已删除「${undoSnapshot.item.title}」`
          : ''}
        onExpire={expireUndo}
        onUndo={undoSnapshot !== null && restoreDeletedItemCommand
          ? handleUndoDelete
          : undefined}
        visible={undoSnapshot !== null || deleteError !== null}
      />
      {moveItemToDay && dayMoveItem ? (
        <ItemMoveSheet
          currentDayId={data.day.id}
          days={orderedDays}
          error={dayMoveError}
          isMoving={isDayMoving}
          itemTitle={dayMoveItem.title}
          onClose={() => {
            setDayMoveItemId(null);
            setDayMoveError(null);
          }}
          onMoveToDay={handleMoveToDay}
          onMoveToUnscheduled={moveItemToUnscheduled ? handleMoveToUnscheduled : undefined}
          resetKey={data.day.id}
          visible
        />
      ) : null}
      {editorItem && editorSession && updateItemDetailsCommand ? (
        <ItemEditorModal
          commitDraft={commitEditorDraft}
          day={data.day}
          initialDraft={editorSession.draft ?? undefined}
          item={editorItem}
          place={selectedPlaceSummary(editorSession.pendingPlace,
            editorItem.placeId === null ? undefined : data.placesById[editorItem.placeId])}
          onChangePlace={placeEntry?.changeItemPlace ? () => setEditorPlacePickerVisible(true) : undefined}
          onClosePlacePicker={() => setEditorPlacePickerVisible(false)}
          placePickerLayer={editorPlacePickerVisible && placeEntry ? <EditorPlacePicker
            trip={data.trip} item={editorItem} day={data.day}
            originalPlace={editorItem.placeId === null ? undefined : data.placesById[editorItem.placeId]}
            pendingTarget={editorSession.pendingPlace} services={placeEntry} mapRenderer={MapRendererComponent}
            onClose={() => setEditorPlacePickerVisible(false)}
            onSelect={target => { setEditorSession(active => active ? { ...active, pendingPlace: target } : active); setEditorPlacePickerVisible(false); }}
          /> : undefined}
          onClose={() => { setEditorPlacePickerVisible(false); setEditorSession(null); }}
          onDraftChange={(draft) => {
            setEditorSession((active) => (active === null
              ? active
              : { ...active, draft }));
          }}
          onItemSaved={onItemSaved}
          visible
        />
      ) : null}
      {placeEntryOverlay !== null ? (
        /*
         * Day-origin entry is rendered as an in-place, opaque overlay rather than
         * a sibling native Modal. A Modal over the full-screen map is the
         * black-screen failure seen on the physical device: the modal slides in
         * while the map underneath still owns its GL surface, so iOS paints black
         * until the picker's own map repaints. An absolute overlay over the same
         * React layer as the map keeps the Day surface the presentation owner and
         * removes the modal/map race entirely. The editor flow already uses this
         * exact pattern via its own placePickerLayer.
         */
        <View
          style={styles.placeEntryOverlayLayer}
          testID="day-place-entry-overlay"
        >
          {placeEntryOverlay}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  addPlace: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8 },
  container: { flex: 1 },
  map: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  content: { gap: 4 },
  placeEntryOverlayLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    zIndex: 50,
  },
  entryStatus: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, textAlign: 'center' },
});
