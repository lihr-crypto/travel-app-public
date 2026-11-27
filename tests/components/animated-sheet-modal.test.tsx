import { expect, jest, test } from '@jest/globals';
import { Dimensions, Keyboard, StyleSheet, Text } from 'react-native';
import type { KeyboardEvent, KeyboardEventName } from 'react-native';
import { act, create } from 'react-test-renderer';

import {
  AnimatedSheetModal,
  SHEET_BACKDROP_OPACITY,
  SHEET_BACKDROP_FADE_MS,
  SHEET_MAX_HEIGHT_RATIO,
  SHEET_SLIDE_MS,
} from '@/components/ui/animated-sheet-modal';

const reduceMotion = { enabled: false };
jest.mock('@/state/reduce-motion', () => ({
  useReduceMotionPreference: () => reduceMotion.enabled,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));

function render(visible: boolean, props: Partial<React.ComponentProps<typeof AnimatedSheetModal>> = {}) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <AnimatedSheetModal onRequestClose={jest.fn()} testID="probe" visible={visible} {...props}>
        <Text>内容</Text>
      </AnimatedSheetModal>,
    );
  });
  return renderer;
}

/** The sheet's own host view, not the component element that owns the testID. */
function sheetNode(renderer: ReturnType<typeof create>) {
  return renderer.root.findAll(
    (node) => node.props?.testID === 'probe' && node.props?.style !== undefined,
  )[0];
}

/**
 * The presentation now runs on the JS thread through RN's `Animated`, so the
 * styles hold animated nodes rather than plain numbers. `__getValue()` is the
 * node's current value, which is what these assertions are actually about.
 */
function animatedNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  const node = value as { __getValue?: () => number } | null | undefined;
  return typeof node?.__getValue === 'function' ? node.__getValue() : undefined;
}

/** The interpolation's own mapping, for the assertions about its extent. */
function interpolationOutputRange(value: unknown): number[] | undefined {
  return (value as { _config?: { outputRange?: number[] } } | undefined)?._config?.outputRange;
}

function backdropStyle(renderer: ReturnType<typeof create>) {
  return StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'probe-backdrop' }).props.style,
  ) as {
    opacity?: unknown;
    position?: string;
    top?: number;
    left?: number;
  };
}

function sheetStyle(renderer: ReturnType<typeof create>) {
  return StyleSheet.flatten(sheetNode(renderer).props.style) as {
    transform?: { translateY?: unknown }[];
    maxHeight?: number;
    bottom?: number;
    position?: string;
  };
}

/**
 * Host elements only. A composite component and its host view both carry the
 * same `testID`, so `findAllByProps` counts the layer twice.
 */
function hostCount(renderer: ReturnType<typeof create>, testID: string) {
  return renderer.root.findAll(
    (node) => typeof node.type === 'string' && node.props?.testID === testID,
  ).length;
}

test('renders nothing at all while it is closed', () => {
  const renderer = render(false);
  expect(renderer.toJSON()).toBeNull();
  act(() => renderer.unmount());
});

test('opening fades a full-viewport backdrop and slides the sheet in', () => {
  const renderer = render(true);

  const backdrop = backdropStyle(renderer);
  // Opening rests at the backdrop's target opacity (the value is constructed
  // synchronously, so no animation frame is needed to observe it).
  expect(animatedNumber(backdrop.opacity)).toBeCloseTo(SHEET_BACKDROP_OPACITY);
  // `position: fixed; inset: 0` — one layer covering the viewport.
  expect(backdrop.position).toBe('absolute');
  expect(backdrop.top).toBe(0);
  expect(backdrop.left).toBe(0);
  // The backdrop has no transform of its own.
  expect(backdrop).not.toHaveProperty('transform');

  // Only the white sheet translates, and it rests fully on screen.
  expect(animatedNumber(sheetStyle(renderer).transform?.[0]?.translateY)).toBe(0);
  expect(sheetStyle(renderer).maxHeight).toBeGreaterThan(0);

  act(() => renderer.unmount());
});

test('the slide travel equals the bounded sheet height', () => {
  const renderer = render(true);
  const travel = sheetStyle(renderer).maxHeight as number;

  const transform = sheetStyle(renderer).transform?.[0]?.translateY;
  // The closed sheet sits exactly one bounded height below its resting spot.
  expect(interpolationOutputRange(transform)).toEqual([travel, 0]);

  act(() => renderer.unmount());
});

test('opt-in keyboard avoidance moves the whole sheet, constrains height, and restores on hide', () => {
  const listeners = new Map<KeyboardEventName, (event: KeyboardEvent) => void>();
  const subscriptions: { remove: jest.Mock }[] = [];
  const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
    listeners.set(name, listener);
    const subscription = { remove: jest.fn() };
    subscriptions.push(subscription);
    return subscription as never;
  });
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const keyboardEvent = (screenY: number, height: number): KeyboardEvent => ({
    duration: 250,
    easing: 'keyboard',
    endCoordinates: { height, screenX: 0, screenY, width: 400 },
  } as KeyboardEvent);
  const fire = (name: KeyboardEventName, event: KeyboardEvent) => {
    act(() => listeners.get(name)?.(event));
  };

  const visibleSheet = (visible: boolean) => (
    <AnimatedSheetModal
      avoidKeyboard
      onRequestClose={jest.fn()}
      testID="probe"
      visible={visible}
    >
      <Text>内容</Text>
    </AnimatedSheetModal>
  );
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(visibleSheet(true)); });

  const windowHeight = Dimensions.get('window').height;
  const initialHeight = sheetStyle(renderer).maxHeight as number;
  expect(sheetStyle(renderer).position).toBe('absolute');
  expect(sheetStyle(renderer).bottom).toBe(0);

  // A floating frame has no overlap with the bottom-anchored sheet.
  fire('keyboardWillChangeFrame', keyboardEvent(windowHeight * 0.3, windowHeight * 0.25));
  expect(sheetStyle(renderer).bottom).toBe(0);
  expect(sheetStyle(renderer).maxHeight).toBe(initialHeight);

  // A docked frame lifts the full sheet and bounds it to the area above the keyboard.
  const keyboardHeight = windowHeight / 2;
  fire('keyboardWillChangeFrame', keyboardEvent(windowHeight - keyboardHeight, keyboardHeight));
  expect(sheetStyle(renderer).bottom).toBeCloseTo(keyboardHeight);
  expect(sheetStyle(renderer).maxHeight).toBeCloseTo(keyboardHeight);
  expect(sheetStyle(renderer).maxHeight).toBeLessThan(initialHeight);

  fire('keyboardWillHide', keyboardEvent(windowHeight, 0));
  expect(sheetStyle(renderer).bottom).toBe(0);
  expect(sheetStyle(renderer).maxHeight).toBe(initialHeight);

  fire('keyboardWillChangeFrame', keyboardEvent(windowHeight - keyboardHeight, keyboardHeight));
  act(() => { renderer.update(visibleSheet(false)); });
  expect(sheetStyle(renderer).bottom).toBe(0);
  expect(sheetStyle(renderer).maxHeight).toBe(initialHeight);
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(subscriptions).toHaveLength(4);
  expect(subscriptions.every(({ remove }) => remove.mock.calls.length === 1)).toBe(true);

  act(() => renderer.unmount());
  addListener.mockRestore();
  dismiss.mockRestore();
});

test('a completed close unmounts the layer after the slide finishes', async () => {
  const renderer = render(true);
  act(() => {
    renderer.update(
      <AnimatedSheetModal onRequestClose={jest.fn()} testID="probe" visible={false}>
        <Text>内容</Text>
      </AnimatedSheetModal>,
    );
  });
  // Still mounted during the exit slide.
  expect(hostCount(renderer, 'probe-host')).toBe(1);

  // The plain timer closes the layer after the slide, without depending on
  // the animation driver reporting completion.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SHEET_SLIDE_MS + 60));
  });
  expect(hostCount(renderer, 'probe-host')).toBe(0);
  act(() => renderer.unmount());
});

test('a close that a re-open supersedes never unmounts the open sheet', async () => {
  /*
   * The 2026-10-08 device log showed the sheet going `mounted=false` seven
   * milliseconds *after* opening, with `visible` still true, and staying that way
   * for the rest of the session — the exit timer from a closed state surviving
   * into the open one, so the sheet returned null and nothing appeared. The
   * invariant is "an open sheet is mounted", and it is now enforced on every
   * render as well as guarded in the timer.
   */
  const opened = (visible: boolean) => (
    <AnimatedSheetModal onRequestClose={jest.fn()} testID="probe" visible={visible}>
      <Text>内容</Text>
    </AnimatedSheetModal>
  );
  const renderer = render(true);

  // Close, then re-open before the exit slide has finished.
  act(() => { renderer.update(opened(false)); });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SHEET_SLIDE_MS / 2));
  });
  act(() => { renderer.update(opened(true)); });

  // Past the point where the superseded exit timer would have fired.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SHEET_SLIDE_MS + 80));
  });
  expect(hostCount(renderer, 'probe-host')).toBe(1);
  expect(animatedNumber(backdropStyle(renderer).opacity)).toBeCloseTo(SHEET_BACKDROP_OPACITY);
  act(() => renderer.unmount());
});

test('a changed content identity clears a hidden sheet immediately', () => {
  const renderer = render(false, { resetKey: 'day-1' });
  act(() => {
    renderer.update(
      <AnimatedSheetModal
        onRequestClose={jest.fn()}
        resetKey="day-2"
        testID="probe"
        visible={false}
      >
        <Text>内容</Text>
      </AnimatedSheetModal>,
    );
  });
  expect(hostCount(renderer, 'probe-host')).toBe(0);
  act(() => renderer.unmount());
});

test('Reduce Motion skips the animation and never leaves a stale layer behind', () => {
  reduceMotion.enabled = true;
  const renderer = render(true);
  expect(sheetNode(renderer)).toBeDefined();

  act(() => {
    renderer.update(
      <AnimatedSheetModal onRequestClose={jest.fn()} testID="probe" visible={false}>
        <Text>内容</Text>
      </AnimatedSheetModal>,
    );
  });
  // No timer is needed: the sheet is gone in the same commit.
  expect(hostCount(renderer, 'probe-host')).toBe(0);
  act(() => renderer.unmount());
  reduceMotion.enabled = false;
});

test('exposes the backdrop and sheet timings the revision specifies', () => {
  // Backdrop ~150–200 ms, sheet ~250–320 ms, sheet bounded at 75–85 %.
  expect(SHEET_BACKDROP_FADE_MS).toBeGreaterThanOrEqual(150);
  expect(SHEET_BACKDROP_FADE_MS).toBeLessThanOrEqual(200);
  expect(SHEET_SLIDE_MS).toBeGreaterThanOrEqual(250);
  expect(SHEET_SLIDE_MS).toBeLessThanOrEqual(320);
  expect(SHEET_MAX_HEIGHT_RATIO).toBeGreaterThanOrEqual(0.75);
  expect(SHEET_MAX_HEIGHT_RATIO).toBeLessThanOrEqual(0.85);
});
