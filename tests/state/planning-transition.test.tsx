import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';

import {
  PLANNING_TRANSITION_TIMING,
  PLANNING_TRANSITION_TRANSLATE,
  resolveDayTransitionDirection,
  usePlanningTransition,
  type PlanningTransition,
  type PlanningTransitionTiming,
} from '@/state/planning-transition';

const accessibility = AccessibilityInfo as unknown as {
  isReduceMotionEnabled: jest.Mock<() => Promise<boolean>>;
};

function Harness({
  onRender,
  timing,
}: {
  onRender: (transition: PlanningTransition) => void;
  timing?: PlanningTransitionTiming;
}) {
  const transition = usePlanningTransition(timing);
  onRender(transition);
  return null;
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function mountHarness(timing?: PlanningTransitionTiming) {
  let latest!: PlanningTransition;
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <Harness
        onRender={(transition) => {
          latest = transition;
        }}
        timing={timing}
      />,
    );
  });
  await flushMicrotasks();
  return {
    renderer,
    get transition() {
      return latest;
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  accessibility.isReduceMotionEnabled.mockImplementation(async () => false);
});

afterEach(() => {
  jest.useRealTimers();
  accessibility.isReduceMotionEnabled.mockReset();
  accessibility.isReduceMotionEnabled.mockImplementation(async () => false);
});

test('keeps every approved timing window and the restrained travel distance', () => {
  const home = PLANNING_TRANSITION_TIMING.home.exitMs + PLANNING_TRANSITION_TIMING.home.enterMs;
  expect(home).toBeGreaterThanOrEqual(220);
  expect(home).toBeLessThanOrEqual(260);

  // One shared value covers Overview ↔ Day (200–240) and adjacent Day (180–220).
  const day = PLANNING_TRANSITION_TIMING.day.exitMs + PLANNING_TRANSITION_TIMING.day.enterMs;
  expect(day).toBeGreaterThanOrEqual(200);
  expect(day).toBeLessThanOrEqual(220);

  expect(PLANNING_TRANSITION_TRANSLATE).toBeGreaterThanOrEqual(8);
  expect(PLANNING_TRANSITION_TRANSLATE).toBeLessThanOrEqual(12);
});

test('derives a subtle direction only from adjacent dayIndex distance', () => {
  expect(resolveDayTransitionDirection(1, 2)).toBe('forward');
  expect(resolveDayTransitionDirection(3, 2)).toBe('backward');
  // A Day Jump is not a long multi-page travel animation.
  expect(resolveDayTransitionDirection(1, 4)).toBe('neutral');
  expect(resolveDayTransitionDirection(4, 1)).toBe('neutral');
  expect(resolveDayTransitionDirection(2, 2)).toBe('neutral');
  expect(resolveDayTransitionDirection(null, 2)).toBe('neutral');
  expect(resolveDayTransitionDirection(2, undefined)).toBe('neutral');
});

test('prepares while the source stays visible, then swaps once and settles', async () => {
  const order: string[] = [];
  const harness = await mountHarness();
  expect(harness.transition.phase).toBe('idle');

  act(() => {
    harness.transition.run({
      direction: 'forward',
      prepare: async () => {
        order.push('prepare');
      },
      commit: () => {
        order.push('commit');
      },
    });
  });

  // The source surface is untouched while the destination is still unread.
  expect(harness.transition.phase).toBe('preparing');
  expect(harness.transition.isTransitioning).toBe(true);
  expect(harness.transition.direction).toBe('forward');
  expect(order).toEqual([]);

  await flushMicrotasks();
  expect(order).toEqual(['prepare']);
  expect(harness.transition.phase).toBe('leaving');

  act(() => {
    jest.advanceTimersByTime(PLANNING_TRANSITION_TIMING.day.exitMs);
  });
  expect(order).toEqual(['prepare', 'commit']);
  expect(harness.transition.phase).toBe('entering');
  expect(harness.transition.isTransitioning).toBe(true);

  act(() => {
    jest.advanceTimersByTime(PLANNING_TRANSITION_TIMING.day.enterMs);
  });
  expect(harness.transition.phase).toBe('idle');
  expect(harness.transition.isTransitioning).toBe(false);
  expect(jest.getTimerCount()).toBe(0);

  act(() => harness.renderer.unmount());
});

test('ignores a repeated intent until the in-flight transition has settled', async () => {
  const commit = jest.fn();
  const harness = await mountHarness();

  act(() => {
    expect(harness.transition.run({ commit })).toBe(true);
  });
  expect(harness.transition.phase).toBe('leaving');

  let accepted: boolean | undefined;
  act(() => {
    accepted = harness.transition.run({ commit });
  });
  expect(accepted).toBe(false);

  act(() => {
    jest.advanceTimersByTime(
      PLANNING_TRANSITION_TIMING.day.exitMs + PLANNING_TRANSITION_TIMING.day.enterMs,
    );
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(harness.transition.phase).toBe('idle');

  act(() => {
    expect(harness.transition.run({ commit })).toBe(true);
  });
  act(() => {
    jest.advanceTimersByTime(
      PLANNING_TRANSITION_TIMING.day.exitMs + PLANNING_TRANSITION_TIMING.day.enterMs,
    );
  });
  expect(commit).toHaveBeenCalledTimes(2);

  act(() => harness.renderer.unmount());
});

test('an in-place request swaps content without any leaving or entering phase', async () => {
  const phases: string[] = [];
  let latest!: PlanningTransition;
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <Harness
        onRender={(transition) => {
          latest = transition;
          phases.push(transition.phase);
        }}
      />,
    );
  });
  await flushMicrotasks();
  phases.length = 0;

  const commit = jest.fn();
  act(() => {
    expect(latest.run({
      direction: 'forward',
      inPlace: true,
      prepare: async () => undefined,
      commit,
    })).toBe(true);
  });
  await flushMicrotasks();

  // A persistent surface must not fade, translate or wait out an animation.
  expect(commit).toHaveBeenCalledTimes(1);
  expect(phases).not.toContain('leaving');
  expect(phases).not.toContain('entering');
  expect(latest.phase).toBe('idle');
  expect(latest.isTransitioning).toBe(false);

  act(() => renderer.unmount());
});

test('an in-place request still blocks a second intent while it is in flight', async () => {
  const commit = jest.fn();
  const harness = await mountHarness();
  const dayRead = deferred<void>();

  act(() => {
    expect(harness.transition.run({
      inPlace: true,
      prepare: () => dayRead.promise,
      commit,
    })).toBe(true);
  });
  expect(harness.transition.phase).toBe('preparing');

  let accepted: boolean | undefined;
  act(() => {
    accepted = harness.transition.run({ inPlace: true, commit });
  });
  expect(accepted).toBe(false);

  await act(async () => {
    dayRead.resolve();
    await Promise.resolve();
  });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(harness.transition.phase).toBe('idle');

  act(() => harness.renderer.unmount());
});

test('keeps the source surface and reports the error when preparation fails', async () => {
  const commit = jest.fn();
  const onError = jest.fn();
  const harness = await mountHarness();

  act(() => {
    harness.transition.run({
      prepare: async () => {
        throw new Error('day read failed');
      },
      commit,
      onError,
    });
  });
  await flushMicrotasks();

  expect(commit).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(1);
  expect((onError.mock.calls[0][0] as Error).message).toBe('day read failed');
  expect(harness.transition.phase).toBe('idle');
  expect(harness.transition.isTransitioning).toBe(false);

  // No exit/enter frame was scheduled for a failed preparation.
  act(() => {
    jest.advanceTimersByTime(
      PLANNING_TRANSITION_TIMING.day.exitMs + PLANNING_TRANSITION_TIMING.day.enterMs,
    );
  });
  expect(commit).not.toHaveBeenCalled();
  expect(harness.transition.phase).toBe('idle');

  // A failed transition must not lock out the next attempt.
  act(() => {
    expect(harness.transition.run({ commit })).toBe(true);
  });
  act(() => harness.renderer.unmount());
});

test('Reduce Motion commits immediately without waiting for an animation frame', async () => {
  accessibility.isReduceMotionEnabled.mockImplementation(async () => true);
  const commit = jest.fn();
  const harness = await mountHarness();

  act(() => {
    harness.transition.run({
      direction: 'forward',
      prepare: async () => undefined,
      commit,
    });
  });
  await flushMicrotasks();

  // Committed without advancing any timer, and already settled.
  expect(commit).toHaveBeenCalledTimes(1);
  expect(harness.transition.phase).toBe('idle');
  expect(harness.transition.isTransitioning).toBe(false);

  act(() => harness.renderer.unmount());
});

test('does not commit a swap after the surface has unmounted', async () => {
  const commit = jest.fn();
  const harness = await mountHarness();

  act(() => {
    harness.transition.run({ commit });
  });
  expect(commit).not.toHaveBeenCalled();

  act(() => harness.renderer.unmount());
  act(() => {
    jest.advanceTimersByTime(
      PLANNING_TRANSITION_TIMING.day.exitMs + PLANNING_TRANSITION_TIMING.day.enterMs,
    );
  });
  expect(commit).not.toHaveBeenCalled();
});
