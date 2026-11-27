import type { EntityId, IsoTimestamp } from '@/domain/common/types';

export interface ApplePlaceBinding {
  sourcePlaceId: EntityId;
  applePlaceId: EntityId;
  createdAt: IsoTimestamp;
}

/** Maps an existing provider-native Place to its separately saved Apple snapshot. */
export interface ApplePlaceBindingRepository {
  getBySourceId(sourcePlaceId: EntityId): Promise<ApplePlaceBinding | null>;
  upsert(binding: ApplePlaceBinding): Promise<void>;
  listBySourceIds(sourcePlaceIds: readonly EntityId[]): Promise<ApplePlaceBinding[]>;
}
