import type { Place } from '@/domain/place/types';
import type { PlaceSearchResult } from '@/infrastructure/place/place-provider';

const APPLE_MATCH_RADIUS_METERS = 2_000;
const EARTH_RADIUS_METERS = 6_371_000;

const GENERIC_NORMALIZED_NAMES = new Set([
  '',
  'place',
  'location',
  'poi',
  'pointofinterest',
  'unknown',
  'unknownplace',
  'unnamed',
  'unnamedplace',
  'default',
  'searchresult',
  'maplocation',
  'terminal',
  'terminal1',
  'terminal2',
  'terminal3',
  'terminal4',
  'terminal5',
  'station',
  'trainstation',
  'railwaystation',
  'busstop',
  'subwaystation',
  'metrostation',
  'parking',
  'parkinglot',
  'arrival',
  'departure',
  '地点',
  '位置',
  '未知',
  '未知地点',
  '未命名',
  '場所',
  '不明',
  '航站楼',
  '候机楼',
  '车站',
  '火车站',
  '地铁站',
  '停车场',
  '公交站',
]);

function isCoordinate(value: unknown, system?: 'wgs84' | 'gcj02'): value is {
  latitude: number;
  longitude: number;
  system: 'wgs84' | 'gcj02';
} {
  if (typeof value !== 'object' || value === null) return false;
  const coordinate = value as Record<string, unknown>;
  return (
    typeof coordinate.latitude === 'number' &&
    Number.isFinite(coordinate.latitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    typeof coordinate.longitude === 'number' &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180 &&
    (system === undefined || coordinate.system === system) &&
    (coordinate.system === 'wgs84' || coordinate.system === 'gcj02')
  );
}

function normalizeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const normalized = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/國/g, '国')
    .replace(/際/g, '际')
    .replace(/[\s\p{P}]+/gu, '')
    .replace(/国际|机场|機場|空港|international|airport/g, '');
  return (
    GENERIC_NORMALIZED_NAMES.has(normalized) || /^[\p{N}]+$/u.test(normalized)
  ) ? null : normalized;
}

function distanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const boundedHaversine = Math.max(0, Math.min(1, haversine));
  return 2 * EARTH_RADIUS_METERS * Math.atan2(
    Math.sqrt(boundedHaversine),
    Math.sqrt(1 - boundedHaversine),
  );
}

/**
 * Find one unambiguous Apple counterpart for a legacy Place. The 2 km radius
 * only gates name-matched candidates around the stored raw coordinate; it does
 * not transform either coordinate or prove geodetic alignment.
 */
export function chooseLegacyAppleMatch(
  source: Place,
  results: readonly PlaceSearchResult[],
): PlaceSearchResult | null {
  if (!source || !isCoordinate(source.coordinate)) return null;
  const sourceName = normalizeName(source.name);
  if (!sourceName) return null;

  const eligible = results.flatMap((candidate) => {
    if (
      !candidate ||
      candidate.provider !== 'apple' ||
      !isCoordinate(candidate.coordinate, 'wgs84')
    ) {
      return [];
    }

    const candidateName = normalizeName(candidate.name);
    if (
      candidateName !== sourceName ||
      distanceMeters(source.coordinate, candidate.coordinate) > APPLE_MATCH_RADIUS_METERS
    ) {
      return [];
    }
    return [{ candidate, candidateName }];
  });

  const parents = eligible.map((_, index) => index);
  function find(index: number): number {
    if (parents[index] !== index) parents[index] = find(parents[index]);
    return parents[index];
  }
  function union(left: number, right: number) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  }

  const providerIdOwners = new Map<string, number>();
  const identityOwners = new Map<string, number>();
  for (const [index, { candidate, candidateName }] of eligible.entries()) {
    const providerId = typeof candidate.providerPlaceId === 'string'
      ? candidate.providerPlaceId.trim()
      : '';
    const coordinateIdentity = [
      candidateName,
      candidate.coordinate.latitude,
      candidate.coordinate.longitude,
    ].join('\u0000');
    const sameProviderId = providerId === '' ? undefined : providerIdOwners.get(providerId);
    const sameIdentity = identityOwners.get(coordinateIdentity);
    if (sameProviderId !== undefined) union(index, sameProviderId);
    if (sameIdentity !== undefined) union(index, sameIdentity);
    if (providerId !== '') providerIdOwners.set(providerId, index);
    identityOwners.set(coordinateIdentity, index);
  }

  const groups = new Set(parents.map((_, index) => find(index)));
  return groups.size === 1 ? eligible[0]?.candidate ?? null : null;
}
