import { expect, jest, test } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import type {
  ChangeTripDateRangeCommand,
  ChangeTripDateRangeInput,
} from '@/application/trip/change-trip-date-range';
import type { DeleteTripDayCommand } from '@/application/trip/delete-trip-day';
import type { InsertTripDayCommand } from '@/application/trip/insert-trip-day';
import { TripDateManagement } from '@/components/trip-date-management';
import type { Item } from '@/domain/item/types';
import type { Day } from '@/domain/trip/types';
import { SafeAreaTestProvider } from '../helpers/safe-area';

const timestamp = '2026-09-11T12:00:00.000Z';
const dayDates = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'];
const days: Day[] = dayDates.map((date, index) => ({
  id: `day-${index + 1}`,
  tripId: 'trip-1',
  date,
  dayIndex: index + 1,
  createdAt: timestamp,
  updatedAt: timestamp,
}));

function item(id: string, dayId: string | null, sortOrder: number): Item {
  return {
    id,
    tripId: 'trip-1',
    dayId,
    placeId: null,
    type: 'custom',
    title: id,
    sortOrder,
    timeMode: 'none',
    startDateTime: null,
    endDateTime: null,
    period: null,
    isFixed: false,
    note: null,
    payload: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const scheduledItems = [
  item('item-1', 'day-3', 0),
  item('item-2', 'day-3', 1),
  item('item-3', 'day-4', 0),
];

function ok<T>(data: T) {
  return { data, affectedEntityIds: [], validationIssues: [] };
}

const changeTripDateRange = jest.fn<ChangeTripDateRangeCommand>(
  async () => ok(undefined),
);
const insertTripDay = jest.fn<InsertTripDayCommand>(
  async () => ok({ day: days[0], tripEndDate: '2026-09-23' }),
);
const deleteTripDay = jest.fn<DeleteTripDayCommand>(
  async () => ok({ unscheduledItemCount: 2, tripEndDate: '2026-09-21' }),
);

function renderManagement(
  overrides: Partial<React.ComponentProps<typeof TripDateManagement>> = {},
) {
  const onClose = jest.fn();
  const onCompleted = jest.fn();
  const onChanged = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <SafeAreaTestProvider>
        <TripDateManagement
          changeTripDateRange={changeTripDateRange}
          days={days}
          deleteTripDay={deleteTripDay}
          endDate="2026-09-22"
          insertTripDay={insertTripDay}
          onChanged={onChanged}
          onClose={onClose}
          onCompleted={onCompleted}
          scheduledItems={scheduledItems}
          startDate="2026-09-18"
          tripId="trip-1"
          visible
          {...overrides}
        />
      </SafeAreaTestProvider>,
    );
  });
  return { onChanged, onClose, onCompleted, renderer };
}

function texts(renderer: ReturnType<typeof create>) {
  return renderer.root.findAllByType(Text).flatMap((node) =>
    (Array.isArray(node.props.children) ? node.props.children : [node.props.children])
      .filter((child: unknown): child is string | number =>
        typeof child === 'string' || typeof child === 'number'),
  );
}

function press(renderer: ReturnType<typeof create>, testID: string) {
  act(() => {
    renderer.root.findByProps({ testID }).props.onPress();
  });
}

test('the entry page summarises the trip and offers the three intents', () => {
  const { renderer } = renderManagement();

  expect(renderer.root.findByProps({ testID: 'trip-date-management-current' })).toBeDefined();
  const rendered = texts(renderer);
  expect(rendered).toContain('修改旅行日期');
  expect(rendered).toContain('2026年9月18日 ～ 9月22日');
  expect(rendered).toContain('5 天');
  expect(rendered).toContain('整趟改期');
  expect(rendered).toContain('调整开始 / 结束日期');
  expect(rendered).toContain('管理旅行日');
  // The storage strategy is never named in the UI.
  expect(rendered).not.toContain('整体平移');
  expect(rendered).not.toContain('按日历日期');
  act(() => renderer.unmount());
});

test('整趟改期 keeps the length and confirms with the shifted range', async () => {
  const { onChanged, onClose, onCompleted, renderer } = renderManagement();
  changeTripDateRange.mockClear();

  press(renderer, 'trip-date-management-entry-shift');
  expect(renderer.root.findByProps({ testID: 'trip-date-shift-title' })).toBeDefined();
  // Nothing is confirmable before a date is picked.
  expect(renderer.root.findByProps({ testID: 'trip-date-shift-confirm' }).props.disabled)
    .toBe(true);

  press(renderer, 'trip-date-shift-calendar-day-2026-09-20');
  expect(renderer.root.findByProps({ testID: 'trip-date-shift-preview-range' }).props.children)
    .toBe('2026年9月20日 ～ 9月24日');
  expect(renderer.root.findByProps({ testID: 'trip-date-shift-preview-note' }).props.children)
    .toBe('所有已安排的旅行日和行程将整体顺延 2 天。');

  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-date-shift-confirm' }).props.onPress();
  });

  const input = changeTripDateRange.mock.calls[0][0] as ChangeTripDateRangeInput;
  expect(input).toEqual({
    tripId: 'trip-1',
    startDate: '2026-09-20',
    endDate: '2026-09-24',
    strategy: 'shiftItems',
  });
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(onCompleted).toHaveBeenCalledWith('旅行日期已更新');
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('整趟改期 can move the trip earlier', async () => {
  const { renderer } = renderManagement();
  changeTripDateRange.mockClear();

  press(renderer, 'trip-date-management-entry-shift');
  press(renderer, 'trip-date-shift-calendar-day-2026-09-16');

  expect(renderer.root.findByProps({ testID: 'trip-date-shift-preview-range' }).props.children)
    .toBe('2026年9月16日 ～ 9月20日');
  expect(renderer.root.findByProps({ testID: 'trip-date-shift-preview-note' }).props.children)
    .toBe('所有已安排的旅行日和行程将整体提前 2 天。');

  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-date-shift-confirm' }).props.onPress();
  });
  expect(changeTripDateRange.mock.calls[0][0]).toMatchObject({
    startDate: '2026-09-16',
    endDate: '2026-09-20',
    strategy: 'shiftItems',
  });
  act(() => renderer.unmount());
});

test('调整旅行日期 previews the removed Days and where their Items go', async () => {
  const { onCompleted, renderer } = renderManagement();
  changeTripDateRange.mockClear();

  press(renderer, 'trip-date-management-entry-range');
  expect(renderer.root.findByProps({ testID: 'trip-date-range-save' }).props.disabled).toBe(true);

  // The end readout is active by default, so one tap shortens the trip.
  press(renderer, 'trip-date-range-calendar-day-2026-09-20');

  const impact = texts(renderer);
  expect(impact).toContain('此次调整将：');
  expect(impact).toContain('－ 移除 Day 4 · 9月21日');
  expect(impact).toContain('－ 移除 Day 5 · 9月22日');
  expect(impact).toContain('其中共有 1 个行程。这些行程会移动到「未安排」，不会删除任何行程。');
  expect(renderer.root.findByProps({ testID: 'trip-date-range-preview-count' }).props.children)
    .toBe('3 天');

  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-date-range-save' }).props.onPress();
  });

  expect(changeTripDateRange.mock.calls[0][0]).toEqual({
    tripId: 'trip-1',
    startDate: '2026-09-18',
    endDate: '2026-09-20',
    strategy: 'keepCalendarDates',
  });
  expect(onCompleted).toHaveBeenCalledWith('旅行日期已更新');
  act(() => renderer.unmount());
});

test('调整旅行日期 extends the range by adding empty Days', () => {
  const { renderer } = renderManagement();

  press(renderer, 'trip-date-management-entry-range');
  press(renderer, 'trip-date-range-calendar-day-2026-09-25');

  const impact = texts(renderer);
  expect(impact).toContain('将新增 3 天：9月23日 ～ 9月25日。');
  expect(renderer.root.findByProps({ testID: 'trip-date-range-preview-count' }).props.children)
    .toBe('8 天');
  act(() => renderer.unmount());
});

test('调整旅行日期 switches which end a tap moves', () => {
  const { renderer } = renderManagement();

  press(renderer, 'trip-date-management-entry-range');
  press(renderer, 'trip-date-range-start');
  press(renderer, 'trip-date-range-calendar-day-2026-09-16');

  expect(renderer.root.findByProps({ testID: 'trip-date-range-start-value' }).props.children)
    .toBe('9月16日');
  expect(renderer.root.findByProps({ testID: 'trip-date-range-end-value' }).props.children)
    .toBe('9月22日');
  expect(texts(renderer)).toContain('将新增 2 天：9月16日 ～ 9月17日。');
  act(() => renderer.unmount());
});

test('管理旅行日 uses `...` and inserts a Day before or after', async () => {
  const { onCompleted, renderer } = renderManagement();
  insertTripDay.mockClear();

  press(renderer, 'trip-date-management-entry-days');
  const rendered = texts(renderer).join('');
  expect(rendered).toContain('Day 3');
  expect(rendered).toContain('9月20日 周日');
  // The structural editor owns `...`; the Overview keeps `›` for Day Detail.
  expect(rendered).not.toContain('›');
  expect(rendered).toContain('...');

  press(renderer, 'trip-day-structure-menu-day-3');
  expect(renderer.root.findByProps({ testID: 'trip-day-menu-insert-before' })).toBeDefined();

  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-day-menu-insert-after' }).props.onPress();
  });
  expect(insertTripDay.mock.calls[0][0]).toEqual({
    tripId: 'trip-1',
    dayId: 'day-3',
    position: 'after',
  });
  expect(onCompleted).toHaveBeenCalledWith('已插入新的旅行日');
  act(() => renderer.unmount());
});

test('管理旅行日 confirms a delete with the Item count and the new end date', async () => {
  const { onCompleted, renderer } = renderManagement();
  deleteTripDay.mockClear();

  press(renderer, 'trip-date-management-entry-days');
  press(renderer, 'trip-day-structure-menu-day-3');
  press(renderer, 'trip-day-menu-delete');

  const confirm = texts(renderer).join('');
  expect(confirm).toContain('删除 Day 3？');
  expect(confirm).toContain('9月20日共有 2 个行程，这些行程会移动到「未安排」。');
  expect(confirm).toContain('旅行结束日期：9月22日 → 9月21日');

  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-day-delete-confirm-action' }).props.onPress();
  });
  expect(deleteTripDay.mock.calls[0][0]).toEqual({ tripId: 'trip-1', dayId: 'day-3' });
  expect(onCompleted).toHaveBeenCalledWith('Day 3 已删除，2 个行程已移至未安排');
  act(() => renderer.unmount());
});

test('管理旅行日 does not offer to delete the only remaining Day', () => {
  const { renderer } = renderManagement({ days: [days[0]] });

  press(renderer, 'trip-date-management-entry-days');
  press(renderer, 'trip-day-structure-menu-day-1');

  expect(renderer.root.findByProps({ testID: 'trip-day-menu-delete' }).props.disabled).toBe(true);
  act(() => renderer.unmount());
});

test('a failed write reports inline and keeps the page open', async () => {
  const failing = jest.fn<ChangeTripDateRangeCommand>(async () => {
    throw new Error('旅行日期无效');
  });
  const { onChanged, onCompleted, renderer } = renderManagement({
    changeTripDateRange: failing,
  });

  press(renderer, 'trip-date-management-entry-shift');
  press(renderer, 'trip-date-shift-calendar-day-2026-09-20');
  await act(async () => {
    renderer.root.findByProps({ testID: 'trip-date-shift-confirm' }).props.onPress();
  });

  expect(renderer.root.findByProps({ testID: 'trip-date-shift-error' }).props.children)
    .toBe('旅行日期无效');
  expect(onChanged).not.toHaveBeenCalled();
  expect(onCompleted).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('entries are unavailable rather than dead when a command is missing', () => {
  const { renderer } = renderManagement({
    changeTripDateRange: undefined,
    deleteTripDay: undefined,
    insertTripDay: undefined,
  });

  expect(renderer.root.findByProps({ testID: 'trip-date-management-entry-shift' }).props.disabled)
    .toBe(true);
  expect(renderer.root.findByProps({ testID: 'trip-date-management-entry-days' }).props.disabled)
    .toBe(true);
  act(() => renderer.unmount());
});

test('a reopened sheet always starts at the entry page', () => {
  const { renderer } = renderManagement();
  press(renderer, 'trip-date-management-entry-shift');
  expect(renderer.root.findByProps({ testID: 'trip-date-shift-title' })).toBeDefined();

  act(() => renderer.update(
    <SafeAreaTestProvider>
      <TripDateManagement
        changeTripDateRange={changeTripDateRange}
        days={days}
        deleteTripDay={deleteTripDay}
        endDate="2026-09-22"
        insertTripDay={insertTripDay}
        onChanged={jest.fn()}
        onClose={jest.fn()}
        onCompleted={jest.fn()}
        scheduledItems={scheduledItems}
        startDate="2026-09-18"
        tripId="trip-1"
        visible={false}
      />
    </SafeAreaTestProvider>,
  ));
  act(() => renderer.update(
    <SafeAreaTestProvider>
      <TripDateManagement
        changeTripDateRange={changeTripDateRange}
        days={days}
        deleteTripDay={deleteTripDay}
        endDate="2026-09-22"
        insertTripDay={insertTripDay}
        onChanged={jest.fn()}
        onClose={jest.fn()}
        onCompleted={jest.fn()}
        scheduledItems={scheduledItems}
        startDate="2026-09-18"
        tripId="trip-1"
        visible
      />
    </SafeAreaTestProvider>,
  ));

  expect(renderer.root.findByProps({ testID: 'trip-date-management-menu' })).toBeDefined();
  expect(renderer.root.findAllByProps({ testID: 'trip-date-shift-title' })).toHaveLength(0);
  act(() => renderer.unmount());
});
