import { beforeEach, expect, jest, test } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create } from 'react-test-renderer';

import {
  BACK_SWIPE_ACTIVATION_X,
  shouldTriggerBackSwipe,
  TripBackButton,
  useBackSwipeGesture,
} from '@/components/trip-back-button';
import { tripFocusStore } from '@/state/trip-focus';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

beforeEach(() => {
  act(() => {
    tripFocusStore.setState({ tripId: 'trip-1', focus: { type: 'item', itemId: 'item-1', dayId: 'day-1' }, sheetSnap: 'half' });
  });
});

test('backs one interaction level at a time and emits Home only when leaving Overview', () => {
  const onHome = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <TripBackButton onHome={onHome} />
      </SafeAreaProvider>,
    );
  });
  const button = () => renderer.root.findByProps({ testID: 'trip-back-button' });

  act(() => button().props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'day', dayId: 'day-1' });
  expect(onHome).not.toHaveBeenCalled();
  act(() => button().props.onPress());
  expect(tripFocusStore.getState().focus).toEqual({ type: 'overview' });
  expect(onHome).not.toHaveBeenCalled();
  act(() => button().props.onPress());
  expect(tripFocusStore.getState().tripId).toBeNull();
  expect(onHome).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('does not emit a back action when no Trip is selected', () => {
  const onHome = jest.fn();
  act(() => tripFocusStore.setState({ tripId: null, focus: { type: 'overview' }, sheetSnap: 'half' }));
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <TripBackButton onHome={onHome} />
      </SafeAreaProvider>,
    );
  });
  const button = renderer.root.findByProps({ testID: 'trip-back-button' });
  expect(button.props.disabled).toBe(true);
  act(() => button.props.onPress());
  expect(onHome).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('UX-C: the back-swipe threshold is right-only and beyond the Day-swipe slop', () => {
  expect(shouldTriggerBackSwipe(80)).toBe(true);
  expect(shouldTriggerBackSwipe(BACK_SWIPE_ACTIVATION_X + 1)).toBe(true);
  expect(shouldTriggerBackSwipe(BACK_SWIPE_ACTIVATION_X)).toBe(false);
  // A leftward swipe is never a Back.
  expect(shouldTriggerBackSwipe(-120)).toBe(false);
});

test('UX-C: the back-swipe gesture exists only when there is a back seam', () => {
  const cases: { label: string; onBack?: () => void }[] = [
    { label: 'no-seam' },
    { label: 'seam', onBack: () => undefined },
  ];
  const captured: unknown[] = [];
  for (const testCase of cases) {
    function Probe() {
      captured.push(useBackSwipeGesture(testCase.onBack));
      return null;
    }
    act(() => {
      create(<Probe />);
    });
  }
  // Without a seam there is no gesture ("no seam, no action"); with one, the
  // surface receives a configured pan to attach.
  expect(captured[0]).toBeNull();
  expect(captured[1]).not.toBeNull();
});
