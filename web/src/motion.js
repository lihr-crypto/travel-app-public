import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';

const reducedMotion = '(prefers-reduced-motion: reduce)';
let pending = [], scheduled = false, capture = null, active = null, nextKind = 'dialog';

function canAnimate() {
  return typeof document !== 'undefined' && typeof window !== 'undefined' && typeof document.startViewTransition === 'function'
    && document.visibilityState !== 'hidden' && !window.matchMedia?.(reducedMotion).matches
    && !document.querySelector('.modal .picker-map');
}
function applyPending(sync) {
  const batch = pending; pending = [];
  const commit = () => batch.forEach(update => update());
  if (sync && batch.length) flushSync(commit); else commit();
}
function skipActive() {
  try { active?.transition?.skipTransition(); } catch { /* Animation failure must not block navigation. */ }
}
function finish(record) {
  if (capture === record) capture = null;
  if (active === record) {
    active = null;
    document.documentElement.removeAttribute('data-travel-motion');
  }
  schedule();
}
function applyImmediately() {
  if (capture) capture.applied = true;
  capture = null;
  skipActive(); active = null; nextKind = 'dialog';
  if (typeof document !== 'undefined') document.documentElement.removeAttribute('data-travel-motion');
  applyPending(false);
}
function start() {
  scheduled = false;
  if (!pending.length) return;
  if (!canAnimate()) { applyImmediately(); return; }
  skipActive();
  const record = { applied: false, transition: null };
  active = record; capture = record;
  document.documentElement.setAttribute('data-travel-motion', nextKind);
  nextKind = 'dialog';
  const apply = () => {
    if (record.applied) return;
    record.applied = true;
    if (capture === record) capture = null;
    applyPending(true);
  };
  try { record.transition = document.startViewTransition(apply); }
  catch { apply(); finish(record); return; }
  // Skipped/interrupted transitions reject ready; the DOM update still runs.
  record.transition.ready.catch(() => {});
  record.transition.updateCallbackDone.then(() => { apply(); schedule(); }, () => { apply(); finish(record); });
  record.transition.finished.then(() => { apply(); finish(record); }, () => { apply(); finish(record); });
}
function schedule() {
  if (!pending.length || scheduled || capture) return;
  scheduled = true;
  queueMicrotask(start);
}

// Only user navigation and window state use this queue. Inputs, commands, map
// updates, scrolling and drag positions keep their existing immediate updates.
export function transitionUpdate(update, { kind = 'dialog', animate = true } = {}) {
  pending.push(update);
  if (!animate || !canAnimate()) { applyImmediately(); return; }
  if (kind === 'route') {
    if (capture) document.documentElement.setAttribute('data-travel-motion', 'route');
    else nextKind = 'route';
  }
  schedule();
}

export function useMotionState(initial) {
  const [value, setValue] = useState(initial);
  const setWithMotion = useCallback(next => transitionUpdate(() => setValue(next)), []);
  return [value, setWithMotion];
}
