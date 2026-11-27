import { expect, test } from '@jest/globals';

import { buildTimelineProjection } from '@/application/projections/timeline';
import type { Item } from '@/domain/item/types';
import type { DayViewData } from '@/application/queries/day-view';

const timestamp = '2026-09-11T12:00:00.000Z';
const trip = {
  id: 'trip-1',
  title: 'Hokkaido',
  startDate: '2026-12-30',
  endDate: '2026-12-31',
  mapRegion: 'global' as const,
  note: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const day = {
  id: 'day-1',
  tripId: trip.id,
  date: trip.startDate,
  dayIndex: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function baseItem(overrides: Partial<Item>): Item {
  return {
    id: 'item-1',
    tripId: trip.id,
    dayId: day.id,
    placeId: null,
    type: 'custom',
    title: 'Item',
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
    ...overrides,
  };
}

test('projects the complete ordered Item list and independent time semantics', () => {
  const data: DayViewData = {
    trip,
    day,
    placesById: {},
    items: [
      baseItem({
        id: 'item-period',
        title: 'Museum',
        sortOrder: 1,
        timeMode: 'period',
        period: 'afternoon',
      }),
      baseItem({
        id: 'item-exact',
        title: 'Train',
        type: 'transport',
        sortOrder: 2,
        timeMode: 'exact',
        startDateTime: '2026-12-30T18:00',
        endDateTime: '2026-12-30T19:00',
        note: 'Reserved',
      }),
      baseItem({ id: 'item-none', title: 'Walk', sortOrder: 3 }),
    ],
  };

  expect(buildTimelineProjection(data)).toEqual({
    dayId: day.id,
    items: [
      {
        id: 'item-period',
        title: 'Museum',
        type: 'custom',
        typeLabel: '其他',
        time: { mode: 'period', period: 'afternoon' },
        note: null,
        placeName: null,
      },
      {
        id: 'item-exact',
        title: 'Train',
        type: 'transport',
        typeLabel: '交通',
        time: {
          mode: 'exact',
          startDateTime: '2026-12-30T18:00',
          endDateTime: '2026-12-30T19:00',
        },
        note: 'Reserved',
        placeName: null,
      },
      {
        id: 'item-none',
        title: 'Walk',
        type: 'custom',
        typeLabel: '其他',
        time: { mode: 'none' },
        note: null,
        placeName: null,
      },
    ],
  });
});

test('projects an arrival-only exact Item without inventing a departure', () => {
  const data: DayViewData = {
    trip,
    day,
    placesById: {},
    items: [baseItem({
      id: 'arrival-only',
      type: 'transport',
      timeMode: 'exact',
      startDateTime: null,
      endDateTime: '2026-12-30T19:20',
    })],
  };

  expect(buildTimelineProjection(data).items[0].time).toEqual({
    mode: 'exact',
    startDateTime: null,
    endDateTime: '2026-12-30T19:20',
  });
});

test('carries the saved Place name, and only for an Item that has one', () => {
  const data: DayViewData = {
    trip,
    day,
    placesById: {
      'place-1': {
        id: 'place-1',
        name: '西谷国家湿地公园',
        coordinate: { latitude: 40.36, longitude: 106.415, system: 'gcj02' },
        address: null,
        provider: 'amap',
        providerPlaceId: null,
        metadata: null,
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
      },
    },
    items: [
      baseItem({ id: 'item-placed', title: '湿地', placeId: 'place-1' }),
      baseItem({ id: 'item-orphan', title: '取车', placeId: 'place-missing' }),
    ],
  };

  const items = buildTimelineProjection(data).items;
  expect(items[0].placeName).toBe('西谷国家湿地公园');
  // A dangling reference degrades to "no Place" instead of throwing.
  expect(items[1].placeName).toBeNull();
});

test('projects a custom Item label separately from its title', () => {
  const data: DayViewData = {
    trip,
    day,
    placesById: {},
    items: [baseItem({
      title: '自由活动',
      payload: { kind: 'custom', label: '  拍照  ' },
    })],
  };

  expect(buildTimelineProjection(data).items[0]).toEqual(expect.objectContaining({
    title: '自由活动',
    typeLabel: '拍照',
  }));
});

test('does not invent a timeline row for invalid exact-time state', () => {
  const data: DayViewData = {
    trip,
    day,
    placesById: {},
    items: [baseItem({ timeMode: 'exact' })],
  };

  expect(() => buildTimelineProjection(data)).toThrow(
    'Exact-time Item is missing startDateTime and endDateTime: item-1',
  );
});
