import { beforeEach, expect, jest, test } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';

import { buildDayMapProjection } from '@/application/projections/day-map';
import { buildTimelineProjection } from '@/application/projections/timeline';
import type { DayViewData } from '@/application/queries/day-view';
import { DayTimeline } from '@/components/day-timeline';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import { GoogleMapRenderer } from '@/infrastructure/map/google-map-renderer';
import { useDaySelection, useTripEntry } from '@/state/day-selection';
import { tripFocusStore } from '@/state/trip-focus';

jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const MapView = React.forwardRef(
    (props: { children?: ReactNode; [key: string]: unknown }, ref) => {
      React.useImperativeHandle(ref, () => ({
        animateCamera: jest.fn(),
        fitToCoordinates: jest.fn(),
      }));
      return React.createElement('MockMapView', props, props.children);
    },
  );
  const Marker = (props: { children?: ReactNode; [key: string]: unknown }) =>
    React.createElement('MockMarker', props, props.children);
  return {
    __esModule: true,
    default: MapView,
    Marker,
    PROVIDER_GOOGLE: 'google',
  };
});

const timestamp = '2026-09-13T00:00:00.000Z';

const trip = {
  id: 'trip-1',
  title: 'Sydney',
  startDate: '2026-12-30',
  endDate: '2026-12-30',
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
const place: Place = {
  id: 'place-1',
  name: 'Opera House',
  coordinate: { latitude: -33.8568, longitude: 151.2153, system: 'wgs84' },
  address: null,
  provider: 'google',
  providerPlaceId: null,
  metadata: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function makeItem(id: string, sortOrder: number, placeId: string | null): Item {
  return {
    id,
    tripId: trip.id,
    dayId: day.id,
    placeId,
    type: 'custom',
    title: id,
    sortOrder,
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

/** item-1 has a Place; item-2 must stay in the Timeline without a marker. */
const dayView: DayViewData = {
  trip,
  day,
  items: [makeItem('item-1', 0, 'place-1'), makeItem('item-2', 1, null)],
  placesById: { 'place-1': place },
};

const timeline = buildTimelineProjection(dayView);

/** Map and Timeline both consume the same seam; neither controls the other. */
function SelectionHarness() {
  useTripEntry(trip.id);
  const selection = useDaySelection(day.id);
  const map = buildDayMapProjection(dayView, selection.selectedItemId);

  return (
    <>
      <GoogleMapRenderer
        markers={map.markers}
        system="wgs84"
        onMarkerPress={selection.selectItem}
      />
      <DayTimeline
        onSelectItem={selection.selectItem}
        projection={timeline}
        selectedItemId={selection.selectedItemId}
      />
    </>
  );
}

type Renderer = ReturnType<typeof create>;

function isRowSelected(renderer: Renderer, itemId: string) {
  // The whole row — including the trailing edit action — carries the selection.
  const row = renderer.root.findByProps({ testID: `timeline-row-${itemId}` });
  const style = StyleSheet.flatten(row.props.style) as { backgroundColor?: string } | undefined;
  return Boolean(style?.backgroundColor);
}

function markerAppearance(renderer: Renderer, itemId: string) {
  const pinHead = renderer.root.findByProps({ testID: `map-pin-${itemId}-head` });
  return StyleSheet.flatten(pinHead.props.style);
}

async function renderHarness() {
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(<SelectionHarness />);
  });
  return renderer;
}

beforeEach(() => {
  tripFocusStore.setState({ tripId: null, focus: { type: 'overview' } });
});

test('normal re-entry to the same Trip resets stale Item focus to Overview', async () => {
  tripFocusStore.setState({
    tripId: trip.id,
    focus: { type: 'item', itemId: 'item-1', dayId: day.id },
  });

  const renderer = await renderHarness();

  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });
  expect(isRowSelected(renderer, 'item-1')).toBe(false);

  act(() => renderer.unmount());
});

test('a marker press and a Timeline row press resolve to the same Item selection', async () => {
  const renderer = await renderHarness();

  await act(async () => {
    renderer.root.findByProps({ testID: 'map-marker-item-1' }).props.onPress();
  });
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId: 'item-1', dayId: day.id,
  });
  expect(isRowSelected(renderer, 'item-1')).toBe(true);

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-select-item-2' }).props.onPress();
  });
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId: 'item-2', dayId: day.id,
  });
  expect(isRowSelected(renderer, 'item-2')).toBe(true);
  expect(isRowSelected(renderer, 'item-1')).toBe(false);

  act(() => renderer.unmount());
});

test('both surfaces reflect one shared selection in both directions', async () => {
  const renderer = await renderHarness();
  const normal = markerAppearance(renderer, 'item-1');

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress();
  });
  const selectedFromTimeline = markerAppearance(renderer, 'item-1');
  expect(selectedFromTimeline).not.toEqual(normal);

  await act(async () => {
    tripFocusStore.getState().selectItem('item-2', day.id);
  });
  expect(markerAppearance(renderer, 'item-1')).toEqual(normal);
  expect(isRowSelected(renderer, 'item-1')).toBe(false);

  act(() => renderer.unmount());
});

test('a Place-less Item selects without creating a marker or a numbering gap', async () => {
  const renderer = await renderHarness();
  const projection = buildDayMapProjection(dayView, null);
  expect(projection.markers.map(({ id }) => id)).toEqual(['item-1']);
  expect(projection.markers[0].ordinal).toBe(1);
  expect(renderer.root.findAllByProps({ testID: 'map-marker-item-2' })).toHaveLength(0);

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-select-item-2' }).props.onPress();
  });
  expect(isRowSelected(renderer, 'item-2')).toBe(true);
  expect(renderer.root.findAllByProps({ testID: 'map-marker-item-2' })).toHaveLength(0);

  act(() => renderer.unmount());
});

test('an Unscheduled or other-Day Item focus selects nothing in this Day', async () => {
  const renderer = await renderHarness();

  await act(async () => {
    tripFocusStore.getState().selectItem('item-1', null);
  });
  expect(isRowSelected(renderer, 'item-1')).toBe(false);

  await act(async () => {
    tripFocusStore.getState().selectItem('item-1', 'day-2');
  });
  expect(isRowSelected(renderer, 'item-1')).toBe(false);
  expect(isRowSelected(renderer, 'item-2')).toBe(false);

  act(() => renderer.unmount());
});
