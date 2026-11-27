import type { Coordinate, CoordinateSystem } from './types';

/** Validate untrusted coordinates before crossing a domain/provider boundary. */
export function assertCoordinate(value: unknown): asserts value is Coordinate {
  if (typeof value !== 'object' || value === null) {
    throw new RangeError('Invalid Coordinate');
  }

  const coordinate = value as Record<string, unknown>;
  if (
    typeof coordinate.latitude !== 'number' ||
    !Number.isFinite(coordinate.latitude) ||
    coordinate.latitude < -90 ||
    coordinate.latitude > 90 ||
    typeof coordinate.longitude !== 'number' ||
    !Number.isFinite(coordinate.longitude) ||
    coordinate.longitude < -180 ||
    coordinate.longitude > 180 ||
    (coordinate.system !== 'wgs84' && coordinate.system !== 'gcj02')
  ) {
    throw new RangeError('Invalid Coordinate');
  }
}

/** Fail closed at a renderer/provider boundary rather than silently changing CRS. */
export function assertCoordinateSystem(
  coordinate: Coordinate,
  expected: CoordinateSystem,
): void {
  assertCoordinate(coordinate);
  if (coordinate.system !== expected) {
    throw new RangeError(
      `Coordinate system ${coordinate.system} does not match ${expected}`,
    );
  }
}
