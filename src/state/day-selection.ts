import { useEffect } from 'react';

import type { EntityId } from '@/domain/common/types';

import { tripFocusStore, useTripFocus, type TripFocus } from './trip-focus';

/**
 * Resolves the shared Item selection for one Day view.
 *
 * Only an Item focus that belongs to `dayId` selects a Timeline row or a map
 * marker. Unscheduled Item focus (`dayId === null`), Day focus and Overview
 * focus select nothing, so an Item from another Day — or from Unscheduled —
 * can never leak a selection into this Day.
 */
export function resolveDaySelection(
  focus: TripFocus,
  dayId: EntityId,
): EntityId | null {
  if (focus.type !== 'item') return null;
  return focus.dayId === dayId ? focus.itemId : null;
}

/** One selection seam shared by the Day map and the Day Timeline. */
export interface DaySelection {
  selectedItemId: EntityId | null;
  selectItem: (itemId: EntityId) => void;
}

/**
 * Both surfaces read `selectedItemId` and emit `selectItem`. Neither surface
 * controls the other; both only read TripFocus and emit one intent.
 */
export function useDaySelection(dayId: EntityId): DaySelection {
  const focus = useTripFocus((state) => state.focus);
  const selectItem = useTripFocus((state) => state.selectItem);

  return {
    selectedItemId: resolveDaySelection(focus, dayId),
    selectItem: (itemId) => selectItem(itemId, dayId),
  };
}

/** Normal Trip entry. Binds the workspace to one Trip; focus starts at Overview. */
export function useTripEntry(tripId: EntityId): void {
  useEffect(() => {
    tripFocusStore.getState().selectTrip(tripId);
  }, [tripId]);
}

/** Day navigation intent. Switching Day clears any Item focus. */
export function useSelectDay(): (dayId: EntityId) => void {
  return useTripFocus((state) => state.selectDay);
}
