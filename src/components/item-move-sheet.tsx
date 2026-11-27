import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

import type { EntityId } from '@/domain/common/types';
import type { Day } from '@/domain/trip/types';
import { AnimatedSheetModal } from './ui/animated-sheet-modal';
import { formatDateZh } from './trip-date-labels';

export interface ItemMoveSheetProps {
  /** Shown as the heading, so the Item being moved stays unambiguous. */
  itemTitle: string;
  days: readonly Day[];
  currentDayId: EntityId;
  visible: boolean;
  onClose: () => void;
  /** Moves the Item into another Day. The sheet stays open on failure. */
  onMoveToDay: (dayId: EntityId) => Promise<void> | void;
  /**
   * Takes the Item out of the Day into Unscheduled. Absent means the sheet
   * offers no way out of the Day — "no seam, no action".
   */
  onMoveToUnscheduled?: (() => Promise<void> | void) | undefined;
  isMoving?: boolean;
  error?: string | null;
  /** Clears the sheet without playing the exit when the Day underneath changes. */
  resetKey?: string;
}

/**
 * Where an Item changes Day.
 *
 * The editor no longer carries a date row, so this is the only answer to
 * "which Day is this on" — and the only way into Unscheduled. Choosing another
 * Day leaves the user on the current Day: the Item simply disappears from this
 * Day's list rather than hijacking the screen.
 */
export function ItemMoveSheet({
  itemTitle,
  days,
  currentDayId,
  visible,
  onClose,
  onMoveToDay,
  onMoveToUnscheduled,
  isMoving = false,
  error = null,
  resetKey,
}: ItemMoveSheetProps) {
  const orderedDays = [...days].sort(
    (left, right) => left.dayIndex - right.dayIndex || left.id.localeCompare(right.id),
  );

  return (
    <AnimatedSheetModal
      onRequestClose={onClose}
      resetKey={resetKey}
      scrollable
      testID="item-move-sheet"
      title={itemTitle}
      visible={visible}
    >
      <Text style={styles.lead} testID="item-move-sheet-lead">移动到</Text>
      {orderedDays.map((entry) => (
        <Pressable
          accessibilityRole="button"
          disabled={isMoving || entry.id === currentDayId}
          key={entry.id}
          onPress={() => void onMoveToDay(entry.id)}
          style={[
            styles.row,
            entry.id === currentDayId ? styles.currentRow : null,
          ]}
          testID={`item-move-sheet-day-${entry.id}`}
        >
          <Text style={styles.rowLabel} testID={`item-move-sheet-day-label-${entry.id}`}>
            {entry.id === currentDayId ? '✓ ' : ''}
            Day {entry.dayIndex} · {formatDateZh(entry.date)}
          </Text>
        </Pressable>
      ))}
      {onMoveToUnscheduled ? (
        <View style={styles.separatedRegion}>
          <Pressable
            accessibilityRole="button"
            disabled={isMoving}
            onPress={() => void onMoveToUnscheduled()}
            style={styles.row}
            testID="item-move-sheet-unscheduled"
          >
            <Text style={styles.unscheduledLabel} testID="item-move-sheet-unscheduled-label">
              {isMoving ? '移动中…' : '移至未安排'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={styles.error}
          testID="item-move-sheet-error"
        >
          {error}
        </Text>
      ) : null}
    </AnimatedSheetModal>
  );
}

const styles = StyleSheet.create({
  currentRow: { opacity: 0.6 },
  error: { color: colors.danger, fontSize: 14, paddingTop: 6 },
  lead: { ...typography.caption, color: colors.textSubtle, paddingTop: spacing.xs },
  row: { justifyContent: 'center', minHeight: 52 },
  rowLabel: { ...typography.body, color: colors.text },
  separatedRegion: {
    borderTopColor: colors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  unscheduledLabel: { ...typography.body, color: colors.danger, fontWeight: '600' },
});
