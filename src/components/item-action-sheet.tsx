import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';
import { AnimatedSheetModal } from './ui/animated-sheet-modal';

export interface ItemActionSheetProps {
  /** Shown as the sheet heading, so the row being acted on stays unambiguous. */
  itemTitle: string;
  /** Chooses between `更换地点` and `设置地点`. */
  hasPlace: boolean;
  visible: boolean;
  onClose: () => void;
  /** Opens Location Search for this Item. Absent hides the location action. */
  onChangePlace?: () => void;
  /**
   * Opens the Day selector, which is where an Item changes Day or leaves the
   * Day for Unscheduled. Absent hides the date action.
   */
  onChangeDate?: () => void;
  changeDateLabel?: string;
  /** Opens the Item editor. Absent hides the details action. */
  onEditDetails?: () => void;
  /**
   * UX-C: the provider-aware map handoff, moved here from the Item editor.
   * Absent (a Place-less Item) hides the row.
   */
  onOpenInExternalMap?: () => void;
  /**
   * Ordinary delete; its caller owns the Undo/restore feedback.
   * Unscheduled uses the explicitly confirmed permanent-delete action below.
   */
  onDelete?: () => void;
  /** Permanent deletion is confirmed by its caller before running the command. */
  onPermanentDelete?: () => void;
  resetKey?: string;
}

/**
 * The Day Overview row menu.
 *
 * It replaces the large green `编辑` button that used to dominate every row:
 * the row itself is for scanning, and the actions live behind one compact
 * control that keeps its own 44 × 44 pt target.
 */
export function ItemActionSheet({
  itemTitle,
  hasPlace,
  visible,
  onClose,
  onChangePlace,
  onChangeDate,
  changeDateLabel = '更改日期',
  onEditDetails,
  onOpenInExternalMap,
  onDelete,
  onPermanentDelete,
  resetKey,
}: ItemActionSheetProps) {
  return (
    <AnimatedSheetModal
      onRequestClose={onClose}
      resetKey={resetKey}
      testID="item-action-sheet"
      title={itemTitle}
      visible={visible}
    >
      {onChangePlace ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onChangePlace();
          }}
          style={styles.row}
          testID="item-action-change-place"
        >
          <Text style={styles.rowLabel}>{hasPlace ? '更换地点' : '设置地点'}</Text>
        </Pressable>
      ) : null}
      {onChangeDate ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onChangeDate();
          }}
          style={styles.row}
          testID="item-action-change-date"
        >
          <Text style={styles.rowLabel}>{changeDateLabel}</Text>
        </Pressable>
      ) : null}
      {onEditDetails ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onEditDetails();
          }}
          style={styles.row}
          testID="item-action-edit-details"
        >
          <Text style={styles.rowLabel}>编辑详情</Text>
        </Pressable>
      ) : null}
      {onOpenInExternalMap ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onOpenInExternalMap();
          }}
          style={styles.row}
          testID="item-action-open-in-map"
        >
          <Text style={styles.rowLabel}>在地图中查看 ↗</Text>
        </Pressable>
      ) : null}
      {onDelete ? (
        <View style={styles.destructiveRegion}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onClose();
              onDelete();
            }}
            style={styles.row}
            testID="item-action-delete"
          >
            <Text style={styles.rowDanger}>删除行程</Text>
          </Pressable>
        </View>
      ) : null}
      {onPermanentDelete ? (
        <View style={styles.destructiveRegion}>
          <Pressable
            accessibilityRole="button"
            onPress={() => { onClose(); onPermanentDelete(); }}
            style={styles.row}
            testID="item-action-permanent-delete"
          >
            <Text style={styles.rowDanger}>永久删除</Text>
          </Pressable>
        </View>
      ) : null}
    </AnimatedSheetModal>
  );
}

const styles = StyleSheet.create({
  destructiveRegion: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  row: { justifyContent: 'center', minHeight: 52 },
  rowDanger: { ...typography.body, color: colors.danger, fontWeight: '600' },
  rowLabel: { ...typography.body, color: colors.text },
});
