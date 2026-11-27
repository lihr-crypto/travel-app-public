import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import type { ChangeTripDateRangeCommand } from '@/application/trip/change-trip-date-range';
import type { EntityId, TravelDate } from '@/domain/common/types';
import {
  deriveInclusiveTravelDateRange,
  differenceInTravelDays,
  shiftTravelDate,
} from '@/domain/trip/date-range';
import { AppButton } from './ui/app-button';
import { TripDateCalendar } from './trip-date-calendar';
import { TripDatePageHeader } from './trip-date-page-header';
import { tripDatePageStyles } from './trip-date-page-styles';
import { formatDayCount, formatRangeZh } from './trip-date-labels';

const styles = tripDatePageStyles;

export interface TripDateShiftPageProps {
  tripId: EntityId;
  startDate: TravelDate;
  endDate: TravelDate;
  changeTripDateRange: ChangeTripDateRangeCommand;
  onBack: () => void;
  onDismiss: () => void;
  onCompleted: (message: string) => void;
  onChanged: () => void;
}

function dayCount(startDate: TravelDate, endDate: TravelDate) {
  return deriveInclusiveTravelDateRange(startDate, endDate).length;
}

/**
 * "My whole trip moved, but it is still the same length."
 *
 * The user picks one new start date; the end date and every Day follow by the
 * same delta. Length is fixed here on purpose — changing it is the *other*
 * entry, so this page never asks the user to reconcile two dates by hand.
 */
export function TripDateShiftPage({
  tripId,
  startDate,
  endDate,
  changeTripDateRange,
  onBack,
  onDismiss,
  onCompleted,
  onChanged,
}: TripDateShiftPageProps) {
  const [newStartDate, setNewStartDate] = useState<TravelDate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const originalLength = dayCount(startDate, endDate);
  const delta = newStartDate === null
    ? 0
    : differenceInTravelDays(startDate, newStartDate);
  const newEndDate = newStartDate === null
    ? null
    : shiftTravelDate(endDate, delta);
  const isUnchanged = newStartDate === null || delta === 0;

  async function handleConfirm() {
    if (newStartDate === null || newEndDate === null) return;
    setError(null);
    setIsSaving(true);
    try {
      const result = await changeTripDateRange({
        tripId,
        startDate: newStartDate,
        endDate: newEndDate,
        strategy: 'shiftItems',
      });
      onChanged();
      onCompleted(
        result.validationIssues.length > 0
          ? '旅行日期已更新，有行程时间超出新的日期范围'
          : '旅行日期已更新',
      );
      onDismiss();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '改期失败，请重试。');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <TripDatePageHeader onBack={onBack} testID="trip-date-shift" title="整趟改期" />
      <ScrollView contentContainerStyle={styles.content}
        style={styles.page}
        testID="trip-date-shift-content">
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>当前日期</Text>
          <Text style={styles.summaryRange} testID="trip-date-shift-current">
            {formatRangeZh(startDate, endDate)}
          </Text>
          <Text style={styles.summaryCount}>{formatDayCount(originalLength)}</Text>
        </View>

        <Text style={styles.label}>新的开始日期</Text>
        <TripDateCalendar
          initialMonth={startDate}
          mode="single"
          onChange={({ startDate: picked }) => {
            setNewStartDate(picked);
            setError(null);
          }}
          testID="trip-date-shift-calendar"
          value={{ startDate: newStartDate, endDate: newStartDate }}
        />

        {newEndDate !== null ? (
          <View style={styles.preview} testID="trip-date-shift-preview">
            <Text style={styles.summaryLabel}>调整后</Text>
            <Text style={styles.summaryRange} testID="trip-date-shift-preview-range">
              {formatRangeZh(newStartDate!, newEndDate)}
            </Text>
            <Text style={styles.summaryCount}>{formatDayCount(originalLength)}</Text>
            <Text style={styles.previewNote} testID="trip-date-shift-preview-note">
              {delta === 0
                ? '开始日期没有变化。'
                : `所有已安排的旅行日和行程将整体${delta > 0 ? '顺延' : '提前'} ${Math.abs(delta)} 天。`}
            </Text>
          </View>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="trip-date-shift-error">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            disabled={isSaving}
            onPress={onBack}
            testID="trip-date-shift-cancel"
            title="取消"
            variant="secondary"
          />
          <AppButton
            disabled={isSaving || isUnchanged}
            onPress={() => void handleConfirm()}
            testID="trip-date-shift-confirm"
            title={isSaving ? '改期中…' : '确认改期'}
          />
        </View>
        {newStartDate === null ? (
          <Text style={styles.hint} testID="trip-date-shift-hint">
            请选择新的开始日期。
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
