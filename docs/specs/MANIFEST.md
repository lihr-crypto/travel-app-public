# Travel App Final Reconciled Pack — Manifest

Status: **post-independent-review reconciled baseline**  
Date: 2026-09-11

## Read first

1. `FINAL_REVIEW_ARBITRATION.md`
2. `00-PRODUCT-REALIGNMENT-AMENDMENT.md`
3. `docs/agent/DEVELOPMENT_HANDOFF.md`
4. relevant Stage 01–06 milestone sections
5. `travel-app-review-decision-record-2026-09-11.md`

## Included

- Stage 01–06 revised specifications
- Development Handoff
- Review Decision Record
- Independent Review Report (review input)
- Final Review Arbitration (accepted/rejected decisions)
- AGENTS product-rule snippet
- Beijing/Sample visual references

## Final material changes after independent review

- V1 Leg removed completely; M8 retired/reserved.
- Migration 001: Trip/Day/Place/Item only; `map_region`; start/end datetimes; no `exact_time`, no `legs`.
- `Trip.mapRegion` persisted as `china_mainland | global`.
- M4 moves minimal Place persistence earlier and uses marker-only renderer contract.
- Marker identity is Item occurrence identity.
- Home renderer decided at M10-T0, not pre-locked.
- Home compact persistent Trip-list Bottom Sheet is explicitly in scope.
- Delete UI ships with Undo at M11.
- M13 includes Beijing/Sample, repeated-Place, Place-less Item, CRS and provider/release gates.
