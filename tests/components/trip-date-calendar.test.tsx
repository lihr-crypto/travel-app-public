import { expect, jest, test } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import {
  TripDateCalendar,
  type TripDateCalendarValue,
} from '@/components/trip-date-calendar';

function renderCalendar(
  overrides: Partial<React.ComponentProps<typeof TripDateCalendar>> = {},
) {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripDateCalendar
        initialMonth="2026-09-18"
        mode="single"
        onChange={onChange}
        value={{ startDate: null, endDate: null }}
        {...overrides}
      />,
    );
  });
  return { onChange, renderer };
}

function press(renderer: ReturnType<typeof create>, date: string) {
  act(() => {
    renderer.root
      .findByProps({ testID: `trip-date-calendar-day-${date}` })
      .props.onPress();
  });
}

test('lays out a Gregorian month with Monday-first headings', () => {
  const { renderer } = renderCalendar();

  expect(renderer.root.findByProps({ testID: 'trip-date-calendar-month' }).props.children)
    .toEqual([2026, '年', 9, '月']);
  expect(renderer.root.findByProps({ testID: 'trip-date-calendar-day-2026-09-01' }))
    .toBeDefined();
  expect(renderer.root.findByProps({ testID: 'trip-date-calendar-day-2026-09-30' }))
    .toBeDefined();
  // September starts on a Tuesday, so the grid is padded rather than spilling
  // August into the first row.
  expect(renderer.root.findAllByProps({ testID: 'trip-date-calendar-day-2026-08-31' }))
    .toHaveLength(0);
  expect(renderer.root.findAllByProps({ testID: 'trip-date-calendar-day-2026-10-01' }))
    .toHaveLength(0);
  act(() => renderer.unmount());
});

test('moves between months without changing the selection', () => {
  const { onChange, renderer } = renderCalendar();

  act(() => renderer.root.findByProps({ testID: 'trip-date-calendar-next' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'trip-date-calendar-month' }).props.children)
    .toEqual([2026, '年', 10, '月']);
  act(() => renderer.root.findByProps({ testID: 'trip-date-calendar-prev' }).props.onPress());
  act(() => renderer.root.findByProps({ testID: 'trip-date-calendar-prev' }).props.onPress());
  expect(renderer.root.findByProps({ testID: 'trip-date-calendar-month' }).props.children)
    .toEqual([2026, '年', 8, '月']);
  expect(onChange).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('single mode selects exactly one date', () => {
  const { onChange, renderer } = renderCalendar();

  press(renderer, '2026-09-20');
  expect(onChange).toHaveBeenCalledWith({ startDate: '2026-09-20', endDate: '2026-09-20' });
  act(() => renderer.unmount());
});

test('range mode moves the end by default and the start when asked', () => {
  const value: TripDateCalendarValue = {
    startDate: '2026-09-18',
    endDate: '2026-09-28',
  };
  const onEnd = jest.fn();
  let endRenderer!: ReturnType<typeof create>;
  act(() => {
    endRenderer = create(
      <TripDateCalendar
        activeEnd="end"
        initialMonth="2026-09-18"
        mode="range"
        onChange={onEnd}
        value={value}
      />,
    );
  });
  press(endRenderer, '2026-09-30');
  expect(onEnd).toHaveBeenCalledWith({ startDate: '2026-09-18', endDate: '2026-09-30' });
  act(() => endRenderer.unmount());

  const onStart = jest.fn();
  let startRenderer!: ReturnType<typeof create>;
  act(() => {
    startRenderer = create(
      <TripDateCalendar
        activeEnd="start"
        initialMonth="2026-09-18"
        mode="range"
        onChange={onStart}
        value={value}
      />,
    );
  });
  press(startRenderer, '2026-09-16');
  expect(onStart).toHaveBeenCalledWith({ startDate: '2026-09-16', endDate: '2026-09-28' });
  act(() => startRenderer.unmount());
});

test('collapses the range instead of inverting it when a start passes the end', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripDateCalendar
        activeEnd="start"
        initialMonth="2026-09-18"
        mode="range"
        onChange={onChange}
        value={{ startDate: '2026-09-18', endDate: '2026-09-20' }}
      />,
    );
  });

  press(renderer, '2026-09-25');
  expect(onChange).toHaveBeenCalledWith({ startDate: '2026-09-25', endDate: '2026-09-25' });
  act(() => renderer.unmount());
});

test('re-picking an end before the start reads as re-picking the start', () => {
  const onChange = jest.fn();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <TripDateCalendar
        activeEnd="end"
        initialMonth="2026-09-18"
        mode="range"
        onChange={onChange}
        value={{ startDate: '2026-09-18', endDate: '2026-09-28' }}
      />,
    );
  });

  press(renderer, '2026-09-16');
  expect(onChange).toHaveBeenCalledWith({ startDate: '2026-09-16', endDate: '2026-09-18' });
  act(() => renderer.unmount());
});

test('disables days before the minimum without emitting a selection', () => {
  const { onChange, renderer } = renderCalendar({ minDate: '2026-09-15' });

  expect(renderer.root.findByProps({ testID: 'trip-date-calendar-day-2026-09-14' }).props.disabled)
    .toBe(true);
  expect(renderer.root.findByProps({ testID: 'trip-date-calendar-day-2026-09-15' }).props.disabled)
    .toBe(false);

  act(() => {
    renderer.root
      .findByProps({ testID: 'trip-date-calendar-day-2026-09-14' })
      .props.onPress();
  });
  expect(onChange).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});
