import { afterEach, expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import {
  AppToast,
  APP_TOAST_DURATION_MS,
} from '@/components/ui/app-toast';

afterEach(() => {
  jest.useRealTimers();
});

test('renders nothing until there is a message', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppToast message={null} />);
  });

  expect(renderer.root.findAllByProps({ testID: 'app-toast' })).toHaveLength(0);
  act(() => renderer.unmount());
});

test('shows the confirmation and dismisses itself', () => {
  jest.useFakeTimers();
  const onDismiss = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppToast message="旅行日期已更新" onDismiss={onDismiss} />);
  });

  expect(renderer.root.findByProps({ testID: 'app-toast-message' }).props.children)
    .toBe('旅行日期已更新');
  expect(onDismiss).not.toHaveBeenCalled();

  act(() => {
    jest.advanceTimersByTime(APP_TOAST_DURATION_MS);
  });
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('a new message restarts the dismissal timer instead of stacking toasts', () => {
  jest.useFakeTimers();
  const onDismiss = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<AppToast message="已插入新的旅行日" onDismiss={onDismiss} />);
  });

  act(() => {
    jest.advanceTimersByTime(APP_TOAST_DURATION_MS - 100);
  });
  act(() => {
    renderer.update(<AppToast message="Day 3 已删除" onDismiss={onDismiss} />);
  });
  act(() => {
    jest.advanceTimersByTime(200);
  });
  expect(onDismiss).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ testID: 'app-toast-message' }).props.children)
    .toBe('Day 3 已删除');

  act(() => {
    jest.advanceTimersByTime(APP_TOAST_DURATION_MS);
  });
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});
