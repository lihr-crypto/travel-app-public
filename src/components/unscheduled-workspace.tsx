import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  DeleteItemCommand,
} from '@/application/item/delete-item';
import {
  describeDeleteFailure,
  describeUndoFailure,
} from '@/application/item/delete-feedback';
import type { DeletedItemSnapshot } from '@/application/item/deleted-item-snapshot';
import type { MoveItemToDayCommand } from '@/application/item/move-item-to-day';
import type {
  RestoreDeletedItemCommand,
} from '@/application/item/restore-deleted-item';
import type { UpdateItemDetailsCommand } from '@/application/item/update-item-details';
import type { UnscheduledQuerySource } from '@/application/queries/unscheduled';
import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Day, Trip } from '@/domain/trip/types';
import type { Place } from '@/domain/place/types';
import type { ItemDraft } from '@/application/item/item-draft';
import type { PlaceSelectionTarget } from '@/application/place/place-selection';
import { pendingPlaceName } from '@/application/place/place-selection';
import type { MapRenderer } from '@/infrastructure/map/map-renderer';
import { EditorPlacePicker, selectedPlaceSummary, type EditorPlacePickerServices } from './editor-place-picker';
import { colors } from '@/theme/tokens';
import { glog } from './gesture-debug';
import { DayJumpSheet } from './day-header';
import { ItemActionSheet } from './item-action-sheet';
import { ItemEditorModal } from './item-editor-modal';
import { TripBackButton, useBackSwipeGesture } from './trip-back-button';
import { UnscheduledItemList } from './unscheduled-item-list';
import { UndoSnackbar } from './undo-snackbar';

export interface UnscheduledWorkspaceProps {
  tripId: EntityId;
  trip?: Trip;
  placesById?: Readonly<Record<string, Place>>;
  placePickerServices?: EditorPlacePickerServices;
  mapRenderer?: MapRenderer;
  /** Move-back targets. An empty Trip can offer none. */
  days: readonly Day[];
  source: UnscheduledQuerySource;
  /**
   * Puts an Item back into a Day. Absent means the surface is read-only, so no
   * move control is rendered — the same "no seam, no action" rule the Item
   * editor and the external-map handoff already follow.
   */
  moveItemToDayCommand?: MoveItemToDayCommand;
  /** Fired with the Day the Item landed in, so the caller can invalidate it. */
  onItemMoved?: (dayId: EntityId) => void;
  /**
   * UX-C: the row menu's 编辑详情. Absent hides the action ("no seam, no
   * action").
   */
  updateItemDetailsCommand?: UpdateItemDetailsCommand;
  /**
   * UX-C: the row menu's 删除. Ships together with
   * `restoreDeletedItemCommand` and the Undo Snackbar, per the locked
   * delete-with-Undo rule.
   */
  deleteItemCommand?: DeleteItemCommand;
  /** Restores the snapshot a delete returned, from the Snackbar's 撤销. */
  restoreDeletedItemCommand?: RestoreDeletedItemCommand;
  /** Fired after a delete/restore, so the caller can invalidate its reads. */
  onItemsChanged?: () => void;
  /** Shared presentation transition owner; see `TripBackButton`. */
  onBack?: () => void;
  onHome?: () => void;
}

/**
 * Production surface for Items that were taken out of their Day.
 *
 * Without this surface, "移出当天" would be indistinguishable from deleting the
 * Item: the row would vanish from the Timeline and nothing would show where it
 * went. The move is non-destructive only if the user can still see the result.
 */
export function UnscheduledWorkspace({
  tripId,
  trip,
  placesById,
  placePickerServices,
  mapRenderer,
  days,
  source,
  moveItemToDayCommand,
  onItemMoved,
  updateItemDetailsCommand,
  deleteItemCommand,
  restoreDeletedItemCommand,
  onItemsChanged,
  onBack,
  onHome,
}: UnscheduledWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const [pendingItem, setPendingItem] = useState<Item | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const canMoveBack = moveItemToDayCommand !== undefined && days.length > 0;
  /** UX-C: the row menu's target, plus the editor/delete sessions it opens. */
  const [actionsItem, setActionsItem] = useState<Item | null>(null);
  const [editorSession, setEditorSession] = useState<Item | null>(null);
  const [editorDraft, setEditorDraft] = useState<ItemDraft | undefined>(undefined);
  const [pendingPlace, setPendingPlace] = useState<PlaceSelectionTarget | undefined>(undefined);
  const [placePickerVisible, setPlacePickerVisible] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<DeletedItemSnapshot | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    glog(`u-sheet visible=${actionsItem !== null}`);
  }, [actionsItem]);

  const handleDeleteItem = (item: Item, permanent: boolean) => {
    if (!deleteItemCommand) return;
    setDeleteError(null);
    deleteItemCommand({ itemId: item.id }).then(
      (result) => {
        if (!permanent) setUndoSnapshot(result.data);
        setActionsItem(null);
        onItemsChanged?.();
      },
      (cause: unknown) => {
        setDeleteError(describeDeleteFailure(cause));
      },
    );
  };

  const handleUndoDelete = () => {
    const snapshot = undoSnapshot;
    if (!restoreDeletedItemCommand || !snapshot) return;
    restoreDeletedItemCommand({ snapshot }).then(
      () => {
        setUndoSnapshot(null);
        setDeleteError(null);
        onItemsChanged?.();
      },
      (cause: unknown) => {
        const feedback = describeUndoFailure(cause);
        if (!feedback.retryable) setUndoSnapshot(null);
        setDeleteError(feedback.message);
      },
    );
  };

  const expireUndo = () => {
    setUndoSnapshot(null);
    setDeleteError(null);
  };
  /** The ⋯ sheet exists when ANY of its actions is reachable. */
  const actionsHandler =
    updateItemDetailsCommand || deleteItemCommand || canMoveBack
      ? setActionsItem
      : undefined;
  /** UX-C: the whole content is one non-scrolling panel, so it can host the swipe. */
  const backSwipeGesture = useBackSwipeGesture(onBack);
  /** The editor works on the snapshot taken when the sheet opened. */
  const editorItem = editorSession ?? undefined;

  const handleSelectDay = async (dayId: EntityId) => {
    // `DayJumpSheet` closes itself right after reporting the choice, so the
    // Item has to be captured before the await.
    const item = pendingItem;
    const command = moveItemToDayCommand;
    if (item === null || command === undefined) return;
    setMoveError(null);
    setIsMoving(true);
    try {
      await command({ itemId: item.id, targetDayId: dayId });
      onItemMoved?.(dayId);
    } catch (error: unknown) {
      setMoveError(error instanceof Error ? error.message : '移动失败，请重试。');
    } finally {
      setIsMoving(false);
    }
  };

  const content = (
    <View
      style={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.heading}>未安排行程</Text>
      <Text style={styles.hint}>
        从某一天移出的行程会保留在这里，不会被删除。
      </Text>
      <UnscheduledItemList
        onRequestActions={actionsHandler ? setActionsItem : undefined}
        source={source}
        tripId={tripId}
      />
      {isMoving ? (
        <Text style={styles.status} testID="unscheduled-moving">移动中…</Text>
      ) : null}
      {moveError ? (
        <Text
          accessibilityRole="alert"
          style={styles.error}
          testID="unscheduled-move-error"
        >
          {moveError}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container} testID="unscheduled-workspace">
      <TripBackButton onBack={onBack} onHome={onHome} testID="unscheduled-back" />
      {backSwipeGesture ? (
        <GestureDetector gesture={backSwipeGesture}>{content}</GestureDetector>
      ) : (
        content
      )}
      <ItemActionSheet
        changeDateLabel="安排到某一天"
        hasPlace={false}
        itemTitle={actionsItem?.title ?? ''}
        onClose={() => setActionsItem(null)}
        onChangeDate={canMoveBack && actionsItem
          ? () => setPendingItem(actionsItem)
          : undefined}
        onEditDetails={actionsItem && updateItemDetailsCommand
          ? () => setEditorSession(actionsItem)
          : undefined}
        onPermanentDelete={deleteItemCommand && actionsItem
          ? () => {
            const item = actionsItem;
            Alert.alert('永久删除行程', `确认永久删除「${item.title}」？此操作无法撤销。`, [
              { text: '取消', style: 'cancel' },
              { text: '永久删除', style: 'destructive', onPress: () => handleDeleteItem(item, true) },
            ]);
          }
          : undefined}
        visible={actionsItem !== null}
      />
      {editorItem !== undefined && updateItemDetailsCommand ? (
        <ItemEditorModal
          commitDraft={async (draft) => {
            if (!updateItemDetailsCommand) {
              throw new RangeError('当前构建无法保存行程');
            }
            const saved = await updateItemDetailsCommand({
              itemId: editorItem.id,
              ...draft,
          title: draft.title.trim() || pendingPlaceName(pendingPlace ?? null)
            || (editorItem.placeId ? placesById?.[editorItem.placeId]?.name : null) || editorItem.title,
          ...(pendingPlace ? { placeTarget: pendingPlace } : {}),
            });
            onItemsChanged?.();
            return saved.data;
          }}
          day={days[0] ?? {
            id: 'unscheduled', tripId: tripId, date: '1970-01-01', dayIndex: 0,
            createdAt: '', updatedAt: '',
          }}
          item={editorItem}
          initialDraft={editorDraft}
          onDraftChange={setEditorDraft}
          place={selectedPlaceSummary(pendingPlace, editorItem.placeId ? placesById?.[editorItem.placeId] : undefined)}
          onChangePlace={trip && placePickerServices && mapRenderer ? () => setPlacePickerVisible(true) : undefined}
          onClosePlacePicker={() => setPlacePickerVisible(false)}
          placePickerLayer={placePickerVisible && trip && placePickerServices && mapRenderer ? <EditorPlacePicker
            trip={trip} item={editorItem} originalPlace={editorItem.placeId ? placesById?.[editorItem.placeId] : undefined}
            pendingTarget={pendingPlace} services={placePickerServices} mapRenderer={mapRenderer}
            onClose={() => setPlacePickerVisible(false)}
            onSelect={target => { setPendingPlace(target); setPlacePickerVisible(false); }}
          /> : undefined}
          onClose={() => { setEditorSession(null); setEditorDraft(undefined); setPendingPlace(undefined); setPlacePickerVisible(false); }}
          visible
        />
      ) : null}
      <UndoSnackbar
        error={deleteError}
        message={undoSnapshot !== null ? `已删除「${undoSnapshot.item.title}」` : ''}
        onExpire={expireUndo}
        onUndo={undoSnapshot !== null && restoreDeletedItemCommand ? handleUndoDelete : undefined}
        visible={undoSnapshot !== null || deleteError !== null}
      />
      <DayJumpSheet
        currentDayId=""
        days={days}
        onClose={() => setPendingItem(null)}
        onSelectDay={(dayId) => {
          void handleSelectDay(dayId);
        }}
        visible={pendingItem !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, flex: 1 },
  content: { flex: 1, gap: 8, paddingHorizontal: 20 },
  error: { color: colors.danger, fontSize: 14, paddingTop: 8 },
  heading: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hint: { color: colors.textSubtle, fontSize: 14, paddingBottom: 8 },
  status: { color: colors.textSubtle, fontSize: 14, paddingTop: 8 },
});
