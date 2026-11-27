# M7 PlaceProvider Native Integration Lock

Status: locked by M7-T1 on 2026-09-14.

## Selected paths

| Trip region | Native SDK | Pinned dependency | Expo boundary | Coordinate ownership |
|---|---|---|---|---|
| `china_mainland` | AMap iOS Search SDK | `AMapSearch` `9.8.1` | `ExpoAmapSearch` | provider-native GCJ-02 |
| `global` | Google Places Swift SDK for iOS | `GooglePlacesSwift` `10.15.0` | `ExpoGooglePlaces` | provider-native WGS84 |

Both dependencies use CocoaPods because the existing Expo prebuild/native map
pipeline is CocoaPods-based. Each provider has its own local Expo module so
provider SDK types, keys, privacy state, callbacks and errors stay outside
Domain/Application code. AMap request/result mapping was added in M7-T2;
Google mapping was added in M7-T3.

## AMap mapping added by M7-T2

- `ExpoAmapSearch.searchAsync()` uses `AMapPOIKeywordsSearchRequest`, retains
  concurrent request promises by request identity, and settles them only from
  the matching AMap delegate callback.
- Keyword search is used instead of Input Tips because official AMap semantics
  allow tips without coordinates, while the product requires every displayed
  Place result to have a Marker coordinate.
- `AmapPlaceProvider` validates mainland-China/GCJ-02 inputs, caps the native
  page size at 25, and maps ordered POIs into the shared transient
  `PlaceSearchResult` contract. Provider values are trimmed; missing IDs and
  addresses remain `null`; malformed names or coordinates fail closed.
- Native configuration, invalid-query and provider failures become stable
  infrastructure errors. No result is persisted and no live request is used in
  CI.

## Google mapping added by M7-T3

- `ExpoGooglePlaces.searchAsync()` uses the GA GooglePlacesSwift Autocomplete
  API followed by Place Details requests sharing one session token. This keeps
  the search center optional; Text Search was not selected because its 10.15.0
  Swift request initializers require a location bias or restriction.
- Autocomplete accepts an ISO alpha-2 country filter and optional WGS84 origin.
  The requested details field mask is limited to Place ID, display name,
  formatted address, coordinate and types.
- `GooglePlaceProvider` rejects mainland-China sessions and non-WGS84 centers,
  normalizes the result into the same transient `PlaceSearchResult` contract,
  and maps SDK configuration/query/provider failures to stable infrastructure
  errors. Malformed names, IDs or coordinates fail closed.
- CI injects a mock native client. No result is persisted, no location
  permission is requested and no live provider call is part of the test gate.

## Session resolution added by M7-T4

- `resolvePlaceProviderSession()` reuses the existing `resolveTripMapStack()`
  result, so the saved `Trip.mapRegion` selects both provider and CRS from one
  policy. Phone location and viewport are absent from the resolver input.
- A mainland session returns the AMap/GCJ-02 provider only when the AMap Search
  module is already ready. It never manufactures privacy consent.
- A global session initializes and returns the Google/WGS84 provider. Either
  provider fails closed with `provider_not_ready` when native setup is missing.
- The existing AMap privacy gate now forwards the same actual user choice to
  both the map and search SDKs. Its children mount only when both native
  boundaries report ready.

## External map handoff added by M7-T11

- `resolveExternalMapTarget()` derives the external app from the same persisted
  `Trip.mapRegion` policy the renderer and PlaceProvider already use, so the
  handoff can never disagree with the in-app map. Device location and viewport
  are not inputs.
- `buildExternalMapUrl()` emits an https universal link for the resolved
  provider: AMap
  `uri.amap.com/marker?position=lng,lat&name=…&coordinate=gaode&callnative=1`
  and Google Maps URLs `search/?api=1&query=lat,lng`. Both prefer the installed
  app and fall back to that provider's web page, so no
  `LSApplicationQueriesSchemes` entry, URL-scheme allowlist, new dependency or
  native configuration is required.
- Saved snapshots stay provider-native. A Place whose coordinate system does not
  match the Trip's provider fails closed instead of being converted, and an
  invalid persisted region is rejected before any URL is built.
- `openPlaceInExternalMap()` takes an injected opener and defaults to
  `Linking.openURL`; failures propagate so the Item Detail surface can show a
  visible error. No in-app routing or turn-by-turn navigation is started.

## Reverse-geocode enrichment added by M7-T9

- `PlaceProvider.reverseGeocode?()` is an optional capability. A provider that
  cannot resolve an address simply omits it, and callers must keep working from
  the coordinate alone. A `null` answer means the provider had nothing to
  report; a rejected promise means the lookup failed. Neither blocks the Map
  Picker.
- The mainland provider uses the official `AMapReGeocodeSearchRequest` through a
  new `ExpoAmapSearch.reverseGeocodeAsync`. The bridge requests extension data so
  the POI array comes back, correlates concurrent delegate callbacks by request
  identity, and resolves `null` when AMap answers without a re-geocode payload.
  The shared failure delegate now covers both request types.
- `AmapPlaceProvider` validates the GCJ-02 coordinate and a positive radius,
  clamps the radius to AMap's documented 0-3000 m window, echoes the requested
  provider-native coordinate (AMap does not echo one), and fails closed with
  `invalid_response` when the answer carries no address, place name or region.
- The global provider uses `GMSGeocoder` from `GoogleMaps 9.4.0`, pinned beside
  `GooglePlacesSwift 10.15.0` in the local Expo module. It returns address
  components as metadata and never fabricates the street as a Place name.
  This stays native and does not add an unrestricted Web Service key.
- The Map Picker debounces one request per settled viewport centre, ignores
  answers that arrive after the centre changed or after unmount, and shows the
  resolved address, the place name, or `无法解析地址，仍可保存坐标`. Confirming
  still emits only the coordinate, so enrichment can never block or rewrite what
  gets saved.

## Coordinate-only confirmation added by M7-T10

- `confirmMapPickerPlace()` persists a Place from a picked coordinate without a
  provider place identity. It derives the provider from the persisted
  `Trip.mapRegion` policy rather than trusting the caller, so the snapshot can
  never disagree with the Trip's own provider or coordinate system.
- A matching reverse-geocode enrichment becomes the saved name, address, provider
  Place ID and metadata. An enrichment that describes a different coordinate
  (stale) or another provider/CRS fails closed with zero writes.
- `places.name` is NOT NULL and no migration was added, so the name falls back
  from the enrichment name to its address and finally to a deterministic
  coordinate label. The Map Picker shows the same value it will save.
- Both Place confirmation commands share `insertPlaceSnapshot()` and the same
  exclusive transaction with `addItemWithinTransaction()`, so a provider
  snapshot and a coordinate-only snapshot cannot drift apart.

## Runtime and key rules

- `Trip.mapRegion` remains the only provider selector; device location and map
  viewport never choose or switch the PlaceProvider.
- Both keys are iOS application keys restricted to
  `com.example.travelapp.dev`. No Web Service key is embedded in the client.
- The Google module reads the `GMSApiKey` already generated by the
  `react-native-maps` Expo config plugin and initializes `PlacesClient` only
  when the Google provider is used. The generated AppDelegate remains the sole
  owner of `GMSServices.provideAPIKey`; `GMSGeocoder` reuses that Maps SDK
  initialization. The Cloud project must enable Maps SDK for iOS and Places API
  (New) for that restricted key.
- The AMap module reads `AMapApiKey`. It forwards the user's actual privacy
  disclosure/consent state to `AMapSearchAPI` before configuring the shared
  AMap key. Search must not run unless that call returns `true`.
- Missing keys fail closed (`false`) and must become a visible provider setup
  error when provider resolution is wired. CI never calls live provider APIs.

## Version evidence checked on 2026-09-14

- AMap's official download/release pages list Search SDK `9.8.1`, require
  Foundation `1.9.0+`, identify `AMapSearch` as the CocoaPods dependency, and
  require privacy status calls before SDK use.
- Google's official release notes list Places SDK `11.1.0` as current, but
  `pod install --repo-update` confirms that version is not published to the
  CocoaPods specs repository after Google's announced CocoaPods publication
  cutoff. The official CocoaPods setup still pins `GooglePlacesSwift` `10.15.0`.
  The official migration guide recommends the GA `GooglePlacesSwift` API,
  `PlacesClient.provideAPIKey`, and Places API (New). The current SDK requires
  iOS 16+ and Xcode 26; this project targets iOS 16.4 and the verified host uses
  Xcode 26.6.
- Google now recommends Swift Package Manager and has stopped publishing new
  CocoaPods versions. This project deliberately retains the last documented
  CocoaPods release for M7 to fit Expo autolinking and its existing reproducible
  native pipeline. A package-manager migration is release maintenance, not M7
  search behavior.

Official references:

- https://lbs.amap.com/api/ios-sdk/changelog/changelog/search
- https://lbs.amap.com/api/maps-sdk-for-ios/guide/create-project/cocoapods
- https://developers.google.com/maps/documentation/places/ios-sdk/release-notes
- https://developers.google.com/maps/documentation/places/ios-sdk/config
- https://developers.google.com/maps/documentation/places/ios-sdk/legacy/migrate-places-sdk
