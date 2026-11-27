import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { EntityId } from '@/domain/common/types';

export type TripFocus =
  | { type: 'overview' }
  | { type: 'day'; dayId: EntityId }
  | { type: 'item'; itemId: EntityId; dayId: EntityId | null }
  | { type: 'unscheduled' };

/** Durable sheet geometry. Stage 04 §43 defines the three snap states. */
export type TripSheetSnap = 'collapsed' | 'half' | 'expanded';

/** Half is the default planning state. */
export const DEFAULT_SHEET_SNAP: TripSheetSnap = 'half';

/** Shared sheet geometry used by both the native sheet and map camera insets. */
export const TRIP_SHEET_SNAP_PERCENTAGES: Record<TripSheetSnap, number> = {
  collapsed: 14,
  half: 48,
  expanded: 88,
};

export interface TripFocusState {
  tripId: EntityId | null;
  focus: TripFocus;
  sheetSnap: TripSheetSnap;
  selectTrip(tripId: EntityId): void;
  selectDay(dayId: EntityId): void;
  selectItem(itemId: EntityId, dayId: EntityId | null): void;
  enterOverview(): void;
  openUnscheduled(): void;
  continueToday(tripId: EntityId, dayId: EntityId): void;
  setSheetSnap(snap: TripSheetSnap): void;
  handleBack(): void;
}

function assertId(id: EntityId, name: string) {
  if (!id.trim()) throw new RangeError(`${name} must not be empty`);
}

function requireTrip(tripId: EntityId | null): asserts tripId is EntityId {
  if (tripId === null) throw new RangeError('Select a Trip before changing focus');
}

/** Interaction IDs and sheet geometry only; canonical Trip/Day/Item/Place data stays in SQLite. */
export function createTripFocusStore() {
  return createStore<TripFocusState>()((set, get) => ({
    tripId: null,
    focus: { type: 'overview' },
    sheetSnap: DEFAULT_SHEET_SNAP,

    selectTrip(tripId) {
      assertId(tripId, 'Trip ID');
      set({ tripId, focus: { type: 'overview' }, sheetSnap: DEFAULT_SHEET_SNAP });
    },
    selectDay(dayId) {
      requireTrip(get().tripId);
      assertId(dayId, 'Day ID');
      set({ focus: { type: 'day', dayId } });
    },
    selectItem(itemId, dayId) {
      requireTrip(get().tripId);
      assertId(itemId, 'Item ID');
      if (dayId !== null) assertId(dayId, 'Day ID');
      set({ focus: { type: 'item', itemId, dayId } });
    },
    enterOverview() {
      requireTrip(get().tripId);
      set({ focus: { type: 'overview' } });
    },
    openUnscheduled() {
      requireTrip(get().tripId);
      set({ focus: { type: 'unscheduled' } });
    },
    continueToday(tripId, dayId) {
      assertId(tripId, 'Trip ID');
      assertId(dayId, 'Day ID');
      set({
        tripId,
        focus: { type: 'day', dayId },
        sheetSnap: DEFAULT_SHEET_SNAP,
      });
    },
    setSheetSnap(snap) {
      requireTrip(get().tripId);
      set({ sheetSnap: snap });
    },
    handleBack() {
      set((state) => {
        if (state.tripId === null) return state;
        switch (state.focus.type) {
          case 'item':
            return { focus: state.focus.dayId === null
              ? { type: 'unscheduled' }
              : { type: 'day', dayId: state.focus.dayId } };
          case 'day':
          case 'unscheduled':
            return { focus: { type: 'overview' } };
          case 'overview':
            return {
              tripId: null,
              focus: { type: 'overview' },
              sheetSnap: DEFAULT_SHEET_SNAP,
            };
        }
      });
    },
  }));
}

export const tripFocusStore = createTripFocusStore();

export function useTripFocus<T>(selector: (state: TripFocusState) => T): T {
  return useStore(tripFocusStore, selector);
}
