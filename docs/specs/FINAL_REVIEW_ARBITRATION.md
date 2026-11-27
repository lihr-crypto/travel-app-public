# Final Review Arbitration — 2026-09-11

> Input: `INDEPENDENT_REVIEW_REPORT.md`  
> Result: **GO WITH CORRECTIONS → reconciled specification baseline**

## Accepted and now locked

1. V1 canonical model is `Trip → Day → Ordered Items → Place?`; Timeline is primary planning projection and Map is Place-only spatial projection.
2. One UI/navigation system covers Beijing city travel, Sample road trips and multi-city travel.
3. **Leg is removed completely from canonical V1**. M8 is retired/reserved.
4. Exact time uses `startDateTime/endDateTime`; DayPeriod has exactly four values.
5. `Trip.mapRegion = china_mainland | global` is persisted and is the stable Trip provider selector.
6. M4 owns minimal Place persistence plus persisted fixtures so Map ↔ Timeline sync is a real vertical slice; M7 owns provider search/input flows.
7. Day marker ID is Item occurrence ID; repeated Place occurrences remain independent.
8. Renderer V1 contract does not require polylines.
9. Home renderer is decided/tested at M10-T0, not pre-locked to MapKit.
10. Home V1 includes the accepted compact persistent `我的旅行` Trip-list Bottom Sheet.
11. User-visible Item Delete ships only together with Undo in M11.
12. `changeTripDateRange()` uses explicit `shiftItems | keepCalendarDates`.
13. Unscheduled marker density/toggle rules from Stage 03 are canonical.
14. PlaceProvider path: AMap official iOS Search SDK + Google Places SDK for iOS behind thin Expo native modules; CI uses mocks and device smoke tests are manual gates.

## Reviewer findings intentionally not turned into new product scope

- No road-trip-specific UI.
- No recommendation/discovery feed.
- No in-app route planning/navigation.
- No visited/skipped state.
- No batch editing framework.
- No ticket-grade Transport model.
- No backend/cloud/auth/AI runtime.

## Current M0 impact

No broad rollback. Before M0 exit, the canonical initial schema must use:

- `trips.map_region`;
- `items.start_datetime/end_datetime`;
- no `exact_time`;
- no `legs` table.

If the current development database is disposable, rebuild it after correcting Migration 001. If real non-disposable data somehow already exists, use a forward compatibility migration instead of destructive rollback.
