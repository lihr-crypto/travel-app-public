import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * The React Native equivalent of the `data-no-swipe` marker from the web spec.
 *
 * A Day swipe lives on a container that also holds the Day title, the arrows, the
 * 添加地点 button and the Timeline rows. The swipe is a native RNGH gesture, so
 * it has no DOM `event.target.closest('[data-no-swipe]')` walk to lean on.
 * Instead each control that owns its own tap raises a single mutable flag on
 * touch-down, and the swipe reads it once, at gesture end.
 *
 * The flag is cleared by the control on touch-up and by the swipe on gesture
 * end, so a control press never leaks into a later, separate swipe.
 */
export interface DaySwipeGuard {
  /** True while a touch that began on an excluded control is still down. */
  readonly startedOnControl: { current: boolean };
}

const DaySwipeGuardContext = createContext<DaySwipeGuard | null>(null);

/** One mutable flag per swipe container; the identity is stable for its life. */
export function useDaySwipeGuardState(): DaySwipeGuard {
  return useMemo(() => ({ startedOnControl: { current: false } }), []);
}

export function DaySwipeGuardProvider({
  guard,
  children,
}: {
  guard: DaySwipeGuard;
  children: ReactNode;
}) {
  return (
    <DaySwipeGuardContext.Provider value={guard}>
      {children}
    </DaySwipeGuardContext.Provider>
  );
}

export function useDaySwipeGuard(): DaySwipeGuard | null {
  return useContext(DaySwipeGuardContext);
}

/**
 * Props for a control that must keep its own tap: the Day title, the arrows,
 * 添加地点, a Timeline row's ⋯. It sets the guard flag on touch-down and clears
 * it on touch-up, so a horizontal drag that starts on it never switches Day, and
 * a plain tap leaves no stale flag behind.
 */
export function useSwipeExclusion(guard?: DaySwipeGuard): {
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  onTouchCancel?: () => void;
} {
  const contextGuard = useDaySwipeGuard();
  const resolved = guard ?? contextGuard;
  const startedOnControlRef = resolved?.startedOnControl;
  return useMemo(() => {
    if (startedOnControlRef === undefined) return {};
    return {
      onTouchStart: () => {
        // Intentional mutable gesture flag; it is not rendered state.
        // eslint-disable-next-line react-hooks/immutability
        startedOnControlRef.current = true;
      },
      onTouchEnd: () => {
        // eslint-disable-next-line react-hooks/immutability
        startedOnControlRef.current = false;
      },
      onTouchCancel: () => {
        // eslint-disable-next-line react-hooks/immutability
        startedOnControlRef.current = false;
      },
    };
  }, [startedOnControlRef]);
}
