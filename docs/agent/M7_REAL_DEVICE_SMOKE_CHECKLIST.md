# M7 Real-Device Smoke Checklist

> Scope: M7 Place Search, Preview, Map Picker, persistence, and external-map handoff.
> Run on an iOS Development Build. Normal CI must use mocks and must not call live providers.

Use isolated fixture trips and public landmarks. Keep raw device evidence and coordinates out of published reports.

## Preconditions

- [ ] Build uses the intended bundle identifier and restricted iOS provider keys.
- [ ] Maps SDK for iOS, Places API (New), AMap Map SDK, and AMap Search SDK are enabled.
- [ ] Open the development-only `M7 地点能力验收` route and load the isolated fixture Trips.
- [ ] Keep network enabled for provider checks. Do not record keys in screenshots or logs.

## Mainland China / AMap

- [ ] Select the AMap fixture, read the disclosure, and accept the AMap privacy gate.
- [ ] Search a known Beijing place. Results show AMap, GCJ-02 coordinates, name, and available address.
- [ ] Open Preview, confirm once, and verify the page reports new Place and Item IDs.
- [ ] Open Map Picker. Pan the map and wait for the crosshair address to settle.
- [ ] Confirm with enrichment and verify the saved label matches the displayed address/name.
- [ ] Enable `强制坐标兜底模式`, pick again, and verify no address is required and the coordinate label is saved.
- [ ] From the saved result, choose `在地图中打开`; AMap/app-or-web opens at the selected GCJ-02 coordinate.

## Global / Google

- [ ] Select the Google fixture and search a known Sydney place.
- [ ] Results show Google, WGS84 coordinates, name, and available address.
- [ ] Open Preview, confirm once, and verify the page reports new Place and Item IDs.
- [ ] Open Map Picker. Pan the map and wait for `GMSGeocoder` enrichment.
- [ ] Confirm with enrichment and verify the saved label matches the displayed address.
- [ ] Enable `强制坐标兜底模式`, pick again, and verify the coordinate-only save succeeds.
- [ ] From the saved result, choose `在地图中打开`; Google Maps/app-or-web opens at the WGS84 coordinate.

## Failure and persistence checks

- [ ] Start a search, change provider/fixture, and confirm no old result is attached to the new session.
- [ ] Pan after an address appears; confirm the old address disappears before saving the new center.
- [ ] Disable network and verify failed search/reverse geocode is visible but Map Picker still saves a coordinate.
- [ ] Kill and relaunch the app. The newly created fixture Items and Place snapshots remain readable.
- [ ] Verify the normal Trip Bottom Sheet is absent while the full-screen Map Picker is active.

## Additional production-path checks (Travel-Ready acceptance)

- [ ] App launches on the intended physical iPhone.
- [ ] Create a Trip with title, dates, and mapRegion.
- [ ] Add several Items; Trip Map and Timeline show the same itinerary state.
- [ ] Correct map provider is chosen from `Trip.mapRegion` for both fixtures.
- [ ] Place selection saves a local provider-native snapshot (both providers).
- [ ] External-map handoff opens the correct provider (AMap for GCJ-02, Google for WGS84).
- [ ] `PRAGMA foreign_key_check` clean after every write and after the offline/kill cycles.
- [ ] No user-facing destructive action exists without a safe restore path.
- [ ] Scheduled **and Unscheduled** Items survive restart.
- [ ] Moving/reordering Items does not lose data.
