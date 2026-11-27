// Pure rules for turning map taps into candidates. Distances are screen-sized, so they scale with the zoom level.
export const SECOND_TAP_WINDOW_MS = 4500;
export const SECOND_TAP_MIN_GAP_MS = 350;
export const SECOND_TAP_RADIUS_PX = 36;
export const POI_RADIUS_PX = 24;

// Web Mercator ground resolution (both providers use 256 px tiles).
export const metersPerPixel = (latitude, zoom) => 156543.03392 * Math.cos(latitude * Math.PI / 180) / 2 ** zoom;

export function distanceMeters(a, b) {
  const rad = degrees => degrees * Math.PI / 180, earth = 6371008.8;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

// How far from the finger a labelled place may be and still count as the one tapped.
export const poiRadiusMeters = (latitude, zoom) => Math.min(150, Math.max(15, POI_RADIUS_PX * metersPerPixel(latitude, zoom)));

// What a tap means after an earlier tap found nothing (`pending` = {coordinate, at, zoom}): 'confirm' = same spot again,
// 'ignore' = too soon to be deliberate (a double-tap zoom), 'restart' = a different spot, too late or after the map was
// zoomed, so it is a new first tap.
export function classifySecondTap(pending, coordinate, now, zoom) {
  if (!pending) return 'restart';
  const gap = now - pending.at;
  if (gap > SECOND_TAP_WINDOW_MS || Math.abs(zoom - pending.zoom) > 0.5) return 'restart';
  if (distanceMeters(pending.coordinate, coordinate) > SECOND_TAP_RADIUS_PX * metersPerPixel(coordinate.latitude, zoom)) return 'restart';
  return gap < SECOND_TAP_MIN_GAP_MS ? 'ignore' : 'confirm';
}
