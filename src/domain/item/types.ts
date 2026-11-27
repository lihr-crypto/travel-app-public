import type {
  EntityId,
  IsoTimestamp,
  TravelLocalDateTime,
} from '@/domain/common/types';

export type ItemType =
  | 'sightseeing'
  | 'food'
  | 'hotel'
  | 'activity'
  | 'transport'
  | 'custom';

export type TimeMode = 'none' | 'period' | 'exact';

export type DayPeriod = 'morning' | 'noon' | 'afternoon' | 'night';

export interface HotelPayload {
  kind: 'hotel';
}

/** Stage-02 §11.4 planned-movement events: flight, train, long-distance bus,
 * ferry, and car pickup/return. */
export type TransportMode =
  | 'flight'
  | 'train'
  | 'bus'
  | 'ferry'
  | 'car';

export interface TransportPayload {
  kind: 'transport';
  mode?: TransportMode;
  serviceNumber?: string;
  origin?: string;
  destination?: string;
}

export interface CustomPayload {
  kind: 'custom';
  label: string;
}

export type ItemPayload = HotelPayload | TransportPayload | CustomPayload;

export interface Item {
  id: EntityId;
  tripId: EntityId;
  dayId: EntityId | null;
  placeId: EntityId | null;
  type: ItemType;
  title: string;
  sortOrder: number;
  timeMode: TimeMode;
  startDateTime: TravelLocalDateTime | null;
  endDateTime: TravelLocalDateTime | null;
  period: DayPeriod | null;
  isFixed: boolean;
  note: string | null;
  payload: ItemPayload | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
