import { expect, test } from '@jest/globals';

import { previewTripDateRangeChange } from '@/application/trip/trip-date-change-preview';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';

const timestamp = '2026-09-11T12:00:00.000Z';
const dayDates = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'];
const days: Day[] = dayDates.map((date, index) => ({
  id: `day-${index + 1}`,
  tripId: 'trip-1',
  date,
  dayIndex: index + 1,
  createdAt: timestamp,
  updatedAt: timestamp,
}));

function item(id: string, dayId: string): Item {
  return {
    id,
    tripId: 'trip-1',
    dayId,
    placeId: null,
    type: 'custom',
    title: id,
    sortOrder: 0,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const itemsByDayId = new Map([
  ['day-1', [item('a', 'day-1')]],
  ['day-4', [item('b', 'day-4'), item('c', 'day-4')]],
  ['day-5', [item('d', 'day-5')]],
]);

test('shiftItems reports the whole-trip delta and touches no Day', () => {
  const preview = previewTripDateRangeChange({
    days,
    endDate: '2026-09-24',
    itemsByDayId,
    startDate: '2026-09-20',
    strategy: 'shiftItems',
  });

  expect(preview).toEqual({
    removedDays: [],
    addedDates: [],
    affectedItemCount: 0,
    lengthDelta: 0,
    dayDelta: 2,
    isUnchanged: false,
  });
});

test('shortening the range lists the Days that disappear and the Items they hold', () => {
  const preview = previewTripDateRangeChange({
    days,
    endDate: '2026-09-20',
    itemsByDayId,
    startDate: '2026-09-18',
    strategy: 'keepCalendarDates',
  });

  expect(preview.removedDays).toEqual([
    { dayIndex: 4, date: '2026-09-21', itemCount: 2 },
    { dayIndex: 5, date: '2026-09-22', itemCount: 1 },
  ]);
  expect(preview.addedDates).toEqual([]);
  expect(preview.affectedItemCount).toBe(3);
  expect(preview.lengthDelta).toBe(-2);
  expect(preview.dayDelta).toBe(0);
  expect(preview.isUnchanged).toBe(false);
});

test('extending the range only adds empty Days', () => {
  const preview = previewTripDateRangeChange({
    days,
    endDate: '2026-09-24',
    itemsByDayId,
    startDate: '2026-09-18',
    strategy: 'keepCalendarDates',
  });

  expect(preview.removedDays).toEqual([]);
  expect(preview.addedDates).toEqual(['2026-09-23', '2026-09-24']);
  expect(preview.affectedItemCount).toBe(0);
  expect(preview.lengthDelta).toBe(2);
});

test('starting earlier adds Days at the head without re-dating existing ones', () => {
  const preview = previewTripDateRangeChange({
    days,
    endDate: '2026-09-22',
    itemsByDayId,
    startDate: '2026-09-16',
    strategy: 'keepCalendarDates',
  });

  expect(preview.addedDates).toEqual(['2026-09-16', '2026-09-17']);
  expect(preview.removedDays).toEqual([]);
  expect(preview.lengthDelta).toBe(2);
});

test('an identical range reports no impact at all', () => {
  const preview = previewTripDateRangeChange({
    days,
    endDate: '2026-09-22',
    itemsByDayId,
    startDate: '2026-09-18',
    strategy: 'keepCalendarDates',
  });

  expect(preview).toEqual({
    removedDays: [],
    addedDates: [],
    affectedItemCount: 0,
    lengthDelta: 0,
    dayDelta: 0,
    isUnchanged: true,
  });
});
