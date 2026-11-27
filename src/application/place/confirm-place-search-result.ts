import type { EntityId, IsoTimestamp } from '@/domain/common/types';
import type { ItemDraft } from '@/application/item/item-draft';
import type { ItemType } from '@/domain/item/types';
import type { AddItemTransactionContext } from '@/application/item/add-item';
import { addItemWithinTransaction } from '@/application/item/add-item';
import type { CommandResult } from '@/application/command-result';
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';
import type { PlaceRepository } from '@/repositories/place-repository';
import {
  assertPlaceMatchesTripRegion,
  insertPlaceSnapshot,
  type ConfirmedPlaceItem,
} from './place-snapshot';

export type { ConfirmedPlaceItem } from './place-snapshot';

export interface ConfirmPlaceSearchResultInput {
  tripId: EntityId;
  dayId: EntityId | null;
  result: PlaceSearchResult;
  draft?: ItemDraft;
  /** Legacy callers can still specify a type while migrating to drafts. */
  itemType?: ItemType;
}

export interface ConfirmPlaceSearchResultTransactionContext
  extends AddItemTransactionContext {
  places: Pick<PlaceRepository, 'insert' | 'getById'>;
}

export type RunConfirmPlaceSearchResultTransaction = <T>(
  task: (context: ConfirmPlaceSearchResultTransactionContext) => Promise<T>,
) => Promise<T>;

export interface ConfirmPlaceSearchResultDependencies {
  createPlaceId(): EntityId;
  createItemId(): EntityId;
  now(): IsoTimestamp;
  runInTransaction: RunConfirmPlaceSearchResultTransaction;
}

export type ConfirmPlaceSearchResultCommand = (
  input: ConfirmPlaceSearchResultInput,
) => Promise<CommandResult<ConfirmedPlaceItem>>;

export async function confirmPlaceSearchResult(
  input: ConfirmPlaceSearchResultInput,
  dependencies: ConfirmPlaceSearchResultDependencies,
): Promise<CommandResult<ConfirmedPlaceItem>> {
  const name = input.result.name.trim();
  if (!name) throw new RangeError('Place name must not be empty');

  const placeId = dependencies.createPlaceId();
  const timestamp = dependencies.now();
  const confirmed = await dependencies.runInTransaction(async (repositories) => {
    const trip = await repositories.trips.getById(input.tripId);
    if (!trip) throw new RangeError(`Trip not found: ${input.tripId}`);

    assertPlaceMatchesTripRegion(
      { provider: input.result.provider, coordinate: input.result.coordinate },
      trip.mapRegion,
    );

    const place = await insertPlaceSnapshot(
      {
        placeId,
        snapshot: {
          name,
          coordinate: input.result.coordinate,
          address: input.result.address?.trim() || null,
          provider: input.result.provider,
          providerPlaceId: input.result.providerPlaceId?.trim() || null,
          metadata: input.result.metadata,
        },
        timestamp,
      },
      repositories.places,
    );

    const addedItem = await addItemWithinTransaction(
      {
        tripId: input.tripId,
        dayId: input.dayId,
        placeId,
        ...(input.draft ?? {
          title: name,
          type: input.itemType ?? 'custom',
          timeMode: 'none' as const,
          startDateTime: null,
          endDateTime: null,
          period: null,
          note: null,
        }),
      },
      { createId: dependencies.createItemId, now: () => timestamp },
      repositories,
    );
    return { place, item: addedItem.item, affectedItemIds: addedItem.affectedEntityIds };
  });

  return {
    data: confirmed,
    affectedEntityIds: [confirmed.place.id, ...confirmed.affectedItemIds],
    validationIssues: [],
  };
}
