import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { ChangeTripDateRangeCommand } from '@/application/trip/change-trip-date-range';
import { previewTripDateRangeChange } from '@/application/trip/trip-date-change-preview';
import type { EntityId, TravelDate } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';
import { AppButton } from './ui/app-button';
import {
  TripDateCalendar,
  type TripDateCalendarEnd,
} from './trip-date-calendar';
import { TripDatePageHeader } from './trip-date-page-header';
import { tripDatePageStyles } from './trip-date-page-styles';
import { formatDateZh, formatDayCount, formatRangeZh } from './trip-date-labels';

const styles = tripDatePageStyles;

export interface TripDateRangePageProps {
  tripId: EntityId;
  startDate: TravelDate;
  endDate: TravelDate;
  days: readonly Day[];
  scheduledItems: readonly Item[];
  changeTripDateRange: ChangeTripDateRangeCommand;
  onBack: () => void;
  onDismiss: () => void;
  onCompleted: (message: string) => void;
  onChanged: () => void;
}

function buildImpactLines(
  removedDays: readonly { dayIndex: number; date: TravelDate }[],
  addedDates: readonly TravelDate[],
  affectedItemCount: number,
): string[] {
  const lines: string[] = [];

  if (removedDays.length > 0) {
    lines.push('此次调整将：');
    for (const day of removedDays) {
      lines.push(`－ 移除 Day ${day.dayIndex} · ${formatDateZh(day.date)}`);
    }
    lines.push(
      affectedItemCount > 0
        ? `其中共有 ${affectedItemCount} 个行程。这些行程会移动到「未安排」，不会删除任何行程。`
        : '这些日期没有安排行程，不会删除任何行程。',
    );
  }

  if (addedDates.length > 0) {
    lines.push(
      addedDates.length === 1
        ? `将新增 1 天：${formatDateZh(addedDates[0])}。`
        : `将新增 ${addedDates.length} 天：${formatDateZh(addedDates[0])} ～ ${formatDateZh(addedDates[addedDates.length - 1])}。`,
    );
  }

  if (lines.length === 0) {
    lines.push('旅行日期没有变化。');
  }

  return lines;
}

/**
 * "The trip starts earlier, ends later, or loses a few days."
 *
 * The range itself moves, so every existing Day keeps its own calendar date and
 * only the Days the new range no longer covers are dropped — and their Items go
 * to Unscheduled. The impact is spelled out before saving, because the Days that
 * disappear are not obvious from two dates alone.
 */
export function TripDateRangePage({
  tripId,
  startDate,
  endDate,
  days,
  scheduledItems,
  changeTripDateRange,
  onBack,
  onDismiss,
  onCompleted,
  onChanged,
}: TripDateRangePageProps) {
  const [draft, setDraft] = useState<{ startDate: TravelDate; endDate: TravelDate }>({
    startDate,
    endDate,
  });
  const [activeEnd, setActiveEnd] = useState<TripDateCalendarEnd>('end');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const itemsByDayId = useMemo(() => {
    const grouped = new Map<EntityId, Item[]>();
    for (const item of scheduledItems) {
      if (item.dayId === null) continue;
      grouped.set(item.dayId, [...(grouped.get(item.dayId) ?? []), item]);
    }
    return grouped;
  }, [scheduledItems]);

  const preview = previewTripDateRangeChange({
    days,
    endDate: draft.endDate,
    itemsByDayId,
    startDate: draft.startDate,
    strategy: 'keepCalendarDates',
  });
  const impactLines = buildImpactLines(
    preview.removedDays,
    preview.addedDates,
    preview.affectedItemCount,
  );
  const isUnchanged = draft.startDate === startDate && draft.endDate === endDate;

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      const result = await changeTripDateRange({
        tripId,
        startDate: draft.startDate,
        endDate: draft.endDate,
        strategy: 'keepCalendarDates',
      });
      onChanged();
      onCompleted(
        result.validationIssues.length > 0
          ? '旅行日期已更新，有行程时间超出新的日期范围'
          : '旅行日期已更新',
      );
      onDismiss();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '修改旅行日期失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <TripDatePageHeader onBack={onBack} testID="trip-date-range" title="调整旅行日期" />
      <ScrollView contentContainerStyle={styles.content}
        style={styles.page}
        testID="trip-date-range-content">
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>当前</Text>
          <Text style={styles.summaryRange} testID="trip-date-range-current">
            {formatRangeZh(startDate, endDate)}
          </Text>
          <Text style={styles.summaryCount}>{formatDayCount(days.length)}</Text>
        </View>

        <TripDateCalendar
          activeEnd={activeEnd}
          initialMonth={startDate}
          mode="range"
          onChange={({ startDate: nextStart, endDate: nextEnd }) => {
            setError(null);
            if (nextStart !== null && nextEnd !== null) {
              setDraft({ startDate: nextStart, endDate: nextEnd });
            }
          }}
          testID="trip-date-range-calendar"
          value={draft}
        />

        <View style={styles.readouts}>
          <DateReadout
            active={activeEnd === 'start'}
            label="开始日期"
            onPress={() => setActiveEnd('start')}
            testID="trip-date-range-start"
            value={formatDateZh(draft.startDate)}
          />
          <DateReadout
            active={activeEnd === 'end'}
            label="结束日期"
            onPress={() => setActiveEnd('end')}
            testID="trip-date-range-end"
            value={formatDateZh(draft.endDate)}
          />
        </View>

        <View style={styles.preview} testID="trip-date-range-preview">
          <Text style={styles.summaryLabel}>调整后</Text>
          <Text style={styles.summaryRange} testID="trip-date-range-preview-range">
            {formatRangeZh(draft.startDate, draft.endDate)}
          </Text>
          <Text style={styles.summaryCount} testID="trip-date-range-preview-count">
            {formatDayCount(preview.lengthDelta + days.length)}
          </Text>
          <View style={styles.impact} testID="trip-date-range-impact">
            {impactLines.map((line) => (
              <Text key={line} style={styles.impactLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="trip-date-range-error">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            disabled={isSaving}
            onPress={onBack}
            testID="trip-date-range-cancel"
            title="取消"
            variant="secondary"
          />
          <AppButton
            disabled={isSaving || isUnchanged}
            onPress={() => void handleSave()}
            testID="trip-date-range-save"
            title={isSaving ? '保存中…' : '保存修改'}
          />
        </View>
      </ScrollView>
    </>
  );
}

function DateReadout({
  label,
  value,
  active,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.readout}
      testID={testID}
    >
      <Text style={styles.readoutLabel}>{label}</Text>
      <Text
        style={[styles.readoutValue, active ? styles.readoutValueActive : null]}
        testID={`${testID}-value`}
      >
        {value}
      </Text>
    </Pressable>
  );
}
