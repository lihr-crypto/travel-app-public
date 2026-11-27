#!/usr/bin/env python3
"""Summarise a pulled `gesture-debug.db` from the device.

The gesture diagnostics (`src/components/gesture-debug.ts`) are TEMP
instrumentation. Pull the DB with:

    xcrun devicectl device copy from --device <DEVICE_UDID> \
      --domain-type appDataContainer --domain-identifier com.example.travelapp.dev \
      --source . --destination /tmp/devcontainer

then run:

    python3 scripts/analyze-gesture-log.py /tmp/devcontainer/Documents/SQLite/gesture-debug.db

Two facts make this DB harder to read than it looks:

1. **Rows accumulate across launches and across builds.** `glog` stamps `t` as
   `Date.now() - startedAt`, where `startedAt` is module scope, so `t` restarts
   at every launch. Order by `id` (AUTOINCREMENT, monotonic across launches),
   never by `t`; `t` drops are the launch boundaries. A single file can hold
   several instrumentation generations with different tag vocabularies.
2. **`glog` is fire-and-forget** (`void getDb().then(...)`), so a killed app
   loses the tail of a burst.

The analysis that matters is the ⋯ tap pattern:

- `d-actions-open <itemId>` is logged inside `onOpenItemActions`, which
  `DayTimeline` wires ONLY to the ⋯ Pressable's `onPress`. So one row == one
  ⋯ press that reached the handler. `actions tap` / `openActions` are the same
  event from an older instrumentation generation.
- Repeats of the SAME itemId within ~600 ms are the user retrying because
  nothing appeared. A healthy control produces single-tap clusters.
- `modal item-action-sheet mounted=<bool> visible=<bool>` is the sheet's own
  render log. `mounted=false` means the component returned `null` — nothing on
  screen. `visible=true mounted=false` is the UX-E signature.
"""

from __future__ import annotations

import collections
import sqlite3
import sys

TAP_TAGS = ("d-actions-open ", "actions tap ")
SHEET_TAGS = ("modal item-action-sheet", "modal sheet-smoke")
REPEAT_GAP_MS = 600


def load(db_path: str) -> list[tuple[int, int, str]]:
    con = sqlite3.connect(db_path)
    return list(con.execute("SELECT id, t, line FROM log ORDER BY id"))


def launches(rows: list[tuple[int, int, str]]) -> list[tuple[int, int]]:
    """Split on `t` drops — one segment per app launch."""
    out, start, prev = [], 0, None
    for i, t, _ in rows:
        if prev is not None and t < prev - 100:
            out.append((start, i))
            start = i
        prev = t
    out.append((start, 10**9))
    return out


def clusters(taps: list[tuple[int, int, str]]) -> list[list[tuple[int, int, str]]]:
    if not taps:
        return []
    out, current = [], [taps[0]]
    for prev, nxt in zip(taps, taps[1:]):
        if nxt[2] == prev[2] and nxt[1] - prev[1] < REPEAT_GAP_MS:
            current.append(nxt)
        else:
            out.append(current)
            current = [nxt]
    out.append(current)
    return out


def report(db_path: str) -> None:
    rows = load(db_path)
    print(f"rows: {len(rows)}")
    segs = launches(rows)
    print(f"launches detected: {len(segs)}\n")

    for start, end in segs:
        seg = [r for r in rows if start <= r[0] < end]
        tags = collections.Counter(l.split(" ", 1)[0] for _, _, l in seg)

        line = f"launch id[{start}:{end}) rows={len(seg)}"
        print(line)

        for tag in TAP_TAGS:
            taps = [(i, t, l[len(tag):]) for i, t, l in seg if l.startswith(tag)]
            if not taps:
                continue
            cl = clusters(taps)
            hist = collections.Counter(len(c) for c in cl)
            multi = sum(1 for c in cl if len(c) > 1)
            inside = sum(len(c) for c in cl if len(c) > 1)
            print(
                f"  {tag.strip():16s} taps={len(taps):4d} clusters={len(cl):4d} "
                f"multi={multi:4d} taps-inside-repeats={inside:4d} hist={dict(sorted(hist.items()))}"
            )

        mods = [(i, t, l) for i, t, l in seg if l.startswith(SHEET_TAGS)]
        if mods:
            mounted = sum(1 for _, _, l in mods if "mounted=true" in l)
            visible_never = sum(1 for _, _, l in mods if "visible=true" in l and "mounted=true" not in l)
            print(
                f"  sheet renders      total={len(mods):4d} mounted=true={mounted:4d} "
                f"visible-but-not-mounted={visible_never:4d}"
            )
            if tags.get("d-actions-open") or tags.get("actions"):
                print(
                    "     ^ `visible-but-not-mounted` is the UX-E signature: the press "
                    "arrived, the sheet returned null."
                )
        print()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    report(sys.argv[1])
