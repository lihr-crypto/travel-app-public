import { randomUUID } from 'expo-crypto';

import {
  createTrip,
  type CreateTripCommand,
} from '@/application/trip/create-trip';
import {
  changeTripDateRange,
  type ChangeTripDateRangeCommand,
} from '@/application/trip/change-trip-date-range';
import {
  insertTripDay,
  type InsertTripDayCommand,
} from '@/application/trip/insert-trip-day';
import {
  deleteTripDay,
  type DeleteTripDayCommand,
} from '@/application/trip/delete-trip-day';
import {
  deleteTrip,
  type DeleteTripCommand,
} from '@/application/trip/delete-trip';
import {
  renameTrip,
  type RenameTripCommand,
} from '@/application/trip/rename-trip';
import {
  runInDeleteTripTransaction,
  runInRenameTripTransaction,
  runInTripDateRangeTransaction,
  runInTripDayStructureTransaction,
  runInTripDayTransaction,
} from './index';

export const createTripCommand: CreateTripCommand = (input) =>
  createTrip(input, {
    createId: randomUUID,
    now: () => new Date().toISOString(),
    runInTransaction: runInTripDayTransaction,
  });

export const changeTripDateRangeCommand: ChangeTripDateRangeCommand = (input) =>
  changeTripDateRange(input, {
    createId: randomUUID,
    now: () => new Date().toISOString(),
    runInTransaction: runInTripDateRangeTransaction,
  });

export const insertTripDayCommand: InsertTripDayCommand = (input) =>
  insertTripDay(input, {
    createId: randomUUID,
    now: () => new Date().toISOString(),
    runInTransaction: runInTripDayStructureTransaction,
  });

export const deleteTripDayCommand: DeleteTripDayCommand = (input) =>
  deleteTripDay(input, {
    createId: randomUUID,
    now: () => new Date().toISOString(),
    runInTransaction: runInTripDayStructureTransaction,
  });

export const renameTripCommand: RenameTripCommand = (input) =>
  renameTrip(input, {
    now: () => new Date().toISOString(),
    runInTransaction: runInRenameTripTransaction,
  });

export const deleteTripCommand: DeleteTripCommand = (input) =>
  deleteTrip(input, {
    runInTransaction: runInDeleteTripTransaction,
  });
