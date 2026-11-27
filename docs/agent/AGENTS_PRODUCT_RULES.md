# AGENTS.md Product Rules — merge snippet

Use these rules in the development repository root `AGENTS.md`:

```text
Canonical plan = Trip -> Day -> Ordered Items.
Timeline is the primary Trip planning/browsing projection.
Map is a synchronized Place-only spatial projection; it must not create canonical itinerary state.
Home remains map-centered as travel footprint / Trip entry.
Trip Overview shows Trip-wide saved Place distribution/clusters + Day List; no Day anchors or cross-Day routes.
Day View shows only current-Day Place-bearing Items by default.
Day marker display numbers are assigned 1..N after sorting by itinerary order and filtering to Place-bearing Items.
Items without Place remain in Timeline and create no map numbering gap.
Item Selected is a same-screen Day View state; explicit Detail action navigates.
Do not require route polylines, route choice, ETA, traffic or in-app navigation.
Place Search is input assistance, not discovery/recommendation.
External navigation uses provider-aware handoff to AMap / Google Maps.
Do not create or expose Leg domain/table/repository/reconciliation/rows/polylines/RouteProvider in V1 unless a later user-approved product change explicitly reopens them.
Do not implement AI/cloud/deferred features unless explicitly requested.
```

- Day Map marker IDs must be Item occurrence IDs, never Place IDs.
- `Trip.mapRegion` is persisted (`china_mainland | global`) and must not switch with phone location or viewport.
- Home renderer is decided only at M10-T0; do not assume MapKit earlier.
