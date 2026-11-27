import { afterEach, expect, jest, test } from '@jest/globals';
import type { ComponentProps } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { Coordinate, EntityId } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { MapPlace } from '@/application/projections/map-place';
import type { Day, Trip } from '@/domain/trip/types';
import type { HomeMapData, HomeTripData } from '@/application/projections/home-map';
import type { AppleMapRendererProps } from '@/infrastructure/map/apple-map-renderer';
import { HomeMapWorkspace } from '@/components/home-map-workspace';

// The component test injects its own renderer; the real adapter has its own
// suite, and importing it here would pull the native map module in.
jest.mock('@/infrastructure/map/apple-map-renderer', () => ({ AppleMapRenderer: () => null }));
jest.mock('@/state/reduce-motion', () => ({
  useReduceMotionPreference: () => true,
}));

// Home now renders the 我的旅行 Bottom Sheet, so the sheet library needs a stub.
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const View = (props: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('MockBottomSheetView', props, props.children);
  const BottomSheet = React.forwardRef(
    (props: { children?: React.ReactNode; [key: string]: unknown }, _ref) =>
      React.createElement('MockBottomSheet', props, props.children),
  );
  BottomSheet.displayName = 'MockBottomSheet';
  return {
    __esModule: true,
    BottomSheetScrollView: View,
    BottomSheetView: View,
    default: BottomSheet,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 47 }),
}));

const today = '2026-10-12';
const timestamp = '2026-10-12T00:00:00.000Z';

const mockApplePlaceResolution: {
  mapPlacesById?: Record<string, MapPlace>;
  unresolved?: Place[];
} = {};

jest.mock('@/state/apple-place-resolution', () => ({
  useApplePlaceResolution: (rawPlaces: Record<string, Place>) => ({
    mapPlacesById: mockApplePlaceResolution.mapPlacesById ?? rawPlaces,
    unresolved: mockApplePlaceResolution.unresolved ?? [],
  }),
}));

afterEach(() => {
  delete mockApplePlaceResolution.mapPlacesById;
  delete mockApplePlaceResolution.unresolved;
});

const tiananmen: Coordinate = { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' };
const forbiddenCity: Coordinate = { latitude: 39.916345, longitude: 116.397155, system: 'gcj02' };
const tokyo: Coordinate = { latitude: 35.6812, longitude: 139.7671, system: 'wgs84' };
const beijingWgs84: Coordinate = { latitude: 39.9042, longitude: 116.4074, system: 'wgs84' };

function trip(id: string, startDate: string, endDate: string, region: Trip['mapRegion'] = 'china_mainland'): Trip {
  return {
    id, title: `Trip ${id}`, startDate, endDate, mapRegion: region,
    note: null, createdAt: timestamp, updatedAt: timestamp,
  };
}

function entry(tripValue: Trip, placeId: EntityId, coordinate: Coordinate, name: string) {
  const day: Day = {
    id: `${tripValue.id}-d1`, tripId: tripValue.id, date: tripValue.startDate, dayIndex: 1,
    createdAt: timestamp, updatedAt: timestamp,
  };
  const item: Item = {
    id: `${tripValue.id}-i1`, tripId: tripValue.id, dayId: day.id, placeId,
    type: 'sightseeing', title: name, sortOrder: 0, timeMode: 'none',
    startDateTime: null, endDateTime: null, period: null, isFixed: false,
    note: null, payload: null, createdAt: timestamp, updatedAt: timestamp,
  };
  const place: Place = {
    id: placeId, name, coordinate, address: null, provider: null,
    providerPlaceId: null, metadata: null, createdAt: timestamp, updatedAt: timestamp,
  };
  return { days: [day], items: [item], placesById: { [placeId]: place }, trip: tripValue };
}

const data: HomeMapData = {
  trips: [
    entry(trip('china', '2026-12-01', '2026-12-05'), 'p-tiananmen', tiananmen, '天安门'),
    entry(trip('china-2', '2026-12-06', '2026-12-09'), 'p-forbidden', forbiddenCity, '故宫'),
    entry(trip('japan', '2026-08-01', '2026-08-05', 'global'), 'p-tokyo', tokyo, '東京駅'),
  ],
};

/** A Trip whose inclusive range covers `today` (2026-10-12). */
const activeEntry = (() => {
  const value = entry(trip('active', '2026-10-10', '2026-10-14'), 'p-beishan', tiananmen, '北山');
  value.days = [{ ...value.days[0], date: '2026-10-11', dayIndex: 2 }, {
    ...value.days[0], id: 'active-d3', date: '2026-10-12', dayIndex: 3,
  }];
  value.items = [
    { ...value.items[0], dayId: 'active-d3' },
  ];
  return value;
})();

const renderMap = jest.fn((_props: AppleMapRendererProps) => <View testID="probe-map" />);

function latestMapProps(): AppleMapRendererProps {
  const call = renderMap.mock.calls.at(-1);
  if (!call) throw new Error('the map renderer was never called');
  return call[0];
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
}

async function renderWorkspace(options: {
  query: () => Promise<HomeMapData>;
  queryClient: QueryClient;
  props?: Partial<ComponentProps<typeof HomeMapWorkspace>>;
}) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={options.queryClient}>
        <HomeMapWorkspace
          mapRenderer={renderMap}
          source={{ getHomeMap: options.query }}
          today={today}
          {...options.props}
        />
      </QueryClientProvider>,
    );
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return renderer;
}

test('M10-T3b: the map is mounted with one marker per Trip and a camera request', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [data.trips[0]] }),
    queryClient,
  });

  const props = latestMapProps();
  expect(props.markers.map(({ id }) => id)).toEqual(['china']);
  expect(props.markers[0].coordinate).toBe(tiananmen);
  expect(props.cameraRequest?.coordinates).toEqual([tiananmen]);
  // The workspace is the only place the adapter's own contract is satisfied, so
  // it must hand over the mixed-CRS markers rather than a single-system set.
  expect(props.markers[0].weight).toBe('weak');
  act(() => renderer.unmount());
  queryClient.clear();
});

test('Home draws the Apple binding at its WGS84 coordinate while retaining the original Trip count', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const source: HomeTripData = {
    ...data.trips[0],
    placesById: {
      ...data.trips[0].placesById,
      'p-tiananmen': {
        ...data.trips[0].placesById['p-tiananmen'],
        provider: 'amap',
      },
    },
  };
  const applePlace: MapPlace = {
    ...source.placesById['p-tiananmen'],
    id: 'apple-p-tiananmen',
    name: 'Apple SDK 天安门',
    displayName: '天安门',
    displayCoordinate: beijingWgs84,
  };
  mockApplePlaceResolution.mapPlacesById = { 'p-tiananmen': applePlace };
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [source] }),
    queryClient,
  });

  expect(latestMapProps().appleCoordinates).toBe(true);
  expect(latestMapProps().markers).toMatchObject([
    { id: 'china', coordinate: beijingWgs84, label: '天安门' },
  ]);
  expect(latestMapProps().cameraRequest?.coordinates).toEqual([beijingWgs84]);
  expect(renderer.root.findByProps({ testID: 'home-trip-list-count' }).props.children).toBe(1);
  expect(source.items[0].placeId).toBe('p-tiananmen');
  expect(source.placesById['p-tiananmen'].coordinate).toEqual(tiananmen);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('Home keeps an unresolved Trip in the list and points to Trip confirmation', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const source = data.trips[0];
  mockApplePlaceResolution.mapPlacesById = {};
  mockApplePlaceResolution.unresolved = [source.placesById['p-tiananmen']];
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [source] }),
    queryClient,
  });

  expect(latestMapProps().markers).toEqual([]);
  expect(renderer.root.findByProps({ testID: 'home-trip-row-china' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'home-trip-list-count' }).props.children).toBe(1);
  const confirmationHint = renderer.root.findByProps({ testID: 'home-legacy-place-confirm' });
  const hintText = confirmationHint.props.children;
  expect(Array.isArray(hintText) ? hintText.join('') : hintText)
    .toBe('打开旅行以确认旧地点（1）');
  expect(confirmationHint.props.onPress).toBeUndefined();

  act(() => renderer.unmount());
  queryClient.clear();
});

test('Home composes WGS84 Places into one Apple map across Trip regions', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const mismatched = entry(trip('global', '2026-12-01', '2026-12-05', 'global'), 'p-bj', beijingWgs84, '北京');
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [mismatched, data.trips[2]] }),
    queryClient,
  });

  // Both source Places are WGS84 and can share the same Apple MapKit map.
  expect(latestMapProps().markers.map(({ id }) => id)).toEqual(['japan', 'global']);
  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T3b: close Trips cluster at the initial span and split when the map zooms in', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [data.trips[0], data.trips[1]] }),
    queryClient,
  });

  // Stage-01 §3.1: low zoom shows a region group with a Trip count.
  const clustered = latestMapProps().markers;
  expect(clustered).toHaveLength(1);
  expect(clustered[0].variant).toBe('cluster');
  expect(clustered[0].sourceItemIds).toEqual(['china', 'china-2']);

  // The same two Trips, zoomed in: the group splits back into Trips.
  act(() => latestMapProps().onViewportChange?.({
    center: tiananmen,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  }));
  const split = latestMapProps().markers;
  expect(split.map(({ id }) => id)).toEqual(['china', 'china-2']);
  expect(split.every(({ variant }) => variant !== 'cluster')).toBe(true);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T3: the first tap only selects and opens the preview, and 查看旅行 is what enters', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const onSelectTrip = jest.fn();
  const onOpenTrip = jest.fn();
  const renderer = await renderWorkspace({
    props: { onOpenTrip, onSelectTrip },
    query: async () => ({ trips: [data.trips[0], data.trips[2]] }),
    queryClient,
  });

  // Stage-03 §3.6: tapping a marker must not navigate by itself.
  expect(renderer.root.findAllByProps({ testID: 'home-trip-preview' })).toHaveLength(0);
  await act(async () => latestMapProps().onMarkerPress?.('china'));
  expect(onOpenTrip).not.toHaveBeenCalled();
  expect(onSelectTrip).toHaveBeenCalledWith('china');
  expect(renderer.root.findByProps({ testID: 'home-trip-preview-heading' }).props.children)
    .toBe('Trip china');
  // The date range comes from the Trip, not from the marker model.
  expect(JSON.stringify(renderer.toJSON())).toContain('12月1日');

  // The explicit action is what enters.
  await act(async () => renderer.root.findByProps({ testID: 'home-trip-preview-enter' })
    .props.onPress());
  expect(onOpenTrip).toHaveBeenCalledTimes(1);
  expect(onOpenTrip.mock.calls[0][0]).toMatchObject({ id: 'china' });

  // And it closes.
  await act(async () => renderer.root.findByProps({ testID: 'home-trip-preview-close' })
    .props.onPress());
  expect(renderer.root.findAllByProps({ testID: 'home-trip-preview' })).toHaveLength(0);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T3: a cluster opens the list form and entry waits for a choice', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const onOpenTrip = jest.fn();
  const renderer = await renderWorkspace({
    props: { onOpenTrip },
    query: async () => ({ trips: [data.trips[0], data.trips[1]] }),
    queryClient,
  });

  await act(async () => latestMapProps().onMarkerPress?.(latestMapProps().markers[0].id));

  // §3.6: `北京 · 3 次旅行` then one row per Trip — and no entry before a choice.
  expect(renderer.root.findByProps({ testID: 'home-trip-preview-heading' }).props.children)
    .toBe('天安门 · 2 次旅行');
  expect(renderer.root.findByProps({ testID: 'home-trip-preview-trip-china' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'home-trip-preview-trip-china-2' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'home-trip-preview-enter' })).toHaveLength(0);

  // Choosing a member reveals the action and targets that member.
  await act(async () => renderer.root.findByProps({ testID: 'home-trip-preview-trip-china-2' })
    .props.onPress());
  await act(async () => renderer.root.findByProps({ testID: 'home-trip-preview-enter' })
    .props.onPress());
  expect(onOpenTrip.mock.calls[0][0]).toMatchObject({ id: 'china-2' });

  act(() => renderer.unmount());
  queryClient.clear();
});

test('the Home list opens the reusable Trip management sheet for a row', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [data.trips[0]] }),
    queryClient,
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'home-trip-manage-china' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'trip-management-menu' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-management-rename' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-management-delete' })).toBeDefined();

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T3: without an entry seam the preview offers no 查看旅行, and a map press dismisses it', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [data.trips[0]] }),
    queryClient,
  });

  await act(async () => latestMapProps().onMarkerPress?.('china'));
  // No seam, no action.
  expect(renderer.root.findAllByProps({ testID: 'home-trip-preview-enter' })).toHaveLength(0);

  await act(async () => latestMapProps().onMapPress?.(tiananmen));
  expect(renderer.root.findAllByProps({ testID: 'home-trip-preview' })).toHaveLength(0);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T3b: a controlled selection is honoured and not shadowed by local state', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const onSelectTrip = jest.fn();
  const renderer = await renderWorkspace({
    props: { onSelectTrip, selectedTripId: 'japan' },
    query: async () => ({ trips: [data.trips[0], data.trips[2]] }),
    queryClient,
  });

  const japan = latestMapProps().markers.find(({ id }) => id === 'japan');
  expect(japan?.variant).toBe('selected');
  // A press still reports upward, but the parent keeps ownership.
  await act(async () => latestMapProps().onMarkerPress?.('china'));
  expect(onSelectTrip).toHaveBeenCalledWith('china');
  expect(latestMapProps().markers.find(({ id }) => id === 'japan')?.variant).toBe('selected');

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T4: the filter control changes which Trips the map shows', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    // `japan` ended 2026-08-05, so it is completed and 计划中 must exclude it.
    query: async () => ({ trips: [data.trips[0], data.trips[2]] }),
    queryClient,
  });

  // 全部 is the default and shows both.
  expect(latestMapProps().markers.map(({ id }) => id).sort()).toEqual(['china', 'japan']);
  expect(latestMapProps().cameraRequest?.animated).toBe(false);
  expect(renderer.root.findByProps({ testID: 'home-trip-filter-all' }).props
    .accessibilityState).toEqual({ selected: true });

  await act(async () => renderer.root.findByProps({ testID: 'home-trip-filter-planned' })
    .props.onPress());
  expect(latestMapProps().markers.map(({ id }) => id)).toEqual(['china']);
  expect(latestMapProps().cameraRequest?.animated).toBe(false);
  expect(latestMapProps().cameraRequest?.scopeKey).toBe('home:planned:all');
  expect(renderer.root.findByProps({ testID: 'home-trip-filter-planned' }).props
    .accessibilityState).toEqual({ selected: true });

  await act(async () => renderer.root.findByProps({ testID: 'home-trip-filter-completed' })
    .props.onPress());
  expect(latestMapProps().markers.map(({ id }) => id)).toEqual(['japan']);
  expect(latestMapProps().cameraRequest?.animated).toBe(false);
  expect(latestMapProps().cameraRequest?.scopeKey).toBe('home:completed:all');

  act(() => renderer.unmount());
  queryClient.clear();
});

/** Far from Beijing and Tokyo, so the year tests never see a cluster instead of a marker. */
const losAngeles: Coordinate = { latitude: 34.0522, longitude: -118.2437, system: 'wgs84' };
const oldEntry = () => entry(trip('old', '2025-05-01', '2025-05-04', 'global'), 'p-old', losAngeles, 'Griffith');

test('Home year: choosing a year narrows the map, the list and the recap, and re-aims the camera', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const old = oldEntry();
  const renderer = await renderWorkspace({
    // china is planned (2026), japan completed (2026), old completed (2025).
    query: async () => ({ trips: [data.trips[0], data.trips[2], old] }),
    queryClient,
  });

  expect(latestMapProps().markers.map(({ id }) => id).sort()).toEqual(['china', 'japan', 'old']);
  expect(latestMapProps().cameraRequest?.scopeKey).toBe('home:all:all');
  expect(renderer.root.findByProps({ testID: 'home-year-filter-all' }).props
    .accessibilityState).toEqual({ selected: true });
  // `findAllByType` includes the node itself, so [1] is the inner number Text.
  expect(renderer.root.findByProps({ testID: 'home-recap-trips' }).findAllByType(Text)[1].props.children)
    .toBe(3);

  await act(async () => renderer.root.findByProps({ testID: 'home-year-filter-2025' }).props.onPress());
  expect(latestMapProps().markers.map(({ id }) => id)).toEqual(['old']);
  expect(latestMapProps().cameraRequest?.scopeKey).toBe('home:all:2025');
  expect(latestMapProps().cameraRequest?.animated).toBe(false);
  expect(renderer.root.findByProps({ testID: 'home-year-filter-2025' }).props
    .accessibilityState).toEqual({ selected: true });
  expect(renderer.root.findByProps({ testID: 'home-trip-list-count' }).props.children).toBe(1);
  expect(renderer.root.findAllByProps({ testID: 'home-trip-row-old' }).length).toBeGreaterThan(0);

  await act(async () => renderer.root.findByProps({ testID: 'home-year-filter-all' }).props.onPress());
  expect(latestMapProps().markers.map(({ id }) => id).sort()).toEqual(['china', 'japan', 'old']);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('Home year: changing the lifecycle filter drops the year, and a lone year hides the row', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const old = oldEntry();
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [data.trips[0], data.trips[2], old] }),
    queryClient,
  });

  await act(async () => renderer.root.findByProps({ testID: 'home-year-filter-2025' }).props.onPress());
  expect(latestMapProps().markers.map(({ id }) => id)).toEqual(['old']);

  // 计划中 holds only `china` (2026): one year, so no year row and no stale 2025.
  await act(async () => renderer.root.findByProps({ testID: 'home-trip-filter-planned' }).props.onPress());
  expect(latestMapProps().markers.map(({ id }) => id)).toEqual(['china']);
  expect(latestMapProps().cameraRequest?.scopeKey).toBe('home:planned:all');
  expect(renderer.root.findAllByProps({ testID: 'home-year-filter' })).toHaveLength(0);

  // Back under 已完成 the year starts from 全部年份, not from the old choice.
  await act(async () => renderer.root.findByProps({ testID: 'home-trip-filter-completed' }).props.onPress());
  expect(latestMapProps().markers.map(({ id }) => id).sort()).toEqual(['japan', 'old']);
  expect(renderer.root.findByProps({ testID: 'home-year-filter-all' }).props
    .accessibilityState).toEqual({ selected: true });

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T4: a controlled filter is honoured and the control still reports changes', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    props: { filter: 'planned' },
    query: async () => ({ trips: [data.trips[0], data.trips[2]] }),
    queryClient,
  });

  expect(latestMapProps().markers.map(({ id }) => id)).toEqual(['china']);
  // The parent keeps ownership, so pressing does not change what is shown.
  await act(async () => renderer.root.findByProps({ testID: 'home-trip-filter-completed' })
    .props.onPress());
  expect(latestMapProps().markers.map(({ id }) => id)).toEqual(['china']);
  expect(renderer.root.findByProps({ testID: 'home-trip-filter-planned' }).props
    .accessibilityState).toEqual({ selected: true });

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T3b: loading, failure and an empty Footprint each have their own state', async () => {
  renderMap.mockClear();
  const pendingClient = makeQueryClient();
  const pending = await renderWorkspace({
    query: () => new Promise<HomeMapData>(() => undefined),
    queryClient: pendingClient,
  });
  expect(pending.root.findByProps({ testID: 'home-map-loading' })).toBeDefined();
  expect(renderMap).not.toHaveBeenCalled();
  act(() => pending.unmount());
  pendingClient.clear();

  const errorClient = makeQueryClient();
  const failed = await renderWorkspace({
    query: async () => { throw new Error('footprint unavailable'); },
    queryClient: errorClient,
  });
  expect(failed.root.findByProps({ testID: 'home-map-error' }).props.children)
    .toBe('footprint unavailable');
  act(() => failed.unmount());
  errorClient.clear();

  const emptyClient = makeQueryClient();
  const empty = await renderWorkspace({ query: async () => ({ trips: [] }), queryClient: emptyClient });
  expect(empty.root.findByProps({ testID: 'home-map-empty' })).toBeDefined();
  act(() => empty.unmount());
  emptyClient.clear();
});

test('M10-T5: the Active Trip Card appears for today\'s Trip and continues into its Day', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const onContinueToday = jest.fn();
  const renderer = await renderWorkspace({
    props: { onContinueToday },
    query: async () => ({ trips: [activeEntry, data.trips[2]] }),
    queryClient,
  });

  // Compact by default, so it never obscures the footprint.
  expect(renderer.root.findByProps({ testID: 'home-active-trip-card' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'home-active-trip-continue' })).toHaveLength(0);

  await act(async () => renderer.root.findByProps({ testID: 'home-active-trip-toggle' })
    .props.onPress());
  expect(renderer.root.findByProps({ testID: 'home-active-trip-day' }).props.children)
    .toBe('Day 3 · 北山');

  await act(async () => renderer.root.findByProps({ testID: 'home-active-trip-continue' })
    .props.onPress());
  // The surface hands over the Trip itself, like the map's entry path does.
  expect(onContinueToday).toHaveBeenCalledTimes(1);
  expect(onContinueToday.mock.calls[0][0]).toMatchObject({ id: 'active' });
  expect(onContinueToday.mock.calls[0][1]).toBe('active-d3');

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T5: no active Trip means no card', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [data.trips[2]] }),
    queryClient,
  });
  expect(renderer.root.findAllByProps({ testID: 'home-active-trip-card' })).toHaveLength(0);
  act(() => renderer.unmount());
  queryClient.clear();
});

test('UX-B: a list row opens the Trip outright, while a marker still previews', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const onOpenTrip = jest.fn();
  const renderer = await renderWorkspace({
    props: { onOpenTrip },
    query: async () => ({ trips: [data.trips[0], data.trips[2]] }),
    queryClient,
  });

  // UX-B (2026-10-13): the list is the one-step alternative — a row navigates
  // to the Trip Overview with the Trip entity, and no preview intervenes.
  await act(async () => renderer.root.findByProps({ testID: 'home-trip-row-china' })
    .props.onPress());
  expect(onOpenTrip).toHaveBeenCalledTimes(1);
  expect(onOpenTrip.mock.calls[0][0]).toMatchObject({ id: 'china' });
  expect(renderer.root.findAllByProps({ testID: 'home-trip-preview' })).toHaveLength(0);

  // A marker keeps the Stage-03 §3.6 select-first flow.
  await act(async () => latestMapProps().onMarkerPress?.('japan'));
  expect(onOpenTrip).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({ testID: 'home-trip-preview-heading' }).props.children)
    .toBe('Trip japan');

  act(() => renderer.unmount());
  queryClient.clear();
});

test('Home draws a WGS84 Place over mainland China and keeps the Trip in the list', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const mismatched = entry(trip('global', '2026-12-01', '2026-12-05', 'global'), 'p-bj', beijingWgs84, '北京');
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [mismatched] }),
    queryClient,
  });

  const mapProps = latestMapProps();
  expect(mapProps.markers.map(({ id }) => id)).toEqual(['global']);
  expect(mapProps.showsUserLocation).toBe(false);
  expect(renderer.root.findByProps({ testID: 'home-trip-row-global' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'home-trip-list-count' }).props.children).toBe(1);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T7: the create affordance takes over the sheet, and closing returns to the list', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [data.trips[0]] }),
    queryClient,
  });

  expect(renderer.root.findAllByProps({ testID: 'home-create-trip-sheet' })).toHaveLength(0);
  await act(async () => renderer.root.findByProps({ testID: 'home-create-trip' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'home-create-trip-sheet' })).toBeDefined();
  // The real form, not a placeholder.
  expect(renderer.root.findByProps({ testID: 'create-trip-form' })).toBeDefined();
  // One sheet at a time: the list is replaced rather than stacked under it.
  expect(renderer.root.findAllByProps({ testID: 'home-trip-list-sheet' })).toHaveLength(0);

  await act(async () => renderer.root.findByProps({ testID: 'home-create-trip-close' })
    .props.onPress());
  expect(renderer.root.findByProps({ testID: 'home-trip-list-sheet' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'home-create-trip-sheet' })).toHaveLength(0);

  act(() => renderer.unmount());
  queryClient.clear();
});

test('M10-T7: an empty Footprint shows the first-use CTA instead of the filter', async () => {
  renderMap.mockClear();
  const queryClient = makeQueryClient();
  const renderer = await renderWorkspace({
    query: async () => ({ trips: [] }),
    queryClient,
  });

  expect(renderer.root.findByProps({ testID: 'home-trip-list-first-use' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'home-trip-filter' })).toHaveLength(0);
  // The map has nothing to draw, but the create path is present.
  expect(renderer.root.findByProps({ testID: 'home-map-empty' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'home-create-trip' })).toBeDefined();

  act(() => renderer.unmount());
  queryClient.clear();
});
