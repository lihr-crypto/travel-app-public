import { expect, test } from '@jest/globals';
import { createElement } from 'react';
import { Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';

import { createTripFocusStore, DEFAULT_SHEET_SNAP, tripFocusStore, useTripFocus } from '@/state/trip-focus';

test('keeps one legal focus state and follows Item → Day → Overview → Home back hierarchy', () => {
  const store = createTripFocusStore();
  expect({ tripId: store.getState().tripId, focus: store.getState().focus })
    .toEqual({ tripId: null, focus: { type: 'overview' } });

  store.getState().selectTrip('trip-1');
  expect(store.getState().focus).toEqual({ type: 'overview' });
  store.getState().selectDay('day-1');
  store.getState().selectItem('item-1', 'day-1');
  expect(store.getState().focus).toEqual({
    type: 'item', itemId: 'item-1', dayId: 'day-1',
  });

  store.getState().handleBack();
  expect(store.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });
  store.getState().handleBack();
  expect(store.getState().focus).toEqual({ type: 'overview' });
  store.getState().handleBack();
  expect({ tripId: store.getState().tripId, focus: store.getState().focus })
    .toEqual({ tripId: null, focus: { type: 'overview' } });
  store.getState().handleBack();
  expect(store.getState().tripId).toBeNull();
});

test('Unscheduled Item backs to Unscheduled; switching Day clears Item focus', () => {
  const store = createTripFocusStore();
  store.getState().selectTrip('trip-1');
  store.getState().openUnscheduled();
  store.getState().selectItem('item-unscheduled', null);
  store.getState().handleBack();
  expect(store.getState().focus).toEqual({ type: 'unscheduled' });
  store.getState().selectDay('day-2');
  expect(store.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });
  store.getState().enterOverview();
  expect(store.getState().focus).toEqual({ type: 'overview' });
});

test('Continue Today enters a saved Trip and Day in one state change', () => {
  const store = createTripFocusStore();
  store.getState().selectTrip('old-trip');
  store.getState().selectItem('old-item', 'old-day');
  let updates = 0;
  const unsubscribe = store.subscribe(() => { updates += 1; });

  store.getState().continueToday('active-trip', 'today-day');
  expect(updates).toBe(1);
  expect({ tripId: store.getState().tripId, focus: store.getState().focus })
    .toEqual({ tripId: 'active-trip', focus: { type: 'day', dayId: 'today-day' } });
  unsubscribe();
});

test('rejects focus changes without a Trip or blank stable IDs', () => {
  const store = createTripFocusStore();
  expect(() => store.getState().selectDay('day-1'))
    .toThrow('Select a Trip before changing focus');
  expect(() => store.getState().selectTrip('  '))
    .toThrow('Trip ID must not be empty');
  expect(store.getState().tripId).toBeNull();

  store.getState().selectTrip('trip-1');
  expect(() => store.getState().selectItem('', 'day-1'))
    .toThrow('Item ID must not be empty');
  expect(() => store.getState().selectItem('item-1', ' '))
    .toThrow('Day ID must not be empty');
  expect(store.getState().focus).toEqual({ type: 'overview' });
});

test('store contains only interaction IDs, focus, sheet geometry and actions', () => {
  const store = createTripFocusStore();
  expect(Object.keys(store.getState()).sort()).toEqual([
    'continueToday', 'enterOverview', 'focus', 'handleBack', 'openUnscheduled',
    'selectDay', 'selectItem', 'selectTrip', 'setSheetSnap', 'sheetSnap',
    'tripId',
  ]);
});

test('starts every Trip on the Half planning state and tracks sheet snaps', () => {
  const store = createTripFocusStore();
  expect(DEFAULT_SHEET_SNAP).toBe('half');
  expect(store.getState().sheetSnap).toBe('half');

  expect(() => store.getState().setSheetSnap('collapsed'))
    .toThrow('Select a Trip before changing focus');
  expect(store.getState().sheetSnap).toBe('half');

  store.getState().selectTrip('trip-1');
  store.getState().setSheetSnap('expanded');
  expect(store.getState().sheetSnap).toBe('expanded');

  store.getState().handleBack();
  expect(store.getState().sheetSnap).toBe('half');

  store.getState().selectTrip('trip-2');
  store.getState().setSheetSnap('collapsed');
  expect(store.getState().sheetSnap).toBe('collapsed');
  store.getState().selectTrip('trip-3');
  expect(store.getState().sheetSnap).toBe('half');

  store.getState().continueToday('active-trip', 'today-day');
  store.getState().setSheetSnap('expanded');
  store.getState().continueToday('active-trip', 'today-day');
  expect(store.getState().sheetSnap).toBe('half');
});

test('two independent subscribers observe the same TripFocus', () => {
  function FocusLabel({ testID }: { testID: string }) {
    const focus = useTripFocus((state) => state.focus);
    return createElement(Text, { testID }, focus.type === 'item' ? focus.itemId : focus.type);
  }

  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(
      View, null,
      createElement(FocusLabel, { testID: 'map-focus' }),
      createElement(FocusLabel, { testID: 'timeline-focus' }),
    ));
  });
  act(() => {
    tripFocusStore.getState().selectTrip('trip-1');
    tripFocusStore.getState().selectItem('item-1', 'day-1');
  });
  const labels = renderer.root.findAllByType(Text);
  expect(labels.find((node) => node.props.testID === 'map-focus')?.props.children).toBe('item-1');
  expect(labels.find((node) => node.props.testID === 'timeline-focus')?.props.children).toBe('item-1');
  act(() => {
    renderer.unmount();
    tripFocusStore.setState({ tripId: null, focus: { type: 'overview' } });
  });
});
