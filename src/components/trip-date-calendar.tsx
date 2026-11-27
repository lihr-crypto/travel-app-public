import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TravelDate } from '@/domain/common/types';
import {
  daysInTravelMonth,
  travelDateFromParts,
  travelDateParts,
  weekdayOfTravelDate,
} from '@/domain/trip/date-range';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { WEEKDAY_HEADING_LABELS } from './trip-date-labels';

export type TripDateCalendarMode = 'single' | 'range';

/** Which end of a range a tap edits; `range` mode ignores it when unused. */
export type TripDateCalendarEnd = 'start' | 'end';

export interface TripDateCalendarValue {
  startDate: TravelDate | null;
  endDate: TravelDate | null;
}

export interface TripDateCalendarProps {
  mode: TripDateCalendarMode;
  value: TripDateCalendarValue;
  /** Month rendered first; selection may move the visible month afterwards. */
  initialMonth: TravelDate;
  /**
   * Range mode only: the end a tap moves. Defaults to `end`, because changing a
   * Trip's length is far more often "start later / finish later" than the
   * reverse. The caller exposes it as the two tappable date readouts.
   */
  activeEnd?: TripDateCalendarEnd;
  /** Dates before this render disabled; omit to allow every Gregorian date. */
  minDate?: TravelDate;
  onChange: (value: TripDateCalendarValue) => void;
  testID?: string;
}

function addMonths(year: number, month: number, delta: number) {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { month: (zeroBased % 12) + 1, year: Math.floor(zeroBased / 12) };
}

/**
 * Builds the Monday-first month grid as date strings with `null` padding.
 *
 * Pure calendar arithmetic on the ISO date string; no `Date`, so the grid cannot
 * shift with the device timezone and the app never falls back to a non-Gregorian
 * calendar such as the Reiwa year labels the old spinner produced.
 */
function monthGrid(year: number, month: number): (TravelDate | null)[] {
  const firstWeekday = weekdayOfTravelDate(
    travelDateFromParts({ day: 1, month, year }),
  );
  const dayCount = daysInTravelMonth(year, month);
  const cellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7;

  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= dayCount
      ? travelDateFromParts({ day, month, year })
      : null;
  });
}

/**
 * Gregorian month Calendar used for every Trip date selection.
 *
 * One component covers both intents: `single` picks one date (moving the whole
 * trip), `range` picks an inclusive span (changing the trip's length). It is
 * built from the app's own tokens rather than a library's default theme, so it
 * does not read as a third-party web widget.
 */
export function TripDateCalendar({
  mode,
  value,
  initialMonth,
  activeEnd = 'end',
  minDate,
  onChange,
  testID = 'trip-date-calendar',
}: TripDateCalendarProps) {
  const [visible, setVisible] = useState(() => {
    const { month, year } = travelDateParts(initialMonth);
    return { month, year };
  });

  const cells = monthGrid(visible.year, visible.month);
  const { startDate, endDate } = value;
  const rangeEnd = mode === 'range' ? endDate : null;

  function selectDate(date: TravelDate) {
    if (minDate !== undefined && date < minDate) return;

    if (mode === 'single') {
      onChange({ startDate: date, endDate: date });
      return;
    }

    if (activeEnd === 'start') {
      // Moving the start past the end collapses the range onto that one day
      // rather than leaving an inverted one behind.
      onChange({
        startDate: date,
        endDate: rangeEnd === null || rangeEnd < date ? date : rangeEnd,
      });
      return;
    }

    // Picking an "end" before the start reads as re-picking the start.
    if (startDate === null || date < startDate) {
      onChange({ startDate: date, endDate: startDate ?? date });
      return;
    }

    onChange({ startDate, endDate: date });
  }

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="上一个月"
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={() => setVisible(({ month, year }) => addMonths(year, month, -1))}
          testID={`${testID}-prev`}
        >
          <Text style={styles.headerAction}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} testID={`${testID}-month`}>
          {visible.year}年{visible.month}月
        </Text>
        <Pressable
          accessibilityLabel="下一个月"
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={() => setVisible(({ month, year }) => addMonths(year, month, 1))}
          testID={`${testID}-next`}
        >
          <Text style={styles.headerAction}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdays}>
        {WEEKDAY_HEADING_LABELS.map((label) => (
          <View key={label} style={styles.cell}>
            <Text style={styles.weekdayText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: cells.length / 7 }, (_, week) => (
          <View key={week} style={styles.week}>
            {cells.slice(week * 7, week * 7 + 7).map((date, day) =>
              date === null ? (
                <View key={day} style={styles.cell} />
              ) : (
                <CalendarDay
                  date={date}
                  endDate={rangeEnd}
                  isDisabled={minDate !== undefined && date < minDate}
                  key={date}
                  onPress={selectDate}
                  startDate={startDate}
                  testID={testID}
                />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function CalendarDay({
  date,
  startDate,
  endDate,
  isDisabled,
  onPress,
  testID,
}: {
  date: TravelDate;
  startDate: TravelDate | null;
  endDate: TravelDate | null;
  isDisabled: boolean;
  onPress: (date: TravelDate) => void;
  testID: string;
}) {
  const isEndpoint = date === startDate || date === endDate;
  const isInRange =
    startDate !== null &&
    endDate !== null &&
    date > startDate &&
    date < endDate;

  return (
    <Pressable
      accessibilityLabel={date}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, selected: isEndpoint }}
      disabled={isDisabled}
      onPress={() => onPress(date)}
      style={[styles.cell, isInRange ? styles.inRange : null]}
      testID={`${testID}-day-${date}`}
    >
      <View style={[styles.dayBadge, isEndpoint ? styles.dayBadgeSelected : null]}>
        <Text
          style={[
            styles.dayText,
            isDisabled ? styles.dayTextDisabled : null,
            isEndpoint ? styles.dayTextSelected : null,
          ]}
        >
          {travelDateParts(date).day}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    aspectRatio: 1,
    flex: 1,
    justifyContent: 'center',
  },
  container: { gap: spacing.sm },
  dayBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  dayBadgeSelected: { backgroundColor: colors.accentStrong },
  dayText: { color: colors.text, fontSize: 15 },
  dayTextDisabled: { color: colors.textDisabled },
  dayTextSelected: { color: colors.onPrimary, fontWeight: '600' },
  grid: { gap: 2 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerAction: { color: colors.primary, fontSize: 22, fontWeight: '600' },
  headerTitle: { ...typography.label, color: colors.text, fontSize: 15 },
  inRange: { backgroundColor: colors.accentSoft },
  weekdayText: { ...typography.micro, color: colors.textSubtle },
  weekdays: { flexDirection: 'row' },
  week: { flexDirection: 'row' },
});
