import { expect, test } from '@jest/globals';

import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';
import {
  hotelContextForDay,
  hotelContextsByDayId,
} from '@/application/projections/hotel-context';

const days: Day[] = [
  { id: 'day-1', tripId: 'trip-1', date: '2026-03-22', dayIndex: 1, createdAt: 't', updatedAt: 't' },
  { id: 'day-2', tripId: 'trip-1', date: '2026-03-23', dayIndex: 2, createdAt: 't', updatedAt: 't' },
  { id: 'day-3', tripId: 'trip-1', date: '2026-03-24', dayIndex: 3, createdAt: 't', updatedAt: 't' },
  { id: 'day-4', tripId: 'trip-1', date: '2026-03-25', dayIndex: 4, createdAt: 't', updatedAt: 't' },
];

function hotel(overrides: Partial<Item>): Item {
  return {
    id: 'hotel-1',
    tripId: 'trip-1',
    dayId: 'day-2',
    placeId: null,
    type: 'hotel',
    title: '北山酒店',
    sortOrder: 0,
    timeMode: 'exact',
    startDateTime: '2026-03-23T19:00',
    endDateTime: '2026-03-25T08:30',
    period: null,
    isFixed: false,
    note: null,
    payload: { kind: 'hotel' },
    createdAt: 't',
    updatedAt: 't',
    ...overrides,
  };
}

function plainDay(date: string) {
  return { id: `target-${date}`, date };
}

test('the checkout Day shows the checkout card with the canonical end time', () => {
  expect(hotelContextForDay(plainDay('2026-03-25'), days, [hotel({})])).toEqual({
    kind: 'checkout',
    title: '北山酒店',
    checkOutTime: '08:30',
  });
});

test('intermediate nights show the stay card and the check-in Day shows nothing', () => {
  expect(hotelContextForDay(plainDay('2026-03-24'), days, [hotel({})])).toEqual({
    kind: 'stay',
    title: '北山酒店',
  });
  // The Hotel itself is a Timeline row on its check-in Day.
  expect(hotelContextForDay(plainDay('2026-03-23'), days, [hotel({})])).toBeNull();
});

test('a Hotel without a canonical checkout end yields no context', () => {
  expect(
    hotelContextForDay(plainDay('2026-03-24'), days, [hotel({ endDateTime: null })]),
  ).toBeNull();
});

test('an inverted or same-day stay yields no context', () => {
  expect(
    hotelContextForDay(plainDay('2026-03-24'), days, [
      hotel({ startDateTime: '2026-03-25T19:00', endDateTime: '2026-03-24T08:30' }),
    ]),
  ).toBeNull();
  expect(
    hotelContextForDay(plainDay('2026-03-24'), days, [
      hotel({ startDateTime: '2026-03-24T19:00', endDateTime: '2026-03-24T23:00' }),
    ]),
  ).toBeNull();
});

test('a missing exact check-in falls back to the Hotel primary Day date', () => {
  expect(
    hotelContextForDay(plainDay('2026-03-24'), days, [
      hotel({ startDateTime: null, timeMode: 'none' }),
    ]),
  ).toEqual({ kind: 'stay', title: '北山酒店' });
});

test('the first Hotel by collection order wins', () => {
  const items = [
    hotel({ id: 'second', title: '另一家酒店', sortOrder: 1 }),
    hotel({ id: 'first', title: '北山酒店', sortOrder: 0 }),
  ];
  expect(hotelContextForDay(plainDay('2026-03-24'), days, items)).toEqual({
    kind: 'stay',
    title: '北山酒店',
  });
});

test('hotelContextsByDayId resolves every Day in one pass', () => {
  const contexts = hotelContextsByDayId(days, [hotel({})]);
  // Days without a card are simply absent from the map.
  expect(contexts.has('day-1')).toBe(false);
  expect(contexts.get('day-2')).toBeUndefined();
  expect(contexts.get('day-3')).toEqual({ kind: 'stay', title: '北山酒店' });
  expect(contexts.get('day-4')).toEqual({
    kind: 'checkout',
    title: '北山酒店',
    checkOutTime: '08:30',
  });
});
