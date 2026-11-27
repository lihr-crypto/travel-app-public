# Travel App — Travel-Ready Sprint

> Target date: 2026-03-09
> Purpose: produce a build that is genuinely useful during the upcoming trip.
> This is a checkpoint, not a replacement for the M0–M13 roadmap.

## 1. Principle

Prefer a smaller build that is reliable for real travel over a nominally complete V1 with unverified behavior.

Do not weaken persistence, transaction, CRS, or itinerary invariants for speed.

## 2. Travel-Ready P0 capabilities

The build should support the following user loop:

```text
Create Trip
→ generated Days
→ add/edit itinerary Item
→ scheduled or Unscheduled
→ move/reorder itinerary
→ Trip Map
→ Timeline
→ Place search / map pick
→ correct regional map provider
→ open Place in external map
→ restart app without losing saved itinerary
→ existing saved itinerary remains readable without network
```

Provider behavior:

```text
mainland China → AMap
global         → Google Maps / Google Places
```

## 3. Milestone priority

Primary path:

```text
M0 → M1 → M2 → M3 → M4 → M5 → M7
```

Then perform a targeted Travel-Ready persistence/offline smoke test using the relevant M12 acceptance ideas without pretending full M12 is complete.

Stretch goals before departure:

```text
M6  drag reorder
M9  Hotel / Transport specialization
```

Normally safe to finish after the trip:

```text
M8   reserved/retired; no implementation
M10  Home Footprint Map
M11  final Validation + Delete/Undo productization
M12  full persistence/offline hardening
M13  full stabilization/release gate
```

If actual dependencies or defects make one of those necessary earlier, follow implementation evidence rather than this preference.

## 4. Travel-Ready acceptance checklist

Before calling the build Travel-Ready:

- [ ] app launches on a physical iPhone or intended iOS test device;
- [ ] create a Trip with title, dates, and mapRegion;
- [ ] inclusive Days are generated and persist after restart;
- [ ] add at least several Items;
- [ ] scheduled and Unscheduled Items survive restart;
- [ ] moving/reordering Items does not lose data;
- [ ] Trip Map and Timeline show the same itinerary state;
- [ ] correct map provider is chosen from `Trip.mapRegion`;
- [ ] at least one mainland-China fixture works with AMap;
- [ ] at least one global fixture works with Google;
- [ ] Place selection saves a local snapshot;
- [ ] external-map handoff opens the correct provider;
- [ ] kill/relaunch preserves itinerary;
- [ ] with network unavailable, previously saved Trip/Day/Item/Place/Timeline data can still be read;
- [ ] no user-facing destructive action exists without a safe restore path;
- [ ] no known data-loss bug remains.

## 5. Model budget strategy

Default:

```text
Luna High
```

Escalate to:

```text
Sol Medium
```

for data integrity, architecture, native maps/CRS, complex debugging, and checkpoint review.

Aim for roughly:

```text
~70% Luna High
~30% Sol Medium
```

This is a budget heuristic, not a quota.

## 6. Final Travel-Ready review

When the checklist is nearly complete, use Sol Medium for a dedicated review.

Required output:

```text
TRAVEL-READY VERDICT:
READY
READY WITH KNOWN LIMITATIONS
NOT READY

Blocking defects:
Known limitations:
Safe trip-use flows:
Features intentionally deferred until after travel:
```

Do not mark the canonical roadmap complete merely because the Travel-Ready checkpoint passes.
