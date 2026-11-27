import { expect, test } from '@jest/globals';

import {
  dateForLocalDayTime,
  defaultEndPickerDate,
  localTimeFromPickerDate,
  travelLocalDateTimeFromPicker,
} from '@/components/item-time-picker-adapter';

test('round-trips the local wall clock without serializing through UTC', () => {
  const pickerDate = dateForLocalDayTime('2026-12-30', '23:35');

  expect(pickerDate.getFullYear()).toBe(2026);
  expect(pickerDate.getMonth()).toBe(11);
  expect(pickerDate.getDate()).toBe(30);
  expect(localTimeFromPickerDate(pickerDate)).toBe('23:35');
  expect(travelLocalDateTimeFromPicker('2026-12-30', pickerDate))
    .toBe('2026-12-30T23:35');
});

test('uses a reasonable rounded start and a same-Day optional end default', () => {
  const start = dateForLocalDayTime('2026-09-20');
  const end = defaultEndPickerDate(start);

  expect(localTimeFromPickerDate(start)).toBe('09:00');
  expect(localTimeFromPickerDate(end)).toBe('10:00');
  expect(end.getDate()).toBe(start.getDate());
});

test('rejects invalid Day dates and wall-clock values', () => {
  expect(() => dateForLocalDayTime('2026-02-30', '09:00')).toThrow('Invalid Day date');
  expect(() => dateForLocalDayTime('2026-09-20', '24:00')).toThrow('Invalid local time');
});
