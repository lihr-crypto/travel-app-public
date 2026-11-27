import { expect, test } from '@jest/globals';

import type { Item } from '@/domain/item/types';
import type { Trip } from '@/domain/trip/types';
import {
  endBeforeStartIssues,
  fixedItemTimeConflictIssues,
  validateTrip,
} from '@/application/trip/validate-trip';
import { itemOutsideTripRangeIssues } from '@/application/trip/item-range-issues';
import {
  buildValidationIssueRows,
  describeValidationIssue,
} from '@/application/trip/validation-issue-presentation';

const trip: Trip = {
  id: 'trip-1',
  title: 'Trip',
  startDate: '2026-09-19',
  endDate: '2026-09-20',
  mapRegion: 'global',
  note: null,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
};

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    tripId: trip.id,
    dayId: 'day-1',
    placeId: null,
    type: 'custom',
    title: overrides.id,
    sortOrder: 0,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: null,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    ...overrides,
  };
}

test('warns when an exact Item ends before it starts', () => {
  const items = [
    item({
      id: 'inverted',
      timeMode: 'exact',
      startDateTime: '2026-09-19T10:00',
      endDateTime: '2026-09-19T09:00',
    }),
    item({
      id: 'inverted-across-midnight',
      timeMode: 'exact',
      startDateTime: '2026-09-19T23:00',
      endDateTime: '2026-09-19T22:00',
    }),
    item({
      id: 'fine',
      timeMode: 'exact',
      startDateTime: '2026-09-19T09:00',
      endDateTime: '2026-09-19T10:00',
    }),
    item({
      id: 'touching',
      timeMode: 'exact',
      startDateTime: '2026-09-19T10:00',
      endDateTime: '2026-09-19T10:00',
    }),
    item({ id: 'untimed' }),
    item({
      id: 'missing-end',
      timeMode: 'exact',
      startDateTime: '2026-09-19T09:00',
    }),
  ];

  expect(endBeforeStartIssues(trip, items).map(({ itemId }) => itemId)).toEqual([
    'inverted',
    'inverted-across-midnight',
  ]);
});

test('warns only for overlapping fixed Items of the same Day', () => {
  const items = [
    item({
      id: 'fixed-a',
      isFixed: true,
      timeMode: 'exact',
      sortOrder: 0,
      startDateTime: '2026-09-19T09:00',
      endDateTime: '2026-09-19T11:00',
    }),
    item({
      id: 'fixed-b',
      isFixed: true,
      timeMode: 'exact',
      sortOrder: 1,
      startDateTime: '2026-09-19T10:00',
      endDateTime: '2026-09-19T10:30',
    }),
    item({
      id: 'fixed-c',
      isFixed: true,
      timeMode: 'exact',
      sortOrder: 2,
      startDateTime: '2026-09-19T11:00',
      endDateTime: '2026-09-19T12:00',
    }),
    item({
      id: 'flexible',
      timeMode: 'exact',
      sortOrder: 3,
      startDateTime: '2026-09-19T09:30',
      endDateTime: '2026-09-19T10:30',
    }),
    item({
      id: 'other-day',
      dayId: 'day-2',
      isFixed: true,
      timeMode: 'exact',
      sortOrder: 4,
      startDateTime: '2026-09-19T09:30',
      endDateTime: '2026-09-19T10:30',
    }),
  ];

  // A–B overlap; A–C merely touch at 11:00; B–C do not reach each other.
  const issues = fixedItemTimeConflictIssues(trip, items);
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({
    id: 'fixed-item-time-conflict:fixed-a:fixed-b',
    itemId: 'fixed-a',
    type: 'FIXED_ITEM_TIME_CONFLICT',
    severity: 'warning',
  });
});

test('a fixed instant only conflicts when it sits strictly inside a window', () => {
  const items = [
    item({
      id: 'instant',
      isFixed: true,
      timeMode: 'exact',
      startDateTime: '2026-09-19T10:00',
    }),
    item({
      id: 'window',
      isFixed: true,
      timeMode: 'exact',
      sortOrder: 1,
      startDateTime: '2026-09-19T09:00',
      endDateTime: '2026-09-19T11:00',
    }),
    item({
      id: 'edge',
      isFixed: true,
      timeMode: 'exact',
      sortOrder: 2,
      startDateTime: '2026-09-19T11:00',
    }),
  ];

  expect(fixedItemTimeConflictIssues(trip, items).map(({ itemId }) => itemId))
    .toEqual(['instant']);
});

test('uses an arrival-only endpoint for range warnings and fixed conflicts', () => {
  const arrivalOnly = item({
    id: 'arrival-only',
    isFixed: true,
    timeMode: 'exact',
    startDateTime: null,
    endDateTime: '2026-10-01T10:00',
  });
  const fixedWindow = item({
    id: 'fixed-window',
    isFixed: true,
    timeMode: 'exact',
    sortOrder: 1,
    startDateTime: '2026-09-19T09:00',
    endDateTime: '2026-09-19T11:00',
  });

  expect(itemOutsideTripRangeIssues(trip, [arrivalOnly])).toHaveLength(1);
  expect(fixedItemTimeConflictIssues(trip, [
    { ...arrivalOnly, endDateTime: '2026-09-19T10:00' },
    fixedWindow,
  ]).map(({ itemId }) => itemId)).toEqual(['arrival-only']);
});

test('a Hotel with an inverted stay warns once, through the dedicated issue', () => {
  const items = [
    item({
      id: 'inverted-hotel',
      type: 'hotel',
      timeMode: 'exact',
      startDateTime: '2026-09-20T19:00',
      endDateTime: '2026-09-20T08:30',
    }),
    item({
      id: 'inverted-transport',
      type: 'transport',
      timeMode: 'exact',
      startDateTime: '2026-09-20T19:00',
      endDateTime: '2026-09-20T08:30',
    }),
  ];
  expect(validateTrip({ trip, items }).map(({ type }) => type)).toEqual([
    'END_BEFORE_START',
    'HOTEL_CHECKOUT_BEFORE_CHECKIN',
  ]);
  expect(validateTrip({ trip, items }).map(({ itemId }) => itemId)).toEqual([
    'inverted-transport',
    'inverted-hotel',
  ]);
});

test('validateTrip composes every V1 issue type and stays quiet on a clean Trip', () => {
  const clean = [item({ id: 'plain' })];
  expect(validateTrip({ trip, items: clean })).toEqual([]);

  const messy = [
    item({
      id: 'outside',
      timeMode: 'exact',
      startDateTime: '2026-10-01T09:00',
      endDateTime: '2026-10-01T10:00',
    }),
    item({
      id: 'inverted',
      timeMode: 'exact',
      startDateTime: '2026-09-19T15:00',
      endDateTime: '2026-09-19T14:00',
    }),
    item({
      id: 'fixed-a',
      isFixed: true,
      timeMode: 'exact',
      sortOrder: 0,
      startDateTime: '2026-09-19T09:00',
      endDateTime: '2026-09-19T10:00',
    }),
    item({
      id: 'fixed-b',
      isFixed: true,
      timeMode: 'exact',
      sortOrder: 1,
      startDateTime: '2026-09-19T09:30',
      endDateTime: '2026-09-19T10:30',
    }),
  ];
  expect(validateTrip({ trip, items: messy }).map(({ type }) => type)).toEqual([
    'ITEM_OUTSIDE_TRIP_RANGE',
    'END_BEFORE_START',
    'FIXED_ITEM_TIME_CONFLICT',
  ]);
});

test('rows carry the Item title, the type copy and stay neutral without one', () => {
  const issues = validateTrip({
    trip,
    items: [
      item({
        id: 'inverted',
        title: '取车',
        timeMode: 'exact',
        startDateTime: '2026-09-19T15:00',
        endDateTime: '2026-09-19T14:00',
      }),
    ],
  });
  const itemsById = new Map([['inverted', item({ id: 'inverted', title: '取车' })]]);
  const rows = buildValidationIssueRows(issues, itemsById);
  expect(rows).toEqual([
    {
      issue: expect.objectContaining({ type: 'END_BEFORE_START' }),
      title: '取车',
      message: '结束时间早于开始时间',
    },
  ]);

  const orphan = buildValidationIssueRows(
    [{ ...issues[0], itemId: 'ghost', type: 'MYSTERY_TYPE' }],
    itemsById,
  );
  expect(orphan[0]).toMatchObject({ title: '行程项', message: '行程时间需要确认' });
  expect(describeValidationIssue(issues[0])).toBe('结束时间早于开始时间');
});
