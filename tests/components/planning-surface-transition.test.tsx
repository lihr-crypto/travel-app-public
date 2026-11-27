import { beforeEach, expect, jest, test } from '@jest/globals';
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { PlanningSurfaceTransition } from '@/components/planning-surface-transition';
import {
  PLANNING_TRANSITION_TIMING,
  PLANNING_TRANSITION_TRANSLATE,
  type PlanningTransition,
  type PlanningTransitionDirection,
  type PlanningTransitionPhase,
} from '@/state/planning-transition';
import { colors } from '@/theme/tokens';

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const sharedValues: Array<{ value: number }> = [];
  const withTiming = jest.fn((toValue: number) => toValue);
  const useSharedValue = (initial: number) => {
    const ref = React.useRef<{ value: number } | null>(null);
    if (ref.current === null) {
      ref.current = { value: initial };
      sharedValues.push(ref.current);
    }
    return ref.current;
  };
  const useAnimatedStyle = (factory: () => Record<string, unknown>) => factory();
  const AnimatedView = (props: { children?: ReactNode; [key: string]: unknown }) =>
    React.createElement('MockAnimatedView', props, props.children);

  return {
    __esModule: true,
    default: { View: AnimatedView },
    Easing: {
      in: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      quad: (value: number) => value * value,
    },
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    __mock: { sharedValues, withTiming },
  };
});

const reanimated = jest.requireMock('react-native-reanimated') as unknown as {
  __mock: {
    sharedValues: Array<{ value: number }>;
    withTiming: jest.Mock<(toValue: number, config?: unknown) => number>;
  };
};

const timing = PLANNING_TRANSITION_TIMING.day;

function makeTransition(
  phase: PlanningTransitionPhase,
  direction: PlanningTransitionDirection = 'neutral',
): PlanningTransition {
  return {
    phase,
    direction,
    timing,
    isTransitioning: phase !== 'idle',
    run: () => false,
  };
}

function renderTransition(transition: PlanningTransition) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <PlanningSurfaceTransition transition={transition}>
        <Text testID="surface-child">Trip Overview</Text>
      </PlanningSurfaceTransition>,
    );
  });
  return renderer;
}

/** The two shared values are always created opacity-first, then translateX. */
function lastSharedValues() {
  const values = reanimated.__mock.sharedValues;
  return {
    opacity: values[values.length - 2],
    translateX: values[values.length - 1],
  };
}

beforeEach(() => {
  reanimated.__mock.sharedValues.length = 0;
  reanimated.__mock.withTiming.mockClear();
});

test('mounts one surface over a stable page background', () => {
  const renderer = renderTransition(makeTransition('idle'));

  const host = renderer.root.findByProps({ testID: 'planning-surface-transition-host' });
  // The host background is what covers a native map first frame during the swap.
  expect(StyleSheet.flatten(host.props.style).backgroundColor).toBe(colors.background);

  // Exactly one surface is mounted: no two live native maps can overlap.
  expect(renderer.root.findAll(
    (node) => (node.type as unknown as string) === 'MockAnimatedView',
  )).toHaveLength(1);
  expect(renderer.root.findAllByType(Text)).toHaveLength(1);

  const { opacity, translateX } = lastSharedValues();
  expect(opacity.value).toBe(1);
  expect(translateX.value).toBe(0);
  act(() => renderer.unmount());
});

test('leaving fades out over the exit duration and travels in the swap direction', () => {
  const renderer = renderTransition(makeTransition('leaving', 'forward'));

  const { opacity, translateX } = lastSharedValues();
  expect(opacity.value).toBe(0);
  expect(translateX.value).toBe(-PLANNING_TRANSITION_TRANSLATE);
  expect(reanimated.__mock.withTiming).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: timing.exitMs }),
  );
  expect(reanimated.__mock.withTiming).toHaveBeenCalledWith(
    -PLANNING_TRANSITION_TRANSLATE,
    expect.objectContaining({ duration: timing.exitMs }),
  );

  act(() => renderer.unmount());
});

test('a backward swap mirrors the travel direction', () => {
  const renderer = renderTransition(makeTransition('leaving', 'backward'));
  expect(lastSharedValues().translateX.value).toBe(PLANNING_TRANSITION_TRANSLATE);
  act(() => renderer.unmount());
});

test('a neutral Day Jump fades without horizontal travel', () => {
  const renderer = renderTransition(makeTransition('leaving', 'neutral'));

  const { translateX } = lastSharedValues();
  expect(translateX.value).toBe(0);
  expect(reanimated.__mock.withTiming).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: timing.exitMs }),
  );

  act(() => renderer.unmount());
});

test('entering eases the destination in over the enter duration', () => {
  const renderer = renderTransition(makeTransition('entering', 'forward'));

  expect(reanimated.__mock.withTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: timing.enterMs }),
  );
  expect(reanimated.__mock.withTiming).toHaveBeenCalledWith(
    0,
    expect.objectContaining({ duration: timing.enterMs }),
  );

  act(() => renderer.unmount());
});

test('preparing keeps the source surface exactly as it is', () => {
  const renderer = renderTransition(makeTransition('preparing', 'forward'));

  expect(reanimated.__mock.withTiming).not.toHaveBeenCalled();
  const { opacity, translateX } = lastSharedValues();
  expect(opacity.value).toBe(1);
  expect(translateX.value).toBe(0);

  act(() => renderer.unmount());
});
