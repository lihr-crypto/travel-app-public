import type { NativePadding } from './ExpoAmapMap.types';

export interface MapBoundsSize {
  width: number;
  height: number;
}

export interface NormalizedScreenAnchor {
  x: number;
  y: number;
}

export interface VisibleMapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisibleMapGeometry {
  visibleRect: VisibleMapRect;
  screenAnchor: NormalizedScreenAnchor;
}

/** A user gesture invalidates only the one-shot request whose camera was moved. */
export function isCameraRequestSuppressedAfterUserAction(
  requestKey: string,
  userActionRequestKey: string | null,
): boolean {
  return userActionRequestKey !== null && requestKey === userActionRequestKey;
}

/** Resolve the unoccluded map rectangle and its normalized center anchor. */
export function computeVisibleMapGeometry(
  padding: NativePadding | undefined,
  bounds: MapBoundsSize,
): VisibleMapGeometry | null {
  const { width, height } = bounds;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const top = padding?.top ?? 0;
  const right = padding?.right ?? 0;
  const bottom = padding?.bottom ?? 0;
  const left = padding?.left ?? 0;
  const insets = [top, right, bottom, left];
  if (insets.some((value) => !Number.isFinite(value) || value < 0)) return null;

  const visibleWidth = width - left - right;
  const visibleHeight = height - top - bottom;
  if (visibleWidth <= 0 || visibleHeight <= 0) return null;

  const anchorX = (left + width - right) / (2 * width);
  const anchorY = (top + height - bottom) / (2 * height);
  return {
    visibleRect: {
      x: left,
      y: top,
      width: visibleWidth,
      height: visibleHeight,
    },
    screenAnchor: {
      x: Math.min(1, Math.max(0, anchorX)),
      y: Math.min(1, Math.max(0, anchorY)),
    },
  };
}
