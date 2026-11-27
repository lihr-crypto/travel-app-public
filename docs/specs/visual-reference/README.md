# Visual Reference Notes

The Beijing and Sample boards are visual references for layout, hierarchy and shared navigation only.

Written Stage 03/05 acceptance criteria take precedence over pixels in the generated boards.

## Canonical interpretation

- Both travel shapes use the same Home → Trip Overview → Day View → Item Selected → Add Item structure.
- Home includes the accepted compact persistent Trip-list Bottom Sheet.
- Trip Overview map shows Trip-wide saved Place distribution/clusters, not Day anchors or routes.
- Day View map shows current-Day Place-bearing Items only.
- Day marker number follows Item order; marker identity is Item occurrence identity.
- Place-less Items remain in Timeline and create no marker or numbering gap.
- Item Selected is a same-screen focus state.
- Route selection/navigation is external to AMap / Google Maps.

## Generated-image caveat

Any faint line that visually appears to connect Day markers in these generated reference images is **non-normative decorative artifact** and must NOT be implemented as a route/polyline in V1.

The boards also do not fully demonstrate repeated-Place occurrence Preview or Place-less Item states; these are covered by written acceptance tests instead.

## Sampled visual tokens

Sampled directly from `beijing-ui-reference.png` on 2026-09-15 with a pixel-histogram
pass over the Day View and Item Selected screens. These are **derived hints**, not new
acceptance criteria; written Stage 03/05 text still wins.

| Token | Value | Where it came from |
|---|---|---|
| Accent (marker / badge fill) | `#086050` | Numbered timeline badges and map markers; the dominant saturated cluster was `#006050`–`#086858` |
| Accent, emphasised | `#0B7A63` | Selected state stays inside the same hue family — no second hue appears anywhere in the boards |
| Accent, deep | `#054A3E` | Cluster fill, so the marker family keeps one hue (Stage 03 §3.5) |
| De-emphasised marker | `#707882` | Unscheduled / weaker visual weight |

Notes:

- **The boards use one marker hue.** Sampling the Item Selected screen found no red,
  orange or purple marker, so selection must be expressed through weight (size, ring,
  halo) rather than a second colour. Stage 03 §3.5 asks for exactly this.
- **The boards show a section-grouped timeline** (`上午` / `下午` / `晚上` headings). Stage 03
  §5.2 specifies an inline time/period label per row instead, and written criteria win.
  V1 keeps the inline form.
- Neutral greys in the boards already match the values used by the app, so only the
  accent changes.

> 注：两张生成的参考图没有随公开仓库发布；下文的取色记录与书面验收标准仍然有效。
