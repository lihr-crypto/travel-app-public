import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/tokens';

import type { EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';
import { AnimatedSheetModal } from './ui/animated-sheet-modal';

export interface TripOverviewOccurrence {
  item: Item;
  day: Day;
  placeName?: string;
}

export interface TripOverviewPlacePreviewProps {
  placeName: string;
  occurrences: readonly TripOverviewOccurrence[];
  visible: boolean;
  onClose: () => void;
  onSelectDay: (dayId: EntityId) => void;
  /** Clears the sheet without playing the exit when the surface underneath changes. */
  resetKey?: string;
}

/**
 * Lightweight Overview marker preview; entering a Day always remains explicit.
 *
 * It is a Bottom Sheet on the shared sheet shell, so its backdrop only fades
 * while the white sheet translates — the same motion the Day selector uses.
 */
export function TripOverviewPlacePreview({
  placeName,
  occurrences,
  visible,
  onClose,
  onSelectDay,
  resetKey,
}: TripOverviewPlacePreviewProps) {
  return (
    <AnimatedSheetModal
      onRequestClose={onClose}
      resetKey={resetKey}
      scrollable
      testID="trip-overview-place-preview"
      title={placeName}
      visible={visible}
    >
      <Text style={styles.subtitle}>
        {occurrences.length === 1 ? '行程地点' : `${occurrences.length} 项行程 · 点击查看当天安排`}
      </Text>
      {occurrences.map(({ item, day, placeName: originalName }) => (
        <Pressable
          accessibilityRole="button"
          key={item.id}
          onPress={() => {
            onSelectDay(day.id);
            onClose();
          }}
          style={styles.occurrence}
          testID={`trip-overview-occurrence-${item.id}`}
        >
          <View style={styles.occurrenceText}>
            <Text style={styles.day}>Day {day.dayIndex} · {day.date}</Text>
            <Text style={styles.itemTitle}>{item.title}</Text>
            {originalName && originalName !== item.title ? <Text style={styles.placeName}>{originalName}</Text> : null}
          </View>
          <Text style={styles.enter}>查看当天 ›</Text>
        </Pressable>
      ))}
    </AnimatedSheetModal>
  );
}

const styles = StyleSheet.create({
  day: { ...typography.caption, color: colors.textMuted },
  enter: { ...typography.caption, color: colors.primary },
  itemTitle: { ...typography.cardTitle, color: colors.text },
  placeName: { ...typography.caption, color: colors.textMuted },
  occurrence: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  occurrenceText: { flex: 1, gap: 5, paddingRight: spacing.sm },
  subtitle: { ...typography.micro, color: colors.textSubtle, paddingBottom: spacing.xs },
});
