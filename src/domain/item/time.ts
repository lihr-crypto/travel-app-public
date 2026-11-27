import type { TravelLocalDateTime } from '@/domain/common/types';
import { shiftTravelDate } from '@/domain/trip/date-range';
import type { DayPeriod, TimeMode } from './types';

interface ItemTimeFields {
  timeMode: TimeMode;
  startDateTime: TravelLocalDateTime | null;
  endDateTime: TravelLocalDateTime | null;
  period: DayPeriod | null;
}

const TRAVEL_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const DAY_PERIODS: readonly DayPeriod[] = [
  'morning',
  'noon',
  'afternoon',
  'night',
];

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function assertTravelLocalDateTime(value: TravelLocalDateTime) {
  const match = TRAVEL_LOCAL_DATE_TIME_PATTERN.exec(value);

  if (!match) {
    throw new RangeError(`Invalid TravelLocalDateTime: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59
  ) {
    throw new RangeError(`Invalid TravelLocalDateTime: ${value}`);
  }
}

export function shiftTravelLocalDateTime(
  value: TravelLocalDateTime,
  dayDelta: number,
): TravelLocalDateTime {
  assertTravelLocalDateTime(value);
  return `${shiftTravelDate(value.slice(0, 10), dayDelta)}${value.slice(10)}`;
}

export function assertItemTimeFields(fields: ItemTimeFields) {
  if (fields.startDateTime !== null) {
    assertTravelLocalDateTime(fields.startDateTime);
  }

  if (fields.endDateTime !== null) {
    assertTravelLocalDateTime(fields.endDateTime);
  }

  if (fields.period !== null && !DAY_PERIODS.includes(fields.period)) {
    throw new RangeError(`Invalid Item period: ${fields.period}`);
  }

  switch (fields.timeMode) {
    case 'none':
      if (
        fields.startDateTime !== null ||
        fields.endDateTime !== null ||
        fields.period !== null
      ) {
        throw new RangeError('Item timeMode none cannot have time fields');
      }
      return;
    case 'period':
      if (
        fields.startDateTime !== null ||
        fields.endDateTime !== null ||
        fields.period === null
      ) {
        throw new RangeError(
          'Item timeMode period requires only a DayPeriod',
        );
      }
      return;
    case 'exact':
      if (
        (fields.startDateTime === null && fields.endDateTime === null)
        || fields.period !== null
      ) {
        throw new RangeError(
          'Item timeMode exact requires startDateTime or endDateTime and no period',
        );
      }
      return;
    default:
      throw new RangeError(`Invalid Item timeMode: ${fields.timeMode}`);
  }
}
