import type { TravelLocalDateTime } from '@/domain/common/types';

const DEFAULT_START_TIME = '09:00';
const MINUTE_INTERVAL = 5;

function parseDay(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError(`Invalid Day date: ${day}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const check = new Date(year, month - 1, date);
  if (
    check.getFullYear() !== year
    || check.getMonth() !== month - 1
    || check.getDate() !== date
  ) {
    throw new RangeError(`Invalid Day date: ${day}`);
  }
  return { year, month, date };
}

function parseTime(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError(`Invalid local time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new RangeError(`Invalid local time: ${time}`);
  }
  return { hour, minute };
}

/**
 * Date is only the native picker adapter. Its local wall-clock fields are
 * populated directly; no UTC conversion is involved.
 */
export function dateForLocalDayTime(day: string, time = DEFAULT_START_TIME): Date {
  const { year, month, date } = parseDay(day);
  const { hour, minute } = parseTime(time);
  return new Date(year, month - 1, date, hour, minute, 0, 0);
}

export function localTimeFromPickerDate(value: Date): string {
  const hour = String(value.getHours()).padStart(2, '0');
  const minute = String(value.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

/** Builds the persisted travel-local timestamp from the Day plus local picker fields. */
export function travelLocalDateTimeFromPicker(
  day: string,
  value: Date,
): TravelLocalDateTime {
  parseDay(day);
  return `${day}T${localTimeFromPickerDate(value)}` as TravelLocalDateTime;
}

/** A practical same-Day end default, rounded to the next five-minute wheel value. */
export function defaultEndPickerDate(start: Date): Date {
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  if (
    end.getFullYear() !== start.getFullYear()
    || end.getMonth() !== start.getMonth()
    || end.getDate() !== start.getDate()
  ) {
    return new Date(
      start.getFullYear(), start.getMonth(), start.getDate(), 23, 55, 0, 0,
    );
  }
  const roundedMinute = Math.ceil(end.getMinutes() / MINUTE_INTERVAL) * MINUTE_INTERVAL;
  if (roundedMinute === 60) end.setHours(end.getHours() + 1, 0, 0, 0);
  else end.setMinutes(roundedMinute, 0, 0);
  return end;
}
