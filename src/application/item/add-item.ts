import type {
  EntityId,
  IsoTimestamp,
  TravelLocalDateTime,
} from '@/domain/common/types';
import { assertItemTimeFields } from '@/domain/item/time';
import { assertItemType, normalizeItemPayload } from '@/domain/item/validation';
import type {
  DayPeriod,
  Item,
  ItemPayload,
  ItemType,
  TimeMode,
} from '@/domain/item/types';
import type { DayRepository } from '@/repositories/day-repository';
import type { ItemRepository } from '@/repositories/item-repository';
import type { TripRepository } from '@/repositories/trip-repository';
import type { PlaceRepository } from '@/repositories/place-repository';
import type { CommandResult } from '../command-result';
import { orderItemsByTravelTime, reindexChangedItems } from './ordering';
import { assertPlaceMatchesTripRegion } from '../place/place-snapshot';

export interface AddItemInput {
  tripId: EntityId;
  dayId: EntityId | null;
  placeId?: EntityId | null;
  title: string;
  type: ItemType;
  timeMode?: TimeMode;
  startDateTime?: TravelLocalDateTime | null;
  endDateTime?: TravelLocalDateTime | null;
  period?: DayPeriod | null;
  isFixed?: boolean;
  note?: string | null;
  payload?: ItemPayload | null;
}

export type AddItemCommand = (
  input: AddItemInput,
) => Promise<CommandResult<Item>>;

export interface AddItemTransactionContext {
  trips: Pick<TripRepository, 'getById'>;
  days: Pick<DayRepository, 'getById'>;
  items: Pick<
    ItemRepository,
    'insert' | 'listByDayId' | 'listUnscheduledByTripId' | 'updateMany'
  >;
  places: Pick<PlaceRepository, 'getById'>;
}

export type RunAddItemTransaction = <T>(
  task: (context: AddItemTransactionContext) => Promise<T>,
) => Promise<T>;

export interface AddItemDependencies {
  createId(): EntityId;
  now(): IsoTimestamp;
  runInTransaction: RunAddItemTransaction;
}

export interface AddItemWithinTransactionDependencies {
  createId(): EntityId;
  now(): IsoTimestamp;
}

export interface AddedItemWithinTransaction {
  item: Item;
  affectedEntityIds: EntityId[];
}

function validateAddItemInput(input: AddItemInput) {
  const title = input.title.trim();
  if (!title) throw new RangeError('Item title must not be empty');
  assertItemType(input.type);
  const timeFields = {
    timeMode: input.timeMode ?? ('none' as const),
    startDateTime: input.startDateTime ?? null,
    endDateTime: input.endDateTime ?? null,
    period: input.period ?? null,
  };
  assertItemTimeFields(timeFields);
  const payload = normalizeItemPayload(input.type, input.payload ?? null);
  return { title, timeFields, payload };
}

export async function addItemWithinTransaction(
  input: AddItemInput,
  dependencies: AddItemWithinTransactionDependencies,
  repositories: AddItemTransactionContext,
): Promise<AddedItemWithinTransaction> {
  const { title, timeFields, payload } = validateAddItemInput(input);
  const trip = await repositories.trips.getById(input.tripId);
  if (!trip) throw new RangeError(`Trip not found: ${input.tripId}`);

  if (input.dayId !== null) {
    const day = await repositories.days.getById(input.dayId);
    if (!day) throw new RangeError(`Day not found: ${input.dayId}`);
    if (day.tripId !== input.tripId) {
      throw new RangeError('Item Day must belong to the same Trip');
    }
  }

  const placeId = input.placeId ?? null;
  if (placeId !== null) {
    const place = await repositories.places.getById(placeId);
    if (!place) throw new RangeError(`Place not found: ${placeId}`);
    assertPlaceMatchesTripRegion(place, trip.mapRegion);
  }

  const currentItems = input.dayId === null
    ? await repositories.items.listUnscheduledByTripId(input.tripId)
    : await repositories.items.listByDayId(input.dayId);
  const timestamp = dependencies.now();
  const item: Item = {
    id: dependencies.createId(),
    tripId: input.tripId,
    dayId: input.dayId,
    placeId,
    type: input.type,
    title,
    sortOrder: currentItems.length,
    ...timeFields,
    isFixed: input.isFixed ?? false,
    note: input.note ?? null,
    payload,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const ordered = orderItemsByTravelTime([...currentItems, item]);
  const reindexed = reindexChangedItems(ordered, timestamp);
  const createdIndex = ordered.findIndex(({ id }) => id === item.id);
  const created = { ...item, sortOrder: createdIndex };
  const existingUpdates = reindexed.filter(({ id }) => id !== item.id);
  if (existingUpdates.length > 0) await repositories.items.updateMany(existingUpdates);
  await repositories.items.insert(created);
  return {
    item: created,
    affectedEntityIds: [...existingUpdates.map(({ id }) => id), created.id],
  };
}

export async function addItem(
  input: AddItemInput,
  dependencies: AddItemDependencies,
): Promise<CommandResult<Item>> {
  validateAddItemInput(input);

  const added = await dependencies.runInTransaction((repositories) =>
    addItemWithinTransaction(input, dependencies, repositories));

  return {
    data: added.item,
    affectedEntityIds: added.affectedEntityIds,
    validationIssues: [],
  };
}
