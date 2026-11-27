import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { QueryClient } from '@tanstack/react-query';

import { queryClient as defaultQueryClient } from '@/application/query-client';
import { invalidateCreatedTripQueries } from '@/application/queries/trip-queries';
import type { CreateTripCommand } from '@/application/trip/create-trip';
import type { TravelDate } from '@/domain/common/types';
import { travelDateParts } from '@/domain/trip/date-range';
import type { TripMapRegion } from '@/domain/trip/types';
import { createTripCommand as defaultCreateTripCommand } from '@/infrastructure/database/trip-command';
import { colors, radius, spacing, typography } from '@/theme/tokens';

import {
  TripDateCalendar,
  type TripDateCalendarValue,
} from './trip-date-calendar';
import { AppButton } from './ui/app-button';

interface CreatedTripSummary {
  tripTitle: string;
  startDate: string;
  endDate: string;
  dayCount: number;
}

export interface CreateTripFormProps {
  createTripCommand?: CreateTripCommand;
  queryClient?: QueryClient;
  /**
   * Fired after a successful create, so a host that presents the form (Home's
   * create sheet) can close itself. Absent means the form stays as it is.
   */
  onTripCreated?: () => void;
}

/** The current Gregorian date used only to choose the calendar's first month. */
function todayAsTravelDate(): TravelDate {
  const now = new Date();
  const year = `${now.getFullYear()}`.padStart(4, '0');
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `2026年3月27日` — the field's explicit Gregorian display form. */
function toDisplayDate(value: TravelDate): string {
  const { day, month, year } = travelDateParts(value);
  return `${year}年${month}月${day}日`;
}

const FALLBACK_DISPLAY = '未选择';

function DateField({
  label,
  testID,
  value,
  isActive,
  onPress,
}: {
  label: string;
  testID: string;
  value: TravelDate | null;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityLabel={value === null ? label : `${label}${toDisplayDate(value)}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        onPress={onPress}
        style={[styles.dateRow, isActive ? styles.dateRowActive : null]}
        testID={testID}
      >
        <Text style={[styles.dateValue, value === null ? styles.datePlaceholder : null]}>
          {value === null ? FALLBACK_DISPLAY : toDisplayDate(value)}
        </Text>
        <Text style={styles.dateAction}>{isActive ? '请选择' : '更改'}</Text>
      </Pressable>
    </View>
  );
}

export function CreateTripForm({
  createTripCommand = defaultCreateTripCommand,
  queryClient = defaultQueryClient,
  onTripCreated,
}: CreateTripFormProps) {
  const [title, setTitle] = useState('');
  const [mapRegion, setMapRegion] = useState<TripMapRegion>('china_mainland');
  const [startDate, setStartDate] = useState<TravelDate | null>(null);
  const [endDate, setEndDate] = useState<TravelDate | null>(null);
  const [activeDateField, setActiveDateField] = useState<'start' | 'end'>('start');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdTrip, setCreatedTrip] = useState<CreatedTripSummary | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    title.trim().length > 0
    && startDate !== null
    && endDate !== null
    && startDate <= endDate
    && !isSubmitting;

  const dateRangeError = startDate !== null && endDate !== null && startDate > endDate
    ? '结束日期不能早于出发日期'
    : null;
  const activeDate = activeDateField === 'start' ? startDate : endDate;
  const calendarInitialMonth = activeDate ?? startDate ?? endDate ?? todayAsTravelDate();

  const submit = async () => {
    if (startDate === null || endDate === null) return;
    setErrorMessage(null);
    setCreatedTrip(null);
    setIsSubmitting(true);

    try {
      const result = await createTripCommand({
        title: title.trim(),
        startDate,
        endDate,
        mapRegion,
      });

      await invalidateCreatedTripQueries(queryClient, result.data.id);
      setCreatedTrip({
        tripTitle: result.data.title,
        startDate: result.data.startDate,
        endDate: result.data.endDate,
        dayCount: result.affectedEntityIds.length - 1,
      });
      onTripCreated?.();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : '创建旅行失败，请重试。',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container} testID="create-trip-form">
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>旅行名称</Text>
        <TextInput
          accessibilityLabel="旅行名称"
          onChangeText={setTitle}
          placeholder="想去哪儿？给它起个名字"
          placeholderTextColor={colors.textDisabled}
          style={styles.input}
          testID="create-trip-title"
          value={title}
        />
      </View>

      <View style={styles.fieldGroup} testID="create-trip-region">
        <Text style={styles.label}>行程地区</Text>
        <View accessibilityRole="radiogroup" style={styles.regionSegmented}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: mapRegion === 'china_mainland' }}
            onPress={() => setMapRegion('china_mainland')}
            style={[
              styles.regionOption,
              mapRegion === 'china_mainland' ? styles.regionOptionSelected : null,
            ]}
            testID="create-trip-region-mainland"
          >
            <Text
              style={[
                styles.regionOptionLabel,
                mapRegion === 'china_mainland' ? styles.regionOptionLabelSelected : null,
              ]}
            >
              中国大陆
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: mapRegion === 'global' }}
            onPress={() => setMapRegion('global')}
            style={[
              styles.regionOption,
              mapRegion === 'global' ? styles.regionOptionSelected : null,
            ]}
            testID="create-trip-region-overseas"
          >
            <Text
              style={[
                styles.regionOptionLabel,
                mapRegion === 'global' ? styles.regionOptionLabelSelected : null,
              ]}
            >
              海外
            </Text>
          </Pressable>
        </View>
      </View>

      <DateField
        isActive={activeDateField === 'start'}
        label="出发日期"
        onPress={() => setActiveDateField('start')}
        testID="create-trip-start-date"
        value={startDate}
      />
      <DateField
        isActive={activeDateField === 'end'}
        label="返回日期"
        onPress={() => setActiveDateField('end')}
        testID="create-trip-end-date"
        value={endDate}
      />
      {dateRangeError ? (
        <Text style={styles.error} testID="create-trip-range-error">
          {dateRangeError}
        </Text>
      ) : null}

      <View style={styles.calendarSection} testID="create-trip-calendar-section">
        <Text style={styles.label}>
          选择{activeDateField === 'start' ? '出发' : '返回'}日期
        </Text>
        <TripDateCalendar
          initialMonth={calendarInitialMonth}
          key={`${activeDateField}-${calendarInitialMonth}`}
          mode="single"
          onChange={({ startDate: selectedDate }: TripDateCalendarValue) => {
            if (selectedDate === null) return;
            if (activeDateField === 'start') {
              setStartDate(selectedDate);
            } else {
              setEndDate(selectedDate);
            }
          }}
          testID="create-trip-calendar"
          value={{
            startDate: activeDate,
            endDate: null,
          }}
        />
      </View>

      <AppButton
        disabled={!canSubmit}
        onPress={() => void submit()}
        style={styles.submit}
        testID="create-trip-submit"
        title={isSubmitting ? '创建中…' : '创建旅行'}
      />

      {errorMessage ? (
        <Text style={styles.error} testID="create-trip-error">
          {errorMessage}
        </Text>
      ) : null}

      {createdTrip ? (
        <View style={styles.success} testID="create-trip-created">
          <Text style={styles.successTitle}>已创建：{createdTrip.tripTitle}</Text>
          <Text style={styles.meta}>
            {createdTrip.startDate} 至 {createdTrip.endDate}
          </Text>
          <Text style={styles.meta}>
            {createdTrip.dayCount} 天
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  dateRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  dateRowActive: {
    borderColor: colors.accentStrong,
  },
  dateAction: {
    ...typography.caption,
    color: colors.accentStrong,
  },
  datePlaceholder: {
    color: colors.textDisabled,
  },
  dateValue: {
    ...typography.body,
    color: colors.text,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  input: {
    ...typography.body,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  meta: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  regionOption: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.sm,
  },
  regionOptionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  regionOptionLabelSelected: {
    color: colors.onPrimary,
  },
  regionOptionSelected: {
    backgroundColor: colors.accentStrong,
  },
  regionSegmented: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  calendarSection: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    gap: spacing.sm,
    padding: spacing.md,
  },
  submit: {
    marginTop: spacing.xs,
  },
  success: {
    backgroundColor: colors.successSurface,
    borderRadius: radius.sm,
    gap: spacing.xs,
    padding: spacing.md,
  },
  successTitle: {
    ...typography.label,
    color: colors.success,
  },
});
