import { expect, jest, test } from '@jest/globals';

import {
  getUnscheduledItems,
  getUnscheduledItemsFromContext,
  type UnscheduledQuerySource,
} from '@/application/queries/unscheduled';
import { unscheduledKeys } from '@/application/queries/query-keys';
import type { Item } from '@/domain/item/types';

const item: Item = {
  id: 'item-1',
  tripId: 'trip-1',
  dayId: null,
  placeId: null,
  type: 'custom',
  title: 'Maybe visit',
  sortOrder: 0,
  timeMode: 'none',
  startDateTime: null,
  endDateTime: null,
  period: null,
  isFixed: false,
  note: null,
  payload: null,
  createdAt: '2026-09-11T12:00:00.000Z',
  updatedAt: '2026-09-11T12:00:00.000Z',
};

test('delegates the Trip-scoped Unscheduled read', async () => {
  const source: UnscheduledQuerySource = {
    getUnscheduledItems: jest.fn(async () => [item]),
  };

  await expect(getUnscheduledItems(source, item.tripId)).resolves.toEqual([item]);
  expect(source.getUnscheduledItems).toHaveBeenCalledWith(item.tripId);
  await expect(
    getUnscheduledItemsFromContext(item.tripId, {
      items: { listUnscheduledByTripId: async () => [item] },
    }),
  ).resolves.toEqual([item]);
});

test('uses a Trip-scoped Unscheduled query key', () => {
  expect(unscheduledKeys.byTrip('trip-1')).toEqual([
    'trips',
    'trip-1',
    'unscheduled',
  ]);
});
