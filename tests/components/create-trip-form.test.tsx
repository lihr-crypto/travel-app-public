import { afterEach, expect, jest, test } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import type { CreateTripCommand } from '@/application/trip/create-trip';
import { CreateTripForm } from '@/components/create-trip-form';
import { tripKeys } from '@/application/queries/query-keys';


const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

afterEach(() => {
  queryClient.clear();
});

function visibleCalendarMonth(renderer: ReturnType<typeof create>) {
  const children = renderer.root.findByProps({ testID: 'create-trip-calendar-month' })
    .props.children as [number, string, number, string];
  return { year: children[0], month: children[2] };
}

function showCalendarMonth(renderer: ReturnType<typeof create>, date: string) {
  const [targetYear, targetMonth] = date.split('-').map(Number);
  let { year, month } = visibleCalendarMonth(renderer);
  let delta = (targetYear - year) * 12 + targetMonth - month;
  const direction = delta < 0 ? 'prev' : 'next';

  let steps = 0;
  while (delta !== 0) {
    steps += 1;
    if (steps > 120) {
      throw new Error(`Calendar did not reach ${date}; at ${year}-${month}`);
    }
    act(() => {
      renderer.root.findByProps({ testID: `create-trip-calendar-${direction}` })
        .props.onPress();
    });
    ({ year, month } = visibleCalendarMonth(renderer));
    delta = (targetYear - year) * 12 + targetMonth - month;
  }
}

function tapDate(
  renderer: ReturnType<typeof create>,
  field: 'start' | 'end',
  date: string,
) {
  act(() => {
    renderer.root
      .findByProps({ testID: `create-trip-${field === 'start' ? 'start' : 'end'}-date` })
      .props.onPress();
  });
  showCalendarMonth(renderer, date);
  act(() => {
    renderer.root.findByProps({ testID: `create-trip-calendar-day-${date}` })
      .props.onPress();
  });
}

function fillForm(renderer: ReturnType<typeof create>) {
  act(() => {
    renderer.root
      .findByProps({ testID: 'create-trip-title' })
      .props.onChangeText('Beijing');
  });
  tapDate(renderer, 'start', '2026-09-19');
  tapDate(renderer, 'end', '2026-09-21');
}

test('submits Create Trip through the command and shows the created Trip', async () => {
  const createTripCommand = jest.fn(async () => ({
    data: {
      id: 'trip-1',
      title: 'Beijing',
      startDate: '2026-09-19',
      endDate: '2026-09-21',
      mapRegion: 'china_mainland' as const,
      note: null,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
    affectedEntityIds: ['trip-1', 'day-1', 'day-2', 'day-3'],
    validationIssues: [],
  }));
  queryClient.setQueryData(tripKeys.all, []);
  queryClient.setQueryData(tripKeys.detail('trip-1'), null);
  queryClient.setQueryData(tripKeys.days('trip-1'), []);

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <CreateTripForm
        createTripCommand={createTripCommand}
        queryClient={queryClient}
      />,
    );
  });

  fillForm(renderer);
  await act(async () => {
    renderer.root.findByProps({ testID: 'create-trip-submit' }).props.onPress();
  });

  expect(createTripCommand).toHaveBeenCalledWith({
    title: 'Beijing',
    startDate: '2026-09-19',
    endDate: '2026-09-21',
    mapRegion: 'china_mainland',
  });
  expect(renderer.root.findByProps({ testID: 'create-trip-created' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('Beijing');
  expect(JSON.stringify(renderer.toJSON())).toContain('3');
  expect(JSON.stringify(renderer.toJSON())).toContain('天');
  expect(JSON.stringify(renderer.toJSON())).toContain('2026年9月19日');
  expect(JSON.stringify(renderer.toJSON())).toContain('2026年9月21日');
  expect(renderer.root.findByProps({ testID: 'create-trip-region' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'create-trip-region-mainland' }).props.accessibilityState)
    .toEqual({ selected: true });
  expect(renderer.root.findByProps({ testID: 'create-trip-region-overseas' }).props.accessibilityState)
    .toEqual({ selected: false });
  expect(queryClient.getQueryState(tripKeys.all)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(tripKeys.detail('trip-1'))?.isInvalidated).toBe(
    true,
  );
  expect(queryClient.getQueryState(tripKeys.days('trip-1'))?.isInvalidated).toBe(
    true,
  );
});

test('selecting Overseas submits an explicit global map region', async () => {
  const createTripCommand = jest.fn(async () => ({
    data: {
      id: 'trip-overseas',
      title: 'Beijing',
      startDate: '2026-09-19',
      endDate: '2026-09-21',
      mapRegion: 'global' as const,
      note: null,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
    affectedEntityIds: ['trip-overseas', 'day-1', 'day-2', 'day-3'],
    validationIssues: [],
  }));
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <CreateTripForm
        createTripCommand={createTripCommand}
        queryClient={queryClient}
      />,
    );
  });

  fillForm(renderer);
  act(() => {
    renderer.root.findByProps({ testID: 'create-trip-region-overseas' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'create-trip-region-mainland' }).props.accessibilityState)
    .toEqual({ selected: false });
  expect(renderer.root.findByProps({ testID: 'create-trip-region-overseas' }).props.accessibilityState)
    .toEqual({ selected: true });

  await act(async () => {
    renderer.root.findByProps({ testID: 'create-trip-submit' }).props.onPress();
  });
  expect(createTripCommand).toHaveBeenCalledWith({
    title: 'Beijing',
    startDate: '2026-09-19',
    endDate: '2026-09-21',
    mapRegion: 'global',
  });
  act(() => renderer.unmount());
});

test('shows a command validation error in the form', async () => {
  const createTripCommand = jest.fn(async () => {
    throw new RangeError('Trip endDate must be on or after startDate');
  });

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <CreateTripForm
        createTripCommand={createTripCommand}
        queryClient={queryClient}
      />,
    );
  });

  fillForm(renderer);
  await act(async () => {
    renderer.root.findByProps({ testID: 'create-trip-submit' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'create-trip-error' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain(
    'Trip endDate must be on or after startDate',
  );
});

test('the submit stays disabled until the title and both dates are set', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <CreateTripForm
        createTripCommand={jest.fn<CreateTripCommand>(async () => {
          throw new RangeError('unused');
        })}
        queryClient={queryClient}
      />,
    );
  });

  expect(renderer.root.findByProps({ testID: 'create-trip-submit' }).props.disabled)
    .toBe(true);

  act(() => {
    renderer.root
      .findByProps({ testID: 'create-trip-title' })
      .props.onChangeText('Beijing');
  });
  tapDate(renderer, 'start', '2026-09-19');
  tapDate(renderer, 'end', '2026-09-21');

  expect(renderer.root.findByProps({ testID: 'create-trip-submit' }).props.disabled)
    .toBe(false);
  act(() => renderer.unmount());
});

test('a reversed date range surfaces an inline error and blocks the submit', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <CreateTripForm
        createTripCommand={jest.fn<CreateTripCommand>(async () => {
          throw new RangeError('unused');
        })}
        queryClient={queryClient}
      />,
    );
  });

  act(() => {
    renderer.root
      .findByProps({ testID: 'create-trip-title' })
      .props.onChangeText('Beijing');
  });
  tapDate(renderer, 'start', '2026-09-21');
  tapDate(renderer, 'end', '2026-09-19');

  expect(renderer.root.findByProps({ testID: 'create-trip-range-error' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'create-trip-submit' }).props.disabled)
    .toBe(true);
  act(() => renderer.unmount());
});

test('keeps Gregorian labels and ISO command dates across a month boundary', async () => {
  const createTripCommand = jest.fn(async () => ({
    data: {
      id: 'trip-boundary',
      title: 'Boundary',
      startDate: '2026-09-30',
      endDate: '2026-10-01',
      mapRegion: 'china_mainland' as const,
      note: null,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
    affectedEntityIds: ['trip-boundary', 'day-1', 'day-2'],
    validationIssues: [],
  }));

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <CreateTripForm
        createTripCommand={createTripCommand}
        queryClient={queryClient}
      />,
    );
  });

  await act(async () => {
    renderer.root
      .findByProps({ testID: 'create-trip-title' })
      .props.onChangeText('Boundary');
  });
  tapDate(renderer, 'start', '2026-09-30');
  tapDate(renderer, 'end', '2026-10-01');

  expect(JSON.stringify(renderer.toJSON())).toContain('2026年9月30日');
  expect(JSON.stringify(renderer.toJSON())).toContain('2026年10月1日');

  await act(async () => {
    renderer.root.findByProps({ testID: 'create-trip-submit' }).props.onPress();
  });

  expect(createTripCommand).toHaveBeenCalledWith({
    title: 'Boundary',
    startDate: '2026-09-30',
    endDate: '2026-10-01',
    mapRegion: 'china_mainland',
  });
  act(() => renderer.unmount());
});
