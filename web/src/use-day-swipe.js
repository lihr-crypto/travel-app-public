import { useEffect, useRef } from 'react';

const SHEET = '[data-testid="web-day-sheet-gesture-content"],[data-testid="web-day-sheet-handle"]';
const CONTROL = 'button,a,input,select,textarea,summary,[role="button"],[role="link"],[contenteditable="true"]';

/** Observe the Web sheet touch stream; native RNGH still owns vertical pan/reorder. */
export default function useDaySwipe(rootRef, { enabled, resetKey, onSwipe }) {
  const latest = useRef(onSwipe);
  const suppressClickUntil = useRef(0);
  useEffect(() => { latest.current = onSwipe; }, [onSwipe]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    let touch = null;
    const start = (target, id, x, y) => {
      const element = target?.closest ? target : target?.parentElement;
      const control = element?.closest(CONTROL);
      if (!element?.closest(SHEET) || element.closest('[role="dialog"]')
        || (control && !control.matches('[data-testid^="timeline-select-"]'))) { touch = null; return; }
      touch = { id, x, y, at: Date.now(), axis: null };
    };
    const move = (id, x, y, event) => {
      if (!touch || touch.id !== id || touch.axis === 'vertical' || touch.axis === 'swiped') return;
      if (Date.now() - touch.at >= 500) { touch = null; return; }
      const dx = x - touch.x, dy = y - touch.y;
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.2) { touch.axis = 'vertical'; return; }
      if (Math.abs(dx) <= 50 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      touch.axis = 'swiped';
      suppressClickUntil.current = Date.now() + 400;
      if (event.cancelable) event.preventDefault();
      latest.current(dx < 0 ? 'left' : 'right');
    };
    const touchStart = event => {
      if (event.touches.length !== 1) { touch = null; return; }
      const first = event.touches[0];
      start(event.target, first.identifier, first.clientX, first.clientY);
    };
    const touchMove = event => {
      if (event.touches.length !== 1) { touch = null; return; }
      const first = event.touches[0];
      move(first.identifier, first.clientX, first.clientY, event);
    };
    const end = () => { touch = null; };
    // Mouse drags exercise the same intent on desktop; touch/pen never double-fire.
    const pointerStart = event => { if (event.pointerType === 'mouse' && event.button === 0) start(event.target, event.pointerId, event.clientX, event.clientY); };
    const pointerMove = event => { if (event.pointerType === 'mouse') move(event.pointerId, event.clientX, event.clientY, event); };
    const click = event => {
      if (Date.now() >= suppressClickUntil.current) return;
      event.preventDefault(); event.stopPropagation();
    };
    const events = { touchstart: touchStart, touchmove: touchMove, touchend: end, touchcancel: end, pointerdown: pointerStart, pointermove: pointerMove, pointerup: end, pointercancel: end, click };
    for (const [name, handler] of Object.entries(events)) root.addEventListener(name, handler, { capture: true, passive: false });
    return () => { for (const [name, handler] of Object.entries(events)) root.removeEventListener(name, handler, true); };
  }, [enabled, resetKey, rootRef]);
}
