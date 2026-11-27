import { expect, test } from '@jest/globals';

import {
  formatDateZh,
  formatDateZhWeekday,
  formatDateZhWithYear,
  formatDayCount,
  formatIsoRange,
  formatRangeZh,
  weekdayLabel,
  relativeDayLabel,
} from '@/components/trip-date-labels';

test('formats Gregorian Chinese date copy without the device calendar', () => {
  expect(formatDateZh('2026-09-18')).toBe('9月18日');
  expect(formatDateZhWithYear('2026-09-18')).toBe('2026年9月18日');
  expect(weekdayLabel('2026-09-18')).toBe('周五');
  expect(formatDateZhWeekday('2026-09-18')).toBe('9月18日 周五');
  expect(formatDateZhWeekday('2026-09-28')).toBe('9月28日 周一');
});

test('keeps the Trip range on one short line', () => {
  expect(formatRangeZh('2026-09-18', '2026-09-28')).toBe('2026年9月18日 ～ 9月28日');
  expect(formatRangeZh('2026-09-18', '2026-10-02')).toBe('2026年9月18日 ～ 10月2日');
});

test('keeps both years when a range crosses a year boundary', () => {
  expect(formatRangeZh('2026-12-30', '2027-01-02')).toBe(
    '2026年12月30日 ～ 2027年1月2日',
  );
});

test('keeps the compact ISO form the Overview block already used', () => {
  expect(formatIsoRange('2026-09-18', '2026-09-28')).toBe('2026-09-18 ～ 2026-09-28');
  expect(formatDayCount(11)).toBe('11 天');
});

test('A3: relative labels cover only today and tomorrow', () => {
  expect(relativeDayLabel('2026-10-04', '2026-10-04')).toBe('今天');
  expect(relativeDayLabel('2026-10-05', '2026-10-04')).toBe('明天');
  // Month and year boundaries are plain calendar arithmetic.
  expect(relativeDayLabel('2026-11-01', '2026-10-31')).toBe('明天');
  expect(relativeDayLabel('2026-10-06', '2026-10-04')).toBeNull();
  expect(relativeDayLabel('2026-10-03', '2026-10-04')).toBeNull();
});
