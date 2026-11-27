import { requireNativeModule } from 'expo';
import type { Coordinate } from '@/domain/common/types';
import { assertCoordinateSystem } from '@/domain/common/coordinate';

interface NativeAmapSearchModule {
  setPrivacyStatusAsync(
    shown: boolean,
    includesAmap: boolean,
    agreed: boolean,
  ): Promise<boolean>;
  isConfigured(): boolean;
  searchAsync(query: NativeAmapSearchQuery): Promise<NativeAmapSearchPage>;
  inputTipsAsync(query: NativeAmapSearchQuery): Promise<NativeAmapSearchResult[]>;
  reverseGeocodeAsync(
    query: NativeAmapReGeocodeQuery,
  ): Promise<NativeAmapReGeocodeResult | null>;
  convertCoordinatesToWgs84Async(
    coordinates: NativeAmapCoordinate[],
  ): Promise<NativeAmapCoordinate[]>;
}

interface NativeAmapCoordinate {
  latitude: number;
  longitude: number;
}

export interface NativeAmapSearchQuery {
  keyword: string;
  city?: string;
  center?: { latitude: number; longitude: number };
  limit: number;
  page?: number;
}

export interface NativeAmapSearchPage {
  results: NativeAmapSearchResult[];
  count: number;
  suggestions: string[];
}

export interface NativeAmapSearchResult {
  uid?: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  province?: string;
  city?: string;
  district?: string;
  type?: string;
  typeCode?: string;
}

export interface NativeAmapReGeocodeQuery {
  latitude: number;
  longitude: number;
  radius: number;
}

/** Address resolution for a coordinate; `null` means AMap had no match. */
export interface NativeAmapReGeocodeResult {
  formattedAddress?: string;
  province?: string;
  city?: string;
  district?: string;
  township?: string;
  neighborhood?: string;
  building?: string;
  adcode?: string;
  poiName?: string;
  poiUid?: string;
  poiType?: string;
}

function nativeModule(): NativeAmapSearchModule {
  return requireNativeModule<NativeAmapSearchModule>('ExpoAmapSearch');
}

/** Must reflect the user's actual consent before any AMap search request. */
export function setAmapSearchPrivacyStatus(input: {
  shown: boolean;
  includesAmap: boolean;
  agreed: boolean;
}): Promise<boolean> {
  return nativeModule().setPrivacyStatusAsync(
    input.shown,
    input.includesAmap,
    input.agreed,
  );
}

export function isAmapSearchConfigured(): boolean {
  return nativeModule().isConfigured();
}

export function searchAmapPlaces(
  query: NativeAmapSearchQuery,
): Promise<NativeAmapSearchPage> {
  return nativeModule().searchAsync(query);
}

export function getAmapInputTips(
  query: NativeAmapSearchQuery,
): Promise<NativeAmapSearchResult[]> {
  return nativeModule().inputTipsAsync(query);
}

export function reverseGeocodeAmapCoordinate(
  query: NativeAmapReGeocodeQuery,
): Promise<NativeAmapReGeocodeResult | null> {
  return nativeModule().reverseGeocodeAsync(query);
}

/**
 * Returns temporary GPS/WGS84 display coordinates for saved GCJ-02 Places.
 * The caller keeps the source coordinates unchanged for persistence and labels.
 */
export async function convertAmapCoordinatesToWgs84(
  coordinates: readonly Coordinate[],
): Promise<Coordinate[]> {
  const input = coordinates.map((coordinate, index) => {
    try {
      assertCoordinateSystem(coordinate, 'gcj02');
    } catch {
      throw new RangeError(
        `Coordinate ${index} must be a finite, valid GCJ-02 coordinate.`,
      );
    }
    return { latitude: coordinate.latitude, longitude: coordinate.longitude };
  });
  if (input.length === 0) return [];

  const converted = await nativeModule().convertCoordinatesToWgs84Async(input);
  if (!Array.isArray(converted) || converted.length !== coordinates.length) {
    throw new Error('AMap coordinate conversion returned a mismatched result count.');
  }

  return converted.map((coordinate, index) => {
    if (
      !coordinate
      || !Number.isFinite(coordinate.latitude)
      || coordinate.latitude < -90
      || coordinate.latitude > 90
      || !Number.isFinite(coordinate.longitude)
      || coordinate.longitude < -180
      || coordinate.longitude > 180
    ) {
      throw new Error(`AMap returned an invalid display coordinate at index ${index}.`);
    }
    return {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      system: 'wgs84',
    };
  });
}
