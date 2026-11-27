import { expect, jest, test } from '@jest/globals';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { TripBottomSheetRef } from '@/components/trip-bottom-sheet';
import { useDaySheetPan } from '@/components/use-day-sheet-pan';

jest.mock('@/components/trip-bottom-sheet', () => ({
  TRIP_SHEET_SNAP_INDEX: { collapsed: 0, half: 1, expanded: 2 },
  TRIP_SHEET_SNAP_STATES: ['collapsed', 'half', 'expanded'],
}));

jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Pan: () => {
    const gesture: Record<string, jest.Mock> = {};
    for (const name of [
      'manualActivation', 'runOnJS', 'simultaneousWithExternalGesture',
      'onTouchesDown', 'onTouchesMove', 'onTouchesUp', 'onTouchesCancelled',
    ]) {
      gesture[name] = jest.fn((arg: unknown) => {
        if (typeof arg === 'function') gesture[`__${name}`] = arg as jest.Mock;
        return gesture;
      });
    }
    return gesture;
  } },
}));

function Harness({ dayId = 'day-1' }: { dayId?: string }) {
  return createElement('PanHarness', { ...useDaySheetPan('half', dayId), testID: 'pan-harness' });
}

function renderPan() {
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<Harness />); });
  const pan = renderer.root.findByProps({ testID: 'pan-harness' }).props as ReturnType<typeof useDaySheetPan>;
  const snapToPosition = jest.fn();
  const snapToIndex = jest.fn();
  const scrollTo = jest.fn();
  pan.sheetRef.current = { snapToPosition, snapToIndex } as unknown as TripBottomSheetRef;
  pan.scrollRef.current = { scrollTo };
  pan.onContainerLayout({ nativeEvent: { layout: { height: 1000 } } } as never);
  pan.onContentSizeChange(1800);
  pan.onScrollLayout(700);
  pan.position.value = 520;
  return { renderer, pan, snapToPosition, snapToIndex, scrollTo };
}

test('an upward pull follows the finger from Half, then scrolls at Expanded', () => {
  const { renderer, pan, snapToPosition, snapToIndex, scrollTo } = renderPan();
  pan.onPanStart();
  pan.onPanDelta(80);
  expect(snapToPosition).toHaveBeenLastCalledWith(560, { duration: 0 });
  expect(scrollTo).not.toHaveBeenCalled();
  pan.onPanDelta(400);
  expect(snapToPosition).toHaveBeenLastCalledWith(880, { duration: 0 });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 80, animated: false });
  pan.onPanEnd();
  expect(snapToIndex).toHaveBeenCalledWith(2);
  act(() => renderer.unmount());
});

test('downward movement consumes list offset and hands the remainder to the panel', () => {
  const { renderer, pan, snapToPosition, snapToIndex, scrollTo } = renderPan();
  pan.position.value = 120;
  pan.onScroll({ nativeEvent: { contentOffset: { y: 100 } } });
  pan.onPanStart();
  pan.onPanDelta(-60);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 40, animated: false });
  expect(snapToPosition).not.toHaveBeenCalled();
  pan.onPanDelta(-240);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  expect(snapToPosition).toHaveBeenLastCalledWith(680, { duration: 0 });
  pan.onPanEnd();
  expect(snapToIndex).toHaveBeenCalledWith(1);
  act(() => renderer.unmount());
});

test('a short pull settles back, and a long pull stops at Collapsed', () => {
  const { renderer, pan, snapToPosition, snapToIndex } = renderPan();
  pan.onPanStart();
  pan.onPanDelta(-20);
  pan.onPanEnd();
  expect(snapToPosition).toHaveBeenLastCalledWith(460, { duration: 0 });
  expect(snapToIndex).toHaveBeenLastCalledWith(1);
  pan.onPanStart();
  pan.onPanDelta(-900);
  expect(snapToPosition).toHaveBeenLastCalledWith(140, { duration: 0 });
  pan.onPanEnd();
  expect(snapToIndex).toHaveBeenLastCalledWith(0);
  act(() => renderer.unmount());
});

test('header and blank-area touches resize; Timeline touches are processed only by the Timeline', () => {
  const { renderer, pan, snapToPosition, snapToIndex } = renderPan();
  const gesture = pan.contentGesture as unknown as Record<string, jest.Mock>;
  const manager = { activate: jest.fn() };
  const touches = (y: number, x = 10) => ({ allTouches: [{ id: 1, x, y }] });
  gesture.__onTouchesDown(touches(100));
  gesture.__onTouchesMove(touches(30), manager);
  expect(snapToPosition).toHaveBeenCalledWith(550, { duration: 0 });
  gesture.__onTouchesUp();
  expect(snapToIndex).toHaveBeenCalledWith(1);
  snapToPosition.mockClear();
  gesture.__onTouchesDown(touches(100));
  pan.onTimelineTouchChange(true);
  gesture.__onTouchesMove(touches(20), manager);
  expect(snapToPosition).not.toHaveBeenCalled();
  pan.onPanStart();
  pan.onPanDelta(80);
  expect(snapToPosition).toHaveBeenCalledTimes(1);
  pan.onTimelineTouchChange(false);
  act(() => renderer.unmount());
});

test('horizontal drifts and taps leave sheet position alone', () => {
  const { renderer, pan, snapToPosition } = renderPan();
  const gesture = pan.contentGesture as unknown as Record<string, jest.Mock>;
  const manager = { activate: jest.fn() };
  gesture.__onTouchesDown({ allTouches: [{ id: 1, x: 0, y: 100 }] });
  gesture.__onTouchesMove({ allTouches: [{ id: 1, x: 2, y: 98 }] }, manager);
  gesture.__onTouchesMove({ allTouches: [{ id: 1, x: 90, y: 96 }] }, manager);
  gesture.__onTouchesUp();
  expect(manager.activate).not.toHaveBeenCalled();
  expect(snapToPosition).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('body drags use absolute coordinates while the panel itself moves beneath the finger', () => {
  const { renderer, pan, snapToPosition } = renderPan();
  const gesture = pan.contentGesture as unknown as Record<string, jest.Mock>;
  const manager = { activate: jest.fn() };
  const touches = (absoluteY: number) => ({
    allTouches: [{ id: 1, x: 10, y: 100, absoluteX: 10, absoluteY }],
  });
  gesture.__onTouchesDown(touches(600));
  gesture.__onTouchesMove(touches(520), manager);
  gesture.__onTouchesMove(touches(440), manager);
  expect(snapToPosition.mock.calls).toEqual([
    [560, { duration: 0 }], [640, { duration: 0 }],
  ]);
  gesture.__onTouchesCancelled();
  act(() => renderer.unmount());
});
