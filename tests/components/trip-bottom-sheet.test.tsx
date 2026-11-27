import { beforeEach, expect, jest, test } from '@jest/globals';
import type { ComponentType, ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import BottomSheetMock from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  sheetIndexToSnap,
  TRIP_SHEET_DEFAULT_SNAP,
  TRIP_SHEET_DEFAULT_SNAP_INDEX,
  TRIP_SHEET_SNAP_INDEX,
  TRIP_SHEET_SNAP_PERCENTAGES,
  TRIP_SHEET_SNAP_POINTS,
  TRIP_SHEET_SNAP_STATES,
  TripBottomSheet,
} from '@/components/trip-bottom-sheet';
import { tripFocusStore, useTripFocus } from '@/state/trip-focus';

jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const snapToIndex = jest.fn();
  const BottomSheet = React.forwardRef(
    (props: { children?: ReactNode; [key: string]: unknown }, ref) => {
      React.useImperativeHandle(ref, () => ({ snapToIndex }));
      const Handle = props.handleComponent as
        | ComponentType<Record<string, never>>
        | null
        | undefined;
      return React.createElement(
        'MockBottomSheet',
        props,
        Handle ? React.createElement(Handle, {}) : null,
        props.children,
      );
    },
  );
  const BottomSheetView = (props: { children?: ReactNode; [key: string]: unknown }) =>
    React.createElement('MockBottomSheetView', props, props.children);
  const BottomSheetScrollView = (props: { children?: ReactNode; [key: string]: unknown }) =>
    React.createElement('MockBottomSheetScrollView', { ...props, mockScrollable: true }, props.children);
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetView,
    BottomSheetScrollView,
    __mock: { snapToIndex },
  };
});

const nativeCalls = jest.requireMock('@gorhom/bottom-sheet') as {
  __mock: { snapToIndex: ReturnType<typeof jest.fn> };
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(children: ReactNode) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={metrics}>
          <TripBottomSheet>{children}</TripBottomSheet>
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
  });
  return renderer;
}

/** The wiring M5-T3/T4 will use: one store slice drives the sheet. */
function StoreSheetHarness() {
  const snap = useTripFocus((state) => state.sheetSnap);
  const setSheetSnap = useTripFocus((state) => state.setSheetSnap);
  return (
    <TripBottomSheet onSnapChange={setSheetSnap} snap={snap}>
      <Text testID="sheet-child">Trip Overview</Text>
    </TripBottomSheet>
  );
}

function renderHarness() {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={metrics}>
          <StoreSheetHarness />
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
  });
  return renderer;
}

beforeEach(() => {
  tripFocusStore.setState({ tripId: null, focus: { type: 'overview' }, sheetSnap: 'half' });
  nativeCalls.__mock.snapToIndex.mockClear();
});

test('exposes the Stage 04 §43 snap targets with Half as the planning default', () => {
  expect(TRIP_SHEET_SNAP_STATES).toEqual(['collapsed', 'half', 'expanded']);
  expect(TRIP_SHEET_SNAP_POINTS).toEqual(['14%', '48%', '88%']);
  expect(TRIP_SHEET_DEFAULT_SNAP).toBe('half');
  expect(TRIP_SHEET_DEFAULT_SNAP_INDEX).toBe(TRIP_SHEET_SNAP_INDEX.half);

  const { collapsed, half, expanded } = TRIP_SHEET_SNAP_PERCENTAGES;
  expect(collapsed).toBeGreaterThanOrEqual(12);
  expect(collapsed).toBeLessThanOrEqual(15);
  expect(half).toBeGreaterThanOrEqual(45);
  expect(half).toBeLessThanOrEqual(50);
  expect(expanded).toBeGreaterThanOrEqual(85);
  expect(expanded).toBeLessThanOrEqual(90);
  expect(expanded).toBeLessThan(100);

  // Ascending order is what makes a native index a position in this list.
  expect(TRIP_SHEET_SNAP_STATES.map((snap) => TRIP_SHEET_SNAP_INDEX[snap]))
    .toEqual([0, 1, 2]);
});

test('mounts inside the gesture root and keeps the map visible behind it', () => {
  const renderer = renderSheet(<Text testID="sheet-child">Trip Overview</Text>);
  const sheet = renderer.root.findByType(BottomSheetMock);

  expect(sheet.props.snapPoints).toEqual(['14%', '48%', '88%']);
  expect(sheet.props.index).toBe(TRIP_SHEET_SNAP_INDEX.half);
  expect(sheet.props.enableDynamicSizing).toBe(false);
  expect(sheet.props.enablePanDownToClose).toBe(false);
  // The white background must reach the physical bottom edge: a sheet-level
  // bottom inset lifts it and exposes the full-screen map underneath.
  expect(sheet.props.bottomInset ?? 0).toBe(0);
  expect(typeof sheet.props.handleComponent).toBe('function');

  expect(
    renderer.root.findByProps({ testID: 'trip-bottom-sheet-handle' }),
  ).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'sheet-child' })).toBeDefined();

  act(() => renderer.unmount());
});

test('opts long Overview content into the Bottom Sheet gesture-aware scroller', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={metrics}>
          <TripBottomSheet scrollable><Text>Days</Text></TripBottomSheet>
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
  });

  expect(renderer.root.findByProps({ mockScrollable: true })).toBeDefined();
  act(() => renderer.unmount());
});

test('keeps Home Indicator clearance in content padding rather than a sheet gap', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={metrics}>
          <TripBottomSheet scrollable><Text>Days</Text></TripBottomSheet>
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
  });

  const sheet = renderer.root.findByType(BottomSheetMock);
  expect(sheet.props.bottomInset ?? 0).toBe(0);

  const content = renderer.root.findByProps({ testID: 'trip-bottom-sheet-content' });
  const contentStyle = StyleSheet.flatten(content.props.contentContainerStyle);
  expect(contentStyle.paddingBottom).toBe(metrics.insets.bottom + 16);
  // Snap geometry and camera-padding semantics are untouched by this fix.
  expect(TRIP_SHEET_SNAP_PERCENTAGES).toEqual({ collapsed: 14, half: 48, expanded: 88 });

  act(() => renderer.unmount());
});

test('maps every native sheet index to exactly one snap state', () => {
  expect(sheetIndexToSnap(0)).toBe('collapsed');
  expect(sheetIndexToSnap(1)).toBe('half');
  expect(sheetIndexToSnap(2)).toBe('expanded');
  expect(sheetIndexToSnap(-1)).toBeUndefined();
  expect(sheetIndexToSnap(3)).toBeUndefined();
});

test('renders a fixed header outside the scrollable body', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={metrics}>
          <TripBottomSheet
            header={<Text testID="sheet-header-child">Day 1</Text>}
            scrollable
          >
            <Text testID="sheet-body-child">Timeline</Text>
          </TripBottomSheet>
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
  });

  const header = renderer.root.findByProps({ testID: 'trip-bottom-sheet-header' });
  const scrollable = renderer.root.findByProps({ mockScrollable: true });
  /** Host nodes only: a composite and its host view share one `testID`. */
  const hostCount = (node: typeof header, testID: string) =>
    node.findAll((child) => typeof child.type === 'string' && child.props?.testID === testID).length;

  expect(hostCount(header, 'sheet-header-child')).toBe(1);
  /*
   * The header must be a sibling of the scrollable, never a child of it. A
   * gesture nested inside `BottomSheetScrollView` is not declared simultaneous
   * with the scroll view's own UIScrollView pan, so on device it loses the
   * activation race and the swipe never fires.
   */
  expect(hostCount(scrollable, 'sheet-header-child')).toBe(0);
  expect(hostCount(scrollable, 'sheet-body-child')).toBe(1);

  act(() => renderer.unmount());
});

test('reports a user drag to the store without snapping the sheet back', () => {
  tripFocusStore.getState().selectTrip('trip-1');
  const renderer = renderHarness();
  const sheet = renderer.root.findByType(BottomSheetMock);
  expect(sheet.props.index).toBe(TRIP_SHEET_SNAP_INDEX.half);

  act(() => sheet.props.onChange(0, 0, 'gesture'));
  expect(tripFocusStore.getState().sheetSnap).toBe('collapsed');
  expect(nativeCalls.__mock.snapToIndex).not.toHaveBeenCalled();

  act(() => sheet.props.onChange(2, 0, 'gesture'));
  expect(tripFocusStore.getState().sheetSnap).toBe('expanded');
  expect(nativeCalls.__mock.snapToIndex).not.toHaveBeenCalled();

  // An out-of-range index must not invent a snap state.
  act(() => sheet.props.onChange(7, 0, 'gesture'));
  expect(tripFocusStore.getState().sheetSnap).toBe('expanded');

  act(() => renderer.unmount());
});

test('an externally changed snap state snaps the sheet exactly once', () => {
  tripFocusStore.getState().selectTrip('trip-1');
  const renderer = renderHarness();
  expect(nativeCalls.__mock.snapToIndex).not.toHaveBeenCalled();

  act(() => tripFocusStore.getState().setSheetSnap('collapsed'));
  expect(nativeCalls.__mock.snapToIndex).toHaveBeenCalledTimes(1);
  expect(nativeCalls.__mock.snapToIndex).toHaveBeenCalledWith(
    TRIP_SHEET_SNAP_INDEX.collapsed,
  );

  // Re-rendering with the same snap state must not re-snap.
  act(() => tripFocusStore.getState().setSheetSnap('collapsed'));
  expect(nativeCalls.__mock.snapToIndex).toHaveBeenCalledTimes(1);

  act(() => tripFocusStore.getState().setSheetSnap('expanded'));
  expect(nativeCalls.__mock.snapToIndex).toHaveBeenCalledTimes(2);
  expect(nativeCalls.__mock.snapToIndex).toHaveBeenLastCalledWith(
    TRIP_SHEET_SNAP_INDEX.expanded,
  );

  act(() => renderer.unmount());
});

test('a temporary body-pull position never becomes the controlled sheet index', () => {
  tripFocusStore.getState().selectTrip('trip-1');
  const renderer = renderHarness();
  const sheet = renderer.root.findByType(BottomSheetMock);
  act(() => sheet.props.onChange(-1));
  act(() => renderer.update(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={metrics}>
        <StoreSheetHarness />
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  ));
  expect(renderer.root.findByType(BottomSheetMock).props.index).toBe(1);
  expect(nativeCalls.__mock.snapToIndex).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});
