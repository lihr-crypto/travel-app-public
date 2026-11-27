import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChangeTripDateRangeCommand } from '@/application/trip/change-trip-date-range';
import type { DeleteTripDayCommand } from '@/application/trip/delete-trip-day';
import type { InsertTripDayCommand } from '@/application/trip/insert-trip-day';
import type { EntityId, TravelDate } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { TripDatePageHeader } from './trip-date-page-header';
import { TripDateRangePage } from './trip-date-range-page';
import { TripDateShiftPage } from './trip-date-shift-page';
import { TripDayStructurePage } from './trip-day-structure-page';
import { formatDayCount, formatRangeZh } from './trip-date-labels';

export type TripDateManagementPage = 'menu' | 'shift' | 'range' | 'days';

export interface TripDateManagementProps {
  visible: boolean;
  tripId: EntityId;
  startDate: TravelDate;
  endDate: TravelDate;
  /** Ordered by `dayIndex`. */
  days: readonly Day[];
  scheduledItems: readonly Item[];
  /** Absent commands render their entry as unavailable rather than dead. */
  changeTripDateRange?: ChangeTripDateRangeCommand;
  insertTripDay?: InsertTripDayCommand;
  deleteTripDay?: DeleteTripDayCommand;
  onClose: () => void;
  /** Confirmation copy for a completed write; the shell owns the feedback slot. */
  onCompleted: (message: string) => void;
  /** Fired after a successful write so the caller can invalidate read models. */
  onChanged: () => void;
}

interface MenuEntry {
  key: Exclude<TripDateManagementPage, 'menu'>;
  title: string;
  hint: string;
  enabled: boolean;
}

/**
 * Trip date management sheet: the single place where Trip structure is edited.
 *
 * Day Overview stays a browse-and-navigate surface and links here, so delete,
 * insert and range edits only exist behind an explicit "I am editing the trip
 * dates" step. The three entries map to three different user intents rather than
 * to the internal storage strategy, which is never named in the UI.
 */
export function TripDateManagement({
  visible,
  tripId,
  startDate,
  endDate,
  days,
  scheduledItems,
  changeTripDateRange,
  insertTripDay,
  deleteTripDay,
  onClose,
  onCompleted,
  onChanged,
}: TripDateManagementProps) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<TripDateManagementPage>('menu');
  const [wasVisible, setWasVisible] = useState(visible);

  // Each opening starts at the entry page; a half-finished edit must not survive.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPage('menu');
  }

  const canChangeRange = changeTripDateRange !== undefined;
  const entries: MenuEntry[] = [
    {
      key: 'shift',
      title: '整趟改期',
      hint: '保持旅行天数不变，所有 Day 和行程一起移动',
      enabled: canChangeRange,
    },
    {
      key: 'range',
      title: '调整开始 / 结束日期',
      hint: '延长或缩短旅行日期',
      enabled: canChangeRange,
    },
    {
      key: 'days',
      title: '管理旅行日',
      hint: '在旅行中插入或删除某一天',
      enabled: insertTripDay !== undefined || deleteTripDay !== undefined,
    },
  ];

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View
        style={[
          styles.container,
          { paddingBottom: insets.bottom + spacing.lg, paddingTop: insets.top + spacing.sm },
        ]}
        testID="trip-date-management"
      >
        {page === 'menu' ? (
          <ScrollView
            contentContainerStyle={styles.content}
            style={styles.page}
            testID="trip-date-management-menu"
          >
            <TripDatePageHeader
              onClose={onClose}
              testID="trip-date-management-header"
              title="修改旅行日期"
            />
            <View style={styles.summary} testID="trip-date-management-current">
              <Text style={styles.summaryLabel}>当前行程</Text>
              <Text style={styles.summaryRange}>{formatRangeZh(startDate, endDate)}</Text>
              <Text style={styles.summaryCount}>{formatDayCount(days.length)}</Text>
            </View>
            <View style={styles.entries}>
              {entries.map((entry) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={!entry.enabled}
                  key={entry.key}
                  onPress={() => setPage(entry.key)}
                  style={[styles.entry, entry.enabled ? null : styles.entryDisabled]}
                  testID={`trip-date-management-entry-${entry.key}`}
                >
                  <View style={styles.entryBody}>
                    <Text style={styles.entryTitle}>{entry.title}</Text>
                    <Text style={styles.entryHint}>{entry.hint}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : null}

        {page === 'shift' && changeTripDateRange ? (
          <TripDateShiftPage
            changeTripDateRange={changeTripDateRange}
            endDate={endDate}
            onBack={() => setPage('menu')}
            onChanged={onChanged}
            onCompleted={onCompleted}
            onDismiss={onClose}
            startDate={startDate}
            tripId={tripId}
          />
        ) : null}

        {page === 'range' && changeTripDateRange ? (
          <TripDateRangePage
            changeTripDateRange={changeTripDateRange}
            days={days}
            endDate={endDate}
            onBack={() => setPage('menu')}
            onChanged={onChanged}
            onCompleted={onCompleted}
            onDismiss={onClose}
            scheduledItems={scheduledItems}
            startDate={startDate}
            tripId={tripId}
          />
        ) : null}

        {page === 'days' ? (
          <TripDayStructurePage
            days={days}
            deleteTripDay={deleteTripDay}
            endDate={endDate}
            insertTripDay={insertTripDay}
            onBack={() => setPage('menu')}
            onChanged={onChanged}
            onCompleted={onCompleted}
            scheduledItems={scheduledItems}
            startDate={startDate}
            tripId={tripId}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chevron: { color: colors.textSubtle, fontSize: 20 },
  container: {
    backgroundColor: colors.surface,
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl },
  entries: { gap: spacing.md },
  entry: {
    alignItems: 'center',
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entryBody: { flex: 1, gap: 2 },
  entryDisabled: { opacity: 0.4 },
  entryHint: { ...typography.caption, color: colors.textSubtle },
  entryTitle: { ...typography.cardTitle, color: colors.text },
  page: { flex: 1 },
  summary: { gap: 2 },
  summaryCount: { ...typography.body, color: colors.textSubtle },
  summaryLabel: { ...typography.label, color: colors.textSubtle },
  summaryRange: { ...typography.cardTitle, color: colors.text },
});
