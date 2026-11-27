import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import type { MoveItemToDayCommand } from '@/application/item/move-item-to-day';
import { unscheduledKeys } from '@/application/queries/query-keys';
import { UnscheduledWorkspace } from '@/components/unscheduled-workspace';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';
import { tripFocusStore } from '@/state/trip-focus';
import { SafeAreaTestProvider } from '../helpers/safe-area';

const timestamp = '2026-09-14T00:00:00.000Z';

const queryClients: QueryClient[] = [];
const renderers: ReturnType<typeof create>[] = [];

afterEach(() => {
  act(() => { for (const renderer of renderers.splice(0)) renderer.unmount(); });
  for (const client of queryClients.splice(0)) client.clear();
});

const day1: Day = {
  id: 'day-1', tripId: 'trip-1', date: '2026-09-20', dayIndex: 1,
  createdAt: timestamp, updatedAt: timestamp,
};
const day2: Day = {
  id: 'day-2', tripId: 'trip-1', date: '2026-09-21', dayIndex: 2,
  createdAt: timestamp, updatedAt: timestamp,
};

function unscheduledItem(id = 'item-1', title = '移出的行程'): Item {
  return {
    id,
    tripId: 'trip-1',
    dayId: null,
    placeId: null,
    type: 'custom',
    title,
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

async function renderWorkspace(
  items: Item[],
  options: {
    moveItemToDayCommand?: MoveItemToDayCommand;
    onItemMoved?: (dayId: string) => void;
    days?: readonly Day[];
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClients.push(queryClient);
  queryClient.setQueryData(unscheduledKeys.byTrip('trip-1'), items);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <SafeAreaTestProvider>
          <UnscheduledWorkspace
            days={options.days ?? [day1, day2]}
            moveItemToDayCommand={options.moveItemToDayCommand}
            onItemMoved={options.onItemMoved}
            source={{ getUnscheduledItems: async () => items }}
            tripId="trip-1"
          />
        </SafeAreaTestProvider>
      </QueryClientProvider>,
    );
  });
  renderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  act(() => {
    tripFocusStore.setState({
      tripId: 'trip-1',
      focus: { type: 'unscheduled' },
      sheetSnap: 'half',
    });
  });
});

test('shows the Items that were taken out of a Day', async () => {
  const renderer = await renderWorkspace([unscheduledItem()]);

  expect(renderer.root.findByProps({ testID: 'unscheduled-workspace' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'unscheduled-item-item-1' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('移出的行程');
});

test('offers no move control when no move-back command is wired', async () => {
  const renderer = await renderWorkspace([unscheduledItem()]);

  // "No seam, no action": a read-only surface must not promise a move it cannot
  // perform.
  expect(renderer.root.findAllByProps({ testID: 'unscheduled-request-move-item-1' }))
    .toHaveLength(0);
});

test('moving an Item back into a Day reports the chosen Day', async () => {
  const moveItemToDay = jest.fn(async () => ({
    data: unscheduledItem(),
    affectedEntityIds: ['item-1'],
    validationIssues: [],
  })) as unknown as MoveItemToDayCommand;
  const onItemMoved = jest.fn((_dayId: string) => undefined);
  const renderer = await renderWorkspace([unscheduledItem()], {
    moveItemToDayCommand: moveItemToDay,
    onItemMoved,
  });

  // UX-C: the move lives behind the row's ⋯ sheet now.
  await act(async () => {
    renderer.root.findByProps({ testID: 'unscheduled-actions-item-1' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-action-change-date' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'day-jump-sheet' })).toBeDefined();

  await act(async () => {
    renderer.root.findByProps({ testID: 'day-jump-day-2' }).props.onPress();
  });

  expect(moveItemToDay).toHaveBeenCalledWith({ itemId: 'item-1', targetDayId: 'day-2' });
  expect(onItemMoved).toHaveBeenCalledWith('day-2');
});

test('a failed move-back stays on the surface and reports inline', async () => {
  const moveItemToDay = jest.fn(async () => {
    throw new Error('移动失败');
  }) as unknown as MoveItemToDayCommand;
  const onItemMoved = jest.fn((_dayId: string) => undefined);
  const renderer = await renderWorkspace([unscheduledItem()], {
    moveItemToDayCommand: moveItemToDay,
    onItemMoved,
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'unscheduled-actions-item-1' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-action-change-date' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'day-jump-day-1' }).props.onPress();
  });

  // The Item must not disappear just because the write failed.
  expect(renderer.root.findByProps({ testID: 'unscheduled-move-error' }).props.children)
    .toBe('移动失败');
  expect(renderer.root.findByProps({ testID: 'unscheduled-item-item-1' })).toBeDefined();
  expect(onItemMoved).not.toHaveBeenCalled();
});

test('a Trip with no Days offers no move target at all', async () => {
  const moveItemToDay = jest.fn(async () => ({
    data: unscheduledItem(),
    affectedEntityIds: ['item-1'],
    validationIssues: [],
  })) as unknown as MoveItemToDayCommand;
  const renderer = await renderWorkspace([unscheduledItem()], {
    moveItemToDayCommand: moveItemToDay,
    days: [],
  });

  expect(renderer.root.findAllByProps({ testID: 'unscheduled-request-move-item-1' }))
    .toHaveLength(0);
});
