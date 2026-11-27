import { requireNativeModule } from 'expo';

interface NativeApplePlacesModule {
  initializeAsync(): Promise<boolean>;
  searchAsync(query: NativeApplePlacesSearchQuery): Promise<NativeApplePlacesPage>;
  reverseGeocodeAsync(
    query: NativeAppleReverseGeocodeQuery,
  ): Promise<NativeAppleReverseGeocodeResult | null>;
}

export interface NativeApplePlacesSearchQuery {
  keyword: string;
  center?: { latitude: number; longitude: number };
  limit: number;
  cursor?: string;
}

export interface NativeApplePlaceResult {
  providerPlaceId: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  regionLabel: string | null;
  types?: string[];
  countryCode?: string;
}

export interface NativeApplePlacesPage {
  results: NativeApplePlaceResult[];
  nextCursor: null;
  suggestions: string[];
}

export interface NativeAppleReverseGeocodeQuery {
  latitude: number;
  longitude: number;
}

export interface NativeAppleReverseGeocodeResult {
  providerPlaceId: string | null;
  name: string | null;
  formattedAddress: string | null;
  regionLabel: string | null;
  countryCode?: string;
}

function nativeModule(): NativeApplePlacesModule {
  return requireNativeModule<NativeApplePlacesModule>('ExpoApplePlaces');
}

export function initializeApplePlaces(): Promise<boolean> {
  return nativeModule().initializeAsync();
}

export function searchApplePlaces(
  query: NativeApplePlacesSearchQuery,
): Promise<NativeApplePlacesPage> {
  return nativeModule().searchAsync(query);
}

export function reverseGeocodeAppleCoordinate(
  query: NativeAppleReverseGeocodeQuery,
): Promise<NativeAppleReverseGeocodeResult | null> {
  return nativeModule().reverseGeocodeAsync(query);
}
