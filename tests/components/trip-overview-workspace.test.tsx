import { beforeEach, expect, jest, test } from '@jest/globals';
import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { ChangeTripDateRangeCommand } from '@/application/trip/change-trip-date-range';
import type { TripOverviewData } from '@/application/queries/trip-overview';
import type { MapPlace } from '@/application/projections/map-place';
import { TripOverviewWorkspace } from '@/components/trip-overview-workspace';
import type { MapRendererProps } from '@/infrastructure/map/map-renderer';
import { tripFocusStore } from '@/state/trip-focus';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));

jest.mock('@/components/trip-bottom-sheet', () => ({
  TripBottomSheet: ({ children, snap, onSnapChange, handleGesture }: {
    children: ReactNode;
    snap: string;
    onSnapChange: (snap: string) => void;
    handleGesture?: unknown;
    scrollable?: boolean;
  }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
    // UX-C: the back-swipe wiring is read off the sheet's captured props.
    mockSheetProps.push({ handleGesture, snap });
    return React.createElement(
      ReactNative.View,
      { onTouchEnd: () => onSnapChange('expanded'), testID: `mock-sheet-${snap}` },
      children,
    );
  },
}));

/** One entry per TripBottomSheet render, in render order. */
const mockSheetProps: { handleGesture?: unknown; snap: string }[] = [];

const timestamp = '2026-09-14T00:00:00.000Z';
const data: TripOverviewData = {
  trip: {
    id: 'trip-1', title: 'Sydney', startDate: '2026-09-20', endDate: '2026-09-21',
    mapRegion: 'global', note: null, createdAt: timestamp, updatedAt: timestamp,
  },
  days: [
    { id: 'day-1', tripId: 'trip-1', date: '2026-09-20', dayIndex: 1, createdAt: timestamp, updatedAt: timestamp },
  ],
  scheduledItems: [{
    id: 'item-1', tripId: 'trip-1', dayId: 'day-1', placeId: 'place-1',
    type: 'sightseeing', title: 'Opera House', sortOrder: 0, timeMode: 'none',
    startDateTime: null, endDateTime: null, period: null, isFixed: false,
    note: null, payload: null, createdAt: timestamp, updatedAt: timestamp,
  }],
  placesById: {
    'place-1': {
      id: 'place-1', name: 'Opera House',
      coordinate: { latitude: -33.8568, longitude: 151.2153, system: 'wgs84' },
      address: null, provider: 'google', providerPlaceId: null, metadata: null,
      createdAt: timestamp, updatedAt: timestamp,
    },
  },
  unscheduledItems: [],
};

function MockMap(props: MapRendererProps) {
  return <View {...props as unknown as ComponentProps<typeof View>} testID="overview-renderer" />;
}

beforeEach(() => {
  mockSheetProps.length = 0;
  tripFocusStore.setState({ tripId: null, focus: { type: 'overview' }, sheetSnap: 'half' });
});

test('composes the saved-region map and Half-default Day List over one shared focus store', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TripOverviewWorkspace data={data} mapRenderer={MockMap} />);
  });

  const map = renderer.root.findByProps({ testID: 'overview-renderer' });
  expect(map.props.system).toBe('wgs84');
  expect(map.props.clusterMarkers).toBe(true);
  expect(map.props.markers).toEqual([
    expect.objectContaining({ id: 'item-1', sourceItemIds: ['item-1'] }),
  ]);
  expect(map.props.markers[0]).not.toHaveProperty('ordinal');
  expect(map.props.cameraRequest.coordinates).toEqual([
    data.placesById['place-1'].coordinate,
  ]);
  expect(renderer.root.findByProps({ testID: 'mock-sheet-half' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-overview-title' }).props.children)
    .toBe('Sydney');
  expect(renderer.root.findByProps({ testID: 'trip-overview-manage' })).toBeDefined();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });

  act(() => renderer.root.findByProps({ testID: 'trip-overview-day-day-1' }).props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });

  act(() => renderer.unmount());
});

test('a MapPlace display fixture cannot override the China Trip source CRS', async () => {
  const sourcePlace = {
    ...data.placesById['place-1'],
    name: 'Opera House',
    coordinate: { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' as const },
    provider: 'amap',
  };
  const applePlace: MapPlace = {
    ...sourcePlace,
    id: 'apple-place-1',
    name: 'Apple SDK Opera House',
    displayName: 'Opera House original label',
    displayCoordinate: { latitude: 39.9071, longitude: 116.3912, system: 'wgs84' },
    providerPlaceId: 'apple-opera',
  };
  const mappedData: TripOverviewData = {
    ...data,
    trip: { ...data.trip, mapRegion: 'china_mainland' },
    placesById: { 'place-1': sourcePlace },
    mapPlacesById: { 'place-1': applePlace },
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TripOverviewWorkspace data={mappedData} mapRenderer={MockMap} />);
  });

  const map = renderer.root.findByProps({ testID: 'overview-renderer' });
  expect(map.props.system).toBe('gcj02');
  expect(map.props.markers[0].coordinate).toEqual(sourcePlace.coordinate);
  expect(map.props.cameraRequest.coordinates).toEqual([sourcePlace.coordinate]);
  await act(async () => map.props.onMarkerPress(map.props.markers[0].id));
  expect(renderer.root.findByProps({ testID: 'trip-overview-place-preview' }).props.title)
    .toBe('Opera House original label');
  expect(mappedData.placesById['place-1']).toBe(sourcePlace);
  act(() => renderer.unmount());
});

test('the Overview heading opens Trip management and forwards successful seams', async () => {
  const renameTripCommand = jest.fn(async ({ title }: { title: string }) => ({
    data: { ...data.trip, title },
    affectedEntityIds: [data.trip.id],
    validationIssues: [],
  }));
  const onTripRenamed = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <TripOverviewWorkspace
        data={data}
        mapRenderer={MockMap}
        onTripRenamed={onTripRenamed}
        renameTripCommand={renameTripCommand}
      />,
    );
  });

  act(() => renderer.root.findByProps({ testID: 'trip-overview-manage' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'trip-management-menu' })).toBeDefined();
  act(() => renderer.root.findByProps({ testID: 'trip-management-rename' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'trip-management-title-input' })
    .props.onChangeText('Sydney renamed'));
  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-management-rename-save' }).props.onPress();
  });

  expect(renameTripCommand).toHaveBeenCalledWith({ tripId: data.trip.id, title: 'Sydney renamed' });
  expect(onTripRenamed).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sydney renamed' }));
  act(() => renderer.unmount());
});

test('opens a marker occurrence Preview and requires explicit Day entry for repeats', async () => {
  const repeatedData: TripOverviewData = {
    ...data,
    days: [
      ...data.days,
      { id: 'day-2', tripId: 'trip-1', date: '2026-09-21', dayIndex: 2, createdAt: timestamp, updatedAt: timestamp },
    ],
    scheduledItems: [
      ...data.scheduledItems,
      { ...data.scheduledItems[0], id: 'item-2', dayId: 'day-2', title: 'Opera House 夜景' },
    ],
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TripOverviewWorkspace data={repeatedData} mapRenderer={MockMap} />);
  });

  const map = renderer.root.findByProps({ testID: 'overview-renderer' });
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });
  await act(async () => map.props.onMarkerPress(map.props.markers[0].id));
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });
  expect(renderer.root.findByProps({ testID: 'trip-overview-place-preview-host' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-overview-occurrence-item-1' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-overview-occurrence-item-2' })).toBeDefined();

  await act(async () => renderer.root.findByProps({ testID: 'trip-overview-occurrence-item-2' }).props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });
  expect(renderer.root.findAllByProps({ testID: 'trip-overview-place-preview-host' }))
    .toHaveLength(0);
  act(() => renderer.unmount());
});

test('single occurrence Preview still requires an explicit Day entry action', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TripOverviewWorkspace data={data} mapRenderer={MockMap} />);
  });
  const map = renderer.root.findByProps({ testID: 'overview-renderer' });
  await act(async () => map.props.onMarkerPress('item-1'));
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });
  expect(renderer.root.findByProps({ testID: 'trip-overview-occurrence-item-1' })).toBeDefined();
  await act(async () => renderer.root.findByProps({ testID: 'trip-overview-occurrence-item-1' }).props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });
  act(() => renderer.unmount());
});

test('keeps Unscheduled pins off Overview at every density while retaining their saved Items', async () => {
  const densePlaces = Object.fromEntries(Array.from({ length: 21 }, (_, index) => {
    const id = `unscheduled-place-${index}`;
    return [id, {
      ...data.placesById['place-1'],
      id,
      name: `候选地点 ${index + 1}`,
      coordinate: {
        latitude: -33.8568 + index * 0.01,
        longitude: 151.2153 + index * 0.01,
        system: 'wgs84' as const,
      },
    }];
  }));
  const denseData: TripOverviewData = {
    ...data,
    placesById: densePlaces,
    unscheduledItems: Object.keys(densePlaces).map((placeId, index) => ({
      ...data.scheduledItems[0],
      id: `unscheduled-item-${index}`,
      dayId: null,
      placeId,
      title: `候选地点 ${index + 1}`,
      sortOrder: index,
    })),
    scheduledItems: [],
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TripOverviewWorkspace data={denseData} mapRenderer={MockMap} />);
  });

  const map = renderer.root.findByProps({ testID: 'overview-renderer' });
  expect(map.props.markers).toHaveLength(0);
  // UX-C: the manual hide/show toggle is gone — the threshold rule stands alone.
  expect(renderer.root.findAllByProps({ testID: 'trip-overview-unscheduled-toggle' }))
    .toHaveLength(0);
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });

  act(() => renderer.unmount());
  const sparseData = { ...denseData, unscheduledItems: denseData.unscheduledItems.slice(0, 1) };
  await act(async () => { renderer = create(<TripOverviewWorkspace data={sparseData} mapRenderer={MockMap} />); });
  expect(renderer.root.findByProps({ testID: 'overview-renderer' }).props.markers).toHaveLength(0);
  expect(sparseData.unscheduledItems).toHaveLength(1);
  act(() => renderer.unmount());
});

test('a numeric cluster fits its original points, then exposes source occurrences if they still cannot separate', async () => {
  const secondPlace = { ...data.placesById['place-1'], id: 'place-2', name: 'Sydney Harbour',
    coordinate: { latitude: -33.858, longitude: 151.211, system: 'wgs84' as const } };
  const clusteredData = { ...data, placesById: { ...data.placesById, 'place-2': secondPlace },
    scheduledItems: [...data.scheduledItems, { ...data.scheduledItems[0], id: 'item-2', placeId: 'place-2',
      title: '看夜景', sortOrder: 1 }] };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TripOverviewWorkspace data={clusteredData} mapRenderer={MockMap} />); });
  const native = () => renderer.root.findByProps({ testID: 'overview-renderer' });
  const members = native().props.markers;
  await act(async () => native().props.onClusterPress(members));
  expect(native().props.cameraRequest.coordinates).toEqual(members.map((m: { coordinate: unknown }) => m.coordinate));
  expect(native().props.cameraRequest.requestId).toBe(1);
  expect(renderer.root.findAllByProps({ testID: 'trip-overview-occurrence-item-2' })).toHaveLength(0);
  await act(async () => native().props.onClusterPress(members));
  expect(native().props.cameraRequest.requestId).toBe(1);
  expect(renderer.root.findByProps({ testID: 'trip-overview-occurrence-item-1' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-overview-occurrence-item-2' })).toBeDefined();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });
  await act(async () => native().props.onMapInteraction());
  await act(async () => native().props.onClusterPress(members));
  expect(native().props.cameraRequest.requestId).toBe(2);
  act(() => renderer.unmount());
});

test('co-located distinct Places open their original occurrence list directly without a futile camera fit', async () => {
  const secondPlace = { ...data.placesById['place-1'], id: 'place-2', name: '同址入口' };
  const samePointData = { ...data, placesById: { ...data.placesById, 'place-2': secondPlace },
    scheduledItems: [...data.scheduledItems, { ...data.scheduledItems[0], id: 'item-2', placeId: 'place-2', sortOrder: 1 }] };
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<TripOverviewWorkspace data={samePointData} mapRenderer={MockMap} />); });
  const map = renderer.root.findByProps({ testID: 'overview-renderer' });
  await act(async () => map.props.onClusterPress(map.props.markers));
  expect(renderer.root.findByProps({ testID: 'overview-renderer' }).props.cameraRequest.requestId).toBeUndefined();
  expect(renderer.root.findByProps({ testID: 'trip-overview-occurrence-item-2' })).toBeDefined();
  act(() => renderer.unmount());
});

test('the date block opens the Trip date sheet and confirms with a toast', async () => {
  const changeTripDateRange = jest.fn<ChangeTripDateRangeCommand>(async () => ({
    data: undefined,
    affectedEntityIds: [],
    validationIssues: [],
  }));
  const onDateRangeChanged = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <TripOverviewWorkspace
        changeTripDateRange={changeTripDateRange}
        data={data}
        mapRenderer={MockMap}
        onDateRangeChanged={onDateRangeChanged}
      />,
    );
  });

  // Browsing never exposes a structural control.
  expect(renderer.root.findAllByProps({ testID: 'trip-day-structure-menu-day-1' }))
    .toHaveLength(0);

  act(() => renderer.root.findByProps({ testID: 'trip-overview-date-summary' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'trip-date-management-menu' })).toBeDefined();

  act(() => renderer.root.findByProps({ testID: 'trip-date-management-entry-shift' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'trip-date-shift-calendar-day-2026-09-22' }).props.onPress());
  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-date-shift-confirm' }).props.onPress();
  });

  expect(changeTripDateRange).toHaveBeenCalledWith({
    tripId: 'trip-1',
    startDate: '2026-09-22',
    endDate: '2026-09-23',
    strategy: 'shiftItems',
  });
  expect(onDateRangeChanged).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByProps({ testID: 'app-toast-message' }).props.children)
    .toBe('旅行日期已更新');
  act(() => renderer.unmount());
});

test('a trip without an editable date command keeps the date block inert', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TripOverviewWorkspace data={data} mapRenderer={MockMap} />);
  });

  expect(renderer.root.findByProps({ testID: 'trip-overview-date-summary' }).props.disabled)
    .toBe(true);
  expect(renderer.root.findAllByProps({ testID: 'trip-date-management' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('UX-C: the right-swipe back rides the sheet handle only with a back seam', async () => {
  const onBack = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<TripOverviewWorkspace data={data} mapRenderer={MockMap} onBack={onBack} />);
  });
  expect(mockSheetProps.at(-1)?.handleGesture).not.toBeUndefined();
  act(() => renderer.unmount());

  await act(async () => {
    renderer = create(<TripOverviewWorkspace data={data} mapRenderer={MockMap} />);
  });
  // No seam, no gesture: the handle stays a plain drag zone.
  expect(mockSheetProps.at(-1)?.handleGesture).toBeUndefined();
  act(() => renderer.unmount());
});
