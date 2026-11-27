import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { Coordinate, EntityId, IsoTimestamp } from '@/domain/common/types';
import type { CommandResult } from '@/application/command-result';
import type { Place } from '@/domain/place/types';
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';
import type { ApplePlaceBindingRepository } from '@/repositories/apple-place-binding-repository';
import type { PlaceRepository } from '@/repositories/place-repository';

type ApplePlaceBindingContext = {
  places: Pick<PlaceRepository, 'getById' | 'insert'>;
  bindings: Pick<
    ApplePlaceBindingRepository,
    'getBySourceId' | 'upsert' | 'listBySourceIds'
  >;
};

export type RunBindApplePlaceTransaction = <T>(
  task: (context: ApplePlaceBindingContext) => Promise<T>,
) => Promise<T>;

export interface BindApplePlaceInput {
  sourcePlaceId: EntityId;
  result: PlaceSearchResult;
}

export interface BindApplePlaceDependencies {
  createPlaceId(): EntityId;
  now(): IsoTimestamp;
  runInTransaction: RunBindApplePlaceTransaction;
}

export type BindApplePlaceCommand = (
  input: BindApplePlaceInput,
) => Promise<CommandResult<Place>>;

interface AppleSnapshotFields {
  name: string;
  coordinate: Coordinate;
  address: string | null;
  providerPlaceId: string | null;
  metadata: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAppleSnapshot(result: PlaceSearchResult): AppleSnapshotFields {
  if (!isRecord(result)) {
    throw new RangeError('Invalid Apple Place result');
  }
  const candidate = result as unknown as Record<string, unknown>;
  if (candidate.provider !== 'apple') {
    throw new RangeError('Apple Place result provider must be apple');
  }
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    throw new RangeError('Apple Place name must not be empty');
  }
  if (candidate.address !== null && typeof candidate.address !== 'string') {
    throw new RangeError('Invalid Apple Place address');
  }
  if (
    candidate.providerPlaceId !== null &&
    typeof candidate.providerPlaceId !== 'string'
  ) {
    throw new RangeError('Invalid Apple Place provider id');
  }
  if (candidate.regionLabel !== null && typeof candidate.regionLabel !== 'string') {
    throw new RangeError('Invalid Apple Place region label');
  }

  assertCoordinateSystem(candidate.coordinate as Coordinate, 'wgs84');
  const coordinate = candidate.coordinate as Coordinate;

  let metadata: Record<string, unknown> | null = null;
  if (candidate.metadata !== null) {
    if (!isRecord(candidate.metadata)) {
      throw new RangeError('Invalid Apple Place metadata');
    }
    try {
      const serialized = JSON.stringify(candidate.metadata);
      if (serialized === undefined) throw new Error('Metadata is not JSON data');
      metadata = JSON.parse(serialized) as Record<string, unknown>;
    } catch {
      throw new RangeError('Invalid Apple Place metadata');
    }
  }

  return {
    name: candidate.name.trim(),
    coordinate: {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      system: 'wgs84',
    },
    address: typeof candidate.address === 'string' ? candidate.address.trim() || null : null,
    providerPlaceId:
      typeof candidate.providerPlaceId === 'string'
        ? candidate.providerPlaceId.trim() || null
        : null,
    metadata,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function isSameSnapshot(place: Place, snapshot: AppleSnapshotFields) {
  return (
    place.provider === 'apple' &&
    place.name === snapshot.name &&
    place.coordinate.latitude === snapshot.coordinate.latitude &&
    place.coordinate.longitude === snapshot.coordinate.longitude &&
    place.coordinate.system === 'wgs84' &&
    place.address === snapshot.address &&
    place.providerPlaceId === snapshot.providerPlaceId &&
    canonicalJson(place.metadata) === canonicalJson(snapshot.metadata)
  );
}

function assertStoredApplePlace(place: Place | null, applePlaceId: EntityId): asserts place is Place {
  if (!place) {
    throw new RangeError(`Apple Place binding target not found: ${applePlaceId}`);
  }
  if (
    place.provider !== 'apple' ||
    typeof place.name !== 'string' ||
    !place.name.trim() ||
    place.coordinate.system !== 'wgs84'
  ) {
    throw new RangeError(`Invalid Apple Place binding target: ${applePlaceId}`);
  }
  if (
    (place.address !== null && typeof place.address !== 'string') ||
    (place.providerPlaceId !== null && typeof place.providerPlaceId !== 'string') ||
    (place.metadata !== null && !isRecord(place.metadata)) ||
    typeof place.createdAt !== 'string' ||
    typeof place.updatedAt !== 'string'
  ) {
    throw new RangeError(`Invalid Apple Place binding target: ${applePlaceId}`);
  }
  assertCoordinateSystem(place.coordinate, 'wgs84');
}

export async function bindApplePlace(
  input: BindApplePlaceInput,
  dependencies: BindApplePlaceDependencies,
): Promise<CommandResult<Place>> {
  if (typeof input.sourcePlaceId !== 'string' || !input.sourcePlaceId.trim()) {
    throw new RangeError('Source Place id must not be empty');
  }
  const snapshot = normalizeAppleSnapshot(input.result);

  const applePlace = await dependencies.runInTransaction(async ({ places, bindings }) => {
    const sourcePlace = await places.getById(input.sourcePlaceId);
    if (!sourcePlace) {
      throw new RangeError(`Source Place not found: ${input.sourcePlaceId}`);
    }

    const existingBinding = await bindings.getBySourceId(input.sourcePlaceId);
    if (existingBinding) {
      const existingPlace = await places.getById(existingBinding.applePlaceId);
      assertStoredApplePlace(existingPlace, existingBinding.applePlaceId);
      if (isSameSnapshot(existingPlace, snapshot)) return existingPlace;
    }

    const timestamp = dependencies.now();
    const place: Place = {
      id: dependencies.createPlaceId(),
      name: snapshot.name,
      coordinate: snapshot.coordinate,
      address: snapshot.address,
      provider: 'apple',
      providerPlaceId: snapshot.providerPlaceId,
      metadata: snapshot.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await places.insert(place);
    await bindings.upsert({
      sourcePlaceId: input.sourcePlaceId,
      applePlaceId: place.id,
      createdAt: timestamp,
    });
    return place;
  });

  return {
    data: applePlace,
    affectedEntityIds: [input.sourcePlaceId, applePlace.id],
    validationIssues: [],
  };
}
