import type {
  EntityId,
  IsoTimestamp,
  TravelDate,
} from '@/domain/common/types';

export type TripMapRegion = 'china_mainland' | 'global';

export interface Trip {
  id: EntityId;
  title: string;
  startDate: TravelDate;
  endDate: TravelDate;
  mapRegion: TripMapRegion;
  note: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type TripLifecycle = 'planned' | 'active' | 'completed';

export interface Day {
  id: EntityId;
  tripId: EntityId;
  date: TravelDate;
  dayIndex: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
