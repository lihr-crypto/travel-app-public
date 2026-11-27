import type {
  EntityId,
  IsoTimestamp,
  TravelLocalDateTime,
} from '@/domain/common/types';
import { assertItemTimeFields } from '@/domain/item/time';
import type {
  DayPeriod,
  Item,
  ItemPayload,
  ItemType,
  TimeMode,
} from '@/domain/item/types';
import { assertItemType, normalizeItemPayload } from '@/domain/item/validation';
import type { ItemRepository } from '@/repositories/item-repository';
import type { CommandResult } from '../command-result';
import { orderItemsByTravelTime, reindexChangedItems } from './ordering';
import { changeItemPlace, type ChangeItemPlaceTransactionContext, type ChangeItemPlaceTarget } from './change-item-place';

export interface UpdateItemDetailsInput {
  itemId: EntityId;
  title?: string;
  type?: ItemType;
  timeMode?: TimeMode;
  startDateTime?: TravelLocalDateTime | null;
  endDateTime?: TravelLocalDateTime | null;
  period?: DayPeriod | null;
  isFixed?: boolean;
  note?: string | null;
  payload?: ItemPayload | null;
  /** Editor-owned pending choice, committed atomically with all other fields. */
  placeTarget?: ChangeItemPlaceTarget;
}

export type UpdateItemDetailsCommand = (
  input: UpdateItemDetailsInput,
) => Promise<CommandResult<Item>>;

export interface UpdateItemDetailsTransactionContext {
  items: Pick<
    ItemRepository,
    'getById' | 'listByDayId' | 'listUnscheduledByTripId' | 'update' | 'updateMany'
  >;
  places?: ChangeItemPlaceTransactionContext['places'];
  trips?: ChangeItemPlaceTransactionContext['trips'];
}

export type RunUpdateItemDetailsTransaction = <T>(
  task: (context: UpdateItemDetailsTransactionContext) => Promise<T>,
) => Promise<T>;

export interface UpdateItemDetailsDependencies {
  now(): IsoTimestamp;
  createPlaceId?(): EntityId;
  runInTransaction: RunUpdateItemDetailsTransaction;
}

export async function updateItemDetails(
  input: UpdateItemDetailsInput,
  dependencies: UpdateItemDetailsDependencies,
): Promise<CommandResult<Item>> {
  const title = input.title?.trim();

  if (title !== undefined && !title) {
    throw new RangeError('Item title must not be empty');
  }

  if (input.type !== undefined) {
    assertItemType(input.type);
  }

  const result = await dependencies.runInTransaction(async (repositories) => {
    let current = await repositories.items.getById(input.itemId);

    if (!current) {
      throw new RangeError(`Item not found: ${input.itemId}`);
    }
    let changedPlaceId: EntityId | null = null;
    if (input.placeTarget !== undefined) {
      const { places, trips } = repositories;
      if (!places || !trips || !dependencies.createPlaceId) throw new RangeError('当前构建无法保存地点更改');
      const changed = await changeItemPlace({ itemId: input.itemId, target: input.placeTarget }, {
        now: dependencies.now, createPlaceId: dependencies.createPlaceId,
        // Join the existing exclusive transaction; never open a nested one.
        runInTransaction: task => task({ items: repositories.items, places, trips }),
      });
      current = changed.data.item;
      changedPlaceId = changed.data.place?.id ?? null;
    }

    const type = input.type ?? current.type;
    const typeChanged = type !== current.type;
    let payloadInput: ItemPayload | null;
    if (input.payload !== undefined) {
      payloadInput = input.payload;
    } else if (typeChanged) {
      payloadInput = null;
    } else {
      payloadInput = current.payload;
    }
    const payload = normalizeItemPayload(type, payloadInput);
    const updated: Item = {
      ...current,
      title: title ?? current.title,
      type,
      timeMode: input.timeMode ?? current.timeMode,
      startDateTime:
        input.startDateTime === undefined
          ? current.startDateTime
          : input.startDateTime,
      endDateTime:
        input.endDateTime === undefined
          ? current.endDateTime
          : input.endDateTime,
      period: input.period === undefined ? current.period : input.period,
      isFixed: input.isFixed ?? current.isFixed,
      note: input.note === undefined ? current.note : input.note,
      payload,
      updatedAt: dependencies.now(),
    };

    assertItemTimeFields(updated);

    await repositories.items.update(updated);
    const timeChanged = updated.timeMode !== current.timeMode
      || updated.startDateTime !== current.startDateTime
      || updated.endDateTime !== current.endDateTime
      || updated.period !== current.period;
    if (!timeChanged) {
      return { item: updated, affectedEntityIds: [updated.id, ...(changedPlaceId ? [changedPlaceId] : [])] };
    }

    const collection = updated.dayId === null
      ? await repositories.items.listUnscheduledByTripId(updated.tripId)
      : await repositories.items.listByDayId(updated.dayId);
    const ordered = orderItemsByTravelTime(
      collection.map((candidate) => candidate.id === updated.id ? updated : candidate),
    );
    const reindexed = reindexChangedItems(ordered, dependencies.now());
    const updatedItems = reindexed.filter((candidate) => candidate.id !== updated.id);
    if (updatedItems.length > 0) await repositories.items.updateMany(updatedItems);
    const sortedUpdated = reindexed.find((candidate) => candidate.id === updated.id) ?? updated;
    if (sortedUpdated.sortOrder !== updated.sortOrder) {
      await repositories.items.update(sortedUpdated);
    }
    return {
      item: sortedUpdated,
      affectedEntityIds: [...new Set([updated.id, ...(changedPlaceId ? [changedPlaceId] : []), ...updatedItems.map(({ id }) => id)])],
    };
  });

  return {
    data: result.item,
    affectedEntityIds: result.affectedEntityIds,
    validationIssues: [],
  };
}
