import { afterEach, expect, test } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import { unscheduledKeys } from '@/application/queries/query-keys';
import { UnscheduledItemList } from '@/components/unscheduled-item-list';
import type { Item } from '@/domain/item/types';

const queryClients: QueryClient[] = [];
const renderers: ReturnType<typeof create>[] = [];

function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClients.push(client);
  return client;
}

function createTracked(element: Parameters<typeof create>[0]) {
  const renderer = create(element);
  renderers.push(renderer);
  return renderer;
}

afterEach(() => {
  act(() => { for (const renderer of renderers.splice(0)) renderer.unmount(); });
  for (const client of queryClients.splice(0)) client.clear();
});

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

test('renders Unscheduled count and complete Item titles', async () => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(unscheduledKeys.byTrip(item.tripId), [item]);
  let renderer!: ReturnType<typeof create>;

  await act(async () => {
    renderer = createTracked(
      <QueryClientProvider client={queryClient}>
        <UnscheduledItemList
          source={{ getUnscheduledItems: async () => [item] }}
          tripId={item.tripId}
        />
      </QueryClientProvider>,
    );
  });

  expect(renderer.root.findByProps({ testID: 'unscheduled-list-trip-1' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'unscheduled-item-item-1' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('未安排');
  expect(JSON.stringify(renderer.toJSON())).toContain('1');
  expect(JSON.stringify(renderer.toJSON())).toContain('Maybe visit');
});

test('renders the empty Unscheduled state', async () => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(unscheduledKeys.byTrip('trip-1'), []);
  let renderer!: ReturnType<typeof create>;

  await act(async () => {
    renderer = createTracked(
      <QueryClientProvider client={queryClient}>
        <UnscheduledItemList
          source={{ getUnscheduledItems: async () => [] }}
          tripId="trip-1"
        />
      </QueryClientProvider>,
    );
  });

  expect(renderer.root.findByProps({ testID: 'unscheduled-empty' })).toBeDefined();
});



test('A2: the Unscheduled empty state points at the move route', async () => {
  const queryClient = createQueryClient();
  queryClient.setQueryData(unscheduledKeys.byTrip('trip-1'), []);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = createTracked(
      <QueryClientProvider client={queryClient}>
        <UnscheduledItemList
          source={{ getUnscheduledItems: async () => [] }}
          tripId="trip-1"
        />
      </QueryClientProvider>,
    );
  });

  // Flush the query's microtasks before asserting on the resolved state.
  await act(async () => {
    await Promise.resolve();
  });

  const text = JSON.stringify(renderer.toJSON());
  expect(text).toContain('没有待安排的行程');
  expect(text).toContain('修改日期');
});
