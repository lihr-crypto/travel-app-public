import type {
  Coordinate,
  EntityId,
  IsoTimestamp,
} from '@/domain/common/types';

export interface Place {
  id: EntityId;
  name: string;
  coordinate: Coordinate;
  address: string | null;
  provider: string | null;
  providerPlaceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
