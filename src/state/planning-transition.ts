import { useCallback, useEffect, useRef, useState } from 'react';

import { useReduceMotionPreference } from './reduce-motion';

/**
 * Presentation-only surface transition controller.
 *
 * It owns the three things that must not be duplicated per screen: the
 * transition phase machine, duplicate-intent protection, and the direction of
 * the swap. It never touches canonical itinerary state.
 */
export type PlanningTransitionDirection = 'forward' | 'backward' | 'neutral';

export type PlanningTransitionPhase =
  /** Nothing in flight; the presented surface is the committed surface. */
  | 'idle'
  /** Destination data is being prepared; the source surface stays visible. */
  | 'preparing'
  /** The source surface is fading out; the swap has not happened yet. */
  | 'leaving'
  /** The destination surface is mounted and fading in. */
  | 'entering';

export interface PlanningTransitionTiming {
  /** Fade-out duration before the single surface swap. */
  exitMs: number;
  /** Fade-in duration after the single surface swap. */
  enterMs: number;
}

/**
 * Restrained two-phase timings from the motion plan §3.3.
 *
 * `day` intentionally covers both Overview ↔ Day and an adjacent Day switch:
 * the approved windows overlap (200–240 ms and 180–220 ms), so one shared value
 * keeps a single motion language instead of two imperceptibly different ones.
 */
export const PLANNING_TRANSITION_TIMING = {
  /** Home → Trip Overview: 220–260 ms total. */
  home: { exitMs: 110, enterMs: 130 },
  /** Overview ↔ Day and adjacent Day ↔ Day: 180–240 ms total. */
  day: { exitMs: 100, enterMs: 120 },
} as const satisfies Record<string, PlanningTransitionTiming>;

/** Approved 8–12 pt travel; larger movement would read as a page slide. */
export const PLANNING_TRANSITION_TRANSLATE = 10;

/**
 * Message for the actionable inline error shown on the source surface when a
 * destination read fails. A failed transition never becomes a blank screen.
 */
export function describeTransitionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Direction comes from `dayIndex` distance, not list position: only a one-step
 * move reads as directional. Any other Day Jump is a neutral fade instead of a
 * long multi-page travel animation.
 */
export function resolveDayTransitionDirection(
  fromDayIndex: number | null | undefined,
  toDayIndex: number | null | undefined,
): PlanningTransitionDirection {
  if (typeof fromDayIndex !== 'number' || typeof toDayIndex !== 'number') {
    return 'neutral';
  }
  const delta = toDayIndex - fromDayIndex;
  if (delta === 1) return 'forward';
  if (delta === -1) return 'backward';
  return 'neutral';
}

export interface PlanningTransitionRequest {
  /** Visual direction of the swap. Defaults to a neutral fade. */
  direction?: PlanningTransitionDirection;
  /**
   * Destination readiness work. It runs while the source surface is still
   * visible; a rejection keeps the source surface and reports through
   * `onError` instead of committing a blank destination.
   */
  prepare?: () => Promise<unknown>;
  /**
   * Swap content inside the already-presented surface instead of replacing the
   * surface. The exit/enter phases are skipped entirely, so a persistent
   * surface (Day → Day) never fades, translates or remounts; `prepare` and the
   * single-intent guard still apply.
   */
  inPlace?: boolean;
  /** The single swap point. Runs exactly once, after `prepare` succeeds. */
  commit: () => void;
  /** Called instead of `commit` when `prepare` rejects. */
  onError?: (error: unknown) => void;
}

export interface PlanningTransition {
  phase: PlanningTransitionPhase;
  direction: PlanningTransitionDirection;
  timing: PlanningTransitionTiming;
  /** True from the first accepted intent until the destination has entered. */
  isTransitioning: boolean;
  /** Returns `false` when a transition is already in flight. */
  run: (request: PlanningTransitionRequest) => boolean;
}

/**
 * One transition at a time. A user-initiated navigation is ignored while an
 * earlier one is preparing, exiting, or entering, so rapid repeated taps cannot
 * stack surfaces or interleave focus.
 */
export function usePlanningTransition(
  timing: PlanningTransitionTiming = PLANNING_TRANSITION_TIMING.day,
): PlanningTransition {
  const [phase, setPhase] = useState<PlanningTransitionPhase>('idle');
  const [direction, setDirection] = useState<PlanningTransitionDirection>('neutral');
  const busy = useRef(false);
  const mounted = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reducedMotion = useReduceMotionPreference();

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }, []);

  useEffect(() => () => {
    mounted.current = false;
    clearTimers();
  }, [clearTimers]);

  const run = useCallback((request: PlanningTransitionRequest) => {
    // `busy` is authoritative: phase state lags behind a synchronous intent.
    if (busy.current) return false;
    busy.current = true;
    setDirection(request.direction ?? 'neutral');
    setPhase('preparing');

    const finish = () => {
      if (!mounted.current) return;
      busy.current = false;
      setPhase('idle');
    };

    const swap = () => {
      if (!mounted.current) return;
      request.commit();
      if (reducedMotion || request.inPlace) {
        finish();
        return;
      }
      setPhase('entering');
      timers.current.push(setTimeout(finish, timing.enterMs));
    };

    const leave = () => {
      if (!mounted.current) return;
      if (reducedMotion || request.inPlace) {
        swap();
        return;
      }
      setPhase('leaving');
      timers.current.push(setTimeout(swap, timing.exitMs));
    };

    if (!request.prepare) {
      leave();
      return true;
    }

    void Promise.resolve()
      .then(request.prepare)
      .then(
        () => leave(),
        (error: unknown) => {
          if (!mounted.current) return;
          busy.current = false;
          setPhase('idle');
          request.onError?.(error);
        },
      );
    return true;
  }, [reducedMotion, timing.enterMs, timing.exitMs]);

  return {
    phase,
    direction,
    timing,
    isTransitioning: phase !== 'idle',
    run,
  };
}
