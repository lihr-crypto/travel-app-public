import { Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRef, useState, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ItemDraft } from '@/application/item/item-draft';
import { itemToDraft } from '@/application/item/item-draft';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { Day } from '@/domain/trip/types';
import { colors } from '@/theme/tokens';
import { ItemDraftForm } from './item-draft-form';

export interface ItemEditorModalProps {
  item: Item;
  /** Caller-selected Place label; the editor never queries Places itself. */
  place?: Pick<Place, 'name' | 'address'>;
  /** Opens the caller's place selection flow without ending this edit session. */
  onChangePlace?: () => void;
  /** Opaque selection UI rendered above the form inside this native Modal. */
  placePickerLayer?: ReactNode;
  /** Closes the inline picker layer when the Modal receives a close request. */
  onClosePlacePicker?: () => void;
  /** The Day the Item is in. Used only to date the clock rows; not editable. */
  day: Day;
  visible: boolean;
  onClose: () => void;
  /**
   * The draft to restore. The Item's own fields are used when absent, which is
   * also what makes returning from Location Search resume the same session.
   */
  initialDraft?: ItemDraft;
  /** Reports every edit, so the caller can preserve the draft across a sub-flow. */
  onDraftChange?: (draft: ItemDraft) => void;
  /** Commits the complete draft and returns the saved Item. */
  commitDraft: (draft: ItemDraft) => Promise<Item>;
  onItemSaved?: (item: Item) => void;
}

/**
 * The Item editing session.
 *
 * One field or concept appears once, in one column: the name is optional and
 * falls back to the Place name, and the clock wheel is mounted only while a
 * time row is being edited. Nothing is written until 保存.
 *
 * The caller may provide a current Place summary and a change-place seam. Its
 * picker is rendered above this still-mounted form, inside the same native
 * Modal, so the in-progress draft survives the round trip. Without that seam,
 * any provided Place stays read-only. 在地图中查看 remains in the Day row
 * menu's ⋯ sheet.
 *
 * The Item's Day is likewise absent. It is a Day-level decision and moves
 * through the Day row menu, so this screen carries no date row and no second
 * way to answer the same question.
 */
export function ItemEditorModal({
  item,
  place,
  onChangePlace,
  placePickerLayer,
  onClosePlacePicker,
  day,
  visible,
  onClose,
  initialDraft,
  onDraftChange,
  commitDraft,
  onItemSaved,
}: ItemEditorModalProps) {
  const insets = useSafeAreaInsets();
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const draft = initialDraft ?? itemToDraft(item);
  const hasPickerLayer = placePickerLayer !== undefined && placePickerLayer !== null;
  const handleSavingChange = (saving: boolean) => {
    isSavingRef.current = saving;
    setIsSaving(saving);
  };
  const handleRequestClose = () => {
    if (isSavingRef.current) return;
    if (hasPickerLayer && onClosePlacePicker) {
      onClosePlacePicker();
      return;
    }
    onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={handleRequestClose} visible={visible}>
      <View style={styles.root} testID="item-editor-modal">
        <View
          /*
           * No bottom inset here: the editor's form owns its own bottom clearance
           * through the ScrollView's keyboard insets. Padding the container as
           * well would stack an extra gap on top of the keyboard.
           */
          style={[styles.container, { paddingTop: insets.top + 8 }]}
        >
          <ItemDraftForm
            headerContext={item.dayId === null ? '未安排日期' : undefined}
            headerTitle={item.title}
            initialDate={day.date}
            initialDraft={draft}
            onCancel={onClose}
            onDraftChange={onDraftChange}
            onSavingChange={handleSavingChange}
            placeSection={place || onChangePlace ? (
              <View style={styles.placeSummary} testID="item-editor-place-summary">
                <View style={styles.placeDetails}>
                  <Text style={styles.placeName} testID="item-editor-place-name">
                    {place?.name || '未设置地点'}
                  </Text>
                  {place?.address?.trim() && place.address.trim() !== place.name ? (
                    <Text style={styles.placeAddress} testID="item-editor-place-address">
                      {place.address}
                    </Text>
                  ) : null}
                </View>
                {onChangePlace ? (
                  <Pressable
                    accessibilityLabel={place ? '更改地点' : '选择地点'}
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={() => { if (!isSavingRef.current) { Keyboard.dismiss(); onChangePlace(); } }}
                    style={[styles.placeChangeButton, isSaving ? styles.placeChangeButtonDisabled : null]}
                    testID="item-editor-change-place"
                  >
                    <Text style={styles.placeChangeLabel}>{place ? '更改' : '选择地点'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : undefined}
            onSave={async (nextDraft) => {
              const saved = await commitDraft(nextDraft);
              onItemSaved?.(saved);
              onClose();
            }}
            testIDPrefix="quick-edit"
          />
        </View>
        {hasPickerLayer ? (
          <View
            accessibilityViewIsModal
            style={styles.placePickerLayer}
            testID="item-editor-place-picker-layer"
          >
            {placePickerLayer}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  placeAddress: { color: colors.textSubtle, flexShrink: 1, fontSize: 13, lineHeight: 18 },
  placeChangeButton: { alignItems: 'center', borderColor: colors.accentStrong, borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 72, paddingHorizontal: 10 },
  placeChangeButtonDisabled: { opacity: 0.45 },
  placeChangeLabel: { color: colors.accentStrong, fontSize: 14, fontWeight: '700' },
  placeDetails: { flex: 1, gap: 3, minWidth: 0 },
  placeName: { color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  placePickerLayer: { backgroundColor: colors.background, bottom: 0, elevation: 20, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  placeSummary: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  root: { backgroundColor: colors.background, flex: 1 },
});
