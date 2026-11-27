import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { UndoSnackbar } from '@/components/undo-snackbar';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders the delete message and the 撤销 action while visible', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <UndoSnackbar
        message="已删除「林间镇」"
        onExpire={jest.fn()}
        onUndo={jest.fn()}
        visible
      />,
    );
  });

  expect(
    renderer.root.findByProps({ testID: 'undo-snackbar' })
      .findAllByType(Text)
      .map((node) => node.props.children),
  ).toEqual(['已删除「林间镇」', '撤销']);

  act(() => renderer.unmount());
});

test('renders nothing when not visible and hides 撤销 without onUndo', () => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <UndoSnackbar message="已删除「x」" onExpire={jest.fn()} visible={false} />,
    );
  });
  expect(renderer.root.findAllByProps({ testID: 'undo-snackbar' })).toHaveLength(0);

  act(() => {
    renderer.update(
      <UndoSnackbar message="已删除「x」" onExpire={jest.fn()} visible />,
    );
  });
  expect(
    renderer.root.findAllByProps({ testID: 'undo-snackbar-undo' }),
  ).toHaveLength(0);

  act(() => renderer.unmount());
});

test('expires once after the duration so the parent can drop the snapshot', () => {
  const onExpire = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <UndoSnackbar message="已删除「x」" onExpire={onExpire} onUndo={jest.fn()} visible />,
    );
  });

  act(() => jest.advanceTimersByTime(4999));
  expect(onExpire).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(onExpire).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(10000));
  expect(onExpire).toHaveBeenCalledTimes(1);

  act(() => renderer.unmount());
});

test('a new message restarts the expiry timer', () => {
  const onExpire = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <UndoSnackbar message="已删除「a」" onExpire={onExpire} onUndo={jest.fn()} visible />,
    );
  });

  act(() => jest.advanceTimersByTime(3000));
  act(() => {
    renderer.update(
      <UndoSnackbar message="已删除「b」" onExpire={onExpire} onUndo={jest.fn()} visible />,
    );
  });
  act(() => jest.advanceTimersByTime(3000));
  expect(onExpire).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(2000));
  expect(onExpire).toHaveBeenCalledTimes(1);

  act(() => renderer.unmount());
});

test('shows the error line beneath the message while keeping 撤销', async () => {
  const onUndo = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <UndoSnackbar
        error="撤销失败，请重试。"
        message="已删除「x」"
        onExpire={jest.fn()}
        onUndo={onUndo}
        visible
      />,
    );
  });

  expect(
    renderer.root.findByProps({ testID: 'undo-snackbar' })
      .findAllByType(Text)
      .map((node) => node.props.children),
  ).toEqual(['已删除「x」', '撤销失败，请重试。', '撤销']);

  await act(async () => {
    renderer.root.findByProps({ testID: 'undo-snackbar-undo' }).props.onPress();
  });
  expect(onUndo).toHaveBeenCalledTimes(1);

  act(() => renderer.unmount());
});
