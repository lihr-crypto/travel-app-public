import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate, EntityId, IsoTimestamp } from '@/domain/common/types';
import type { ItemDraft } from '@/application/item/item-draft';
import type { ItemType } from '@/domain/item/types';
import type { AddItemTransactionContext } from '@/application/item/add-item';
import { addItemWithinTransaction } from '@/application/item/add-item';
import type { CommandResult } from '@/application/command-result';
import type { PlaceProviderId, ReverseGeocodeResult } from '@/infrastructure/place/place-provider';
import type { PlaceRepository } from '@/repositories/place-repository';
import {
  assertPlaceMatchesTripRegion,
  assertEnrichmentMatchesPick,
  expectedSnapshotPolicy,
  insertPlaceSnapshot,
  resolveCoordinatePlaceName,
  type ConfirmedPlaceItem,
} from './place-snapshot';

export interface ConfirmMapPickerPlaceInput {
  tripId: EntityId;
  dayId: EntityId | null;
  /** Provider-native coordinate taken from the fixed crosshair. */
  coordinate: Coordinate;
  provider?: PlaceProviderId;
  /**
   * Optional M7-T9 enrichment for that same coordinate. Absent or `null` means
   * the provider had no answer, which must not stop the coordinate-only save.
   */
  enrichment?: ReverseGeocodeResult | null;
  draft?: ItemDraft;
  /** Legacy callers can still specify a type while migrating to drafts. */
  itemType?: ItemType;
}

export interface ConfirmMapPickerPlaceTransactionContext
  extends AddItemTransactionContext {
  places: Pick<PlaceRepository, 'insert' | 'getById'>;
}

export type RunConfirmMapPickerPlaceTransaction = <T>(
  task: (context: ConfirmMapPickerPlaceTransactionContext) => Promise<T>,
) => Promise<T>;

export interface ConfirmMapPickerPlaceDependencies {
  createPlaceId(): EntityId;
  createItemId(): EntityId;
  now(): IsoTimestamp;
  runInTransaction: RunConfirmMapPickerPlaceTransaction;
}

export type ConfirmMapPickerPlaceCommand = (
  input: ConfirmMapPickerPlaceInput,
) => Promise<CommandResult<ConfirmedPlaceItem>>;

/** Re-exported so existing callers and tests keep one import path. */
export { resolveCoordinatePlaceName } from './place-snapshot';

export async function confirmMapPickerPlace(
  input: ConfirmMapPickerPlaceInput,
  dependencies: ConfirmMapPickerPlaceDependencies,
): Promise<CommandResult<ConfirmedPlaceItem>> {
  const enrichment = input.enrichment ?? null;
  const placeId = dependencies.createPlaceId();
  const timestamp = dependencies.now();

  const confirmed = await dependencies.runInTransaction(async (repositories) => {
    const trip = await repositories.trips.getById(input.tripId);
    if (!trip) throw new RangeError(`Trip not found: ${input.tripId}`);

    const requestedProvider = input.provider ?? expectedSnapshotPolicy(trip.mapRegion).provider;
    const policy = assertPlaceMatchesTripRegion(
      { provider: requestedProvider, coordinate: input.coordinate },
      trip.mapRegion,
    );
    assertCoordinateSystem(input.coordinate, policy.coordinateSystem);
    if (enrichment !== null) {
      assertEnrichmentMatchesPick(enrichment, input.coordinate, policy);
    }

    const name = resolveCoordinatePlaceName(enrichment, input.coordinate);
    const place = await insertPlaceSnapshot(
      {
        placeId,
        snapshot: {
          name,
          coordinate: input.coordinate,
          address: enrichment?.address?.trim() || null,
          provider: policy.provider,
          providerPlaceId: enrichment?.providerPlaceId?.trim() || null,
          metadata: enrichment?.metadata ?? null,
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
