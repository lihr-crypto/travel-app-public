import { beforeEach, expect, jest, test } from '@jest/globals';
import type { ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import M4MapFixturesRoute from '@/app/map-fixtures';
import { DayTimeline } from '@/components/day-timeline';
import { SafeAreaTestProvider } from '../helpers/safe-area';
import { m4MapFixtures } from '@/infrastructure/database/m4-map-fixtures';
import { resolveTripMapStack } from '@/infrastructure/map/map-provider-policy';
import { tripFocusStore } from '@/state/trip-focus';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare' },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));
jest.mock('@/infrastructure/map/google-map-renderer', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    GoogleMapRenderer: (props: Record<string, unknown>) =>
      React.createElement('MockGoogleMap', { ...props, testID: 'm4-google-map' }),
  };
});
jest.mock('@/infrastructure/map/amap-map-renderer', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    AmapMapRenderer: (props: Record<string, unknown>) =>
      React.createElement('MockAmapMap', { ...props, testID: 'm4-amap-map' }),
  };
});
jest.mock('@/components/amap-privacy-gate', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    AmapPrivacyGate: ({ children }: { children: ReactNode }) =>
      React.createElement('MockPrivacyGate', { testID: 'm4-amap-consent' }, children),
  };
});

const persisted = m4MapFixtures.map((fixture) => ({
  ...fixture,
  stack: resolveTripMapStack(fixture.trip),
}));

beforeEach(() => {
  tripFocusStore.setState({ tripId: null, focus: { type: 'overview' }, sheetSnap: 'half' });
});

test('explicitly installs persisted fixtures and routes each saved region to its native map', async () => {
  const installFixtures = jest.fn(async () => {});
  const loadFixtures = jest.fn(async () => persisted);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <SafeAreaTestProvider>
        <M4MapFixturesRoute
          installFixtures={installFixtures}
          loadFixtures={loadFixtures}
        />
      </SafeAreaTestProvider>,
    );
  });
  expect(installFixtures).not.toHaveBeenCalled();
  expect(renderer.root.findAllByProps({ testID: 'm4-google-map' })).toHaveLength(0);

  await act(async () => {
    renderer.root.findByProps({ testID: 'm4-install-fixtures' }).props.onPress();
  });
  expect(installFixtures).toHaveBeenCalledTimes(1);
  expect(loadFixtures).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(renderer.toJSON())).toContain(persisted[0].item.id);
  const google = renderer.root.findByProps({ testID: 'm4-google-map' });
  expect(google.props.system).toBe('wgs84');
  expect(google.props.markers[0].id).toBe(persisted[0].item.id);

  await act(async () => {
    renderer.root.findByProps({ testID: 'm4-select-amap' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'm4-amap-consent' })).toBeDefined();
  const amap = renderer.root.findByProps({ testID: 'm4-amap-map' });
  expect(amap.props.system).toBe('gcj02');
  expect(amap.props.markers[0].id).toBe(persisted[1].item.id);
  act(() => renderer.unmount());
});

test('fixture installation failure leaves the map unmounted', async () => {
  const installFixtures = jest.fn(async () => { throw new Error('fixture failed'); });
  const loadFixtures = jest.fn(async () => persisted);
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <SafeAreaTestProvider>
        <M4MapFixturesRoute
          installFixtures={installFixtures}
          loadFixtures={loadFixtures}
        />
      </SafeAreaTestProvider>,
    );
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'm4-install-fixtures' }).props.onPress();
  });
  expect(loadFixtures).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ testID: 'm4-fixture-error' }).props.children)
    .toBe('fixture failed');
  expect(renderer.root.findAllByProps({ testID: 'm4-fixture-map-frame' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('real fixture route connects the DayTimeline and map with repeatable one-shot focus', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <SafeAreaTestProvider>
        <M4MapFixturesRoute
          installFixtures={async () => {}}
          loadFixtures={async () => persisted}
        />
      </SafeAreaTestProvider>,
    );
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'm4-install-fixtures' }).props.onPress();
  });
  const itemId = persisted[0].item.id;
  const map = () => renderer.root.findByProps({ testID: 'm4-google-map' });
  expect(renderer.root.findByProps({ testID: `timeline-select-${itemId}` })).toBeDefined();
  expect(map().props.markers[0].variant).toBe('normal');

  act(() => tripFocusStore.getState().setSheetSnap('collapsed'));
  await act(async () => {
    renderer.root.findByProps({ testID: `timeline-select-${itemId}` }).props.onPress();
  });
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId, dayId: persisted[0].day.id,
  });
  expect(tripFocusStore.getState().sheetSnap).toBe('half');
  expect(map().props.markers[0].variant).toBe('selected');
  expect(map().props.cameraRequest.requestId).toBe(1);

  act(() => tripFocusStore.getState().setSheetSnap('expanded'));
  await act(async () => {
    map().props.onMarkerPress(itemId);
  });
  expect(tripFocusStore.getState().sheetSnap).toBe('expanded');
  expect(renderer.root.findByProps({ testID: 'day-timeline' })).toBeDefined();
  expect(renderer.root.findByType(DayTimeline).props.scrollRequest).toEqual({
    itemId, requestId: 2,
  });
  expect(map().props.cameraRequest.requestId).toBe(1);

  await act(async () => {
    renderer.root.findByProps({ testID: 'm4-fit-day' }).props.onPress();
  });
  expect(map().props.cameraRequest.requestId).toBe(3);

  await act(async () => {
    renderer.root.findByProps({ testID: `timeline-select-${itemId}` }).props.onPress();
  });
  expect(map().props.cameraRequest.requestId).toBe(4);
  act(() => renderer.unmount());
});
