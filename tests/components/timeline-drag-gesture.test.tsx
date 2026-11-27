import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import type { TimelineProjection } from '@/application/projections/timeline';
import { DayTimeline } from '@/components/day-timeline';
import { DRAG_ACTIVATION_MS } from '@/components/timeline-drag';

/**
 * `TimelineRow` arms its drag from the touch stream itself — RNGH's
 * `activateAfterLongPress` cannot win the activation race against the Bottom
 * Sheet's own scroll view (the scroll pan activates at roughly 10 pt, before any
 * long-press timer can fire), so the row counts its own hold and only calls
 * `stateManager.activate()` once the finger has stayed put.
 *
 * That state machine is JS and therefore testable; this suite drives it through
 * the callbacks the component registered on its gesture.
 */
type CapturedGesture = Record<string, jest.Mock>;

jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  const chainable = () => {
    const g: CapturedGesture = {};
    for (const method of [
      'manualActivation',
      'withRef',
      // The component pins every callback to the JS thread (see day-timeline).
      'runOnJS',
      // UX-C: the pending hold fails natively past the slop so scrolling wins.
      'failOffsetX',
      'failOffsetY',
      'hitSlop',
      'onTouchesDown',
      'onTouchesMove',
      'onTouchesUp',
      'onTouchesCancelled',
      'onUpdate',
      'onEnd',
      'onFinalize',
    ]) {
      g[method] = jest.fn((...args: unknown[]) => {
        const fnArg = args.find((arg) => typeof arg === 'function');
        if (fnArg) g[`__${method}`] = fnArg as jest.Mock;
        return g;
      });
    }
    return g;
  };
  return {
    // The gesture is exposed on the rendered surface so the test can drive it.
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: React.ReactNode }) =>
      React.createElement(
        ReactNative.View,
        { testID: 'gesture-surface', gesture } as unknown as { testID: string },
        children,
      ),
    Gesture: { Pan: jest.fn(chainable) },
  };
});

const projection: TimelineProjection = {
  dayId: 'day-1',
  items: [
    { id: 'a', title: 'A', type: 'custom', typeLabel: '其他', time: { mode: 'none' }, note: null, placeName: null },
    { id: 'b', title: 'B', type: 'custom', typeLabel: '其他', time: { mode: 'none' }, note: null, placeName: null },
    { id: 'c', title: 'C', type: 'custom', typeLabel: '其他', time: { mode: 'none' }, note: null, placeName: null },
  ],
};

function renderTimeline() {
  const onReorderDrop = jest.fn();
  const onDragActiveChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <DayTimeline
        onDragActiveChange={onDragActiveChange}
        onReorderDrop={onReorderDrop}
        projection={projection}
      />,
    );
  });
  return { renderer, onReorderDrop, onDragActiveChange };
}

/** Three uniform 80 pt rows at 0 / 80 / 160, as a real layout pass measures. */
function layoutRows(renderer: ReturnType<typeof create>) {
  for (const [index, id] of ['a', 'b', 'c'].entries()) {
    act(() => {
      renderer.root.findByProps({ testID: `timeline-row-${id}` }).props.onLayout({
        nativeEvent: { layout: { height: 80, width: 320, x: 0, y: index * 80 } },
      });
    });
  }
}

function gestureOf(renderer: ReturnType<typeof create>): CapturedGesture {
  // UX-C: one gesture on the list container, not one per row.
  const surface = renderer.root.findByProps({ testID: 'gesture-surface' });
  return surface.props.gesture as CapturedGesture;
}

function touch(id: number, absoluteX: number, absoluteY: number) {
  return { allTouches: [{ absoluteX, absoluteY, id, x: absoluteX, y: absoluteY }] };
}

const waitPastHold = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DRAG_ACTIVATION_MS + 50));
  });
};

test('sheet-relative row movement still scrolls by screen-space finger travel and settles once', () => {
  const onStart = jest.fn();
  const onDelta = jest.fn();
  const onEnd = jest.fn();
  const onTouch = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<DayTimeline
    projection={projection}
    onPanScrollStart={onStart}
    onPanScrollDelta={onDelta}
    onPanScrollEnd={onEnd}
    onGestureTouchChange={onTouch}
  />); });
  const gesture = gestureOf(renderer);
  const manager = { activate: jest.fn() };
  const movingSheetTouch = (absoluteY: number) => ({
    allTouches: [{ id: 1, x: 10, y: 100, absoluteX: 10, absoluteY }],
  });
  gesture.__onTouchesDown(movingSheetTouch(600), manager);
  gesture.__onTouchesMove(movingSheetTouch(560), manager);
  gesture.__onTouchesMove(movingSheetTouch(520), manager);
  gesture.__onTouchesUp();
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onDelta.mock.calls).toEqual([[40], [40]]);
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(onTouch.mock.calls).toEqual([[true], [false]]);
  act(() => renderer.unmount());
});

test('M6-T1: a held finger activates the drag, a drifting one stays a scroll', async () => {
  const { renderer, onDragActiveChange } = renderTimeline();
  layoutRows(renderer);
  const gesture = gestureOf(renderer);

  const held = { activate: jest.fn(), fail: jest.fn() };
  act(() => { gesture.__onTouchesDown(touch(1, 10, 10), held); });
  // Nothing happens while the hold is still pending.
  expect(held.activate).not.toHaveBeenCalled();
  await waitPastHold();
  expect(held.activate).toHaveBeenCalledTimes(1);
  expect(onDragActiveChange).toHaveBeenCalledWith(true);

  // A second touch, on row B: the finger drifts past the slop, so the scroll
  // keeps the touch and the drag never arms.
  const drifted = { activate: jest.fn(), fail: jest.fn() };
  act(() => { gesture.__onTouchesDown(touch(2, 10, 90), drifted); });
  act(() => { gesture.__onTouchesMove(touch(2, 10, 130)); });
  await waitPastHold();
  expect(drifted.activate).not.toHaveBeenCalled();
  expect(onDragActiveChange).toHaveBeenCalledTimes(1);

  act(() => renderer.unmount());
});

test('M6-T2/T4: the drop emits one relative intent, and a tap emits none', async () => {
  const { renderer, onReorderDrop, onDragActiveChange } = renderTimeline();
  layoutRows(renderer);
  const gesture = gestureOf(renderer);

  // A tap: down and up inside the hold window — the drag never arms, no write.
  act(() => { gesture.__onTouchesDown(touch(1, 10, 10), { activate: jest.fn(), fail: jest.fn() }); });
  act(() => { gesture.__onTouchesUp(touch(1, 10, 10)); });
  expect(onReorderDrop).not.toHaveBeenCalled();

  // A real drag of A past C's centre (200) lands A after C — armed by the
  // hold, moved by the raw touch stream, ended by the finger lifting.
  const held = { activate: jest.fn(), fail: jest.fn() };
  act(() => { gesture.__onTouchesDown(touch(1, 10, 10), held); });
  await waitPastHold();
  act(() => { gesture.__onTouchesMove(touch(1, 10, 180)); });
  act(() => { gesture.__onTouchesUp(touch(1, 10, 180)); });

  expect(onReorderDrop).toHaveBeenCalledTimes(1);
  expect(onReorderDrop).toHaveBeenCalledWith('a', { type: 'after', itemId: 'c' });
  expect(onDragActiveChange).toHaveBeenLastCalledWith(false);

  act(() => renderer.unmount());
});

test('M6: without a reorder seam the rows expose no drag surface', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<DayTimeline projection={projection} />);
  });
  expect(renderer.root.findAllByProps({ testID: 'gesture-surface' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('UX-C: vertical drift scrolls synthetically and never arms the drag', async () => {
  const onPanScrollStart = jest.fn();
  const onPanScrollDelta = jest.fn();
  const onPanSwipe = jest.fn();
  const onDragActiveChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DayTimeline
        onDragActiveChange={onDragActiveChange}
        onPanScrollDelta={onPanScrollDelta}
        onPanScrollStart={onPanScrollStart}
        onPanSwipe={onPanSwipe}
        onReorderDrop={jest.fn()}
        projection={projection}
      />,
    );
  });
  const gesture = gestureOf(renderer);

  // Finger moves down then up: deltas are negative then positive (positive =
  // towards the list's end), scroll anchors exactly once, no drag activates.
  act(() => { gesture.__onTouchesDown(touch(1, 10, 100), { activate: jest.fn(), fail: jest.fn() }); });
  act(() => { gesture.__onTouchesMove(touch(1, 10, 116)); });
  act(() => { gesture.__onTouchesMove(touch(1, 10, 96)); });
  expect(onPanScrollStart).toHaveBeenCalledTimes(1);
  expect(onPanScrollDelta.mock.calls.map(([delta]) => delta)).toEqual([-16, 20]);
  expect(onPanSwipe).not.toHaveBeenCalled();
  expect(onDragActiveChange).not.toHaveBeenCalled();
  act(() => { gesture.__onTouchesUp(touch(1, 10, 96)); });
  act(() => renderer.unmount());
});

test('UX-C: a horizontal flick stays undecided under the threshold, then swipes once', async () => {
  const onPanScrollStart = jest.fn();
  const onPanScrollDelta = jest.fn();
  const onPanSwipe = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DayTimeline
        onPanScrollDelta={onPanScrollDelta}
        onPanScrollStart={onPanScrollStart}
        onPanSwipe={onPanSwipe}
        onReorderDrop={jest.fn()}
        projection={projection}
      />,
    );
  });
  layoutRows(renderer);
  const gesture = gestureOf(renderer);

  // 30pt of horizontal drift is past the slop but under the swipe threshold:
  // undecided — no scroll, no swipe (this is what keeps a flick from scrolling).
  act(() => { gesture.__onTouchesDown(touch(2, 10, 100), { activate: jest.fn(), fail: jest.fn() }); });
  act(() => { gesture.__onTouchesMove(touch(2, 40, 101)); });
  expect(onPanScrollStart).not.toHaveBeenCalled();
  expect(onPanScrollDelta).not.toHaveBeenCalled();
  expect(onPanSwipe).not.toHaveBeenCalled();

  // Past the threshold the swipe fires exactly once, and later moves stay mute.
  act(() => { gesture.__onTouchesMove(touch(2, 75, 102)); });
  act(() => { gesture.__onTouchesMove(touch(2, 110, 103)); });
  expect(onPanSwipe).toHaveBeenCalledTimes(1);
  expect(onPanSwipe).toHaveBeenCalledWith('right');
  expect(onPanScrollStart).not.toHaveBeenCalled();
  act(() => { gesture.__onTouchesUp(touch(2, 110, 103)); });
  act(() => renderer.unmount());
});

test('UX-C: a left flick on a row swipes to the next Day direction', async () => {
  const onPanSwipe = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DayTimeline onPanSwipe={onPanSwipe} onReorderDrop={jest.fn()} projection={projection} />,
    );
  });
  layoutRows(renderer);
  const gesture = gestureOf(renderer);
  act(() => { gesture.__onTouchesDown(touch(3, 200, 140), { activate: jest.fn(), fail: jest.fn() }); });
  act(() => { gesture.__onTouchesMove(touch(3, 130, 100)); });
  expect(onPanSwipe).toHaveBeenCalledWith('left');
  act(() => { gesture.__onTouchesUp(touch(3, 130, 100)); });
  act(() => renderer.unmount());
});

test('UX-C: an armed row floats — vacated slot in the flow, card overlay above', async () => {
  const { renderer } = renderTimeline();
  layoutRows(renderer);
  const gesture = gestureOf(renderer);

  // Arm the hold: the row leaves the flow.
  act(() => { gesture.__onTouchesDown(touch(1, 10, 10), { activate: jest.fn(), fail: jest.fn() }); });
  await waitPastHold();
  expect(renderer.root.findByProps({ testID: 'timeline-drag-slot-a' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'timeline-drag-overlay-a' })).toBeDefined();
  // The flow keeps the other rows, and the dragged row itself is gone from it.
  expect(renderer.root.findAllByProps({ testID: 'timeline-row-a' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'timeline-row-b' })).toBeDefined();
  // The overlay never intercepts a touch.
  expect(renderer.root.findByProps({ testID: 'timeline-drag-overlay-a' }).props.pointerEvents)
    .toBe('none');

  // Disarm: lifting the finger returns the card to the flow at its slot (a
  // motionless drag resolves no drop intent, so the held preview settles).
  act(() => { gesture.__onTouchesUp(touch(1, 10, 10)); });
  expect(renderer.root.findAllByProps({ testID: 'timeline-drag-slot-a' })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'timeline-drag-overlay-a' })).toHaveLength(0);
  expect(renderer.root.findByProps({ testID: 'timeline-row-a' })).toBeDefined();
  act(() => renderer.unmount());
});

test('UX-C: scrolling still works after a completed drag', async () => {
  const onPanScrollStart = jest.fn();
  const onPanScrollDelta = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DayTimeline
        onPanScrollDelta={onPanScrollDelta}
        onPanScrollStart={onPanScrollStart}
        onReorderDrop={jest.fn()}
        projection={projection}
      />,
    );
  });
  layoutRows(renderer);
  const gesture = gestureOf(renderer);

  // A complete drag: arm A, move it past B, release.
  act(() => { gesture.__onTouchesDown(touch(1, 10, 10), { activate: jest.fn(), fail: jest.fn() }); });
  await waitPastHold();
  act(() => { gesture.__onTouchesMove(touch(1, 10, 100)); });
  act(() => { gesture.__onTouchesUp(touch(1, 10, 100)); });
  expect(onPanScrollDelta).not.toHaveBeenCalled();

  // A fresh touch afterwards must still classify as a scroll.
  act(() => { gesture.__onTouchesDown(touch(2, 10, 100), { activate: jest.fn(), fail: jest.fn() }); });
  act(() => { gesture.__onTouchesMove(touch(2, 10, 116)); });
  act(() => { gesture.__onTouchesMove(touch(2, 10, 96)); });
  expect(onPanScrollStart).toHaveBeenCalledTimes(1);
  expect(onPanScrollDelta.mock.calls.map(([delta]) => delta)).toEqual([-16, 20]);
  act(() => { gesture.__onTouchesUp(touch(2, 10, 96)); });
  act(() => renderer.unmount());
});

test('UX-C: a touch after a torn-down drag resets the zombie activation', async () => {
  const onPanScrollStart = jest.fn();
  const onDragActiveChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DayTimeline
        onDragActiveChange={onDragActiveChange}
        onPanScrollStart={onPanScrollStart}
        onReorderDrop={jest.fn()}
        projection={projection}
      />,
    );
  });
  layoutRows(renderer);
  const gesture = gestureOf(renderer);

  // Arm a drag, then simulate the surface being torn down mid-drag: the up
  // event is lost, the hold still says "activated".
  act(() => { gesture.__onTouchesDown(touch(1, 10, 10), { activate: jest.fn(), fail: jest.fn() }); });
  await waitPastHold();
  expect(onDragActiveChange).toHaveBeenCalledWith(true);

  // A new touch (new Day visit) arrives with the stale activation in place:
  // it must be treated as a fresh touch, not as the continuation of a drag —
  // a vertical move classifies as a scroll, not a dragMove.
  act(() => { gesture.__onTouchesDown(touch(2, 10, 100), { activate: jest.fn(), fail: jest.fn() }); });
  act(() => { gesture.__onTouchesMove(touch(2, 10, 130)); });
  expect(onPanScrollStart).toHaveBeenCalledTimes(1);
  act(() => { gesture.__onTouchesUp(touch(2, 10, 130)); });
  act(() => renderer.unmount());
});
