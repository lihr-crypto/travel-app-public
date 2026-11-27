import type { TravelDate } from '@/domain/common/types';

export interface DerivedTripDay {
  date: TravelDate;
  dayIndex: number;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const TRAVEL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseTravelDate(value: TravelDate): CalendarDate {
  const match = TRAVEL_DATE_PATTERN.exec(value);

  if (!match) {
    throw new RangeError(`Invalid TravelDate: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new RangeError(`Invalid TravelDate: ${value}`);
  }

  return { day, month, year };
}

function formatTravelDate(value: CalendarDate): TravelDate {
  return [
    String(value.year).padStart(4, '0'),
    String(value.month).padStart(2, '0'),
    String(value.day).padStart(2, '0'),
  ].join('-');
}

function nextCalendarDate(value: CalendarDate): CalendarDate {
  if (value.day < daysInMonth(value.year, value.month)) {
    return { ...value, day: value.day + 1 };
  }

  if (value.month < 12) {
    return { day: 1, month: value.month + 1, year: value.year };
  }

  if (value.year === 9999) {
    throw new RangeError('TravelDate range exceeds 9999-12-31');
  }

  return { day: 1, month: 1, year: value.year + 1 };
}

function previousCalendarDate(value: CalendarDate): CalendarDate {
  if (value.day > 1) {
    return { ...value, day: value.day - 1 };
  }

  if (value.month > 1) {
    const month = value.month - 1;
    return {
      day: daysInMonth(value.year, month),
      month,
      year: value.year,
    };
  }

  if (value.year === 1) {
    throw new RangeError('TravelDate range precedes 0001-01-01');
  }

  return { day: 31, month: 12, year: value.year - 1 };
}

function calendarOrdinal(value: CalendarDate) {
  const previousYear = value.year - 1;
  let ordinal =
    previousYear * 365 +
    Math.floor(previousYear / 4) -
    Math.floor(previousYear / 100) +
    Math.floor(previousYear / 400) +
    value.day;

  for (let month = 1; month < value.month; month += 1) {
    ordinal += daysInMonth(value.year, month);
  }

  return ordinal;
}

export function differenceInTravelDays(
  startDate: TravelDate,
  endDate: TravelDate,
) {
  return calendarOrdinal(parseTravelDate(endDate)) -
    calendarOrdinal(parseTravelDate(startDate));
}

/**
 * Monday-first weekday index: 0 = Monday … 6 = Sunday.
 *
 * Derived from the same proleptic-Gregorian ordinal the range maths uses, so a
 * date never lands on a different weekday because the device is in another
 * timezone or another calendar (the UI must stay Gregorian, never Reiwa).
 */
export function weekdayOfTravelDate(date: TravelDate): number {
  return (calendarOrdinal(parseTravelDate(date)) - 1) % 7;
}

export interface TravelDateParts {
  year: number;
  month: number;
  day: number;
}

export function travelDateParts(date: TravelDate): TravelDateParts {
  return parseTravelDate(date);
}

export function travelDateFromParts(parts: TravelDateParts): TravelDate {
  return formatTravelDate(parts);
}

/** Day count of a Gregorian month; used to lay out the date Calendar. */
export function daysInTravelMonth(year: number, month: number): number {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999) {
    throw new RangeError(`Invalid TravelDate year: ${year}`);
  }

  if (!Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid TravelDate month: ${month}`);
  }

  return daysInMonth(year, month);
}

export function shiftTravelDate(
  date: TravelDate,
  dayDelta: number,
): TravelDate {
  if (!Number.isSafeInteger(dayDelta)) {
    throw new RangeError(`Invalid calendar day delta: ${dayDelta}`);
  }

  let value = parseTravelDate(date);
  const step = dayDelta < 0 ? previousCalendarDate : nextCalendarDate;

  for (let remaining = Math.abs(dayDelta); remaining > 0; remaining -= 1) {
    value = step(value);
  }

  return formatTravelDate(value);
}

/**
 * Derives every calendar day in an inclusive Trip range.
 *
 * Date-only strings are parsed and advanced as calendar values without a
 * JavaScript Date conversion, so the result cannot drift with device timezone.
 */
export function deriveInclusiveTravelDateRange(
  startDate: TravelDate,
  endDate: TravelDate,
): DerivedTripDay[] {
  let current = parseTravelDate(startDate);
  parseTravelDate(endDate);

  if (endDate < startDate) {
    throw new RangeError('Trip endDate must be on or after startDate');
  }

  const days: DerivedTripDay[] = [];

  while (true) {
    const date = formatTravelDate(current);
    days.push({ date, dayIndex: days.length + 1 });

    if (date === endDate) {
      return days;
    }

    current = nextCalendarDate(current);
  }
}
