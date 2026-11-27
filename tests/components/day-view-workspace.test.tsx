import { beforeEach, expect, jest, test } from '@jest/globals';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { DayViewData } from '@/application/queries/day-view';
import type { ConfirmMapPickerPlaceCommand } from '@/application/place/confirm-map-picker-place';
import type { ConfirmedPlaceItem, ConfirmPlaceSearchResultCommand } from '@/application/place/confirm-place-search-result';
import type { MapPlace } from '@/application/projections/map-place';
import type { DeleteItemCommand } from '@/application/item/delete-item';
import type { UpdateItemDetailsCommand } from '@/application/item/update-item-details';
import type { RestoreDeletedItemCommand } from '@/application/item/restore-deleted-item';
import type { ChangeItemPlaceCommand } from '@/application/item/change-item-place';
import type { MoveItemToDayCommand } from '@/application/item/move-item-to-day';
import type { MoveItemToUnscheduledCommand } from '@/application/item/move-item-to-unscheduled';
import type { ReorderItemCommand } from '@/application/item/reorder-item';
import { resolveAdjacentDaySwipe, resolveDaySwipeIntent, shouldClaimDaySwipe } from '@/components/day-header';
import { TripBottomSheet } from '@/components/trip-bottom-sheet';
import { DayTimeline } from '@/components/day-timeline';
import { DayViewWorkspace } from '@/components/day-view-workspace';
import { SHEET_SLIDE_MS } from '@/components/ui/animated-sheet-modal';
import { PlaceSearch } from '@/components/place-search';
import { openPlaceInExternalMap } from '@/infrastructure/map/external-map-handoff';
import type { MapRendererProps } from '@/infrastructure/map/map-renderer';
import type { PlaceProviderSession } from '@/infrastructure/place/place-provider-session';
import { tripFocusStore } from '@/state/trip-focus';

jest.mock('@/infrastructure/map/external-map-handoff', () => ({
  openPlaceInExternalMap: jest.fn(async () => ({ app: 'google', url: 'mocked' })),
}));

const handoff = openPlaceInExternalMap as jest.MockedFunction<typeof openPlaceInExternalMap>;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));

jest.mock('@/components/trip-bottom-sheet', () => {
  const scrollToSheet = jest.fn();
  const scrollableValues: boolean[] = [];
  const contentPanFlags: boolean[] = [];
  const scrollEnabledFlags: boolean[] = [];
  const mountLog: string[] = [];
  const simultaneousHandlers: unknown[] = [];
  const headerGestures: unknown[] = [];
  return {
    TRIP_SHEET_SNAP_INDEX: { collapsed: 0, half: 1, expanded: 2 },
    TRIP_SHEET_SNAP_STATES: ['collapsed', 'half', 'expanded'],
    TripBottomSheet: ({ children, header, headerGesture, snap, scrollable, scrollViewRef, simultaneousHandlers: handlers, contentPanningGesture, scrollEnabled }: {
      children: ReactNode;
      header?: ReactNode;
      headerGesture?: unknown;
      snap: string;
      scrollable?: boolean;
      scrollViewRef?: { current: { scrollTo: (options: { y: number; animated: boolean }) => void } | null };
      simultaneousHandlers?: unknown;
      contentPanningGesture?: boolean;
      scrollEnabled?: boolean;
    }) => {
      const React = jest.requireActual<typeof import('react')>('react');
      const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
      if (scrollViewRef) scrollViewRef.current = { scrollTo: scrollToSheet };
      // Capture each distinct ref once: the sheet re-renders on effects, which
      // would otherwise push the same ref many times and shift the indices the
      // swipe test reads.
      if (handlers !== undefined && !simultaneousHandlers.includes(handlers)) {
        simultaneousHandlers.push(handlers);
      }
      if (headerGesture !== undefined && !headerGestures.includes(headerGesture)) {
        headerGestures.push(headerGesture);
      }
      scrollableValues.push(Boolean(scrollable));
      contentPanFlags.push(contentPanningGesture !== false);
      scrollEnabledFlags.push(scrollEnabled !== false);
      React.useEffect(() => {
        mountLog.push(snap);
        return () => { mountLog.push(`unmounted:${snap}`); };
      }, []);
      return React.createElement(
        ReactNative.View,
        { testID: `mock-day-sheet-${snap}` },
        header === undefined
          ? null
          : React.createElement(
              ReactNative.View,
              { testID: 'mock-day-sheet-header' },
              header,
            ),
        children,
      );
    },
    __mock: { scrollToSheet, scrollableValues, contentPanFlags, scrollEnabledFlags, mountLog, simultaneousHandlers, headerGestures },
  };
});

const sheetMock = jest.requireMock('@/components/trip-bottom-sheet') as {
  __mock: {
    scrollToSheet: ReturnType<typeof jest.fn>;
    scrollableValues: boolean[];
    contentPanFlags: boolean[];
    scrollEnabledFlags: boolean[];
    mountLog: string[];
    simultaneousHandlers: unknown[];
    headerGestures: unknown[];
  };
};

// The Day swipe is an RNGH native gesture. In tests we render the detector as a
// pass-through and make `Gesture.Pan()` a chainable stub so the component can
// build its gesture without a native host.
jest.mock('react-native-gesture-handler', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const chainable = () => {
    const g: Record<string, jest.Mock> = {};
    for (const method of ['activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY', 'hitSlop', 'manualActivation', 'onBegin', 'onStart', 'onEnd', 'onFinalize', 'onTouchesDown', 'onTouchesMove', 'onTouchesUp', 'onTouchesCancelled', 'onUpdate', 'enabled', 'runOnJS', 'simultaneousWithExternalGesture']) {
      g[method] = jest.fn((...args: unknown[]) => {
        // Capture a callback so tests can drive the gesture: `gesture.onEnd(cb)`
        // stores `cb`, reachable afterward as `gesture.__onEnd`.
        const fnArg = args.find((arg) => typeof arg === 'function');
        if (fnArg) g[`__${method}` as keyof typeof g] = fnArg as jest.Mock;
        return g;
      });
    }
    /**
     * `withRef` must actually assign the gesture to the ref, mirroring RNGH, so
     * the test can reach the built gesture through the ref the component passed
     * to the Bottom Sheet's `simultaneousHandlers`.
     */
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
      ReactActual.createElement(ReactActual.Fragment, null, children),
    Gesture: { Pan: jest.fn(chainable) },
  };
});

const timestamp = '2026-09-14T00:00:00.000Z';
const data: DayViewData = {
  trip: {
    id: 'trip-1', title: 'Sydney', startDate: '2026-09-20', endDate: '2026-09-21',
    mapRegion: 'global', note: null, createdAt: timestamp, updatedAt: timestamp,
  },
  day: {
    id: 'day-1', tripId: 'trip-1', date: '2026-09-20', dayIndex: 1,
    createdAt: timestamp, updatedAt: timestamp,
  },
  items: [
    {
      id: 'item-1', tripId: 'trip-1', dayId: 'day-1', placeId: 'place-1',
      type: 'sightseeing', title: 'Opera House', sortOrder: 0, timeMode: 'none',
      startDateTime: null, endDateTime: null, period: null, isFixed: false,
      note: null, payload: null, createdAt: timestamp, updatedAt: timestamp,
    },
    {
      id: 'item-2', tripId: 'trip-1', dayId: 'day-1', placeId: null,
      type: 'custom', title: '整理照片', sortOrder: 1, timeMode: 'none',
      startDateTime: null, endDateTime: null, period: null, isFixed: false,
      note: null, payload: null, createdAt: timestamp, updatedAt: timestamp,
    },
  ],
  placesById: {
    'place-1': {
      id: 'place-1', name: 'Opera House',
      coordinate: { latitude: -33.8568, longitude: 151.2153, system: 'wgs84' },
      address: null, provider: 'google', providerPlaceId: null, metadata: null,
      createdAt: timestamp, updatedAt: timestamp,
    },
  },
};
const days = [
  data.day,
  { ...data.day, id: 'day-2', date: '2026-09-21', dayIndex: 2 },
  { ...data.day, id: 'day-3', date: '2026-09-22', dayIndex: 3 },
];

const placeSession: PlaceProviderSession = {
  coordinateSystem: 'wgs84',
  mapRegion: 'global',
  provider: { search: jest.fn(async () => ({ results: [], nextCursor: null })) },
  providerId: 'google',
};

const amapPlaceSession: PlaceProviderSession = {
  coordinateSystem: 'gcj02',
  mapRegion: 'china_mainland',
  provider: { search: jest.fn(async () => ({ results: [], nextCursor: null })) },
  providerId: 'amap',
};

const added: ConfirmedPlaceItem = {
  place: {
    id: 'place-added', name: 'New place',
    coordinate: { latitude: -33.86, longitude: 151.21, system: 'wgs84' },
    address: null, provider: 'google', providerPlaceId: null, metadata: null,
    createdAt: timestamp, updatedAt: timestamp,
  },
  item: {
    id: 'item-added', tripId: data.trip.id, dayId: data.day.id,
    placeId: 'place-added', type: 'custom', title: 'New place', sortOrder: 2,
    timeMode: 'none', startDateTime: null, endDateTime: null, period: null,
    isFixed: false, note: null, payload: null,
    createdAt: timestamp, updatedAt: timestamp,
  },
};

const unusedConfirmSearch = jest.fn<ConfirmPlaceSearchResultCommand>(async () => ({
  data: added,
  affectedEntityIds: [added.place.id, added.item.id],
  validationIssues: [],
}));

const unusedConfirmMapPicker = jest.fn<ConfirmMapPickerPlaceCommand>(async () => ({
  data: added,
  affectedEntityIds: [added.place.id, added.item.id],
  validationIssues: [],
}));

function MockMap(props: MapRendererProps) {
  return <View {...props as unknown as ComponentProps<typeof View>} testID="day-renderer" />;
}

/**
 * The two layers of a sheet, read back from the animated styles the component
 * requested. Proving they are independent is the point: a backdrop that
 * translated with the sheet is exactly the defect being fixed.
 *
 * The host view is matched rather than the component element, because the
 * component itself carries the same `testID` prop whether or not it renders.
 */
function sheetNode(renderer: ReturnType<typeof create>, testID: string) {
  return renderer.root.findAll(
    (node) => node.props?.testID === testID && node.props?.style !== undefined,
  )[0];
}

function isSheetMounted(renderer: ReturnType<typeof create>, testID: string) {
  return renderer.root.findAllByProps({ testID: `${testID}-host` }).length > 0;
}

/**
 * The sheet animates on the JS thread, so its settled value arrives a frame
 * later instead of synchronously with the render that started it.
 */
async function settleSheetAnimation(ms: number = SHEET_SLIDE_MS + 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/**
 * `AnimatedSheetModal` presents through RN's `Animated` on the JS thread, so its
 * styles hold animated nodes instead of plain numbers. `__getValue()` reads the
 * node's current value, which is what these two helpers are asking for.
 */
function animatedNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  const node = value as { __getValue?: () => number } | null | undefined;
  return typeof node?.__getValue === 'function' ? node.__getValue() : undefined;
}

function backdropOpacity(renderer: ReturnType<typeof create>, testID: string) {
  const style = StyleSheet.flatten(
    renderer.root.findByProps({ testID: `${testID}-backdrop` }).props.style,
  ) as { opacity?: unknown };
  return animatedNumber(style.opacity);
}

function sheetTranslateY(renderer: ReturnType<typeof create>, testID: string) {
  const style = StyleSheet.flatten(
    sheetNode(renderer, testID).props.style,
  ) as { transform?: { translateY?: unknown }[] };
  return animatedNumber(style.transform?.[0]?.translateY);
}

/** Records real mount/unmount events, so "one map instance" can be proven. */
const mapMountLog: string[] = [];
function TrackedMap(props: MapRendererProps) {
  useEffect(() => {
    mapMountLog.push('mount');
    return () => { mapMountLog.push('unmount'); };
  }, []);
  return <View {...props as unknown as ComponentProps<typeof View>} testID="day-renderer" />;
}

beforeEach(() => {
  sheetMock.__mock.scrollToSheet.mockClear();
  sheetMock.__mock.scrollableValues.length = 0;
  sheetMock.__mock.mountLog.length = 0;
  sheetMock.__mock.simultaneousHandlers.length = 0;
  sheetMock.__mock.headerGestures.length = 0;
  mapMountLog.length = 0;
  handoff.mockClear();
  act(() => {
    tripFocusStore.setState({ tripId: 'trip-1', focus: { type: 'day', dayId: 'day-1' }, sheetSnap: 'half' });
  });
});

test('composes only the current-Day map markers with the complete ordered Timeline', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} mapRenderer={MockMap} />);
  });

  const map = renderer.root.findByProps({ testID: 'day-renderer' });
  expect(map.props.system).toBe('wgs84');
  expect(map.props.markers.map(({ id, ordinal }: { id: string; ordinal: number }) => ({ id, ordinal })))
    .toEqual([{ id: 'item-1', ordinal: 1 }]);
  expect(map.props.cameraRequest.coordinates).toHaveLength(1);
  expect(map.props.cameraRequest.scopeKey).toBe(data.day.id);
  expect(renderer.root.findByProps({ testID: 'day-view-sheet-content' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-1' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-2' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'mock-day-sheet-half' })).toBeDefined();
  expect(sheetMock.__mock.scrollableValues).toContain(true);
  const dayHeader = renderer.root.findByProps({ testID: 'day-header' });
  expect(dayHeader.props.style).toMatchObject({ minHeight: 64 });
  expect(dayHeader.props.style).not.toHaveProperty('paddingTop');
  const dayTitle = renderer.root.findByProps({ testID: 'day-header-day-index' });
  expect(dayTitle.props.style).toMatchObject({ fontSize: 22, fontWeight: '700' });

  act(() => renderer.unmount());
});

test('switches adjacent Days from the header and opens a direct Day Jump surface', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<DayViewWorkspace data={data} days={days} mapRenderer={MockMap} />);
  });

  expect(resolveAdjacentDaySwipe(-80, days[0], days[1])?.id).toBe('day-2');
  expect(resolveAdjacentDaySwipe(80, days[0], days[1])?.id).toBe('day-1');
  expect(resolveAdjacentDaySwipe(20, days[0], days[1])).toBeUndefined();
  /*
   * The header owns no responder of its own any more. Two swipe recognisers on
   * the same touch let one cancel the header's own buttons, so the sheet content
   * is the single owner and the header only renders controls.
   */
  expect(renderer.root.findByProps({ testID: 'day-header' }).props.onResponderRelease)
    .toBeUndefined();
  /*
   * The Day swipe is a single RNGH gesture handed to the sheet as the fixed
   * header's gesture. Its ref is also given to the root Bottom Sheet so the
   * parent content pan can run simultaneously with it; `simultaneousHandlers`
   * expresses that relation and does not register a second gesture node.
   */
  expect(sheetMock.__mock.headerGestures).toHaveLength(1);
  expect(sheetMock.__mock.simultaneousHandlers.length).toBeGreaterThanOrEqual(1);
  const wiredRef = sheetMock.__mock.simultaneousHandlers[0] as { current: unknown };
  expect(wiredRef.current).toBeDefined();
  expect(wiredRef.current).toBe(sheetMock.__mock.headerGestures[0]);
  /*
   * And it is attached to the fixed header, not to the scrollable body: a
   * gesture nested inside `BottomSheetScrollView` has no declared relation with
   * the scroll view's own pan and loses the activation race on device.
   */
  expect(
    renderer.root.findByProps({ testID: 'mock-day-sheet-header' })
      .findAllByProps({ testID: 'day-header' }).length,
  ).toBeGreaterThanOrEqual(1);
  expect(
    renderer.root.findByProps({ testID: 'day-view-sheet-content' })
      .findAllByProps({ testID: 'day-header' }),
  ).toHaveLength(0);
  // The whole `Day X + 日期` block is one 44pt target, without a separate icon.
  expect(renderer.root.findAllByProps({ testID: 'day-header-caret' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'day-header-title' }).props.style)
    .toMatchObject({ minHeight: 44 });
  await act(async () => renderer.root.findByProps({ testID: 'day-header-next' }).props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });

  await act(async () => renderer.root.findByProps({ testID: 'day-header-title' }).props.onPress());
  expect(isSheetMounted(renderer, 'day-jump-sheet')).toBe(true);

  // The Day selector stays a Bottom Sheet: the backdrop and the white sheet are
  // separate layers that animate independently, and both settle once the slide
  // finishes.
  await settleSheetAnimation();
  expect(backdropOpacity(renderer, 'day-jump-sheet')).toBeCloseTo(0.28);
  expect(sheetTranslateY(renderer, 'day-jump-sheet')).toBe(0);

  await act(async () => renderer.root.findByProps({ testID: 'day-jump-day-3' }).props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-3' });

  /*
   * Closing only fades the backdrop and slides the sheet back down; the dark
   * layer never travels with it. Read it *mid-slide*: the exit timer unmounts
   * the whole layer once the slide finishes, so the settled exit state is
   * "gone", which the unmount test already covers.
   */
  await settleSheetAnimation(SHEET_SLIDE_MS / 2);
  expect(backdropOpacity(renderer, 'day-jump-sheet')).toBeLessThan(0.28);
  expect(sheetTranslateY(renderer, 'day-jump-sheet')).toBeGreaterThan(0);

  /*
   * Awaited, not a bare `act`: the sheet's exit timer is still pending here, and
   * React defers passive-effect cleanups, so a synchronous unmount left the tree
   * (and its store subscription) alive into the next test — which is what
   * re-populated the mock's capture arrays there.
   */
  await act(async () => { renderer.unmount(); });
});

test('Day selector opens, selects, closes and reopens reliably (连开/选/再开)', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<DayViewWorkspace data={data} days={days} mapRenderer={MockMap} />);
  });

  const openJump = () => renderer.root.findByProps({ testID: 'day-header-title' }).props.onPress();
  const row = (id: string) => renderer.root.findByProps({ testID: `day-jump-${id}` });

  // Open by tapping the Day title.
  await act(async () => openJump());
  expect(isSheetMounted(renderer, 'day-jump-sheet')).toBe(true);

  // Select Day 2 → focus moves to Day 2 and the selector closes.
  await act(async () => row('day-2').props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });

  // Reopen: the title tap must respond again (no "click no response").
  await act(async () => openJump());
  expect(isSheetMounted(renderer, 'day-jump-sheet')).toBe(true);

  // From the reopened selector, advance to Day 3.
  await act(async () => row('day-3').props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-3' });

  // And it can be reopened a third time without issue.
  await act(async () => openJump());
  expect(isSheetMounted(renderer, 'day-jump-sheet')).toBe(true);

  act(() => renderer.unmount());
});

test('attaches the Day-swipe gesture to the fixed sheet header, never inside the scrollable', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} days={days} mapRenderer={MockMap} />);
  });

  /*
   * The swipe lives on the RNGH gesture system, the same one the Bottom Sheet
   * uses, so it composes with the sheet's content pan instead of fighting the
   * JS responder. It is handed to the sheet as the *fixed header's* gesture:
   * RNGH only grants simultaneous recognition to handlers it registered a
   * relation for, and `BottomSheetScrollView`'s own pan declares none, so a
   * swipe nested inside the scrollable never activated on device.
   */
  /*
   * The gesture is rebuilt whenever the surface re-renders — the focus-effect
   * callbacks it closes over are not memoised — and the JS-thread presentation
   * re-renders the tree while it animates. So the sheet is handed several
   * instances of the same gesture; the live one is the last, and it is the one
   * whose ref the root sheet runs simultaneously with its content pan.
   */
  const gestures = sheetMock.__mock.headerGestures;
  expect(gestures.length).toBeGreaterThanOrEqual(1);
  const gesture = gestures[gestures.length - 1] as Record<string, jest.Mock>;
  expect(gesture).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'day-view-sheet-content' })).toBeDefined();
  expect(
    renderer.root.findByProps({ testID: 'mock-day-sheet-header' })
      .findAllByProps({ testID: 'day-header' }).length,
  ).toBeGreaterThanOrEqual(1);

  // The Day swipe is attached once by the sheet's header detector. The same
  // gesture ref is handed to the root Sheet only to declare simultaneous
  // recognition with its content pan; that relation attaches no second node.
  expect(gesture.withRef).toHaveBeenCalled();
  /*
   * Read the live ref rather than a count. The mock's arrays are cleared in
   * `beforeEach`, but a renderer left mounted by an earlier test in this file
   * re-renders on that hook's store write and re-populates them, so only the
   * last entry belongs to the tree under test. The ref object itself is stable
   * for the instance, so the relation is the same either way.
   */
  const wiredRefs = sheetMock.__mock.simultaneousHandlers as { current: unknown }[];
  expect(wiredRefs.length).toBeGreaterThanOrEqual(1);
  expect(wiredRefs[wiredRefs.length - 1].current).toBe(gesture);

  // A swipe only fires when dx clearly dominates: a drift that is mostly vertical
  // (or tiny) never switches Day, so taps, list scroll and sheet drag stay safe.
  expect(shouldClaimDaySwipe(-60, 5)).toBe(true);
  expect(shouldClaimDaySwipe(-60, -50)).toBe(false);
  expect(shouldClaimDaySwipe(6, 40)).toBe(false);
  expect(resolveAdjacentDaySwipe(-80, days[0], days[1])?.id).toBe('day-2');
  expect(resolveAdjacentDaySwipe(20, days[0], days[1])).toBeUndefined();

  // Drive the real gesture end handler the component installed: a left swipe
  // (dx < 0) must land on the next Day, a right swipe on the previous one.
  act(() => {
    gesture.__onEnd({ translationX: -80 });
  });
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });
  // A non-qualifying drift must not switch Day.
  act(() => {
    gesture.__onEnd({ translationX: 12 });
  });
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });

  // From Day 2 a right swipe returns to the previous Day. A fresh renderer is
  // used because the component's `days`/`data` prop is what defines adjacency.
  const day2Data = { ...data, day: days[1] };
  let renderer2!: ReturnType<typeof create>;
  act(() => {
    renderer2 = create(<DayViewWorkspace data={day2Data} days={days} mapRenderer={MockMap} />);
  });
  const liveRefs = sheetMock.__mock.simultaneousHandlers as { current: Record<string, jest.Mock> }[];
  const gesture2 = liveRefs[liveRefs.length - 1].current;
  expect(gesture2).toBeDefined();
  act(() => {
    gesture2.__onEnd({ translationX: 80 });
  });
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });

  act(() => renderer2.unmount());
  act(() => renderer.unmount());
});

test('passes marker and Timeline intents through without owning selection state', () => {
  const onMarkerPress = jest.fn();
  const onSelectItem = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        onMarkerPress={onMarkerPress}
        onSelectItem={onSelectItem}
      />,
    );
  });

  act(() => renderer.root.findByProps({ testID: 'day-renderer' }).props.onMarkerPress('item-1'));
  act(() => renderer.root.findByProps({ testID: 'timeline-select-item-2' }).props.onPress());
  expect(onMarkerPress).toHaveBeenCalledWith('item-1');
  expect(onSelectItem).toHaveBeenCalledWith('item-2');
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });

  act(() => renderer.unmount());
});

test('wires default marker and Timeline intents to shared Item focus and one-shot effects', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} mapRenderer={MockMap} />);
  });

  await act(async () => renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId: 'item-1', dayId: 'day-1',
  });
  expect(tripFocusStore.getState().sheetSnap).toBe('half');
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.markers[0].variant)
    .toBe('selected');
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest)
    .toMatchObject({ coordinates: [data.placesById['place-1'].coordinate], requestId: 1 });

  await act(async () => renderer.root.findByProps({ testID: 'day-renderer' }).props.onMarkerPress('item-1'));
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId: 'item-1', dayId: 'day-1',
  });
  expect(renderer.root.findByProps({ testID: 'day-timeline' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest.requestId)
    .toBe(1);

  const scrollRequest = renderer.root.findByType(DayTimeline).props.scrollRequest;
  expect(scrollRequest).toEqual({ itemId: 'item-1', requestId: 2 });
  act(() => renderer.unmount());
});

test('adds sheet content and row offsets before scrolling the gesture-aware sheet', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} mapRenderer={MockMap} />);
  });

  const sheetContent = renderer.root.findByProps({ testID: 'day-view-sheet-content' });
  const timeline = renderer.root.findByType(DayTimeline);
  const row = renderer.root.findByProps({ testID: 'timeline-item-item-1' });
  let rowLayoutNode = row;
  while (rowLayoutNode.parent && typeof rowLayoutNode.props.onLayout !== 'function') {
    rowLayoutNode = rowLayoutNode.parent;
  }
  expect(typeof timeline.props.onLayout).toBe('function');
  expect(typeof rowLayoutNode.props.onLayout).toBe('function');

  act(() => {
    sheetContent.props.onLayout({ nativeEvent: { layout: { y: 4 } } });
    timeline.props.onLayout({ nativeEvent: { layout: { y: 92 } } });
    rowLayoutNode.props.onLayout({ nativeEvent: { layout: { y: 18 } } });
  });

  act(() => {
    renderer.update(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        scrollRequest={{ itemId: 'item-1', requestId: 1 }}
      />,
    );
  });

  // 4 (sheet content) + 92 (timeline) + 34 (row: 16 list padding + 18 in-list).
  expect(sheetMock.__mock.scrollToSheet).toHaveBeenCalledWith({ y: 130, animated: true });
  act(() => renderer.unmount());
});

test('a Place-less Timeline selection stays selected without inventing a camera request', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} mapRenderer={MockMap} />);
  });

  await act(async () => renderer.root.findByProps({ testID: 'timeline-select-item-2' }).props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId: 'item-2', dayId: 'day-1',
  });
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest.coordinates)
    .toEqual([data.placesById['place-1'].coordinate]);
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.markers[0].variant)
    .toBe('normal');
  act(() => renderer.unmount());
});

test('does not expose a read-only detail step when no edit command is wired', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} mapRenderer={MockMap} />);
  });
  await act(async () => renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress());
  expect(renderer.root.findAllByProps({ testID: 'item-editor-modal' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'timeline-actions-item-1' })).toHaveLength(0);
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId: 'item-1', dayId: 'day-1',
  });
  act(() => renderer.unmount());
});

test('hands the selected Place and its Trip to the provider-aware external map', async () => {
  const updateItemDetailsCommand = jest.fn<UpdateItemDetailsCommand>(async () => ({
    data: data.items[0], affectedEntityIds: [data.items[0].id], validationIssues: [],
  }));
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        updateItemDetailsCommand={updateItemDetailsCommand}
      />,
    );
  });
  await act(async () => renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress());
  // UX-C: the handoff lives in the ⋯ sheet now, not in the editor.
  await act(async () => renderer.root.findByProps({ testID: 'timeline-actions-item-1' }).props.onPress());
  await act(async () => renderer.root.findByProps({ testID: 'item-action-open-in-map' }).props.onPress());

  expect(handoff).toHaveBeenCalledWith({
    place: data.placesById['place-1'],
    trip: data.trip,
  });
  act(() => renderer.unmount());
});

test('a Place-less Item editor offers no external-map action', async () => {
  const updateItemDetailsCommand = jest.fn<UpdateItemDetailsCommand>(async () => ({
    data: data.items[1], affectedEntityIds: [data.items[1].id], validationIssues: [],
  }));
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        updateItemDetailsCommand={updateItemDetailsCommand}
      />,
    );
  });
  await act(async () => renderer.root.findByProps({ testID: 'timeline-select-item-2' }).props.onPress());
  await act(async () => renderer.root.findByProps({ testID: 'timeline-actions-item-2' }).props.onPress());

  expect(renderer.root.findByProps({ testID: 'item-action-sheet' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'item-action-open-in-map' })).toHaveLength(0);
  expect(handoff).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('edits the selected Item through the injected command and reports the save', async () => {
  const updateItemDetailsCommand = jest.fn<UpdateItemDetailsCommand>(async (input) => ({
    data: { ...data.items[0], note: input.note ?? null },
    affectedEntityIds: [data.items[0].id],
    validationIssues: [],
  }));
  const onItemSaved = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        onItemSaved={onItemSaved}
        updateItemDetailsCommand={updateItemDetailsCommand}
      />,
    );
  });

  await act(async () => renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress());
  await openEditor(renderer);
  expect(renderer.root.findByProps({ testID: 'quick-edit-form' })).toBeDefined();

  act(() => {
    renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onChangeText('买票');
  });
  await act(async () => renderer.root.findByProps({ testID: 'quick-edit-save' }).props.onPress());

  /*
   * The exact input, migrated from the legacy `quick-edit` suite when it was
   * deleted. `objectContaining` would let the editor silently start sending a
   * field the command merges differently — `isFixed` in particular must not be
   * sent at all, because `updateItemDetails` reads `input.isFixed ?? current`.
   */
  expect(updateItemDetailsCommand).toHaveBeenCalledWith({
    itemId: 'item-1',
    title: 'Opera House',
    type: 'sightseeing',
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    note: '买票',
    payload: null,
  });
  expect(onItemSaved).toHaveBeenCalledWith(expect.objectContaining({ note: '买票' }));
  // A successful update refreshes the caller and returns to the Day View.
  expect(renderer.root.findAllByProps({ testID: 'item-editor-modal' })).toHaveLength(0);
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId: 'item-1', dayId: 'day-1',
  });
  act(() => renderer.unmount());
});

test('opens the production Place flow for the current Day and hides the normal sheet', async () => {
  const onConfirmed = jest.fn();
  const confirmMapPicker = jest.fn(async () => ({
    data: added,
    affectedEntityIds: [added.place.id, added.item.id],
    validationIssues: [],
  }));
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        placeEntry={{
          confirmMapPicker,
          confirmSearch: unusedConfirmSearch,
          onConfirmed,
          resolveSession: jest.fn(async () => placeSession),
        }}
      />,
    );
  });

  const viewportCenter = {
    latitude: -33.86, longitude: 151.21, system: 'wgs84' as const,
  };
  act(() => renderer.root.findByProps({ testID: 'day-renderer' }).props.onViewportChange({
    center: viewportCenter,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  }));
  await act(async () => renderer.root.findByProps({ testID: 'day-add-place' }).props.onPress());

  expect(renderer.root.findByProps({ testID: 'day-place-entry' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'place-search' })).toBeDefined();
  /*
   * Search is an in-place opaque overlay, not a sibling Modal: the Day surface
   * stays mounted under it, so closing it cannot flash the Day back into view and
   * a native Modal over the map never paints black on the device.
   */
  expect(renderer.root.findByProps({ testID: 'day-place-entry-overlay' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'mock-day-sheet-half' })).toBeDefined();

  act(() => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'map-picker' })).toBeDefined();
  await act(async () => renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());
  expect(confirmMapPicker).not.toHaveBeenCalled();
  await act(async () => renderer.root.findByProps({ testID: 'add-item-draft-save' }).props.onPress());

  expect(confirmMapPicker).toHaveBeenCalledWith({
    coordinate: viewportCenter,
    dayId: data.day.id,
    enrichment: null,
    tripId: data.trip.id,
    draft: {
      title: '-33.86000, 151.21000',
      type: 'sightseeing',
      timeMode: 'none',
      startDateTime: null,
      endDateTime: null,
      period: null,
      note: null,
      payload: null,
    },
  });
  expect(onConfirmed).toHaveBeenCalledWith(added);
  expect(tripFocusStore.getState().focus).toEqual({
    type: 'item', itemId: added.item.id, dayId: data.day.id,
  });
  expect(renderer.root.findByProps({ testID: 'mock-day-sheet-half' })).toBeDefined();
  act(() => renderer.unmount());
});

test('Amap Map Picker uses the Trip source coordinate without nesting the root privacy gate', async () => {
  const appleCoordinate = { latitude: 35.6811, longitude: 139.7672, system: 'wgs84' as const };
  const sourcePlace = {
    ...data.placesById['place-1'],
    name: 'Opera House',
    coordinate: { latitude: 39.90923, longitude: 116.397428, system: 'gcj02' as const },
    provider: 'amap',
  };
  const applePlace: MapPlace = {
    ...sourcePlace,
    name: 'Apple SDK Opera House',
    displayName: 'Opera House',
    displayCoordinate: appleCoordinate,
  };
  const mappedData: DayViewData = {
    ...data,
    trip: { ...data.trip, mapRegion: 'china_mainland' },
    placesById: { 'place-1': sourcePlace },
    mapPlacesById: { 'place-1': applePlace },
  };
  const changeItemPlace = jest.fn<ChangeItemPlaceCommand>(async () => ({
    data: { item: changedPlace.item, place: changedPlace.place },
    affectedEntityIds: [changedPlace.item.id, changedPlace.place.id],
    validationIssues: [],
  }));
  const placeEntry = changePlaceConfig({
    changeItemPlace,
    resolveSession: jest.fn(async () => amapPlaceSession),
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={mappedData}
        mapRenderer={MockMap}
        placeEntry={placeEntry}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await act(async () => renderer.root.findByProps({ testID: 'timeline-actions-item-1' }).props.onPress());
  await act(async () => renderer.root.findByProps({ testID: 'item-action-change-place' }).props.onPress());
  expect(renderer.root.findAllByProps({ testID: 'day-amap-privacy-gate' })).toHaveLength(0);
  const search = renderer.root.findAllByType(PlaceSearch)[0];
  expect(search.props.initialQuery.center).toEqual(sourcePlace.coordinate);

  await act(async () => renderer.root.findByProps({ testID: 'place-search-map-picker' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'map-picker-coordinate' }).props.children.join(''))
    .toBe('39.90923, 116.39743 · GCJ02');
  await act(async () => renderer.root.findByProps({ testID: 'map-picker-use-coordinate' }).props.onPress());

  expect(changeItemPlace).toHaveBeenCalledWith({
    itemId: 'item-1',
    target: {
      kind: 'map-picker',
      coordinate: sourcePlace.coordinate,
      provider: undefined,
      enrichment: null,
    },
  });
  act(() => renderer.unmount());
});

test('cancelling provider initialization prevents a late session from reopening Place Search', async () => {
  let resolveSession!: (value: PlaceProviderSession) => void;
  const pendingSession = new Promise<PlaceProviderSession>((resolve) => {
    resolveSession = resolve;
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        placeEntry={{
          confirmMapPicker: unusedConfirmMapPicker,
          confirmSearch: unusedConfirmSearch,
          onConfirmed: jest.fn(),
          resolveSession: jest.fn(() => pendingSession),
        }}
      />,
    );
  });

  act(() => renderer.root.findByProps({ testID: 'day-add-place' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'day-place-entry-loading' })).toBeDefined();
  act(() => renderer.root.findByProps({ testID: 'day-place-entry-cancel' }).props.onPress());
  await act(async () => resolveSession(placeSession));

  expect(renderer.root.findAllByProps({ testID: 'place-search' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'mock-day-sheet-half' })).toBeDefined();
  act(() => renderer.unmount());
});

test('provider failure can be dismissed without losing the saved local Timeline', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        placeEntry={{
          confirmMapPicker: unusedConfirmMapPicker,
          confirmSearch: unusedConfirmSearch,
          onConfirmed: jest.fn(),
          resolveSession: jest.fn(async () => {
            throw new Error('provider network unavailable');
          }),
        }}
      />,
    );
  });

  expect(renderer.root.findByProps({ testID: 'timeline-item-item-1' })).toBeDefined();
  act(() => renderer.root.findByProps({ testID: 'day-add-place' }).props.onPress());
  await act(async () => {});
  expect(renderer.root.findByProps({ testID: 'day-place-entry-error' })).toBeDefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('provider network unavailable');

  act(() => renderer.root.findByProps({ testID: 'day-place-entry-cancel' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-1' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-2' })).toBeDefined();
  act(() => renderer.unmount());
});

// --- Persistent Day View: one Day surface, one map, one Bottom Sheet ---

const day2Data: DayViewData = {
  ...data,
  day: days[1],
  items: [
    {
      ...data.items[0],
      id: 'item-3',
      dayId: 'day-2',
      placeId: 'place-2',
      title: 'Bondi',
      sortOrder: 0,
    },
  ],
  placesById: {
    'place-2': {
      ...data.placesById['place-1'],
      id: 'place-2',
      name: 'Bondi',
      coordinate: { latitude: -33.8915, longitude: 151.2767, system: 'wgs84' },
    },
  },
};

/** Same coordinate as Day 1, so only the request identity can force a refit. */
const day2RepeatData: DayViewData = {
  ...day2Data,
  placesById: {
    'place-2': { ...day2Data.placesById['place-2'], coordinate: data.placesById['place-1'].coordinate },
  },
};

const mainlandLegacyDayData: DayViewData = {
  ...data,
  trip: { ...data.trip, mapRegion: 'china_mainland' },
  items: [
    data.items[0],
    data.items[1],
    { ...data.items[0], id: 'item-3', placeId: 'place-2', title: 'Old Palace', sortOrder: 2 },
  ],
  placesById: {
    'place-1': {
      ...data.placesById['place-1'],
      name: 'Legacy Airport',
      coordinate: { latitude: 31.73, longitude: 118.87, system: 'gcj02' },
      provider: 'amap',
    },
    'place-2': {
      ...data.placesById['place-1'],
      id: 'place-2',
      name: 'Legacy Palace',
      coordinate: { latitude: 31.74, longitude: 118.88, system: 'gcj02' },
      provider: 'amap',
    },
  },
};

const appleMainlandMapPlaces: Record<string, MapPlace> = {
  'place-1': {
    ...mainlandLegacyDayData.placesById['place-1'],
    name: 'Apple SDK Airport',
    displayName: 'Legacy Airport',
    displayCoordinate: { latitude: 31.7326, longitude: 118.8716, system: 'wgs84' },
  },
  'place-2': {
    ...mainlandLegacyDayData.placesById['place-2'],
    name: 'Apple SDK Palace',
    displayName: 'Legacy Palace',
    displayCoordinate: { latitude: 31.74, longitude: 118.88, system: 'wgs84' },
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

test('keeps one map, one sheet and one Day surface when a new Day arrives', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} days={days} mapRenderer={TrackedMap} />);
  });
  expect(mapMountLog).toEqual(['mount']);
  expect(sheetMock.__mock.mountLog).toEqual(['half']);
  expect(renderer.root.findByProps({ testID: 'day-header-day-index' }).props.children)
    .toEqual('第 1 天');

  act(() => {
    renderer.update(<DayViewWorkspace data={day2Data} days={days} mapRenderer={TrackedMap} />);
  });

  // Nothing was torn down and recreated: the same instances received new props.
  expect(mapMountLog).toEqual(['mount']);
  expect(sheetMock.__mock.mountLog).toEqual(['half']);
  expect(sheetMock.__mock.mountLog).not.toContain('unmounted:half');

  const map = renderer.root.findByProps({ testID: 'day-renderer' });
  expect(map.props.markers.map(({ id }: { id: string }) => id)).toEqual(['item-3']);
  expect(renderer.root.findByProps({ testID: 'day-header-day-index' }).props.children)
    .toEqual('第 2 天');
  const hostCount = (testID: string) => renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props?.testID === testID,
  ).length;
  expect(hostCount('timeline-item-item-3')).toBe(1);
  expect(hostCount('timeline-item-item-1')).toBe(0);

  act(() => renderer.unmount());
  expect(mapMountLog).toEqual(['mount', 'unmount']);
});

test('fits each newly available Apple pin batch in place and keeps the full Timeline', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace data={mainlandLegacyDayData} days={days} mapRenderer={TrackedMap} />,
    );
  });
  const map = () => renderer.root.findByProps({ testID: 'day-renderer' });
  expect(map().props.system).toBe('gcj02');
  expect(map().props.markers).toHaveLength(2);

  act(() => {
    renderer.update(<DayViewWorkspace
      data={{ ...mainlandLegacyDayData, mapPlacesById: {} }}
      days={days}
      mapRenderer={TrackedMap}
    />);
  });
  expect(map().props.system).toBe('gcj02');
  expect(map().props.markers).toEqual([]);
  expect(map().props.cameraRequest).toBeNull();

  act(() => {
    renderer.update(<DayViewWorkspace
      data={{
        ...mainlandLegacyDayData,
        mapPlacesById: { 'place-1': appleMainlandMapPlaces['place-1'] },
      }}
      days={days}
      mapRenderer={TrackedMap}
    />);
  });
  const onePinRequest = map().props.cameraRequest;
  expect(map().props.markers.map(({ ordinal }: { ordinal: number }) => ordinal)).toEqual([1]);
  expect(onePinRequest.coordinates).toEqual([appleMainlandMapPlaces['place-1'].coordinate]);

  act(() => {
    renderer.update(<DayViewWorkspace
      data={{ ...mainlandLegacyDayData, mapPlacesById: appleMainlandMapPlaces }}
      days={days}
      mapRenderer={TrackedMap}
    />);
  });
  expect(map().props.markers.map(({ id, ordinal }: { id: string; ordinal: number }) => ({ id, ordinal })))
    .toEqual([{ id: 'item-1', ordinal: 1 }, { id: 'item-3', ordinal: 2 }]);
  expect(map().props.cameraRequest.coordinates).toEqual([
    appleMainlandMapPlaces['place-1'].coordinate,
    appleMainlandMapPlaces['place-2'].coordinate,
  ]);
  expect(map().props.cameraRequest.requestId).not.toBe(onePinRequest.requestId);
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-1' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-2' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-item-item-3' })).toBeDefined();
  expect(mapMountLog).toEqual(['mount']);
  expect(mainlandLegacyDayData.placesById['place-1'].coordinate.system).toBe('gcj02');

  act(() => renderer.unmount());
});

test('keeps a timeline-focused Item in view when its Apple mapping arrives', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace data={mainlandLegacyDayData} days={days} mapRenderer={TrackedMap} />,
    );
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress();
  });
  const oldFocusedRequest = renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest;
  expect(oldFocusedRequest.coordinates).toHaveLength(1);
  expect(oldFocusedRequest.coordinates[0].system).toBe('gcj02');

  act(() => {
    renderer.update(<DayViewWorkspace
      data={{ ...mainlandLegacyDayData, mapPlacesById: appleMainlandMapPlaces }}
      days={days}
      mapRenderer={TrackedMap}
    />);
  });
  const map = renderer.root.findByProps({ testID: 'day-renderer' });
  expect(map.props.system).toBe('gcj02');
  expect(map.props.markers.map(({ variant }: { variant: string }) => variant))
    .toEqual(['selected', 'normal']);
  expect(map.props.cameraRequest.coordinates)
    .toEqual([appleMainlandMapPlaces['place-1'].coordinate]);
  expect(map.props.cameraRequest.requestId).toBe(oldFocusedRequest.requestId);
  expect(mapMountLog).toEqual(['mount']);

  act(() => renderer.unmount());
});

test('a Timeline focus made before an empty Apple mapping resolves follows the new snapshot', async () => {
  const emptyMapData: DayViewData = {
    ...mainlandLegacyDayData,
    mapPlacesById: {},
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={emptyMapData} days={days} mapRenderer={TrackedMap} />);
  });
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest).toBeNull();

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest).toBeNull();

  act(() => {
    renderer.update(<DayViewWorkspace
      data={{
        ...mainlandLegacyDayData,
        mapPlacesById: { 'place-1': appleMainlandMapPlaces['place-1'] },
      }}
      days={days}
      mapRenderer={TrackedMap}
    />);
  });
  const map = renderer.root.findByProps({ testID: 'day-renderer' });
  expect(map.props.cameraRequest.coordinates)
    .toEqual([appleMainlandMapPlaces['place-1'].coordinate]);
  expect(map.props.markers[0]).toMatchObject({ id: 'item-1', ordinal: 1, variant: 'selected' });
  expect(mapMountLog).toEqual(['mount']);

  act(() => renderer.unmount());
});

test('preserves a user-interacted viewport over a selected Item while Apple pins arrive', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace data={mainlandLegacyDayData} days={days} mapRenderer={TrackedMap} />,
    );
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-select-item-1' }).props.onPress();
  });
  const map = renderer.root.findByProps({ testID: 'day-renderer' });
  expect(map.props.cameraRequest.coordinates[0].system).toBe('gcj02');
  act(() => map.props.onMapInteraction());

  act(() => {
    renderer.update(<DayViewWorkspace
      data={{ ...mainlandLegacyDayData, mapPlacesById: appleMainlandMapPlaces }}
      days={days}
      mapRenderer={TrackedMap}
    />);
  });
  const updatedMap = renderer.root.findByProps({ testID: 'day-renderer' });
  expect(updatedMap.props.system).toBe('gcj02');
  expect(updatedMap.props.markers).toHaveLength(2);
  expect(updatedMap.props.cameraRequest.coordinates)
    .toEqual([appleMainlandMapPlaces['place-1'].coordinate]);
  expect(mapMountLog).toEqual(['mount']);

  act(() => renderer.unmount());
});

test('a new Day clears the prior map interaction before its Apple mapping resolves', () => {
  const emptyDay2: DayViewData = {
    ...mainlandLegacyDayData,
    day: days[1],
    items: [{
      ...mainlandLegacyDayData.items[0],
      id: 'item-day-2',
      dayId: days[1].id,
      placeId: 'place-2',
    }],
    placesById: { 'place-2': mainlandLegacyDayData.placesById['place-2'] },
    mapPlacesById: {},
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace data={mainlandLegacyDayData} days={days} mapRenderer={TrackedMap} />,
    );
  });
  act(() => renderer.root.findByProps({ testID: 'day-renderer' }).props.onMapInteraction());

  act(() => {
    renderer.update(<DayViewWorkspace data={emptyDay2} days={days} mapRenderer={TrackedMap} />);
  });
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest).toBeNull();

  act(() => {
    renderer.update(<DayViewWorkspace
      data={{
        ...emptyDay2,
        mapPlacesById: { 'place-2': appleMainlandMapPlaces['place-2'] },
      }}
      days={days}
      mapRenderer={TrackedMap}
    />);
  });
  const map = renderer.root.findByProps({ testID: 'day-renderer' });
  expect(map.props.cameraRequest.coordinates)
    .toEqual([appleMainlandMapPlaces['place-2'].coordinate]);
  expect(mapMountLog).toEqual(['mount']);

  act(() => renderer.unmount());
});

test('reissues the camera on the same map for a new Day even when the coordinate repeats', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} days={days} mapRenderer={TrackedMap} />);
  });
  const first = renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest;
  expect(first.scopeKey).toBe('day-1');

  act(() => {
    renderer.update(<DayViewWorkspace data={day2RepeatData} days={days} mapRenderer={TrackedMap} />);
  });
  const second = renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest;

  expect(second.scopeKey).toBe('day-2');
  expect(second.coordinates).toEqual(first.coordinates);
  expect(typeof second.requestId).toBe('number');
  expect(second.requestId).not.toBe(first.requestId);
  // The renderer keys camera work on this serialization; it must differ.
  expect(JSON.stringify(second)).not.toBe(JSON.stringify(first));
  expect(mapMountLog).toEqual(['mount']);

  act(() => renderer.unmount());
});

test('a Day without a Place does not replay the previous Day camera', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} days={days} mapRenderer={TrackedMap} />);
  });
  expect(renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest).not.toBeNull();

  const emptyDay: DayViewData = { ...day2Data, items: [], placesById: {} };
  act(() => {
    renderer.update(<DayViewWorkspace data={emptyDay} days={days} mapRenderer={TrackedMap} />);
  });

  const request = renderer.root.findByProps({ testID: 'day-renderer' }).props.cameraRequest;
  expect(request?.coordinates ?? []).toEqual([]);
  expect(JSON.stringify(request)).not.toContain('day-1');

  act(() => renderer.unmount());
});

test('resets the sheet content scroll to the top without changing the snap', () => {
  act(() => {
    tripFocusStore.setState({ tripId: 'trip-1', focus: { type: 'day', dayId: 'day-1' }, sheetSnap: 'expanded' });
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} days={days} mapRenderer={TrackedMap} />);
  });
  expect(renderer.root.findByProps({ testID: 'mock-day-sheet-expanded' })).toBeDefined();
  sheetMock.__mock.scrollToSheet.mockClear();

  act(() => {
    renderer.update(<DayViewWorkspace data={day2Data} days={days} mapRenderer={TrackedMap} />);
  });

  expect(sheetMock.__mock.scrollToSheet).toHaveBeenCalledWith({ y: 0, animated: false });
  expect(renderer.root.findByProps({ testID: 'mock-day-sheet-expanded' })).toBeDefined();
  expect(tripFocusStore.getState().sheetSnap).toBe('expanded');

  act(() => renderer.unmount());
});

test('closes the Item editor and the Day Jump when the Day changes', async () => {
  const updateItemDetailsCommand = jest.fn<UpdateItemDetailsCommand>(async () => ({
    data: data.items[0], affectedEntityIds: [data.items[0].id], validationIssues: [],
  }));
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        updateItemDetailsCommand={updateItemDetailsCommand}
      />,
    );
  });

  await openEditor(renderer);
  expect(renderer.root.findByProps({ testID: 'item-editor-modal' })).toBeDefined();
  act(() => renderer.root.findByProps({ testID: 'day-header-title' }).props.onPress());
  expect(isSheetMounted(renderer, 'day-jump-sheet')).toBe(true);

  act(() => {
    renderer.update(
      <DayViewWorkspace
        data={day2Data}
        days={days}
        mapRenderer={TrackedMap}
        updateItemDetailsCommand={updateItemDetailsCommand}
      />,
    );
  });

  expect(renderer.root.findAllByProps({ testID: 'item-editor-modal' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'day-jump-day-3' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'day-header-day-index' }).props.children)
    .toEqual('第 2 天');

  act(() => renderer.unmount());
});

test('abandons an in-flight Place entry when the Day changes', async () => {
  const session = deferred<PlaceProviderSession>();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        placeEntry={{
          confirmMapPicker: unusedConfirmMapPicker,
          confirmSearch: unusedConfirmSearch,
          onConfirmed: jest.fn(),
          resolveSession: jest.fn(() => session.promise),
        }}
      />,
    );
  });

  act(() => renderer.root.findByProps({ testID: 'day-add-place' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'day-place-entry-loading' })).toBeDefined();

  act(() => {
    renderer.update(
      <DayViewWorkspace
        data={day2Data}
        days={days}
        mapRenderer={TrackedMap}
        placeEntry={{
          confirmMapPicker: unusedConfirmMapPicker,
          confirmSearch: unusedConfirmSearch,
          onConfirmed: jest.fn(),
          resolveSession: jest.fn(() => session.promise),
        }}
      />,
    );
  });

  // The new Day renders its normal surface, not the old Day's pending flow.
  expect(renderer.root.findAllByProps({ testID: 'day-place-entry-loading' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'day-header-day-index' }).props.children)
    .toEqual('第 2 天');

  await act(async () => {
    session.resolve(placeSession);
    await Promise.resolve();
  });
  // The late provider session must not reopen the entry for the previous Day.
  expect(renderer.root.findAllByProps({ testID: 'day-place-entry' })).toHaveLength(0);

  act(() => renderer.unmount());
});

test('drops the previous Day viewport centre before the Map Picker opens', async () => {
  let renderer!: ReturnType<typeof create>;
  const placeEntryConfig = {
    confirmMapPicker: unusedConfirmMapPicker,
    confirmSearch: unusedConfirmSearch,
    onConfirmed: jest.fn(),
    resolveSession: jest.fn(async () => placeSession),
  };
  act(() => {
    renderer = create(
      <DayViewWorkspace data={data} days={days} mapRenderer={TrackedMap} placeEntry={placeEntryConfig} />,
    );
  });

  // Pan the Day 1 map somewhere else.
  act(() => {
    renderer.root.findByProps({ testID: 'day-renderer' }).props.onViewportChange({
      center: { latitude: 1, longitude: 2, system: 'wgs84' },
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    });
  });

  act(() => {
    renderer.update(
      <DayViewWorkspace data={day2Data} days={days} mapRenderer={TrackedMap} placeEntry={placeEntryConfig} />,
    );
  });
  await act(async () => renderer.root.findByProps({ testID: 'day-add-place' }).props.onPress());

  // A stale Day 1 viewport centre would make the new Day open its picker there.
  const search = renderer.root.findAllByType(PlaceSearch)[0];
  expect(search.props.initialQuery.center).toEqual(day2Data.placesById['place-2'].coordinate);

  act(() => renderer.unmount());
});

const unusedUpdateItemDetails = jest.fn<UpdateItemDetailsCommand>(async () => ({
  data: data.items[0],
  affectedEntityIds: [data.items[0].id],
  validationIssues: [],
}));

const changedPlace: ConfirmedPlaceItem = {
  place: { ...added.place, id: 'place-new', name: 'Changed place' },
  item: { ...data.items[0], placeId: 'place-new' },
};

function changePlaceConfig(overrides: Record<string, unknown> = {}) {
  return {
    changeItemPlace: jest.fn<ChangeItemPlaceCommand>(async () => ({
      data: { item: changedPlace.item, place: changedPlace.place },
      affectedEntityIds: [changedPlace.item.id, changedPlace.place.id],
      validationIssues: [],
    })),
    confirmMapPicker: unusedConfirmMapPicker,
    confirmSearch: unusedConfirmSearch,
    onConfirmed: jest.fn(),
    resolveSession: jest.fn(async () => placeSession),
    ...overrides,
  };
}

/** The row menu is the only way into the editor from the Timeline. */
async function openEditorFor(renderer: ReturnType<typeof create>, itemId: string) {
  await act(async () => {
    renderer.root.findByProps({ testID: `timeline-actions-${itemId}` }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-action-edit-details' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'item-editor-modal' })).toBeDefined();
}

async function openEditor(renderer: ReturnType<typeof create>) {
  await openEditorFor(renderer, 'item-1');
}

test('the row menu offers the location and details actions, and nothing destructive', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        placeEntry={changePlaceConfig()}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-actions-item-1' }).props.onPress();
  });
  expect(isSheetMounted(renderer, 'item-action-sheet')).toBe(true);
  expect(renderer.root.findByProps({ testID: 'item-action-change-place' })
    .findAllByType(Text).map((node) => node.props.children)).toEqual(['更换地点']);
  expect(renderer.root.findByProps({ testID: 'item-action-edit-details' })).toBeDefined();
  // Without the delete seam there is no destructive row (no-seam-no-action).
  expect(renderer.root.findAllByProps({ testID: 'item-action-delete' })).toHaveLength(0);

  act(() => renderer.unmount());
});

test('deleting an Item shows the Undo Snackbar and 撤销 restores it', async () => {
  const deletedItem = { ...data.items[0] };
  const deleteCommand = jest.fn<DeleteItemCommand>(async (input) => ({
    data: {
      item: { ...deletedItem, id: input.itemId },
      previousItemId: null,
      nextItemId: null,
    },
    affectedEntityIds: [input.itemId],
    validationIssues: [],
  }));
  const restoreCommand = jest.fn<RestoreDeletedItemCommand>(async () => ({
    data: deletedItem,
    affectedEntityIds: [deletedItem.id],
    validationIssues: [],
  }));
  const onItemDeleted = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        deleteItemCommand={deleteCommand}
        onItemDeleted={onItemDeleted}
        restoreDeletedItemCommand={restoreCommand}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-actions-item-1' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'item-action-delete' })).toBeDefined();

  await act(async () => {
    renderer.root.findByProps({ testID: 'item-action-delete' }).props.onPress();
  });
  expect(deleteCommand).toHaveBeenCalledWith({ itemId: 'item-1' });
  // The row disappears from the reads immediately, not at snackbar expiry.
  expect(onItemDeleted).toHaveBeenCalledTimes(1);
  expect(
    renderer.root.findByProps({ testID: 'undo-snackbar' })
      .findAllByType(Text)
      .map((node) => node.props.children),
  ).toEqual(['已删除「Opera House」', '撤销']);

  await act(async () => {
    renderer.root.findByProps({ testID: 'undo-snackbar-undo' }).props.onPress();
  });
  expect(restoreCommand).toHaveBeenCalledWith({
    snapshot: expect.objectContaining({
      item: expect.objectContaining({ id: 'item-1' }),
    }),
  });
  expect(onItemDeleted).toHaveBeenCalledTimes(2);
  expect(renderer.root.findAllByProps({ testID: 'undo-snackbar' })).toHaveLength(0);

  act(() => renderer.unmount());
});

test('a hopeless undo drops the snapshot and shows the error without 撤销', async () => {
  const deletedItem = { ...data.items[0] };
  const deleteCommand = jest.fn<DeleteItemCommand>(async (input) => ({
    data: {
      item: { ...deletedItem, id: input.itemId },
      previousItemId: null,
      nextItemId: null,
    },
    affectedEntityIds: [input.itemId],
    validationIssues: [],
  }));
  // The user deleted the snapshot's Day while the snackbar was up: the restore
  // can never succeed, so retrying must not be offered.
  const restoreCommand = jest.fn<RestoreDeletedItemCommand>(async () => {
    throw new Error('Target Day no longer exists: day-1');
  });
  const onItemDeleted = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        deleteItemCommand={deleteCommand}
        onItemDeleted={onItemDeleted}
        restoreDeletedItemCommand={restoreCommand}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-actions-item-1' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-action-delete' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'undo-snackbar-undo' }).props.onPress();
  });

  expect(
    renderer.root.findByProps({ testID: 'undo-snackbar' })
      .findAllByType(Text)
      .map((node) => node.props.children),
  ).toEqual(['无法恢复：该日程已被删除。']);
  expect(renderer.root.findAllByProps({ testID: 'undo-snackbar-undo' }))
    .toHaveLength(0);

  act(() => renderer.unmount());
});

test('a retryable undo keeps 撤销 alongside the error line', async () => {
  const deletedItem = { ...data.items[0] };
  const deleteCommand = jest.fn<DeleteItemCommand>(async (input) => ({
    data: {
      item: { ...deletedItem, id: input.itemId },
      previousItemId: null,
      nextItemId: null,
    },
    affectedEntityIds: [input.itemId],
    validationIssues: [],
  }));
  const restoreCommand = jest.fn<RestoreDeletedItemCommand>(async () => {
    throw new Error('forced sqlite failure');
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        deleteItemCommand={deleteCommand}
        restoreDeletedItemCommand={restoreCommand}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-actions-item-1' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-action-delete' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'undo-snackbar-undo' }).props.onPress();
  });

  expect(
    renderer.root.findByProps({ testID: 'undo-snackbar' })
      .findAllByType(Text)
      .map((node) => node.props.children),
  ).toEqual(['已删除「Opera House」', '撤销失败，请重试。', '撤销']);

  act(() => renderer.unmount());
});

test('a Place-less row asks to 设置地点 instead of 更换地点', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        placeEntry={changePlaceConfig()}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-actions-item-2' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'item-action-change-place' })
    .findAllByType(Text).map((node) => node.props.children)).toEqual(['设置地点']);
  act(() => renderer.unmount());
});

test('opens the Place flow for an existing Item from the row menu and starts at its current Place', async () => {
  const placeEntry = changePlaceConfig();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        placeEntry={placeEntry}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await act(async () => renderer.root.findByProps({ testID: 'timeline-actions-item-1' }).props.onPress());
  await act(async () => renderer.root.findByProps({ testID: 'item-action-change-place' }).props.onPress());

  expect(renderer.root.findAllByProps({ testID: 'day-place-entry-modal' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'day-place-entry' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'place-search' })).toBeDefined();
  // The page names the task, and the search starts where the Item already is.
  expect(renderer.root.findByProps({ testID: 'place-search-title' }).props.children)
    .toBe('更换地点');
  const search = renderer.root.findAllByType(PlaceSearch)[0];
  expect(search.props.initialQuery.center).toEqual(data.placesById['place-1'].coordinate);

  act(() => renderer.unmount());
});

test('editor 更改地点 preserves unsaved fields and commits the selection only on 保存', async () => {
  const services = changePlaceConfig();
  const update = jest.fn<UpdateItemDetailsCommand>(async input => ({
    data: { ...data.items[0], title: input.title ?? data.items[0].title },
    affectedEntityIds: [data.items[0].id], validationIssues: [],
  }));
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<DayViewWorkspace data={data} mapRenderer={MockMap}
    placeEntry={services} updateItemDetailsCommand={update} />); });
  await openEditor(renderer);
  act(() => {
    renderer.root.findByProps({ testID: 'quick-edit-title' }).props.onChangeText('保留自定义标题');
    renderer.root.findByProps({ testID: 'quick-edit-note' }).props.onChangeText('保留备注');
  });
  await act(async () => renderer.root.findByProps({ testID: 'item-editor-change-place' }).props.onPress());
  const search = renderer.root.findAllByType(PlaceSearch)[0];
  const target = { kind: 'search' as const, result: { name: '新地点', address: '新地址', regionLabel: null, provider: 'google' as const,
    providerPlaceId: 'new-id', coordinate: { latitude: -33.8, longitude: 151.2, system: 'wgs84' as const }, metadata: null } };
  await act(async () => search.props.confirmation!.onSelectTarget!(target));
  expect(renderer.root.findByProps({ testID: 'quick-edit-title' }).props.value).toBe('保留自定义标题');
  expect(renderer.root.findByProps({ testID: 'quick-edit-note' }).props.value).toBe('保留备注');
  expect(renderer.root.findByProps({ testID: 'item-editor-place-name' }).props.children).toBe('新地点');
  expect(update).not.toHaveBeenCalled();
  expect(services.changeItemPlace).not.toHaveBeenCalled();
  await act(async () => renderer.root.findByProps({ testID: 'quick-edit-save' }).props.onPress());
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ title: '保留自定义标题', note: '保留备注', placeTarget: target }));
  act(() => renderer.unmount());
});

test('discarding an editor after a Place pick leaves the original association untouched', async () => {
  const services = changePlaceConfig();
  const update = jest.fn<UpdateItemDetailsCommand>(async () => ({ data: data.items[0], affectedEntityIds: [], validationIssues: [] }));
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<DayViewWorkspace data={data} mapRenderer={MockMap}
    placeEntry={services} updateItemDetailsCommand={update} />); });
  await openEditor(renderer);
  await act(async () => renderer.root.findByProps({ testID: 'item-editor-change-place' }).props.onPress());
  const search = renderer.root.findAllByType(PlaceSearch)[0];
  await act(async () => search.props.confirmation!.onSelectTarget!({ kind: 'none' }));
  await act(async () => renderer.root.findByProps({ testID: 'quick-edit-close' }).props.onPress());
  expect(update).not.toHaveBeenCalled();
  expect(services.changeItemPlace).not.toHaveBeenCalled();
  await openEditor(renderer);
  expect(renderer.root.findByProps({ testID: 'item-editor-place-name' }).props.children).toBe('Opera House');
  act(() => renderer.unmount());
});

test('an empty name falls back to the location name on save', async () => {
  const named = {
    ...data,
    items: [{ ...data.items[0], title: '取车' }, data.items[1]],
  };
  const updateItemDetailsCommand = jest.fn<UpdateItemDetailsCommand>(async (input) => ({
    data: { ...named.items[0], title: input.title ?? named.items[0].title },
    affectedEntityIds: [named.items[0].id],
    validationIssues: [],
  }));
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={named}
        mapRenderer={MockMap}
        updateItemDetailsCommand={updateItemDetailsCommand}
      />,
    );
  });

  await openEditor(renderer);
  act(() => renderer.root.findByProps({ testID: 'quick-edit-title' }).props.onChangeText('   '));
  await act(async () => renderer.root.findByProps({ testID: 'quick-edit-save' }).props.onPress());

  // `title` is never blank; the saved Place name is the documented fallback.
  expect(updateItemDetailsCommand).toHaveBeenCalledWith(expect.objectContaining({
    itemId: 'item-1',
    title: 'Opera House',
  }));
  act(() => renderer.unmount());
});

test('offers no Place action when the Item Place is not editable', async () => {
  const placeEntry = changePlaceConfig({ changeItemPlace: undefined });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        mapRenderer={MockMap}
        placeEntry={placeEntry}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await openEditor(renderer);
  expect(renderer.root.findAllByProps({ testID: 'item-editor-place-row' })).toHaveLength(0);

  act(() => renderer.unmount());
});

const unusedMoveItemToDay = jest.fn<MoveItemToDayCommand>(async () => ({
  data: data.items[0], affectedEntityIds: [data.items[0].id], validationIssues: [],
}));

/** Opens the row menu and then the Day-level move sheet. */
async function openMoveSheet(renderer: ReturnType<typeof create>) {
  await act(async () => {
    renderer.root.findByProps({ testID: 'timeline-actions-item-1' }).props.onPress();
  });
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-action-change-date' }).props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'item-move-sheet' })).toBeDefined();
}

test('更改日期 moves an Item to another Day and keeps the user on this Day', async () => {
  const moveItemToDay = jest.fn<MoveItemToDayCommand>(async () => ({
    data: { ...data.items[0], dayId: 'day-2' },
    affectedEntityIds: [data.items[0].id],
    validationIssues: [],
  }));
  const onItemMoved = jest.fn(() => undefined);
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        moveItemToDay={moveItemToDay}
        onItemMoved={onItemMoved}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await openMoveSheet(renderer);
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-move-sheet-day-day-2' }).props.onPress();
  });

  expect(moveItemToDay).toHaveBeenCalledWith({ itemId: 'item-1', targetDayId: 'day-2' });
  expect(onItemMoved).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByProps({ testID: 'day-view-workspace' })).toHaveLength(2);
  act(() => renderer.unmount());
});

test('更改日期 can move an Item to 未安排', async () => {
  const moveItemToUnscheduled = jest.fn<MoveItemToUnscheduledCommand>(async (input) => ({
    data: { ...data.items[0], id: input.itemId, dayId: null },
    affectedEntityIds: [input.itemId],
    validationIssues: [],
  }));
  const onItemMoved = jest.fn(() => undefined);
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        moveItemToDay={unusedMoveItemToDay}
        moveItemToUnscheduled={moveItemToUnscheduled}
        onItemMoved={onItemMoved}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await openMoveSheet(renderer);
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-move-sheet-unscheduled' }).props.onPress();
  });

  expect(moveItemToUnscheduled).toHaveBeenCalledWith({ itemId: 'item-1' });
  expect(onItemMoved).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('a failed Day-level move keeps the move sheet open', async () => {
  const moveItemToDay = jest.fn<MoveItemToDayCommand>(async () => {
    throw new Error('移动失败');
  });
  const onItemMoved = jest.fn(() => undefined);
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        moveItemToDay={moveItemToDay}
        onItemMoved={onItemMoved}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await openMoveSheet(renderer);
  await act(async () => {
    renderer.root.findByProps({ testID: 'item-move-sheet-day-day-2' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'item-move-sheet-error' }).props.children)
    .toBe('移动失败');
  expect(renderer.root.findByProps({ testID: 'item-move-sheet' })).toBeDefined();
  expect(onItemMoved).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('offers no 移至未安排 when the move-out command is not wired', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        moveItemToDay={unusedMoveItemToDay}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await openMoveSheet(renderer);
  expect(renderer.root.findAllByProps({ testID: 'item-move-sheet-unscheduled' }))
    .toHaveLength(0);
  act(() => renderer.unmount());
});

test('offers no date row when no move command is wired', async () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  await openEditor(renderer);
  expect(renderer.root.findByProps({ testID: 'item-editor-modal' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'item-editor-day-row' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('M6/UX-C: the sheet never remounts for a drag, and the drop emits once', async () => {
  const reorderCommand = jest.fn<ReorderItemCommand>(async () => ({
    data: data.items[0],
    affectedEntityIds: [data.items[0].id],
    validationIssues: [],
  }));
  const onItemReordered = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        onItemReordered={onItemReordered}
        reorderItemCommand={reorderCommand}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  const timeline = renderer.root.findAllByType(DayTimeline)[0];
  expect(timeline.props.onReorderDrop).toBeDefined();

  /*
   * UX-C (2026-10-05 device pass): the sheet must NOT flip its scrollable flag
   * for a drag any more. That flip swapped ScrollView for View — a full content
   * remount that killed the live drag gesture, reset the scroll position and
   * scattered the measured layout on device. The active row pan cancels the
   * scroll view's native pan instead, so the sheet stays one mounted scroll
   * view before, during and after drags.
   */
  /*
   * One mount and no remount, and the scrollable flag never flips. The render
   * *count* is not the signal — the JS-thread presentation re-renders the sheet
   * while it animates — but a remount would show up in the mount log, which is
   * what the device regression actually was.
   */
  expect(sheetMock.__mock.mountLog).toEqual(['half']);
  expect(sheetMock.__mock.scrollableValues.every((value) => value === true)).toBe(true);

  // The drop emits exactly one command call and one invalidation.
  await act(async () => {
    timeline.props.onReorderDrop('item-1', { type: 'after', itemId: 'item-2' });
  });
  expect(reorderCommand).toHaveBeenCalledTimes(1);
  expect(reorderCommand).toHaveBeenCalledWith({
    itemId: 'item-1',
    position: { type: 'after', itemId: 'item-2' },
  });
  expect(onItemReordered).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('M6: without the reorder command the Timeline offers no drag', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });

  const timeline = renderer.root.findAllByType(DayTimeline)[0];
  expect(timeline.props.onReorderDrop).toBeUndefined();
  act(() => renderer.unmount());
});

test('priority UX: the Day swipe vocabulary always selects adjacent Days', () => {
  // At the first Day a right swipe does nothing, even with a Back control.
  expect(resolveDaySwipeIntent(80, { canBack: true, nextDay: days[1], previousDay: undefined }))
    .toBeNull();
  // Without a back seam the right swipe keeps its old meaning: previous Day.
  expect(resolveDaySwipeIntent(80, { canBack: false, nextDay: days[1], previousDay: undefined }))
    .toBeNull();
  const day0 = { ...days[0], id: 'day-0', dayIndex: 0 };
  expect(resolveDaySwipeIntent(80, { canBack: false, nextDay: days[1], previousDay: day0 }))
    .toEqual({ kind: 'day', day: day0 });
  // Left swipe stays "next Day" in both worlds.
  expect(resolveDaySwipeIntent(-80, { canBack: true, nextDay: days[1], previousDay: undefined }))
    .toEqual({ kind: 'day', day: days[1] });
  // Small or non-finite movements are never a swipe.
  expect(resolveDaySwipeIntent(20, { canBack: true, nextDay: days[1] })).toBeNull();
  expect(resolveDaySwipeIntent(Number.NaN, { canBack: true, nextDay: days[1] })).toBeNull();
});

test('priority UX: first-Day row swipe stays put and explicit back stays independent', async () => {
  const onBack = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DayViewWorkspace data={data} days={days} mapRenderer={MockMap} onBack={onBack} />,
    );
  });
  const timeline = renderer.root.findAllByType(DayTimeline)[0];
  // The synthetic-scroll handlers are always wired for rows.
  expect(timeline.props.onPanScrollDelta).toBeDefined();
  expect(timeline.props.onPanScrollStart).toBeDefined();

  // First-Day right swipe stays put; it never triggers the Back seam.
  await act(async () => timeline.props.onPanSwipe('right'));
  expect(onBack).not.toHaveBeenCalled();
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });

  // Left is the next Day, through the same selectDay path as the arrows.
  await act(async () => timeline.props.onPanSwipe('left'));
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-2' });
  expect(onBack).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('UX-C: without a back seam a row right swipe falls back to the previous Day', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DayViewWorkspace data={{ ...data, day: days[1] }} days={days} mapRenderer={MockMap} />,
    );
  });
  const timeline = renderer.root.findAllByType(DayTimeline)[0];
  await act(async () => timeline.props.onPanSwipe('right'));
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });
  act(() => renderer.unmount());
});

test('UX-C: the Day sheet runs no native vertical pans — the row gestures own them', () => {
  sheetMock.__mock.contentPanFlags.length = 0;
  sheetMock.__mock.scrollEnabledFlags.length = 0;
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayViewWorkspace data={data} days={days} mapRenderer={MockMap} />);
  });
  /*
   * 2026-10-05/06 device pass: the sheet's content-drag pan stays off (its
   * activation always beat the drag's long-press hold), and the scroll view
   * never cancels content touches (that cancellation cut the drag's touch
   * stream). scrollEnabled itself must stay ON — with it off, iOS ignores
   * the synthetic scroll's programmatic scrollTo entirely.
   */
  expect(sheetMock.__mock.contentPanFlags.length).toBeGreaterThan(0);
  expect(sheetMock.__mock.contentPanFlags.every((flag: boolean) => !flag)).toBe(true);
  expect(sheetMock.__mock.scrollEnabledFlags.length).toBeGreaterThan(0);
  expect(sheetMock.__mock.scrollEnabledFlags.every((flag: boolean) => flag)).toBe(true);
  act(() => renderer.unmount());
});

test('UX-C: synthetic scrolling survives a completed drag round-trip', async () => {
  const reorderCommand = jest.fn<ReorderItemCommand>(async () => ({
    data: data.items[0],
    affectedEntityIds: [data.items[0].id],
    validationIssues: [],
  }));
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayViewWorkspace
        data={data}
        days={days}
        mapRenderer={TrackedMap}
        reorderItemCommand={reorderCommand}
        updateItemDetailsCommand={unusedUpdateItemDetails}
      />,
    );
  });
  const timeline = renderer.root.findAllByType(DayTimeline)[0];

  // At full height, movement scrolls the list before and after a drag.
  const sheet = renderer.root.findByType(TripBottomSheet);
  act(() => {
    renderer.root.findByProps({ testID: 'day-view-workspace' }).props.onLayout({ nativeEvent: { layout: { height: 800 } } });
    sheet.props.animatedPosition.value = 96;
    sheet.props.onScrollLayout(500);
    sheet.props.onContentSizeChange(1500);
  });
  await act(async () => timeline.props.onPanScrollStart());
  await act(async () => timeline.props.onPanScrollDelta(20));
  const callsBefore = sheetMock.__mock.scrollToSheet.mock.calls.length;
  expect(callsBefore).toBeGreaterThan(0);

  // A full drag round-trip: drop emits, the command resolves, reads invalidate.
  await act(async () => timeline.props.onReorderDrop('item-1', { type: 'after', itemId: 'item-2' }));
  expect(reorderCommand).toHaveBeenCalledTimes(1);

  // Scrolling after the drag must still drive the same scroll view.
  await act(async () => timeline.props.onPanScrollStart());
  await act(async () => timeline.props.onPanScrollDelta(20));
  expect(sheetMock.__mock.scrollToSheet.mock.calls.length).toBeGreaterThan(callsBefore);
  act(() => renderer.unmount());
});
