import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate, EntityId, IsoTimestamp } from '@/domain/common/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { PlaceProviderId, ReverseGeocodeResult, PlaceSearchResult } from '@/infrastructure/place/place-provider';
import type { ItemRepository } from '@/repositories/item-repository';
import type { PlaceRepository } from '@/repositories/place-repository';
import type { TripRepository } from '@/repositories/trip-repository';
import type { CommandResult } from '../command-result';
import {
  assertEnrichmentMatchesPick,
  assertPlaceMatchesTripRegion,
  expectedSnapshotPolicy,
  insertPlaceSnapshot,
  resolveCoordinatePlaceName,
} from '../place/place-snapshot';

/**
 * Where the new Place association comes from. `none` clears it, which is how an
 * Item becomes Place-less again without being deleted.
 */
export type ChangeItemPlaceTarget =
  | { kind: 'search'; result: PlaceSearchResult }
  | {
      kind: 'map-picker';
      coordinate: Coordinate;
      provider?: PlaceProviderId;
      enrichment?: ReverseGeocodeResult | null;
    }
  | { kind: 'none' };

export interface ChangeItemPlaceInput {
  itemId: EntityId;
  target: ChangeItemPlaceTarget;
}

/** `place` is null only for `kind: 'none'`, which inserts no Place row. */
export interface ChangedItemPlace {
  item: Item;
  place: Place | null;
}

export type ChangeItemPlaceCommand = (
  input: ChangeItemPlaceInput,
) => Promise<CommandResult<ChangedItemPlace>>;

export interface ChangeItemPlaceTransactionContext {
  items: Pick<ItemRepository, 'getById' | 'update'>;
  places: Pick<PlaceRepository, 'insert'>;
  trips: Pick<TripRepository, 'getById'>;
}

export type RunChangeItemPlaceTransaction = <T>(
  task: (context: ChangeItemPlaceTransactionContext) => Promise<T>,
) => Promise<T>;

export interface ChangeItemPlaceDependencies {
  createPlaceId(): EntityId;
  now(): IsoTimestamp;
  runInTransaction: RunChangeItemPlaceTransaction;
}

/**
 * Repoints one Item at a different Place snapshot, or at none.
 *
 * Stage 05 §8.2 allows `updateItemDetails` to change the Place association
 * "through an explicit supported edit flow". This is that flow: it is separate
 * from field editing because attaching a Place inserts an immutable snapshot and
 * must be validated against the Trip's provider and CRS, which is a different
 * concern from patching Item fields.
 *
 * Only `placeId` and `updatedAt` change. Title, type, time fields, note, payload,
 * `dayId`, `tripId` and `sortOrder` are deliberately left alone, and no time
 * reorder runs: moving an Item to another Place must not move it in the Timeline.
 */
export async function changeItemPlace(
  input: ChangeItemPlaceInput,
  dependencies: ChangeItemPlaceDependencies,
): Promise<CommandResult<ChangedItemPlace>> {
  const timestamp = dependencies.now();

  const result = await dependencies.runInTransaction(async (repositories) => {
    const current = await repositories.items.getById(input.itemId);
    if (!current) {
      throw new RangeError(`Item not found: ${input.itemId}`);
    }

    /*
     * Verify ownership through the Item's own Trip. Each new snapshot is then
     * validated against the one provider/CRS scope selected for its Trip.
     */
    const trip = await repositories.trips.getById(current.tripId);
    if (!trip) {
      throw new RangeError(`Trip not found: ${current.tripId}`);
    }

    let place: Place | null = null;
    let placeId: EntityId | null = null;

    if (input.target.kind === 'search') {
      const name = input.target.result.name.trim();
      if (!name) throw new RangeError('Place name must not be empty');

      assertPlaceMatchesTripRegion(
        {
          provider: input.target.result.provider,
          coordinate: input.target.result.coordinate,
        },
        trip.mapRegion,
      );

      place = await insertPlaceSnapshot(
        {
          placeId: dependencies.createPlaceId(),
          snapshot: {
            name,
            coordinate: input.target.result.coordinate,
            address: input.target.result.address?.trim() || null,
            provider: input.target.result.provider,
            providerPlaceId: input.target.result.providerPlaceId?.trim() || null,
            metadata: input.target.result.metadata,
          },
          timestamp,
        },
        repositories.places,
      );
      placeId = place.id;
    } else if (input.target.kind === 'map-picker') {
      const enrichment = input.target.enrichment ?? null;
      const requestedProvider = input.target.provider ?? expectedSnapshotPolicy(trip.mapRegion).provider;
      const policy = assertPlaceMatchesTripRegion(
        { provider: requestedProvider, coordinate: input.target.coordinate },
        trip.mapRegion,
      );
      assertCoordinateSystem(input.target.coordinate, policy.coordinateSystem);
      if (enrichment !== null) {
        assertEnrichmentMatchesPick(enrichment, input.target.coordinate, policy);
      }

      const name = resolveCoordinatePlaceName(enrichment, input.target.coordinate);
      place = await insertPlaceSnapshot(
        {
          placeId: dependencies.createPlaceId(),
          snapshot: {
            name,
            coordinate: input.target.coordinate,
            address: enrichment?.address?.trim() || null,
            provider: policy.provider,
            providerPlaceId: enrichment?.providerPlaceId?.trim() || null,
            metadata: enrichment?.metadata ?? null,
          },
          timestamp,
        },
        repositories.places,
      );
      placeId = place.id;
    }

    const updated: Item = { ...current, placeId, updatedAt: timestamp };
    await repositories.items.update(updated);

    return { item: updated, place };
  });

  return {
    data: result,
    affectedEntityIds: [
      result.item.id,
      ...(result.place === null ? [] : [result.place.id]),
    ],
    validationIssues: [],
  };
}
