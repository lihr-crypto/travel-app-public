import type {
  EntityId,
  IsoTimestamp,
  TravelDate,
} from '@/domain/common/types';
import { deriveInclusiveTravelDateRange } from '@/domain/trip/date-range';
import type { Day, Trip, TripMapRegion } from '@/domain/trip/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { TripRepository } from '@/repositories/trip-repository';
import type { CommandResult } from '../command-result';

export interface CreateTripInput {
  title: string;
  startDate: TravelDate;
  endDate: TravelDate;
  mapRegion?: TripMapRegion;
  note?: string;
}

export type CreateTripCommand = (
  input: CreateTripInput,
) => Promise<CommandResult<Trip>>;

export interface CreateTripTransactionContext {
  trips: Pick<TripRepository, 'insert'>;
  days: Pick<DayRepository, 'insertMany'>;
}

export type RunCreateTripTransaction = <T>(
  task: (context: CreateTripTransactionContext) => Promise<T>,
) => Promise<T>;

export interface CreateTripDependencies {
  createId(): EntityId;
  now(): IsoTimestamp;
  runInTransaction: RunCreateTripTransaction;
}

export async function createTrip(
  input: CreateTripInput,
  dependencies: CreateTripDependencies,
): Promise<CommandResult<Trip>> {
  const title = input.title.trim();

  if (!title) {
    throw new RangeError('Trip title must not be empty');
  }

  const mapRegion = input.mapRegion === undefined ? 'global' : input.mapRegion;
  if (
    mapRegion !== 'china_mainland' &&
    mapRegion !== 'global'
  ) {
    throw new RangeError(`Invalid Trip mapRegion: ${input.mapRegion}`);
  }

  const dateRange = deriveInclusiveTravelDateRange(
    input.startDate,
    input.endDate,
  );
  const timestamp = dependencies.now();
  const trip: Trip = {
    id: dependencies.createId(),
    title,
    startDate: input.startDate,
    endDate: input.endDate,
    mapRegion,
    note: input.note ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const days: Day[] = dateRange.map(({ date, dayIndex }) => ({
    id: dependencies.createId(),
    tripId: trip.id,
    date,
    dayIndex,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  await dependencies.runInTransaction(async (repositories) => {
    await repositories.trips.insert(trip);
    await repositories.days.insertMany(days);
  });

  return {
    data: trip,
    affectedEntityIds: [trip.id, ...days.map((day) => day.id)],
    validationIssues: [],
  };
}
