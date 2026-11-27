import { Pressable, StyleSheet, Text, View } from 'react-native';

import { deviceLocalTravelDate } from '@/domain/common/travel-date';
import { colors, MIN_TOUCH_TARGET } from '@/theme/tokens';

import type { EntityId, TravelDate } from '@/domain/common/types';
import type { ValidationIssue } from '@/domain/validation';
import type { TripOverviewProjection } from '@/application/projections/trip-overview';
import type { ValidationIssueRowModel } from '@/application/trip/validation-issue-presentation';
import {
  formatDateZhWeekday,
  formatDayCount,
  formatRangeZh,
  relativeDayLabel,
} from './trip-date-labels';
import { ValidationSummary } from './validation-summary';

export interface TripOverviewSheetProps {
  projection: TripOverviewProjection;
  onSelectDay: (dayId: EntityId) => void;
  /** Optional Trip heading; the workspace supplies it for the real surface. */
  tripTitle?: string;
  onManageTrip?: () => void;
  /** Opens the Trip date sheet. Absent means the range is not editable. */
  onEditDateRange?: () => void;
  onOpenUnscheduled?: () => void;
  /** Derived validation warnings; empty renders no summary. */
  validationRows?: readonly ValidationIssueRowModel[];
  /** A3 relative-date anchor; defaults to the device's local travel date. */
  today?: TravelDate;
  /** The 查看 intent for an issue row; the caller owns navigation. */
  onSelectIssue?: (issue: ValidationIssue) => void;
}

function displayRemainingCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

/**
 * Day List content for the Trip Overview Bottom Sheet.
 *
 * Browse-and-navigate only. The Trip date block opens the date sheet; every Day
 * row's `›` means one thing, "open this Day", and nothing here edits structure.
 * Delete, insert and range edits live behind the date block so a browsing tap
 * can never restructure the trip.
 */
export function TripOverviewSheet({
  projection,
  onSelectDay,
  tripTitle,
  onManageTrip,
  onEditDateRange,
  onOpenUnscheduled,
  validationRows = [],
  onSelectIssue,
  today = deviceLocalTravelDate(),
}: TripOverviewSheetProps) {
  /*
   * Days are the contiguous inclusive range derived from the Trip's dates, so
   * the first and last Day *are* the range. There is no separate Trip field to
   * read here.
   */
  const firstDay = projection.days[0]?.day;
  const lastDay = projection.days[projection.days.length - 1]?.day;
  const rangeText = firstDay && lastDay
    ? formatRangeZh(firstDay.date, lastDay.date)
    : '未设置日期';

  return (
    <View style={styles.container} testID="trip-overview-sheet">
      {tripTitle !== undefined ? (
        <View style={styles.heading} testID="trip-overview-heading">
          <Text numberOfLines={1} style={styles.headingTitle} testID="trip-overview-title">
            {tripTitle}
          </Text>
          {onManageTrip ? (
            <Pressable
              accessibilityLabel={`管理旅行 ${tripTitle}`}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onManageTrip}
              style={styles.manage}
              testID="trip-overview-manage"
            >
              <Text style={styles.manageLabel}>⋯</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={!onEditDateRange}
        onPress={onEditDateRange}
        style={styles.dateBlock}
        testID="trip-overview-date-summary"
      >
        <Text style={styles.dateLabel}>旅行日期</Text>
        <View style={styles.rangeRow}>
          <Text style={styles.rangeText} testID="trip-overview-date-range-text">
            {rangeText}
          </Text>
          {onEditDateRange ? <Text style={styles.chevron}>›</Text> : null}
        </View>
        <Text style={styles.rangeCount} testID="trip-overview-date-count">
          {formatDayCount(projection.days.length)}
        </Text>
      </Pressable>
      <ValidationSummary
        onSelectIssue={onSelectIssue}
        rows={validationRows}
      />
      <View style={styles.dayList} testID="trip-overview-day-list">
        {projection.days.map(({ day, previewTitles, remainingItemCount }) => (
          <Pressable
            accessibilityRole="button"
            key={day.id}
            onPress={() => onSelectDay(day.id)}
            style={styles.row}
            testID={`trip-overview-day-${day.id}`}
          >
            <View style={styles.dayLabel}>
              <Text style={styles.dayIndex}>{`第 ${day.dayIndex} 天`}</Text>
              <View style={styles.dateRow}>
                <Text style={styles.date}>{formatDateZhWeekday(day.date)}</Text>
                {relativeDayLabel(day.date, today) !== null ? (
                  <Text style={styles.relativeDateBadge}>
                    {relativeDayLabel(day.date, today)}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text
              numberOfLines={1}
              style={styles.summary}
              testID={`trip-overview-day-summary-${day.id}`}
            >
              {previewTitles.length > 0 ? previewTitles.join(' · ') : '暂无安排'}
            </Text>
            {displayRemainingCount(remainingItemCount) > 0 ? (
              <Text
                accessibilityLabel={`还有 ${displayRemainingCount(remainingItemCount)} 项`}
                style={styles.remainingBadge}
                testID={`trip-overview-day-remaining-${day.id}`}
              >
                {`+${displayRemainingCount(remainingItemCount)}`}
              </Text>
            ) : null}
            <Text accessibilityElementsHidden importantForAccessibility="no">›</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.unscheduledRow} testID="trip-overview-unscheduled">
        <Pressable
          accessibilityRole="button"
          disabled={!onOpenUnscheduled}
          onPress={onOpenUnscheduled}
          style={styles.unscheduledEntry}
          testID="trip-overview-unscheduled-entry"
        >
          <Text style={styles.dayIndex}>未安排</Text>
          <Text style={styles.unscheduledCount}>{projection.unscheduledItemCount}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chevron: { color: colors.textSubtle, fontSize: 18 },
  container: { gap: 12 },
  dateBlock: { gap: 2, minHeight: MIN_TOUCH_TARGET, paddingVertical: 4 },
  dateLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  dayList: { gap: 2 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: MIN_TOUCH_TARGET },
  headingTitle: { color: colors.text, flex: 1, fontSize: 18, fontWeight: '700' },
  manage: { alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET },
  manageLabel: { color: colors.textMuted, fontSize: 24, lineHeight: 26 },
  rangeCount: { color: colors.textMuted, fontSize: 15 },
  rangeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rangeText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  remainingBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    color: colors.accentStrong,
    flexShrink: 0,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingVertical: 8,
  },
  /** Wide enough for `2026-10-04` + the 今天/明天 badge on one line (UX-B fix). */
  dayLabel: { width: 112 },
  dayIndex: { color: colors.text, fontSize: 15, fontWeight: '600' },
  date: { color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 2 },
  dateRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  relativeDateBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  summary: { color: colors.textSecondary, flex: 1, fontSize: 14 },
  unscheduledRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  unscheduledEntry: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  unscheduledCount: { color: colors.accentStrong, fontSize: 14 },
});
