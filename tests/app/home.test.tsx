import { expect, jest, test } from '@jest/globals';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create } from 'react-test-renderer';

import { tripKeys } from '@/application/queries/query-keys';
import { deviceLocalTravelDate } from '@/domain/common/travel-date';
import IndexRoute from '@/app/index';

jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const View = (props: { children?: ReactNode; [key: string]: unknown }) =>
    React.createElement('MockBottomSheetView', props, props.children);
  const BottomSheet = React.forwardRef((props: { children?: ReactNode; [key: string]: unknown }, _ref) =>
    React.createElement('MockBottomSheet', props, props.children));
  BottomSheet.displayName = 'MockBottomSheet';
  return { __esModule: true, default: BottomSheet, BottomSheetView: View, BottomSheetScrollView: View };
});

jest.mock('@/infrastructure/map/google-map-renderer', () => ({
  GoogleMapRenderer: () => null,
}));
jest.mock('@/infrastructure/map/amap-map-renderer', () => ({
  AmapMapRenderer: () => null,
}));
// Renders one pressable per marker, so the Home test can drive the real
// map → preview → 查看旅行 → Trip path without the native map module.
jest.mock('@/infrastructure/map/apple-map-renderer', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AppleMapRenderer: ({ markers, onMarkerPress }: {
      markers: readonly { id: string }[];
      onMarkerPress?: (markerId: string) => void;
    }) => React.createElement(
      ReactNative.View,
      { testID: 'mock-apple-map' },
      markers.map((marker) => React.createElement(ReactNative.Pressable, {
        key: marker.id,
        onPress: () => onMarkerPress?.(marker.id),
        testID: `mock-marker-${marker.id}`,
      })),
    ),
  };
});
jest.mock('@/state/apple-place-resolution', () => ({
  useApplePlaceResolution: (rawPlaces: Record<string, unknown>) => ({
    mapPlacesById: rawPlaces,
    unresolved: [],
    manualVisible: false,
    setManualVisible: () => undefined,
    confirm: async () => undefined,
  }),
}));
jest.mock('@/components/amap-privacy-gate', () => ({
  AmapPrivacyGate: ({ children }: { children: ReactNode }) => children,
}));
// The Trip surfaces use RNGH gestures; the tests render the detector as a
// pass-through and make Gesture.Pan() a chainable stub, exactly as the Day View
// suite does, so no native host is required.
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const chainable = () => {
    const g: Record<string, jest.Mock> = {};
    for (const method of [
      'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY', 'hitSlop', 'manualActivation',
      'onBegin', 'onStart', 'onEnd', 'onFinalize', 'onTouchesDown', 'onTouchesMove',
      'onTouchesUp', 'onTouchesCancelled', 'onUpdate', 'enabled', 'runOnJS', 'simultaneousWithExternalGesture',
    ]) {
      g[method] = jest.fn(() => g);
    }
    g.withRef = jest.fn((ref: unknown) => {
      if (ref && typeof ref === 'object' && 'current' in ref) {
        (ref as { current: unknown }).current = g;
      }
      return g;
    });
    return g;
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Gesture: { Pan: jest.fn(chainable) },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));

const timestamp = '2026-09-14T00:00:00.000Z';
const trip = {
  id: 'trip-1', title: 'Tokyo', startDate: '2026-10-01', endDate: '2026-10-01',
  mapRegion: 'global' as const, note: null, createdAt: timestamp, updatedAt: timestamp,
};
const day = {
  id: 'day-1', tripId: trip.id, date: trip.startDate, dayIndex: 1,
  createdAt: timestamp, updatedAt: timestamp,
};
const overview = {
  trip, days: [day], scheduledItems: [], placesById: {}, unscheduledItems: [],
};
const dayView = { trip, day, items: [], placesById: {} };

/** Home now mounts the Footprint map, so every render needs a Footprint source. */
const homeMapSource = { getHomeMap: async () => ({ trips: [] }) };

/** The same Trip, seen from Home: one Day, one Place-bearing Item. */
const homeFootprint = {
  trips: [{
    trip,
    days: [day],
    items: [{
      ...day, id: 'item-1', tripId: trip.id, dayId: day.id, placeId: 'place-1',
      type: 'sightseeing' as const, title: 'Tokyo Station', sortOrder: 0,
      timeMode: 'none' as const, startDateTime: null, endDateTime: null,
      period: null, isFixed: false, note: null, payload: null,
    }],
    placesById: {
      'place-1': {
        id: 'place-1', name: 'Tokyo Station',
        coordinate: { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' as const },
        address: null, provider: null, providerPlaceId: null, metadata: null,
        createdAt: timestamp, updatedAt: timestamp,
      },
    },
  }],
};
const footprintSource = { getHomeMap: async () => homeFootprint };

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

/** Longer than Home → Trip exit + enter, so a committed swap has settled. */
async function settleTransition() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

/**
 * Counts rendered host elements only. A composite component and its host view
 * both carry the same `testID`, so a naive `findAllByProps` double-counts.
 */
function countHosts(renderer: ReturnType<typeof create>, testID: string) {
  return renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props?.testID === testID,
  ).length;
}

function press(renderer: ReturnType<typeof create>, testID: string) {
  const target = renderer.root.findAll(
    (node) => node.props?.testID === testID && typeof node.props?.onPress === 'function',
  )[0];
  if (!target) throw new Error(`No pressable found for ${testID}`);
  return target.props.onPress() as void;
}

/**
 * Home's only Trip entry: the Footprint marker selects and previews, and the
 * preview card's explicit 查看旅行 opens it (Stage-03 §3.6).
 */
async function openTripFromMap(renderer: ReturnType<typeof create>) {
  await act(async () => press(renderer, 'mock-marker-trip-1'));
  await act(async () => press(renderer, 'home-trip-preview-enter'));
}

async function renderHome(options: {
  overviewSource: { getTripOverview: (tripId: string) => Promise<typeof overview> };
  queryClient: QueryClient;
}) {
  const daySource = { getDayView: async () => dayView };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={options.queryClient}>
        <IndexRoute
          daySource={daySource}
          homeMapSource={footprintSource}
          overviewSource={options.overviewSource}
        />
      </QueryClientProvider>,
    );
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return renderer;
}

test('Home is the Footprint map, its 我的旅行 sheet, and the create affordance', async () => {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(tripKeys.all, []);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <IndexRoute homeMapSource={homeMapSource} />
      </QueryClientProvider>,
    );
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  expect(renderer.root.findByProps({ testID: 'home-placeholder' })).toBeDefined();
  // The Footprint map, not a Trip list with a decorative map (Stage-03 §3.1).
  expect(renderer.root.findByProps({ testID: 'home-map-workspace' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'home-trip-list-sheet' })).toBeDefined();
  // An empty Footprint is §3.7's first-use state, and it carries the create CTA.
  expect(renderer.root.findByProps({ testID: 'home-trip-list-first-use' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'home-create-trip' })).toBeDefined();
  // The temporary list and its inline form are gone.
  expect(renderer.root.findAllByProps({ testID: 'temporary-trip-list' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'create-trip-form' })).toHaveLength(0);

  await act(async () => {
    renderer.unmount();
  });
  queryClient.clear();
});

test('opening a Trip replaces the Footprint map with the production planning shell', async () => {
  const queryClient = makeQueryClient();
  const overviewSource = { getTripOverview: async () => overview };
  const renderer = await renderHome({ overviewSource, queryClient });

  await openTripFromMap(renderer);
  await settleTransition();

  expect(renderer.root.findByProps({ testID: 'trip-planning-workspace' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'home-trip-list-sheet' })).toHaveLength(0);
  act(() => renderer.unmount());
  queryClient.clear();
});

test('keeps Home visible until the Overview read is ready and never shows a loading frame', async () => {
  const queryClient = makeQueryClient();
  const overviewRead = deferred<typeof overview>();
  const getTripOverview = jest.fn(() => overviewRead.promise);
  const renderer = await renderHome({
    overviewSource: { getTripOverview },
    queryClient,
  });

  await openTripFromMap(renderer);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });

  // The source surface is still Home, and no Trip loading frame was rendered.
  expect(renderer.root.findByProps({ testID: 'home-trip-list-sheet' })).toBeDefined();
  expect(countHosts(renderer, 'trip-planning-workspace')).toBe(0);
  expect(countHosts(renderer, 'trip-planning-loading')).toBe(0);
  expect(getTripOverview).toHaveBeenCalledWith(trip.id);

  await act(async () => {
    overviewRead.resolve(overview);
    await Promise.resolve();
  });
  await settleTransition();

  expect(renderer.root.findByProps({ testID: 'trip-planning-workspace' })).toBeDefined();
  expect(countHosts(renderer, 'trip-planning-loading')).toBe(0);
  act(() => renderer.unmount());
  queryClient.clear();
});

test('a failed Overview read keeps Home and shows an actionable error', async () => {
  const queryClient = makeQueryClient();
  const renderer = await renderHome({
    overviewSource: {
      getTripOverview: async () => { throw new Error('overview unavailable'); },
    },
    queryClient,
  });

  await openTripFromMap(renderer);
  await settleTransition();

  expect(renderer.root.findByProps({ testID: 'home-trip-list-sheet' })).toBeDefined();
  expect(countHosts(renderer, 'trip-planning-workspace')).toBe(0);
  expect(renderer.root.findByProps({ testID: 'home-open-trip-error' }).props.children)
    .toContain('overview unavailable');

  // The failed attempt must not lock out a later retry.
  await openTripFromMap(renderer);
  await settleTransition();
  expect(countHosts(renderer, 'trip-planning-workspace')).toBe(0);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('ignores repeated open intents while one transition is committing', async () => {
  const queryClient = makeQueryClient();
  const getTripOverview = jest.fn(async () => overview);
  const renderer = await renderHome({ overviewSource: { getTripOverview }, queryClient });

  await act(async () => press(renderer, 'mock-marker-trip-1'));
  await act(async () => {
    press(renderer, 'home-trip-preview-enter');
    // A second intent while one is committing must be ignored.
    press(renderer, 'home-trip-preview-enter');
  });
  await settleTransition();

  expect(countHosts(renderer, 'trip-planning-workspace')).toBe(1);
  expect(getTripOverview).toHaveBeenCalledTimes(1);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('Trip Overview → Home uses the same transition and returns to the Home surface', async () => {
  const queryClient = makeQueryClient();
  const renderer = await renderHome({
    overviewSource: { getTripOverview: async () => overview },
    queryClient,
  });

  await openTripFromMap(renderer);
  await settleTransition();
  expect(renderer.root.findByProps({ testID: 'trip-planning-workspace' })).toBeDefined();

  await act(async () => press(renderer, 'trip-overview-back'));
  expect(renderer.root.findByProps({ testID: 'trip-planning-workspace' })).toBeDefined();

  await settleTransition();
  expect(countHosts(renderer, 'trip-planning-workspace')).toBe(0);
  expect(renderer.root.findByProps({ testID: 'home-trip-list-sheet' })).toBeDefined();

  act(() => renderer.unmount());
  queryClient.clear();
});

test('the map can enter a Trip: marker → preview → 查看旅行 → planning shell', async () => {
  const queryClient = makeQueryClient();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <IndexRoute
          homeMapSource={footprintSource}
          overviewSource={{ getTripOverview: async () => overview }}
        />
      </QueryClientProvider>,
    );
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  // The Footprint marker is on the map, and tapping it only previews.
  await act(async () => press(renderer, 'mock-marker-trip-1'));
  expect(renderer.root.findByProps({ testID: 'home-trip-preview' })).toBeDefined();
  expect(countHosts(renderer, 'trip-planning-workspace')).toBe(0);

  // The explicit action enters the Trip, through the same transition the list uses.
  await act(async () => press(renderer, 'home-trip-preview-enter'));
  await settleTransition();
  expect(renderer.root.findByProps({ testID: 'trip-planning-workspace' })).toBeDefined();

  act(() => renderer.unmount());
  queryClient.clear();
});

test('继续今天的行程 opens the Trip at today\'s Day, not the Overview', async () => {
  // Computed, not hard-coded: the workspace defaults `today` to the device date.
  const today = deviceLocalTravelDate();
  const activeTrip = { ...trip, id: 'trip-active', startDate: '2020-01-01', endDate: '2099-12-31' };
  const todayDay = { ...day, id: 'day-today', tripId: activeTrip.id, date: today, dayIndex: 3 };
  const place = {
    id: 'place-1', name: 'Tokyo Station',
    coordinate: { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' as const },
    address: null, provider: null, providerPlaceId: null, metadata: null,
    createdAt: timestamp, updatedAt: timestamp,
  };
  const item = {
    id: 'item-1', tripId: activeTrip.id, dayId: todayDay.id, placeId: place.id,
    type: 'sightseeing' as const, title: 'Tokyo Station', sortOrder: 0,
    timeMode: 'none' as const, startDateTime: null, endDateTime: null,
    period: null, isFixed: false, note: null, payload: null,
    createdAt: timestamp, updatedAt: timestamp,
  };
  const queryClient = makeQueryClient();
  const getDayView = jest.fn(async () => ({
    day: todayDay, items: [item], placesById: { [place.id]: place }, trip: activeTrip,
  }));
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <IndexRoute
          daySource={{ getDayView }}
          homeMapSource={{
            getHomeMap: async () => ({
              trips: [{
                days: [todayDay], items: [item],
                placesById: { [place.id]: place }, trip: activeTrip,
              }],
            }),
          }}
          overviewSource={{
            getTripOverview: async () => ({
              days: [todayDay], placesById: { [place.id]: place },
              scheduledItems: [item], trip: activeTrip, unscheduledItems: [],
            }),
          }}
        />
      </QueryClientProvider>,
    );
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  await act(async () => press(renderer, 'home-active-trip-toggle'));
  await act(async () => press(renderer, 'home-active-trip-continue'));
  await settleTransition();

  // Continue Today is a Day entry, so the Overview must never be the surface.
  expect(countHosts(renderer, 'day-view-workspace')).toBe(1);
  expect(countHosts(renderer, 'trip-overview-workspace')).toBe(0);
  // And the Day read was prepared before the swap, so there is no loading frame.
  expect(countHosts(renderer, 'trip-planning-loading')).toBe(0);
  expect(getDayView).toHaveBeenCalledWith(todayDay.id);

  act(() => renderer.unmount());
  queryClient.clear();
});
