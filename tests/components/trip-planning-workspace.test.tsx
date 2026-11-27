import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';

import type { DayViewQuerySource } from '@/application/queries/day-view';
import type { TripOverviewQuerySource } from '@/application/queries/trip-overview';
import type { UnscheduledQuerySource } from '@/application/queries/unscheduled';
import type { Item } from '@/domain/item/types';
import { TripPlanningWorkspace } from '@/components/trip-planning-workspace';
import { TripOverviewWorkspace } from '@/components/trip-overview-workspace';
import { DayViewWorkspace } from '@/components/day-view-workspace';
import { GoogleMapRenderer } from '@/infrastructure/map/google-map-renderer';
import { resolvePlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import { ItemDraftForm } from '@/components/item-draft-form';
import * as itemCommands from '@/infrastructure/database/item-command';
import { tripFocusStore } from '@/state/trip-focus';

/**
 * `jest.mock` factories may only reference `mock`-prefixed outer variables, so
 * the seams a factory needs are declared here with that prefix.
 */
type MockSelectDay = (dayId: string) => void;
type MockBack = () => void;

function mockCallable<T>(value: unknown): T | undefined {
  return typeof value === 'function' ? (value as T) : undefined;
}

/*
 * The Unscheduled surface now hosts the UX-C right-swipe back via a real
 * GestureDetector; the detector's Reanimated integration is beyond this
 * suite's mocks, so RNGH is stubbed exactly as the Home suite does — a
 * pass-through detector and a chainable Pan.
 */
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const chainable = () => {
    const g: Record<string, jest.Mock> = {};
    for (const method of [
      'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY', 'hitSlop', 'manualActivation',
      'onBegin', 'onStart', 'onEnd', 'onFinalize', 'onTouchesDown', 'onTouchesMove',
      'onTouchesUp', 'onTouchesCancelled', 'onUpdate', 'enabled', 'runOnJS',
    ]) {
      g[method] = jest.fn(() => g);
    }
    return g;
  };
  return {
    GestureDetector: ({ children }: { children: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Gesture: { Pan: jest.fn(chainable) },
  };
});

jest.mock('@/components/trip-overview-workspace', () => ({
  TripOverviewWorkspace: (props: Record<string, unknown>) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
    const onSelectDay = mockCallable<MockSelectDay>(props.onSelectDay);
    const onBack = mockCallable<MockBack>(props.onBack);
    return React.createElement(
      ReactNative.View,
      { testID: 'production-overview' },
      onSelectDay
        ? React.createElement(ReactNative.Pressable, {
          onPress: () => onSelectDay('day-2'),
          testID: 'production-overview-select-day-2',
        })
        : null,
      onSelectDay
        ? React.createElement(ReactNative.Pressable, {
          onPress: () => onSelectDay('day-3'),
          testID: 'production-overview-select-day-3',
        })
        : null,
      onBack
        ? React.createElement(ReactNative.Pressable, {
          onPress: () => onBack(),
          testID: 'production-overview-back',
        })
        : null,
      React.createElement(ReactNative.View, {
        testID: props.changeTripDateRange
          ? 'production-overview-date-range-configured'
          : 'production-overview-date-range-missing',
      }),
      (props.onDateRangeChanged as (() => void) | undefined)
        ? React.createElement(ReactNative.Pressable, {
          onPress: () => (props.onDateRangeChanged as () => void)(),
          testID: 'production-overview-date-range-changed',
        })
        : null,
    );
  },
}));

jest.mock('@/components/day-view-workspace', () => {
  const mountedDayIds: string[] = [];
  const unmountedDayIds: string[] = [];
  return {
    __mock: { mountedDayIds, unmountedDayIds },
    DayViewWorkspace: (props: Record<string, unknown>) => {
      const React = jest.requireActual<typeof import('react')>('react');
      const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
      const data = props.data as { day: { id: string } } | undefined;
      const placeEntry = props.placeEntry as {
        onConfirmed?: (value: unknown) => void;
      } | undefined;
      const onItemSaved = props.onItemSaved as (() => void) | undefined;
      const onSelectDay = mockCallable<MockSelectDay>(props.onSelectDay);
      const onBack = mockCallable<MockBack>(props.onBack);
      const days = props.days as readonly { id: string }[] | undefined;
      React.useEffect(() => {
        if (!data) return undefined;
        mountedDayIds.push(data.day.id);
        return () => { unmountedDayIds.push(data.day.id); };
      }, []);
      return React.createElement(
        ReactNative.View,
        { testID: 'production-day' },
        React.createElement(ReactNative.View, {
          testID: data ? `production-day-current-${data.day.id}` : 'production-day-current-unknown',
        }),
        React.createElement(ReactNative.View, {
          testID: props.placeEntry
            ? 'production-day-place-entry-configured'
            : 'production-day-place-entry-missing',
        }),
        React.createElement(ReactNative.View, {
          testID: (props.placeEntry as { changeItemPlace?: unknown } | undefined)
            ?.changeItemPlace
            ? 'production-day-place-change-configured'
            : 'production-day-place-change-missing',
        }),
        React.createElement(ReactNative.View, {
          testID: props.updateItemDetailsCommand
            ? 'production-day-item-edit-configured'
            : 'production-day-item-edit-missing',
        }),
        React.createElement(ReactNative.View, {
          testID: props.moveItemToUnscheduled
            ? 'production-day-move-configured'
            : 'production-day-move-missing',
        }),
        (props.onItemMoved as (() => void) | undefined)
          ? React.createElement(
            ReactNative.Pressable,
            {
              onPress: () => (props.onItemMoved as () => void)(),
              testID: 'production-day-item-moved',
            },
          )
          : null,
        ...(days ?? []).map((day) => React.createElement(ReactNative.Pressable, {
          key: day.id,
          onPress: () => onSelectDay?.(day.id),
          testID: `production-day-select-${day.id}`,
        })),
        onBack
          ? React.createElement(ReactNative.Pressable, {
            onPress: () => onBack(),
            testID: 'production-day-back',
          })
          : null,
        placeEntry?.onConfirmed
          ? React.createElement(
            ReactNative.Pressable,
            {
              onPress: () => placeEntry.onConfirmed?.({}),
              testID: 'production-day-confirm-place',
            },
          )
          : null,
        onItemSaved
          ? React.createElement(
            ReactNative.Pressable,
            {
              onPress: () => onItemSaved(),
              testID: 'production-day-save-item',
            },
          )
          : null,
      );
    },
  };
});

jest.mock('@/components/planning-surface-transition', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PlanningSurfaceTransition: (props: {
      children?: ReactNode;
      transition: { direction: string; phase: string };
    }) => React.createElement(
      ReactNative.View,
      { testID: `planning-transition-${props.transition.phase}-${props.transition.direction}` },
      props.children,
    ),
  };
});

const dayViewMock = jest.requireMock('@/components/day-view-workspace') as {
  __mock: { mountedDayIds: string[]; unmountedDayIds: string[] };
};
jest.mock('@/state/apple-place-resolution', () => ({
  useApplePlaceResolution: (places: Record<string, unknown>) => ({
    mapPlacesById: places, unresolved: [], resolving: false, error: null,
    manualVisible: false, setManualVisible: jest.fn(), confirm: jest.fn(), retry: jest.fn(),
  }),
}));
jest.mock('@/infrastructure/map/google-map-renderer', () => ({ GoogleMapRenderer: () => null }));
jest.mock('@/infrastructure/map/amap-map-renderer', () => ({ AmapMapRenderer: () => null }));
jest.mock('@/components/amap-privacy-gate', () => ({
  AmapPrivacyGate: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));

const timestamp = '2026-09-14T00:00:00.000Z';
const trip = {
  id: 'trip-1', title: 'Sydney', startDate: '2026-09-20', endDate: '2026-09-22',
  mapRegion: 'global' as const, note: null, createdAt: timestamp, updatedAt: timestamp,
};
const day1 = { id: 'day-1', tripId: trip.id, date: '2026-09-20', dayIndex: 1, createdAt: timestamp, updatedAt: timestamp };
const day2 = { ...day1, id: 'day-2', date: '2026-09-21', dayIndex: 2 };
const day3 = { ...day1, id: 'day-3', date: '2026-09-22', dayIndex: 3 };
const overview = {
  trip,
  days: [day1, day2, day3],
  scheduledItems: [],
  placesById: {},
  unscheduledItems: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function countHosts(renderer: ReturnType<typeof create>, testID: string) {
  return renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props?.testID === testID,
  ).length;
}

/** The transition mock encodes `phase-direction` in its testID. */
function transitionPhases(renderer: ReturnType<typeof create>) {
  return renderer.root
    .findAll((node) => typeof node.type === 'string'
      && typeof node.props?.testID === 'string'
      && (node.props.testID as string).startsWith('planning-transition-'))
    .map((node) => node.props.testID as string);
}

function press(renderer: ReturnType<typeof create>, testID: string) {
  const target = renderer.root.findAll(
    (node) => node.props?.testID === testID && typeof node.props?.onPress === 'function',
  )[0];
  if (!target) throw new Error(`No pressable found for ${testID}`);
  return target.props.onPress() as void;
}

/** Longer than the Overview ↔ Day exit + enter, so a swap has settled. */
async function settleTransition() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

const mountedWorkspaces: { queryClient: QueryClient; renderer: ReturnType<typeof create> }[] = [];

afterEach(() => {
  act(() => {
    for (const { queryClient, renderer } of mountedWorkspaces.splice(0)) {
      renderer.unmount();
      queryClient.clear();
    }
  });
});

async function renderWorkspace(
  overviewSource: TripOverviewQuerySource,
  dayViewSource: DayViewQuerySource,
  unscheduledSource: UnscheduledQuerySource = makeUnscheduledSource(),
  onHome?: () => void,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <TripPlanningWorkspace
          dayViewSource={dayViewSource}
          overviewSource={overviewSource}
          trip={trip}
          onHome={onHome}
          unscheduledSource={unscheduledSource}
        />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  mountedWorkspaces.push({ queryClient, renderer });
  return { queryClient, renderer };
}

function makeDayViewSource(overrides: Partial<DayViewQuerySource> = {}) {
  return {
    getDayView: jest.fn(async (dayId: string) => ({
      trip,
      day: [day1, day2, day3].find(({ id }) => id === dayId) ?? day1,
      items: [],
      placesById: {},
    })),
    ...overrides,
  } satisfies DayViewQuerySource;
}

function makeUnscheduledSource(
  items: Item[] = [],
): UnscheduledQuerySource & { getUnscheduledItems: jest.Mock } {
  return {
    getUnscheduledItems: jest.fn(async () => items),
  };
}

beforeEach(() => {
  dayViewMock.__mock.mountedDayIds.length = 0;
  dayViewMock.__mock.unmountedDayIds.length = 0;
  act(() => {
    tripFocusStore.setState({ tripId: null, focus: { type: 'overview' }, sheetSnap: 'half' });
  });
});

test('production Trip management refreshes a rename and returns Home after deletion', async () => {
  let latest = overview;
  const onHome = jest.fn();
  const { queryClient, renderer } = await renderWorkspace(
    { getTripOverview: async () => latest }, makeDayViewSource(), makeUnscheduledSource(), onHome,
  );
  const workspace = renderer.root.findByType(TripOverviewWorkspace);
  expect(workspace.props.renameTripCommand).toBeDefined();
  expect(workspace.props.deleteTripCommand).toBeDefined();
  latest = { ...overview, trip: { ...trip, title: '新的旅行名称' } };
  await act(async () => workspace.props.onTripRenamed(latest.trip));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(renderer.root.findByType(TripOverviewWorkspace).props.data.trip.title).toBe('新的旅行名称');
  await act(async () => renderer.root.findByType(TripOverviewWorkspace).props.onTripDeleted(trip.id));
  expect(onHome).toHaveBeenCalledTimes(1);
  expect(tripFocusStore.getState().tripId).toBeNull();
  expect(renderer.root.findAllByProps({ testID: 'trip-planning-error' })).toHaveLength(0);
  act(() => renderer.unmount());
  queryClient.clear();
});

test('Unscheduled ⋯ opens 编辑详情, saves without scheduling, and refreshes the list', async () => {
  const item: Item = {
    id: 'unscheduled-1', tripId: trip.id, dayId: null, placeId: null,
    title: '待安排地点', type: 'custom', sortOrder: 0, timeMode: 'none',
    startDateTime: null, endDateTime: null, period: null, isFixed: false,
    note: null, payload: null, createdAt: trip.createdAt, updatedAt: trip.updatedAt,
  };
  let savedItem = item;
  const source = { getUnscheduledItems: jest.fn(async () => [savedItem]) };
  const save = jest.spyOn(itemCommands, 'updateItemDetailsCommand').mockImplementation(async (input) => {
    savedItem = { ...item, title: input.title ?? item.title, note: input.note ?? item.note };
    return { data: savedItem, affectedEntityIds: [item.id], validationIssues: [] };
  });
  const { renderer } = await renderWorkspace(
    { getTripOverview: async () => overview }, makeDayViewSource(), source,
  );
  await act(async () => tripFocusStore.getState().openUnscheduled());
  await settleTransition();
  await act(async () => press(renderer, 'unscheduled-actions-unscheduled-1'));
  expect(renderer.root.findByProps({ testID: 'item-action-edit-details' })).toBeDefined();
  await act(async () => press(renderer, 'item-action-edit-details'));
  const form = renderer.root.findByType(ItemDraftForm);
  expect(form.props.initialDraft.title).toBe(item.title);
  await act(async () => form.props.onSave({
    ...form.props.initialDraft, title: '已修改地点', note: '稍后安排',
  }));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(save).toHaveBeenCalledWith(expect.objectContaining({
    itemId: item.id, title: '已修改地点', note: '稍后安排',
  }));
  expect(save.mock.calls[0][0]).not.toHaveProperty('dayId');
  expect(savedItem.dayId).toBeNull();
  expect(source.getUnscheduledItems.mock.calls.length).toBeGreaterThan(1);
  expect(JSON.stringify(renderer.toJSON())).toContain('已修改地点');
  expect(renderer.root.findAllByProps({ testID: 'item-editor-modal' })).toHaveLength(0);
  act(() => renderer.unmount());
  save.mockRestore();
});

test('Unscheduled names its scheduling action clearly and permanently deletes only after confirmation', async () => {
  const item: Item = {
    id: 'unscheduled-delete', tripId: trip.id, dayId: null, placeId: null,
    title: '待删除行程', type: 'custom', sortOrder: 0, timeMode: 'none',
    startDateTime: null, endDateTime: null, period: null, isFixed: false,
    note: null, payload: null, createdAt: trip.createdAt, updatedAt: trip.updatedAt,
  };
  let items = [item];
  const source = { getUnscheduledItems: async () => items };
  const remove = jest.spyOn(itemCommands, 'deleteItemCommand').mockImplementation(async () => {
    items = [];
    return { data: { item, previousItemId: null, nextItemId: null }, affectedEntityIds: [item.id], validationIssues: [] };
  });
  const alert = jest.spyOn(Alert, 'alert');
  const { queryClient, renderer } = await renderWorkspace(
    { getTripOverview: async () => overview }, makeDayViewSource(), source,
  );
  await act(async () => tripFocusStore.getState().openUnscheduled());
  await settleTransition();
  await act(async () => press(renderer, 'unscheduled-actions-unscheduled-delete'));
  expect(JSON.stringify(renderer.toJSON())).toContain('安排到某一天');
  await act(async () => press(renderer, 'item-action-permanent-delete'));
  expect(remove).not.toHaveBeenCalled();
  expect(alert.mock.calls[0][1]).toContain('待删除行程');
  const confirm = alert.mock.calls[0][2]?.find(({ style }) => style === 'destructive');
  await act(async () => confirm?.onPress?.());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(remove).toHaveBeenCalledWith({ itemId: item.id });
  expect(renderer.root.findAllByProps({ testID: 'unscheduled-item-unscheduled-delete' })).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).not.toContain('撤销');
  act(() => renderer.unmount());
  queryClient.clear();
  remove.mockRestore();
  alert.mockRestore();
});

test('keeps one Day workspace mounted when the selected Day changes', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const { queryClient, renderer } = await renderWorkspace(overviewSource, makeDayViewSource());

  await act(async () => tripFocusStore.getState().selectDay(day1.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(dayViewMock.__mock.mountedDayIds).toEqual(['day-1']);

  await act(async () => tripFocusStore.getState().selectDay(day2.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  // The Day surface is one persistent instance: it receives new content and
  // must not unmount, remount or be replaced by a second workspace.
  expect(dayViewMock.__mock.mountedDayIds).toEqual(['day-1']);
  expect(dayViewMock.__mock.unmountedDayIds).toEqual([]);
  expect(countHosts(renderer, 'production-day')).toBe(1);
  expect(countHosts(renderer, 'production-day-current-day-2')).toBe(1);
  expect(countHosts(renderer, 'production-day-current-day-1')).toBe(0);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('loads the persisted Overview first and switches to Day shell from TripFocus', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayViewSource = makeDayViewSource();
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => {});
  expect(renderer.root.findByProps({ testID: 'production-overview' })).toBeDefined();
  expect(overviewSource.getTripOverview).toHaveBeenCalledWith(trip.id);
  expect(countHosts(renderer, 'production-day')).toBe(0);

  await act(async () => tripFocusStore.getState().selectDay(day2.id));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(renderer.root.findByProps({ testID: 'production-day' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'production-day-place-entry-configured' }))
    .toBeDefined();

  const dayReadsBefore = (dayViewSource.getDayView as jest.Mock).mock.calls.length;
  const overviewReadsBefore = (overviewSource.getTripOverview as jest.Mock).mock.calls.length;
  await act(async () => {
    press(renderer, 'production-day-confirm-place');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect((dayViewSource.getDayView as jest.Mock).mock.calls.length).toBe(dayReadsBefore + 1);
  expect((overviewSource.getTripOverview as jest.Mock).mock.calls.length)
    .toBe(overviewReadsBefore + 1);
  expect(dayViewSource.getDayView).toHaveBeenCalledWith(day2.id);
  expect(countHosts(renderer, 'production-overview')).toBe(0);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('prefetches the destination Day before committing the Overview → Day swap', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayRead = deferred<Awaited<ReturnType<DayViewQuerySource['getDayView']>>>();
  const dayViewSource = makeDayViewSource({ getDayView: jest.fn(() => dayRead.promise) });
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => press(renderer, 'production-overview-select-day-2'));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });

  // The source surface is still Overview while the destination is unread.
  expect(renderer.root.findByProps({ testID: 'planning-transition-preparing-neutral' }))
    .toBeDefined();
  expect(countHosts(renderer, 'production-overview')).toBe(1);
  expect(countHosts(renderer, 'production-day')).toBe(0);
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });

  await act(async () => {
    dayRead.resolve({ trip, day: day2, items: [], placesById: {} });
    await Promise.resolve();
  });
  await settleTransition();

  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });
  expect(countHosts(renderer, 'production-day')).toBe(1);
  expect(countHosts(renderer, 'production-overview')).toBe(0);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('keeps Overview and reports an actionable error when the Day read fails', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayViewSource = makeDayViewSource({
    getDayView: jest.fn(async () => { throw new Error('day read failed'); }),
  });
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => press(renderer, 'production-overview-select-day-2'));
  await settleTransition();

  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });
  expect(countHosts(renderer, 'production-overview')).toBe(1);
  expect(countHosts(renderer, 'production-day')).toBe(0);
  expect(renderer.root.findByProps({ testID: 'trip-navigation-error' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('day read failed');

  // Retry is actionable and does not require re-tapping the Day row.
  const retryCalls = (dayViewSource.getDayView as jest.Mock).mock.calls.length;
  await act(async () => press(renderer, 'trip-navigation-error-retry'));
  await settleTransition();
  expect((dayViewSource.getDayView as jest.Mock).mock.calls.length).toBeGreaterThan(retryCalls);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('Day → Day swaps content in place without a page-level transition', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayViewSource = makeDayViewSource();
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => tripFocusStore.getState().selectDay(day1.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(countHosts(renderer, 'production-day')).toBe(1);

  // Day 1 → Day 2 is the same persistent surface receiving new content.
  await act(async () => press(renderer, 'production-day-select-day-2'));
  const phases = transitionPhases(renderer);
  expect(phases.some((id) => id.includes('-leaving-'))).toBe(false);
  expect(phases.some((id) => id.includes('-entering-'))).toBe(false);
  expect(countHosts(renderer, 'production-day')).toBe(1);

  await settleTransition();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });
  expect(countHosts(renderer, 'production-day-current-day-2')).toBe(1);
  expect(dayViewMock.__mock.unmountedDayIds).toEqual([]);

  // Day 2 → Day 1 is the same in-place swap, not a directional page slide.
  await act(async () => press(renderer, 'production-day-select-day-1'));
  expect(transitionPhases(renderer).some((id) => id.includes('-leaving-'))).toBe(false);
  await settleTransition();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });

  // A non-adjacent Day Jump is also an in-place swap.
  await act(async () => press(renderer, 'production-day-select-day-3'));
  expect(transitionPhases(renderer).some((id) => id.includes('-leaving-'))).toBe(false);
  await settleTransition();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-3' });
  expect(countHosts(renderer, 'production-day-current-day-3')).toBe(1);
  expect(dayViewMock.__mock.mountedDayIds).toEqual(['day-1']);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('ignores a repeated Day intent while the first swap is still in flight', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayRead = deferred<Awaited<ReturnType<DayViewQuerySource['getDayView']>>>();
  const getDayView = jest.fn((dayId: string) => (
    dayId === day2.id
      ? dayRead.promise
      : Promise.resolve({ trip, day: [day1, day2, day3].find(({ id }) => id === dayId) ?? day1, items: [], placesById: {} })
  ));
  const dayViewSource = makeDayViewSource({ getDayView });
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => tripFocusStore.getState().selectDay(day1.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  // Day 2's read never settles, so the swap stays in flight.
  await act(async () => press(renderer, 'production-day-select-day-2'));
  await act(async () => press(renderer, 'production-day-select-day-3'));

  // The out-of-order Day 3 intent must not start its own read.
  expect(getDayView.mock.calls.map(([dayId]) => dayId)).not.toContain(day3.id);
  expect(countHosts(renderer, 'production-day-current-day-1')).toBe(1);

  await act(async () => {
    dayRead.resolve({ trip, day: day2, items: [], placesById: {} });
    await Promise.resolve();
  });
  await settleTransition();

  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });
  expect(countHosts(renderer, 'production-day-current-day-2')).toBe(1);
  expect(countHosts(renderer, 'production-day-current-day-3')).toBe(0);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('a failed Day → Day swap keeps the current Day in place and offers a retry', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  let failDay2 = true;
  const getDayView = jest.fn(async (dayId: string) => {
    if (dayId === day2.id && failDay2) throw new Error('day 2 read failed');
    return {
      trip,
      day: [day1, day2, day3].find(({ id }) => id === dayId) ?? day1,
      items: [],
      placesById: {},
    };
  });
  const dayViewSource = makeDayViewSource({ getDayView });
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => tripFocusStore.getState().selectDay(day1.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(countHosts(renderer, 'production-day-current-day-1')).toBe(1);

  await act(async () => press(renderer, 'production-day-select-day-2'));
  await settleTransition();

  // The destination read failed, so the persistent Day surface keeps Day 1
  // exactly as it was: no focus change, no content swap, no page transition,
  // no map move and nothing unmounted.
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });
  expect(countHosts(renderer, 'production-day-current-day-1')).toBe(1);
  expect(countHosts(renderer, 'production-day-current-day-2')).toBe(0);
  expect(dayViewMock.__mock.mountedDayIds).toEqual(['day-1']);
  expect(dayViewMock.__mock.unmountedDayIds).toEqual([]);
  expect(transitionPhases(renderer).some((id) => id.includes('-leaving-'))).toBe(false);
  expect(renderer.root.findByProps({ testID: 'trip-navigation-error' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('day 2 read failed');

  // Retry re-runs the same destination read and still swaps the one instance.
  failDay2 = false;
  await act(async () => press(renderer, 'trip-navigation-error-retry'));
  await settleTransition();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });
  expect(countHosts(renderer, 'production-day-current-day-2')).toBe(1);
  expect(dayViewMock.__mock.mountedDayIds).toEqual(['day-1']);
  expect(dayViewMock.__mock.unmountedDayIds).toEqual([]);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('prefetches the adjacent Days while the current Day is open', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayViewSource = makeDayViewSource();
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => tripFocusStore.getState().selectDay(day2.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  const requested = (dayViewSource.getDayView as jest.Mock).mock.calls.map(([dayId]) => dayId);
  expect(requested).toContain('day-2');
  expect(requested).toContain('day-1');
  expect(requested).toContain('day-3');
  expect(requested).not.toContain(undefined);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('Day → Overview back keeps the Day until the swap point', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const { queryClient, renderer } = await renderWorkspace(overviewSource, makeDayViewSource());

  await act(async () => tripFocusStore.getState().selectDay(day2.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(countHosts(renderer, 'production-day')).toBe(1);

  await act(async () => press(renderer, 'production-day-back'));
  expect(renderer.root.findByProps({ testID: 'planning-transition-leaving-backward' }))
    .toBeDefined();
  expect(countHosts(renderer, 'production-day')).toBe(1);

  await settleTransition();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });
  expect(countHosts(renderer, 'production-overview')).toBe(1);
  // Leaving Day for Overview is a page-level change, so the persistent Day
  // surface is finally unmounted here and only here.
  expect(countHosts(renderer, 'production-day')).toBe(0);
  expect(dayViewMock.__mock.unmountedDayIds).toEqual(['day-2']);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('an Item save after a Day swap invalidates the Day that is on screen', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayViewSource = makeDayViewSource();
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => tripFocusStore.getState().selectDay(day1.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  await act(async () => press(renderer, 'production-day-select-day-2'));
  await settleTransition();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });

  const overviewReadsBefore = (overviewSource.getTripOverview as jest.Mock).mock.calls.length;
  await act(async () => {
    press(renderer, 'production-day-save-item');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // The invalidation must follow the Day now on screen, not a stale closure
  // over the Day that was showing when the surface mounted.
  const requested = (dayViewSource.getDayView as jest.Mock).mock.calls.map(([dayId]) => dayId);
  expect(requested[requested.length - 1]).toBe('day-2');
  expect((overviewSource.getTripOverview as jest.Mock).mock.calls.length)
    .toBe(overviewReadsBefore + 1);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('wires Item editing into the Day shell and invalidates both read models on save', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayViewSource = makeDayViewSource();
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => tripFocusStore.getState().selectDay(day1.id));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(renderer.root.findByProps({ testID: 'production-day-item-edit-configured' }))
    .toBeDefined();

  const dayReadsBefore = (dayViewSource.getDayView as jest.Mock).mock.calls.length;
  const overviewReadsBefore = (overviewSource.getTripOverview as jest.Mock).mock.calls.length;
  await act(async () => {
    press(renderer, 'production-day-save-item');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // An edited Item changes the Day projection and the Overview that summarises it.
  expect((dayViewSource.getDayView as jest.Mock).mock.calls.length).toBe(dayReadsBefore + 1);
  expect((overviewSource.getTripOverview as jest.Mock).mock.calls.length)
    .toBe(overviewReadsBefore + 1);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('wires the Place-change command into the Day shell', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayViewSource = makeDayViewSource();
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => tripFocusStore.getState().selectDay(day1.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  expect(renderer.root.findByProps({ testID: 'production-day-place-change-configured' }))
    .toBeDefined();
  expect(renderer.root.findByProps({ testID: 'production-day-place-entry-configured' }))
    .toBeDefined();
  const workspace = renderer.root.findByType(DayViewWorkspace);
  expect(workspace.props.mapRenderer).toBe(GoogleMapRenderer);
  expect(workspace.props.placeEntry.resolveSession).toBe(resolvePlaceProviderSession);
  expect(workspace.props.data.mapPlacesById).toEqual({});
  // The Item edit seam and the Item move seam are separate capabilities.
  expect(renderer.root.findByProps({ testID: 'production-day-item-edit-configured' }))
    .toBeDefined();
  expect(renderer.root.findByProps({ testID: 'production-day-move-configured' })).toBeDefined();

  act(() => renderer.unmount());
  queryClient.clear();
});

test('shows query errors without mounting either planning surface', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => { throw new Error('overview failed'); }),
  };
  const { queryClient, renderer } = await renderWorkspace(overviewSource, makeDayViewSource());
  await act(async () => {});
  expect(renderer.root.findByProps({ testID: 'trip-planning-error' }).props.children)
    .toBe('overview failed');
  expect(countHosts(renderer, 'production-overview')).toBe(0);
  expect(countHosts(renderer, 'production-day')).toBe(0);
  act(() => renderer.unmount());
  queryClient.clear();
});

/** Every query key the shell asked React Query to invalidate. */
function invalidatedKeys(queryClient: QueryClient) {
  const spy = jest.spyOn(queryClient, 'invalidateQueries');
  return {
    spy,
    keys: () => (spy.mock.calls as unknown[][]).map(
      ([arg]) => (arg as { queryKey: readonly string[] }).queryKey,
    ),
  };
}

test('the 未安排 focus renders the Unscheduled surface instead of the Overview', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const unscheduledSource = makeUnscheduledSource([]);
  const { queryClient, renderer } = await renderWorkspace(
    overviewSource,
    makeDayViewSource(),
    unscheduledSource,
  );

  await act(async () => {});
  expect(renderer.root.findByProps({ testID: 'production-overview' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'unscheduled-workspace' })).toHaveLength(0);

  /*
   * This is the regression the Overview's 未安排 entry used to hide: it set the
   * focus and rendered the Overview anyway, so nothing on screen changed.
   */
  await act(async () => tripFocusStore.getState().openUnscheduled());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  expect(renderer.root.findByProps({ testID: 'unscheduled-workspace' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'production-overview' })).toHaveLength(0);
  expect(unscheduledSource.getUnscheduledItems).toHaveBeenCalledWith(trip.id);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('an Item move invalidates every Day, the Overview and Unscheduled', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const dayViewSource = makeDayViewSource();
  const { queryClient, renderer } = await renderWorkspace(overviewSource, dayViewSource);

  await act(async () => tripFocusStore.getState().selectDay(day2.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(renderer.root.findByProps({ testID: 'production-day-move-configured' })).toBeDefined();

  const { spy, keys } = invalidatedKeys(queryClient);
  await act(async () => {
    press(renderer, 'production-day-item-moved');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // A move is the widest Day-level change there is: the Item leaves one Day and
  // joins another (which is renumbered), the Overview counts it differently, and
  // Unscheduled gains or loses it. One Day key would leave the other Day stale.
  expect(keys()).toContainEqual(['days']);
  expect(keys()).toContainEqual(['trips', 'trip-1', 'overview']);
  expect(keys()).toContainEqual(['trips', 'trip-1', 'unscheduled']);
  spy.mockRestore();

  act(() => renderer.unmount());
  queryClient.clear();
});

test('an ordinary Item save does not invalidate Unscheduled', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const { queryClient, renderer } = await renderWorkspace(overviewSource, makeDayViewSource());

  await act(async () => tripFocusStore.getState().selectDay(day2.id));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  const { spy, keys } = invalidatedKeys(queryClient);
  await act(async () => {
    press(renderer, 'production-day-save-item');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // Editing an Item's details cannot move it between collections, so widening
  // the invalidation would refetch a read model that did not change.
  expect(keys()).toContainEqual(['days', 'day-2', 'view']);
  expect(keys()).not.toContainEqual(['trips', 'trip-1', 'unscheduled']);
  spy.mockRestore();

  act(() => renderer.unmount());
  queryClient.clear();
});

test('a Trip date-range change invalidates every Day, the Trip and Unscheduled', async () => {
  const overviewSource: TripOverviewQuerySource = {
    getTripOverview: jest.fn(async () => overview),
  };
  const { queryClient, renderer } = await renderWorkspace(overviewSource, makeDayViewSource());

  await act(async () => {});
  expect(renderer.root.findByProps({ testID: 'production-overview-date-range-configured' }))
    .toBeDefined();

  const { spy, keys } = invalidatedKeys(queryClient);
  await act(async () => {
    press(renderer, 'production-overview-date-range-changed');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // Every Day is re-dated, renumbered, created or deleted, so no single Day key
  // is enough — a deleted Day's projection would otherwise stay in the cache.
  expect(keys()).toContainEqual(['days']);
  expect(keys()).toContainEqual(['trips']);
  expect(keys()).toContainEqual(['trips', 'trip-1', 'overview']);
  expect(keys()).toContainEqual(['trips', 'trip-1', 'unscheduled']);
  spy.mockRestore();

  act(() => renderer.unmount());
  queryClient.clear();
});
