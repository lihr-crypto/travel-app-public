import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EntityId, TravelDate } from '@/domain/common/types';
import { colors } from '@/theme/tokens';
import { formatRangeZh } from './trip-date-labels';

/**
 * M10-T3 — the Home Trip Preview Card.
 *
 * Stage-03 §3.6 is explicit that this is a **floating card, not a Bottom
 * Sheet**, and that it is the step between selecting and entering:
 *
 * ```text
 * Trip marker → Floating Trip Preview Card → explicit 查看旅行 → Trip Map
 * ```
 *
 * A cluster opens the same card in list form (`北京 · 3 次旅行` then one row per
 * Trip), because §3.6 requires a choice before entry rather than picking a
 * member for the user. The card is presentational: it owns no selection and no
 * read, so the surface that mounts it stays the single owner of both.
 */

export interface HomeTripPreviewEntry {
  tripId: EntityId;
  title: string;
  startDate: TravelDate;
  endDate: TravelDate;
  /** Content summary (A1): the Trip's Day count and distinct linked Places. */
  dayCount: number;
  placeCount: number;
}

export type HomeTripPreview =
  | { kind: 'trip'; trip: HomeTripPreviewEntry }
  | {
      kind: 'cluster';
      /**
       * The cluster marker's own label, count included. Taken verbatim so the
       * map badge and this heading can never disagree about the count.
       */
      label: string;
      trips: readonly HomeTripPreviewEntry[];
    };

export interface HomeTripPreviewCardProps {
  preview: HomeTripPreview;
  /** The highlighted member; in cluster mode it is also what 查看旅行 acts on. */
  selectedTripId?: EntityId | null;
  onClose: () => void;
  /** Absent means this build cannot enter a Trip — no seam, no action. */
  onEnterTrip?: (tripId: EntityId) => void;
  onSelectTrip?: (tripId: EntityId) => void;
}

function TripRow({
  entry,
  isSelected,
  onPress,
}: {
  entry: HomeTripPreviewEntry;
  isSelected: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text numberOfLines={1} style={[styles.rowTitle, isSelected ? styles.rowTitleSelected : null]}>{entry.title}</Text>
      <Text numberOfLines={1} style={styles.rowMeta}>
        {`${formatRangeZh(entry.startDate, entry.endDate)} · ${entry.dayCount} 天 · ${entry.placeCount} 个地点`}
      </Text>
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, isSelected ? styles.rowSelected : null]}
      testID={`home-trip-preview-trip-${entry.tripId}`}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.row} testID={`home-trip-preview-trip-${entry.tripId}`}>
      {body}
    </View>
  );
}

export function HomeTripPreviewCard({
  preview,
  selectedTripId = null,
  onClose,
  onEnterTrip,
  onSelectTrip,
}: HomeTripPreviewCardProps) {
  const isCluster = preview.kind === 'cluster';
  /*
   * In cluster mode entry needs a choice first. A single Trip is its own choice,
   * so it never needs one.
   */
  const enterTarget = isCluster
    ? preview.trips.find(({ tripId }) => tripId === selectedTripId) ?? null
    : preview.trip;

  return (
    <View style={styles.card} testID="home-trip-preview">
      <View style={styles.header}>
        <Text numberOfLines={1} style={styles.heading} testID="home-trip-preview-heading">
          {isCluster ? preview.label : preview.trip.title}
        </Text>
        <Pressable
          accessibilityLabel="关闭预览"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          testID="home-trip-preview-close"
        >
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      {isCluster ? (
        <>
          <Text style={styles.hint}>选择一趟旅行</Text>
          <View style={styles.rows}>
            {preview.trips.map((entry) => (
              <TripRow
                entry={entry}
                isSelected={entry.tripId === selectedTripId}
                key={entry.tripId}
                onPress={onSelectTrip ? () => onSelectTrip(entry.tripId) : undefined}
              />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.meta}>
          {`${formatRangeZh(preview.trip.startDate, preview.trip.endDate)} · ${preview.trip.dayCount} 天 · ${preview.trip.placeCount} 个地点`}
        </Text>
      )}

      {onEnterTrip && enterTarget ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onEnterTrip(enterTarget.tripId)}
          style={styles.enter}
          testID="home-trip-preview-enter"
        >
          <Text style={styles.enterLabel}>查看旅行</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 16,
    gap: 8,
    left: 16,
    padding: 14,
    position: 'absolute',
    right: 16,
    shadowColor: colors.text,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  close: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  enter: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  enterLabel: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  heading: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12 },
  meta: { color: colors.textMuted, fontSize: 13 },
  row: {
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  rowMeta: { color: colors.textMuted, fontSize: 12 },
  rowSelected: { backgroundColor: colors.accentSoft },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  rowTitleSelected: { color: colors.accentStrong },
  rows: { gap: 2 },
});
