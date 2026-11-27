import type { EntityId, TravelDate } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import {
  deriveInclusiveTravelDateRange,
  differenceInTravelDays,
} from '@/domain/trip/date-range';
import type { Day } from '@/domain/trip/types';
import type { ChangeTripDateRangeStrategy } from './change-trip-date-range';

export interface TripDateChangeDayImpact {
  dayIndex: number;
  date: TravelDate;
  itemCount: number;
}

export interface TripDateChangePreview {
  /** Days the new range no longer covers; their Items move to Unscheduled. */
  removedDays: TripDateChangeDayImpact[];
  /** Dates the new range adds; they arrive as empty Days. */
  addedDates: TravelDate[];
  /** Items that leave a Day for Unscheduled because their Day disappears. */
  affectedItemCount: number;
  /** Signed change in Trip length; 0 when the range is unchanged. */
  lengthDelta: number;
  /** Signed shift applied to every Day and scheduled Item under `shiftItems`. */
  dayDelta: number;
  isUnchanged: boolean;
}

export interface TripDateChangePreviewInput {
  startDate: TravelDate;
  endDate: TravelDate;
  strategy: ChangeTripDateRangeStrategy;
  days: readonly Day[];
  /** Items already scheduled, keyed by Day; Unscheduled Items never move here. */
  itemsByDayId: ReadonlyMap<EntityId, readonly Item[]>;
}

/**
 * Describes what a Trip date change will do *before* it is saved.
 *
 * This is the same arithmetic the command performs, kept side-effect free so the
 * confirmation copy cannot drift from the write. It never reads Unscheduled
 * Items: no date-range change re-dates or re-homes them.
 */
export function previewTripDateRangeChange(
  input: TripDateChangePreviewInput,
): TripDateChangePreview {
  const nextDates = deriveInclusiveTravelDateRange(input.startDate, input.endDate);
  const nextDateSet = new Set(nextDates.map(({ date }) => date));
  const existingDateSet = new Set(input.days.map(({ date }) => date));
  const isUnchanged =
    input.days.length === nextDates.length &&
    input.days.every((day, index) => day.date === nextDates[index]?.date);

  if (input.strategy === 'shiftItems') {
    const dayDelta =
      input.days.length === 0
        ? 0
        : differenceInTravelDays(input.days[0].date, input.startDate);

    return {
      removedDays: [],
      addedDates: [],
      affectedItemCount: 0,
      lengthDelta: nextDates.length - input.days.length,
      dayDelta,
      isUnchanged,
    };
  }

  const removedDays = input.days
    .filter((day) => !nextDateSet.has(day.date))
    .map((day) => ({
      dayIndex: day.dayIndex,
      date: day.date,
      itemCount: (input.itemsByDayId.get(day.id) ?? []).length,
    }));
  const addedDates = nextDates
    .map(({ date }) => date)
    .filter((date) => !existingDateSet.has(date));

  return {
    removedDays,
    addedDates,
    affectedItemCount: removedDays.reduce((total, day) => total + day.itemCount, 0),
    lengthDelta: nextDates.length - input.days.length,
    dayDelta: 0,
    isUnchanged,
  };
}
