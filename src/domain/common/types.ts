export type EntityId = string;

/** A calendar date in ISO 8601 format: YYYY-MM-DD. */
export type TravelDate = string;

/** A local date and time without a timezone offset: YYYY-MM-DDTHH:mm. */
export type TravelLocalDateTime = string;

/** A UTC timestamp in ISO 8601 format. */
export type IsoTimestamp = string;

export type CoordinateSystem = 'wgs84' | 'gcj02';

export interface Coordinate {
  latitude: number;
  longitude: number;
  system: CoordinateSystem;
}
