import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import type { DeleteTripCommand } from '@/application/trip/delete-trip';
import type { RenameTripCommand } from '@/application/trip/rename-trip';
import { TripManagementSheet } from '@/components/trip-management-sheet';
import type { Trip } from '@/domain/trip/types';

jest.mock('@/state/reduce-motion', () => ({
  useReduceMotionPreference: () => false,
}));

const timestamp = '2026-10-08T00:00:00.000Z';
const trip: Trip = {
  id: 'trip-1',
  title: '关西秋日旅行',
  startDate: '2026-11-01',
  endDate: '2026-11-03',
  mapRegion: 'global',
  note: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function render(overrides: Partial<React.ComponentProps<typeof TripManagementSheet>> = {}) {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripManagementSheet
        deleteTripCommand={jest.fn<DeleteTripCommand>(async () => ({
          data: undefined,
          affectedEntityIds: [trip.id],
          validationIssues: [],
        }))}
        onClose={jest.fn()}
        renameTripCommand={jest.fn<RenameTripCommand>(async ({ title }) => ({
          data: { ...trip, title },
          affectedEntityIds: [trip.id],
          validationIssues: [],
        }))}
        trip={trip}
        visible
        {...overrides}
      />,
    );
  });
  return renderer;
}

test('opens the reusable menu with rename and whole-Trip delete actions', () => {
  const renderer = render();

  expect(renderer.root.findByProps({ testID: 'trip-management-menu' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-management-rename' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-management-delete' })).toBeDefined();
  expect(renderer.root.findByProps({ avoidKeyboard: true })).toBeDefined();
  expect(renderer.root.findAllByType(Text).map(({ props }) => props.children))
    .not.toContain(trip.title);
  act(() => renderer.unmount());
});

test('rename trims the title, rejects blank input, and reports the committed Trip', async () => {
  const renameTripCommand = jest.fn<RenameTripCommand>(async ({ title }) => ({
    data: { ...trip, title, updatedAt: '2026-10-09T00:00:00.000Z' },
    affectedEntityIds: [trip.id],
    validationIssues: [],
  }));
  const onTripRenamed = jest.fn();
  const onClose = jest.fn();
  const renderer = render({ onClose, onTripRenamed, renameTripCommand });

  act(() => renderer.root.findByProps({ testID: 'trip-management-rename' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'trip-management-title-input' }).props.autoFocus)
    .toBe(true);
  expect(renderer.root.findByProps({ testID: 'trip-management-rename-cancel' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-management-rename-save' })).toBeDefined();
  act(() => renderer.root.findByProps({ testID: 'trip-management-title-input' })
    .props.onChangeText('   '));
  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-management-rename-save' }).props.onPress();
  });

  expect(renameTripCommand).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ testID: 'trip-management-error' }).props.children)
    .toBe('旅行名称不能为空');

  act(() => renderer.root.findByProps({ testID: 'trip-management-title-input' })
    .props.onChangeText('  新的关西旅行  '));
  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-management-rename-save' }).props.onPress();
  });

  expect(renameTripCommand).toHaveBeenCalledWith({ tripId: trip.id, title: '新的关西旅行' });
  expect(onTripRenamed).toHaveBeenCalledWith(expect.objectContaining({ title: '新的关西旅行' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('delete stays behind a concrete confirmation and names the permanent scope', async () => {
  const deleteTripCommand = jest.fn<DeleteTripCommand>(async () => ({
    data: undefined,
    affectedEntityIds: [trip.id],
    validationIssues: [],
  }));
  const onTripDeleted = jest.fn();
  const onClose = jest.fn();
  const renderer = render({ deleteTripCommand, onClose, onTripDeleted });

  act(() => renderer.root.findByProps({ testID: 'trip-management-delete' }).props.onPress());
  const text = renderer.root.findAllByType(Text)
    .map(({ props }) => (typeof props.children === 'string' ? props.children : ''))
    .join('\n');
  expect(text).toContain('确定删除「关西秋日旅行」吗？');
  expect(text).toContain('全部 Day、已安排行程和未安排行程');
  expect(deleteTripCommand).not.toHaveBeenCalled();

  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-management-delete-confirm' }).props.onPress();
  });
  expect(deleteTripCommand).toHaveBeenCalledWith({ tripId: trip.id });
  expect(onTripDeleted).toHaveBeenCalledWith(trip.id);
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('a command error keeps the current page usable', async () => {
  const renameTripCommand = jest.fn<RenameTripCommand>(async () => {
    throw new Error('database unavailable');
  });
  const renderer = render({ renameTripCommand });

  act(() => renderer.root.findByProps({ testID: 'trip-management-rename' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'trip-management-title-input' })
    .props.onChangeText('保留草稿'));
  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-management-rename-save' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'trip-management-rename-page' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-management-title-input' }).props.value)
    .toBe('保留草稿');
  expect(renderer.root.findByProps({ testID: 'trip-management-error' }).props.children)
    .toBe('旅行名称保存失败，请重试。');
  act(() => renderer.unmount());
});

test('synchronous duplicate confirmation cannot delete a Trip twice', async () => {
  let finish!: () => void;
  const deleteTripCommand = jest.fn<DeleteTripCommand>(() => new Promise((resolve) => {
    finish = () => resolve({ data: undefined, affectedEntityIds: [trip.id], validationIssues: [] });
  }));
  const renderer = render({ deleteTripCommand });
  act(() => renderer.root.findByProps({ testID: 'trip-management-delete' }).props.onPress());
  act(() => {
    const confirm = renderer.root.findByProps({ testID: 'trip-management-delete-confirm' });
    confirm.props.onPress();
    confirm.props.onPress();
  });
  expect(deleteTripCommand).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  act(() => renderer.unmount());
});

test('a delete error keeps the permanent confirmation page open', async () => {
  const deleteTripCommand = jest.fn<DeleteTripCommand>(async () => {
    throw new Error('database unavailable');
  });
  const onClose = jest.fn();
  const renderer = render({ deleteTripCommand, onClose });

  act(() => renderer.root.findByProps({ testID: 'trip-management-delete' }).props.onPress());
  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-management-delete-confirm' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'trip-management-delete-page' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-management-error' }).props.children)
    .toBe('旅行删除失败，请重试。');
  expect(onClose).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});
