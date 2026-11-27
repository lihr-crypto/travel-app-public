import { afterEach, expect, test } from '@jest/globals';

import {
  daysInTravelMonth,
  deriveInclusiveTravelDateRange,
  differenceInTravelDays,
  shiftTravelDate,
  travelDateFromParts,
  travelDateParts,
  weekdayOfTravelDate,
} from '@/domain/trip/date-range';

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimezone;
  }
});

test('derives a one-day inclusive range with a 1-based dayIndex', () => {
  expect(
    deriveInclusiveTravelDateRange('2026-09-19', '2026-09-19'),
  ).toEqual([{ date: '2026-09-19', dayIndex: 1 }]);
});

test('includes every day through the end of a multi-day range', () => {
  expect(
    deriveInclusiveTravelDateRange('2026-09-19', '2026-09-21'),
  ).toEqual([
    { date: '2026-09-19', dayIndex: 1 },
    { date: '2026-09-20', dayIndex: 2 },
    { date: '2026-09-21', dayIndex: 3 },
  ]);
});

test('rejects an end date before the start date', () => {
  expect(() =>
    deriveInclusiveTravelDateRange('2026-09-21', '2026-09-19'),
  ).toThrow('Trip endDate must be on or after startDate');
});

test('advances across month boundaries, including leap day', () => {
  expect(
    deriveInclusiveTravelDateRange('2028-02-28', '2028-03-01'),
  ).toEqual([
    { date: '2028-02-28', dayIndex: 1 },
    { date: '2028-02-29', dayIndex: 2 },
    { date: '2028-03-01', dayIndex: 3 },
  ]);
});

test('advances across a year boundary', () => {
  expect(
    deriveInclusiveTravelDateRange('2026-12-31', '2027-01-01'),
  ).toEqual([
    { date: '2026-12-31', dayIndex: 1 },
    { date: '2027-01-01', dayIndex: 2 },
  ]);
});

test('does not change when the device timezone changes', () => {
  process.env.TZ = 'Pacific/Kiritimati';
  const aheadOfUtc = deriveInclusiveTravelDateRange(
    '2026-03-08',
    '2026-03-10',
  );

  process.env.TZ = 'America/Los_Angeles';
  const behindUtc = deriveInclusiveTravelDateRange(
    '2026-03-08',
    '2026-03-10',
  );

  expect(behindUtc).toEqual(aheadOfUtc);
});

test.each(['2026-02-29', '2026-13-01', '2026-9-01', 'not-a-date'])(
  'rejects invalid or non-canonical TravelDate %s',
  (date) => {
    expect(() => deriveInclusiveTravelDateRange(date, date)).toThrow(
      `Invalid TravelDate: ${date}`,
    );
  },
);

test('computes signed calendar-day differences across a year boundary', () => {
  expect(differenceInTravelDays('2026-12-31', '2027-01-02')).toBe(2);
  expect(differenceInTravelDays('2027-01-02', '2026-12-31')).toBe(-2);
});

test('shifts dates forward and backward without timezone conversion', () => {
  expect(shiftTravelDate('2028-02-28', 2)).toBe('2028-03-01');
  expect(shiftTravelDate('2027-01-01', -1)).toBe('2026-12-31');
  expect(shiftTravelDate('2026-09-19', 0)).toBe('2026-09-19');
});

test('derives a Monday-first weekday index from the Gregorian date alone', () => {
  expect(weekdayOfTravelDate('2026-09-18')).toBe(4);
  expect(weekdayOfTravelDate('2026-09-19')).toBe(5);
  expect(weekdayOfTravelDate('2026-09-20')).toBe(6);
  expect(weekdayOfTravelDate('2026-09-21')).toBe(0);
  expect(weekdayOfTravelDate('2026-09-28')).toBe(0);
  expect(weekdayOfTravelDate('2026-01-01')).toBe(3);
});

test('reports the Gregorian day count of a month, including leap February', () => {
  expect(daysInTravelMonth(2026, 9)).toBe(30);
  expect(daysInTravelMonth(2026, 2)).toBe(28);
  expect(daysInTravelMonth(2028, 2)).toBe(29);
  expect(daysInTravelMonth(2000, 2)).toBe(29);
  expect(() => daysInTravelMonth(2026, 13)).toThrow('Invalid TravelDate month: 13');
  expect(() => daysInTravelMonth(0, 1)).toThrow('Invalid TravelDate year: 0');
});

test('round-trips date parts without a timezone conversion', () => {
  expect(travelDateParts('2026-09-18')).toEqual({ year: 2026, month: 9, day: 18 });
  expect(travelDateFromParts({ year: 2026, month: 9, day: 18 })).toBe('2026-09-18');
});
