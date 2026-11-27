import type { Place } from '@/domain/place/types';
import type { PlaceSearchQuery } from '@/infrastructure/place/place-provider';

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textHint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /^[\d\s.,，+-]+$/u.test(trimmed)) return null;
  if (/^[{[]/u.test(trimmed) || isCoordinateText(trimmed)) return null;
  return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : null;
}

function isCoordinateText(value: string): boolean {
  if (/\b(?:latitude|longitude|lat|lon|coordinates?|gps|wgs-?84|gcj-?02)\b/iu.test(value)) {
    return true;
  }
  return /^(?:[-+]?\d{1,3}(?:\.\d+)?\s*°?\s*[NSEW]?\s*[,，;\s]\s*)[-+]?\d{1,3}(?:\.\d+)?\s*°?\s*[NSEW]?$/iu.test(value);
}

function cityFromAdministrativeText(value: string): string | null {
  const specialRegion = value.match(/香港|澳门/u)?.[0];
  if (specialRegion) return specialRegion;
  const provinceIndex = value.lastIndexOf('省');
  const autonomousRegionIndex = value.lastIndexOf('自治区');
  const provinceEnd = Math.max(
    provinceIndex < 0 ? -1 : provinceIndex + 1,
    autonomousRegionIndex < 0 ? -1 : autonomousRegionIndex + '自治区'.length,
  );
  const cityText = provinceEnd >= 0 ? value.slice(provinceEnd) : value;
  const cities = [...cityText.matchAll(/[\p{Script=Han}]{2,12}市/gu)];
  return cities.at(-1)?.[0] ?? null;
}

function regionCityHint(metadata: unknown): string | undefined {
  if (!isMetadataRecord(metadata)) return undefined;

  const city = textHint(metadata.city);
  if (city) return city;

  // District metadata often contains a full administrative label such as
  // "示例省示例市示例区". It is a text search hint, not a claimed boundary.
  const district = textHint(metadata.district);
  if (district) return district;

  const province = textHint(metadata.province);
  if (province) return cityFromAdministrativeText(province) ?? undefined;
  return undefined;
}

/** Build an Apple lookup from stored text metadata without using old coordinates. */
export function buildLegacyAppleQuery(place: Place): PlaceSearchQuery {
  const city = regionCityHint(place.metadata);
  return {
    keyword: place.name,
    limit: 20,
    ...(city ? { region: { city } } : {}),
  };
}

function normalizeForComparison(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

/** Text alternatives for a user-initiated second search; never bind a result automatically. */
export function legacyAppleSearchSuggestions(place: Place): string[] {
  const address = textHint(place.address);
  if (!address) return [];

  const city = regionCityHint(place.metadata);
  const suggestion = city ? `${city} ${address}` : address;
  if (normalizeForComparison(suggestion) === normalizeForComparison(place.name)) return [];
  return [suggestion];
}
