import type { Coordinate } from '@/domain/common/types';

import type { MapPadding } from './map-models';

export interface FocusCenterInput {
  coordinate: Coordinate;
  padding?: MapPadding;
  /** Height of the whole map view, in points. */
  viewportHeight: number;
  /** Current vertical span of the map view, in degrees of latitude. */
  latitudeDelta: number;
}

/** Mercator-safe latitude bounds; a shifted centre must never leave the map. */
const MAX_LATITUDE = 85;

/**
 * A single-coordinate camera request still has to respect the sheet padding.
 *
 * `MapPadding` describes the part of the map view that stays visible behind the
 * Bottom Sheet, and the multi-coordinate fit path already uses it as edge
 * padding. The one-coordinate path had no equivalent, so a focused Place landed
 * at the centre of the *whole* view — i.e. on the sheet's top edge, or fully
 * behind an expanded sheet.
 *
 * The shift is a pixel quantity, so it needs the current vertical span and the
 * map view height. Callers that cannot supply both keep the plain centre.
 */
export function focusCenterWithinPadding({
  coordinate,
  padding,
  viewportHeight,
  latitudeDelta,
}: FocusCenterInput): Coordinate {
  if (!padding || !(viewportHeight > 0) || !(latitudeDelta > 0)) return coordinate;

  // The visible band runs from `padding.top` to `viewportHeight - padding.bottom`,
  // so its centre sits this many points above the geometric centre. The camera
  // centre has to move the opposite way for the target to appear there.
  const upwardPoints = (padding.bottom - padding.top) / 2;
  if (upwardPoints === 0) return coordinate;

  const latitude = coordinate.latitude - upwardPoints / viewportHeight * latitudeDelta;
  return {
    ...coordinate,
    latitude: Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude)),
  };
}
