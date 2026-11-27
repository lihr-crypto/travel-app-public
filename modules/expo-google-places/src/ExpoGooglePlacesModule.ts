import { requireNativeModule } from 'expo';

interface NativeGooglePlacesModule {
  initializeAsync(): Promise<boolean>;
  isConfiguredAsync(): Promise<boolean>;
  searchAsync(
    query: NativeGooglePlacesSearchQuery,
  ): Promise<NativeGooglePlacesSearchPage>;
  reverseGeocodeAsync(
    query: NativeGoogleReverseGeocodeQuery,
  ): Promise<NativeGoogleReverseGeocodeResult | null>;
}

export interface NativeGooglePlacesSearchQuery {
  keyword: string;
  city?: string;
  countryCode?: string;
  center?: { latitude: number; longitude: number };
  limit: number;
  cursor?: string;
}

export interface NativeGooglePlacesSearchPage {
  results: NativeGooglePlacesSearchResult[];
  nextCursor: string | null;
  suggestions: string[];
}

export interface NativeGooglePlacesSearchResult {
  placeId?: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  regionLabel?: string;
  types: string[];
  attributions?: Array<{ text: string; url?: string }>;
}

export interface NativeGoogleReverseGeocodeQuery {
  latitude: number;
  longitude: number;
}

export interface NativeGoogleReverseGeocodeResult {
  formattedAddress?: string;
  thoroughfare?: string;
  locality?: string;
  subLocality?: string;
  administrativeArea?: string;
  postalCode?: string;
  country?: string;
}

function nativeModule(): NativeGooglePlacesModule {
  return requireNativeModule<NativeGooglePlacesModule>('ExpoGooglePlaces');
}

export function initializeGooglePlaces(): Promise<boolean> {
  return nativeModule().initializeAsync();
}

export function isGooglePlacesConfigured(): Promise<boolean> {
  return nativeModule().isConfiguredAsync();
}

export function searchGooglePlaces(
  query: NativeGooglePlacesSearchQuery,
): Promise<NativeGooglePlacesSearchPage> {
  return nativeModule().searchAsync(query);
}

export function reverseGeocodeGoogleCoordinate(
  query: NativeGoogleReverseGeocodeQuery,
): Promise<NativeGoogleReverseGeocodeResult | null> {
  return nativeModule().reverseGeocodeAsync(query);
}
