import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DeleteTripDayCommand } from '@/application/trip/delete-trip-day';
import type { InsertTripDayCommand } from '@/application/trip/insert-trip-day';
import type { EntityId, TravelDate } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import { shiftTravelDate } from '@/domain/trip/date-range';
import type { Day } from '@/domain/trip/types';
import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@/theme/tokens';
import { AppButton } from './ui/app-button';
import { TripDatePageHeader } from './trip-date-page-header';
import { tripDatePageStyles } from './trip-date-page-styles';
import {
  formatDateZh,
  formatDateZhWeekday,
  formatDayCount,
  formatRangeZh,
} from './trip-date-labels';

export interface TripDayStructurePageProps {
  tripId: EntityId;
  startDate: TravelDate;
  endDate: TravelDate;
  days: readonly Day[];
  scheduledItems: readonly Item[];
  insertTripDay?: InsertTripDayCommand;
  deleteTripDay?: DeleteTripDayCommand;
  onBack: () => void;
  onCompleted: (message: string) => void;
  onChanged: () => void;
}

/**
 * The only page that edits the Trip's Day structure.
 *
 * Day Overview deliberately cannot do this: it shows `›` and goes to a Day. Here
 * each row shows `...`, which means "change this Day's place in the trip". The
 * two glyphs never share a row, so the Overview stays safe to browse.
 *
 * A Trip is one contiguous range, so insert and delete are described as what
 * they actually do to the trip — later Days move, the end date moves — instead
 * of as list operations.
 */
export function TripDayStructurePage({
  tripId,
  startDate,
  endDate,
  days,
  scheduledItems,
  insertTripDay,
  deleteTripDay,
  onBack,
  onCompleted,
  onChanged,
}: TripDayStructurePageProps) {
  const insets = useSafeAreaInsets();
  const [menuDayId, setMenuDayId] = useState<EntityId | null>(null);
  const [deleteDayId, setDeleteDayId] = useState<EntityId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const itemCountByDayId = new Map<EntityId, number>();
  for (const item of scheduledItems) {
    if (item.dayId === null) continue;
    itemCountByDayId.set(item.dayId, (itemCountByDayId.get(item.dayId) ?? 0) + 1);
  }

  const menuDay = days.find(({ id }) => id === menuDayId) ?? null;
  const deleteDay = days.find(({ id }) => id === deleteDayId) ?? null;
  const isLastDay = days.length <= 1;

  async function runInsert(position: 'before' | 'after') {
    if (!menuDay || !insertTripDay) return;
    setMenuDayId(null);
    setError(null);
    setIsSaving(true);
    try {
      await insertTripDay({ dayId: menuDay.id, position, tripId });
      onChanged();
      onCompleted('已插入新的旅行日');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '插入旅行日失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  }

  async function runDelete() {
    if (!deleteDay || !deleteTripDay) return;
    const removedItemCount = itemCountByDayId.get(deleteDay.id) ?? 0;
    setDeleteDayId(null);
    setError(null);
    setIsSaving(true);
    try {
      await deleteTripDay({ dayId: deleteDay.id, tripId });
      onChanged();
      onCompleted(
        removedItemCount > 0
          ? `Day ${deleteDay.dayIndex} 已删除，${removedItemCount} 个行程已移至未安排`
          : `Day ${deleteDay.dayIndex} 已删除`,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '删除旅行日失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <TripDatePageHeader onBack={onBack} testID="trip-day-structure" title="管理旅行日" />
      <View style={styles.summary}>
        <Text style={styles.summaryRange} testID="trip-day-structure-range">
          {formatRangeZh(startDate, endDate)}
        </Text>
        <Text style={styles.summaryCount}>{formatDayCount(days.length)}</Text>
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={styles.error} testID="trip-day-structure-error">
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.list}
        style={tripDatePageStyles.page}
        testID="trip-day-structure-list">
        {days.map((day) => (
          <View key={day.id} style={styles.row}>
            <View style={styles.dayLabel}>
              <Text style={styles.dayIndex}>Day {day.dayIndex}</Text>
              <Text style={styles.date}>{formatDateZhWeekday(day.date)}</Text>
            </View>
            <Pressable
              accessibilityLabel={`管理 Day ${day.dayIndex}`}
              accessibilityRole="button"
              disabled={isSaving}
              hitSlop={spacing.sm}
              onPress={() => setMenuDayId(day.id)}
              style={styles.menuTrigger}
              testID={`trip-day-structure-menu-${day.id}`}
            >
              <Text style={styles.menuTriggerText}>...</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuDayId(null)}
        transparent
        visible={menuDay !== null}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => setMenuDayId(null)}
          style={styles.backdrop}
        >
          <View />
        </Pressable>
        <View style={[styles.actionSheet, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Text style={styles.actionSheetTitle}>
            {menuDay ? `Day ${menuDay.dayIndex} · ${formatDateZh(menuDay.date)}` : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={!insertTripDay || isSaving}
            onPress={() => void runInsert('before')}
            style={styles.actionRow}
            testID="trip-day-menu-insert-before"
          >
            <Text style={styles.actionText}>在这一天之前插入一天</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            disabled={!insertTripDay || isSaving}
            onPress={() => void runInsert('after')}
            style={styles.actionRow}
            testID="trip-day-menu-insert-after"
          >
            <Text style={styles.actionText}>在这一天之后插入一天</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            disabled={!deleteTripDay || isSaving || isLastDay}
            onPress={() => {
              setMenuDayId(null);
              setDeleteDayId(menuDay?.id ?? null);
            }}
            style={styles.actionRow}
            testID="trip-day-menu-delete"
          >
            <Text style={styles.actionDestructive}>删除这一天</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            onPress={() => setMenuDayId(null)}
            style={styles.actionRow}
            testID="trip-day-menu-cancel"
          >
            <Text style={styles.actionText}>取消</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setDeleteDayId(null)}
        transparent
        visible={deleteDay !== null}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard} testID="trip-day-delete-confirm">
            <Text style={styles.confirmTitle}>
              {deleteDay ? `删除 Day ${deleteDay.dayIndex}？` : ''}
            </Text>
            {deleteDay ? (
              <Text style={styles.confirmBody}>
                {(itemCountByDayId.get(deleteDay.id) ?? 0) > 0
                  ? `${formatDateZh(deleteDay.date)}共有 ${itemCountByDayId.get(deleteDay.id)} 个行程，这些行程会移动到「未安排」。\n`
                  : `${formatDateZh(deleteDay.date)}没有安排行程。\n`}
                之后的旅行日将整体提前一天。{'\n'}
                旅行结束日期：{formatDateZh(endDate)} → {formatDateZh(shiftTravelDate(endDate, -1))}
              </Text>
            ) : null}
            <View style={styles.confirmActions}>
              <AppButton
                onPress={() => setDeleteDayId(null)}
                testID="trip-day-delete-cancel"
                title="取消"
                variant="secondary"
              />
              <AppButton
                disabled={isSaving}
                onPress={() => void runDelete()}
                testID="trip-day-delete-confirm-action"
                title="删除"
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actionDestructive: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  actionRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET + 6,
  },
  actionSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  actionSheetTitle: {
    ...typography.caption,
    color: colors.textSubtle,
    paddingTop: spacing.md,
    textAlign: 'center',
  },
  actionText: { ...typography.body, color: colors.text, textAlign: 'center' },
  backdrop: { backgroundColor: colors.backdrop, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  confirmActions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.lg },
  confirmBackdrop: {
    alignItems: 'center',
    backgroundColor: colors.backdrop,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  confirmBody: { ...typography.caption, color: colors.textMuted, paddingTop: spacing.sm },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    width: '100%',
  },
  confirmTitle: { ...typography.cardTitle, color: colors.text },
  date: { ...typography.micro, color: colors.textSubtle, marginTop: 2 },
  dayIndex: { ...typography.body, color: colors.text, fontWeight: '600' },
  dayLabel: { flex: 1 },
  divider: { backgroundColor: colors.borderSubtle, height: StyleSheet.hairlineWidth },
  error: { color: colors.danger, fontSize: 14, paddingBottom: spacing.sm },
  list: { paddingBottom: spacing.xxl },
  menuTrigger: { justifyContent: 'center', minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.sm },
  menuTriggerText: { color: colors.textSubtle, fontSize: 18, fontWeight: '600' },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingVertical: spacing.sm,
  },
  summary: { gap: 2, paddingBottom: spacing.sm },
  summaryCount: tripDatePageStyles.summaryCount,
  summaryRange: tripDatePageStyles.summaryRange,
});
