import { assertCoordinateSystem } from '@/domain/common/coordinate';
import type { EntityId } from '@/domain/common/types';
import type { Place } from '@/domain/place/types';
import type { DatabaseRuntime } from './runtime';
import { SqliteApplePlaceBindingRepository } from './sqlite/apple-place-binding-repository';
import { SqlitePlaceRepository } from './sqlite/place-repository';

export interface ApplePlaceBindingSource {
  getBindings(sourcePlaceIds: readonly EntityId[]): Promise<Record<string, Place>>;
}

export function createApplePlaceBindingSource(
  runInReadContext: DatabaseRuntime['runInReadContext'],
): ApplePlaceBindingSource {
  return {
    async getBindings(sourcePlaceIds) {
      const distinctSourceIds = [...new Set(sourcePlaceIds)];
      if (distinctSourceIds.length === 0) return {};

      return runInReadContext(async (database) => {
        const bindings = await new SqliteApplePlaceBindingRepository(database)
          .listBySourceIds(distinctSourceIds);
        if (bindings.length === 0) return {};

        const bindingBySource = new Map<string, (typeof bindings)[number]>();
        for (const binding of bindings) {
          if (!distinctSourceIds.includes(binding.sourcePlaceId)) {
            throw new RangeError('Apple Place binding query returned an unexpected source');
          }
          if (bindingBySource.has(binding.sourcePlaceId)) {
            throw new RangeError(`Duplicate Apple Place binding: ${binding.sourcePlaceId}`);
          }
          bindingBySource.set(binding.sourcePlaceId, binding);
        }

        const placesRepository = new SqlitePlaceRepository(database);
        const sourcePlaces = await placesRepository.listByIds(
          bindings.map(({ sourcePlaceId }) => sourcePlaceId),
        );
        if (sourcePlaces.length !== bindingBySource.size) {
          throw new RangeError('Apple Place binding source Place is missing');
        }

        const applePlaces = await placesRepository.listByIds(
          bindings.map(({ applePlaceId }) => applePlaceId),
        );
        const applePlaceById = new Map(applePlaces.map((place) => [place.id, place]));
        const result: [string, Place][] = [];
        for (const binding of bindings) {
          const place = applePlaceById.get(binding.applePlaceId);
          if (!place) {
            throw new RangeError(
              `Apple Place binding target not found: ${binding.applePlaceId}`,
            );
          }
          if (
            place.provider !== 'apple' ||
            typeof place.name !== 'string' ||
            !place.name.trim() ||
            place.coordinate.system !== 'wgs84'
          ) {
            throw new RangeError(
              `Invalid Apple Place binding target: ${binding.applePlaceId}`,
            );
          }
          if (
            (place.address !== null && typeof place.address !== 'string') ||
            (place.providerPlaceId !== null && typeof place.providerPlaceId !== 'string') ||
            (place.metadata !== null && (
              typeof place.metadata !== 'object' || Array.isArray(place.metadata)
            )) ||
            typeof place.createdAt !== 'string' ||
            typeof place.updatedAt !== 'string'
          ) {
            throw new RangeError(
              `Invalid Apple Place binding target: ${binding.applePlaceId}`,
            );
          }
          assertCoordinateSystem(place.coordinate, 'wgs84');
          result.push([binding.sourcePlaceId, place]);
        }

        return Object.fromEntries(result);
      });
    },
  };
}
