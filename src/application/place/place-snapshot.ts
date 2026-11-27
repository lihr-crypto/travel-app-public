import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type {
  Coordinate,
  CoordinateSystem,
  EntityId,
  IsoTimestamp,
} from '@/domain/common/types';
import type { TripMapRegion } from '@/domain/trip/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import type { PlaceProviderId, ReverseGeocodeResult } from '@/infrastructure/place/place-provider';
import type { PlaceRepository } from '@/repositories/place-repository';

export interface ConfirmedPlaceItem {
  place: Place;
  item: Item;
}

export interface PlaceSnapshotPolicy {
  provider: PlaceProviderId;
  coordinateSystem: CoordinateSystem;
}

/** Legacy default-map hint; saved Places always retain their own source. */
export function expectedSnapshotPolicy(
  mapRegion: 'china_mainland' | 'global',
): PlaceSnapshotPolicy {
  return mapRegion === 'china_mainland'
    ? { provider: 'amap', coordinateSystem: 'gcj02' }
    : { provider: 'google', coordinateSystem: 'wgs84' };
}

export interface PlaceSnapshot {
  name: string;
  coordinate: Coordinate;
  address: string | null;
  provider: PlaceProviderId;
  providerPlaceId: string | null;
  metadata: Record<string, unknown> | null;
}

/** Validate each source's native coordinates; one Trip may contain both sources. */
export function assertProviderSnapshot(
  snapshot: Pick<PlaceSnapshot, 'provider' | 'coordinate'>,
): PlaceSnapshotPolicy {
  if (snapshot.provider !== 'amap' && snapshot.provider !== 'google' && snapshot.provider !== 'apple') {
    throw new RangeError('Unknown Place provider');
  }
  const policy: PlaceSnapshotPolicy = snapshot.provider === 'apple'
    ? { provider: 'apple', coordinateSystem: 'wgs84' }
    : expectedSnapshotPolicy(snapshot.provider === 'amap' ? 'china_mainland' : 'global');
  assertCoordinateSystem(snapshot.coordinate, policy.coordinateSystem);
  return policy;
}

/** New Place writes must use the single map source selected for their Trip. */
export function assertPlaceMatchesTripRegion(
  snapshot: { provider: string | null; coordinate: Coordinate },
  mapRegion: TripMapRegion,
): PlaceSnapshotPolicy {
  const provider = snapshot.provider;
  if (provider !== 'amap' && provider !== 'google' && provider !== 'apple') {
    throw new RangeError('Unknown Place provider');
  }

  // Keep source-native CRS validation independent from the Trip policy.
  assertProviderSnapshot({ provider, coordinate: snapshot.coordinate });
  const policy = expectedSnapshotPolicy(mapRegion);
  if (provider !== policy.provider) {
    throw new RangeError(
      `Place provider ${provider} does not match Trip map region ${mapRegion}`,
    );
  }
  assertCoordinateSystem(snapshot.coordinate, policy.coordinateSystem);
  return policy;
}

/**
 * A stale or foreign enrichment must never be attached to a different pick.
 *
 * Shared by every command that turns a picked coordinate into a Place snapshot,
 * so the coordinate-only path cannot drift from the provider-enriched one.
 */
export function assertEnrichmentMatchesPick(
  enrichment: ReverseGeocodeResult,
  coordinate: Coordinate,
  policy: PlaceSnapshotPolicy,
): void {
  if (enrichment.provider !== policy.provider) {
    throw new RangeError(
      'Place enrichment provider must match the picked map',
    );
  }
  assertCoordinateSystem(enrichment.coordinate, policy.coordinateSystem);
  if (
    enrichment.coordinate.latitude !== coordinate.latitude
    || enrichment.coordinate.longitude !== coordinate.longitude
  ) {
    throw new RangeError('Place enrichment must describe the picked coordinate');
  }
}

/**
 * A picked coordinate has no provider place identity, while `places.name` is
 * NOT NULL. The name falls back from the enrichment name to its address and
 * finally to a deterministic coordinate label, which never pretends to be a
 * real place name. The Map Picker shows the same value it will save.
 */
export function resolveCoordinatePlaceName(
  enrichment: ReverseGeocodeResult | null | undefined,
  coordinate: Coordinate,
): string {
  const name = enrichment?.name?.trim();
  if (name) return name;

  const address = enrichment?.address?.trim();
  if (address) return address;

  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

/**
 * The single Place row shape. Both Place confirmation commands go through it so
 * a provider snapshot and a coordinate-only snapshot cannot drift apart.
 */
export async function insertPlaceSnapshot(
  input: {
    placeId: EntityId;
    snapshot: PlaceSnapshot;
    timestamp: IsoTimestamp;
  },
  places: Pick<PlaceRepository, 'insert'>,
): Promise<Place> {
  const place: Place = {
    id: input.placeId,
    name: input.snapshot.name,
    coordinate: input.snapshot.coordinate,
    address: input.snapshot.address,
    provider: input.snapshot.provider,
    providerPlaceId: input.snapshot.providerPlaceId,
    metadata: input.snapshot.metadata,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
  await places.insert(place);
  return place;
}
