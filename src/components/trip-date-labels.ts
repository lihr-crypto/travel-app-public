import type { TravelDate } from '@/domain/common/types';
import { shiftTravelDate, travelDateParts, weekdayOfTravelDate } from '@/domain/trip/date-range';

/**
 * Gregorian Chinese date copy for the Trip date surfaces.
 *
 * Everything here is derived from the date string itself, so the labels never
 * pick up the device locale or calendar (no `Intl`, no `Date`).
 */
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

export const WEEKDAY_HEADING_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export function weekdayLabel(date: TravelDate): string {
  return WEEKDAY_LABELS[weekdayOfTravelDate(date)];
}

/** `3月9日` */
export function formatDateZh(date: TravelDate): string {
  const { month, day } = travelDateParts(date);
  return `${month}月${day}日`;
}

/** `3月9日 周一` */
export function formatDateZhWeekday(date: TravelDate): string {
  return `${formatDateZh(date)} ${weekdayLabel(date)}`;
}

/** `2026年3月9日` */
export function formatDateZhWithYear(date: TravelDate): string {
  const { year } = travelDateParts(date);
  return `${year}年${formatDateZh(date)}`;
}

/**
 * `2026年3月9日 ～ 3月19日`, dropping the repeated year so the range still fits
 * one line in the sheet. A range that crosses a year boundary keeps both years.
 */
export function formatRangeZh(startDate: TravelDate, endDate: TravelDate): string {
  const start = travelDateParts(startDate);
  const end = travelDateParts(endDate);

  if (start.year !== end.year) {
    return `${formatDateZhWithYear(startDate)} ～ ${formatDateZhWithYear(endDate)}`;
  }

  return `${formatDateZhWithYear(startDate)} ～ ${formatDateZh(endDate)}`;
}

/** `2026-03-09 ～ 2026-03-19`, the compact Overview header form. */
export function formatIsoRange(startDate: TravelDate, endDate: TravelDate): string {
  return `${startDate} ～ ${endDate}`;
}

/** `11 天` */
export function formatDayCount(dayCount: number): string {
  return `${dayCount} 天`;
}

/**
 * A3: `今天` / `明天` for the two nearest days; `null` keeps the plain date.
 * Pure calendar arithmetic on the travel-date string — no clock, no locale.
 */
export function relativeDayLabel(
  date: TravelDate,
  today: TravelDate,
): '今天' | '明天' | null {
  if (date === today) return '今天';
  if (date === shiftTravelDate(today, 1)) return '明天';
  return null;
}
