import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import type { MapPadding } from './map-models';
import { TRIP_SHEET_SNAP_PERCENTAGES, type TripSheetSnap } from '@/state/trip-focus';

export interface MapViewportPaddingOptions {
  safeArea: EdgeInsets;
  viewportHeight: number;
  sheetSnap: TripSheetSnap;
  edgeGutter?: number;
}

/** Camera edge padding for the map area that remains visible behind the sheet. */
export function buildMapViewportPadding({
  safeArea,
  viewportHeight,
  sheetSnap,
  edgeGutter = 16,
}: MapViewportPaddingOptions): MapPadding {
  if (!Number.isFinite(viewportHeight) || viewportHeight < 0) {
    throw new RangeError('Viewport height must be finite and non-negative');
  }
  if (!Number.isFinite(edgeGutter) || edgeGutter < 0) {
    throw new RangeError('Map edge gutter must be finite and non-negative');
  }
  const sheetHeight = viewportHeight * TRIP_SHEET_SNAP_PERCENTAGES[sheetSnap] / 100;
  return {
    top: safeArea.top + edgeGutter,
    right: safeArea.right + edgeGutter,
    bottom: safeArea.bottom + sheetHeight + edgeGutter,
    left: safeArea.left + edgeGutter,
  };
}

/** Presentation hook; these insets never enter canonical itinerary state. */
export function useMapViewportPadding(sheetSnap: TripSheetSnap): MapPadding {
  const safeArea = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return useMemo(
    () => buildMapViewportPadding({ safeArea, sheetSnap, viewportHeight: height }),
    [height, safeArea, sheetSnap],
  );
}
