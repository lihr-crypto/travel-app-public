import { useEffect, useRef, useState } from 'react';
import { reversePlace, placeFromId, nearbyPlace } from './maps/providers';
import { classifySecondTap, poiRadiusMeters, SECOND_TAP_WINDOW_MS } from './maps/tap-rules';

// Turns Trip-map taps and search choices into one transient candidate. Nothing here writes: the candidate only becomes an
// Item after the user confirms it in the Item editor (Amendment §22/§23).
//   place      a labelled place: a tapped Google icon, the nearest AMap place, or a search result
//   coordinate a bare point the user confirmed with a second tap (named by reverse lookup when the provider can)
//   tentative  a first tap that found no labelled place; only marks the spot while waiting for the second tap
export default function useMapCandidate({ region, config, writable, scope, dayId }) {
  const [candidate, setCandidate] = useState(null), [hint, setHint] = useState(null);
  const [scopeSeen, setScopeSeen] = useState(scope);
  const pending = useRef(null), sequence = useRef(0), scopeRef = useRef(scope);
  // A candidate belongs to the screen it was made on: changing Trip, view or Day, or losing edit rights, discards it.
  if (scopeSeen !== scope) { setScopeSeen(scope); setCandidate(null); setHint(null); }
  // Leaving a screen also forgets its first tap and drops any lookup still in flight, so coming back finds a clean slate.
  useEffect(() => { scopeRef.current = scope; pending.current = null; sequence.current += 1; }, [scope]);
  // The hint and the tentative dot only live while a second tap would still count.
  useEffect(() => {
    if (hint === null) return;
    const timer = setTimeout(() => { pending.current = null; setHint(null); setCandidate(current => current?.kind === 'tentative' ? null : current); }, SECOND_TAP_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  const startCoordinate = (coordinate, request) => {
    setCandidate({ kind: 'coordinate', coordinate, enrichment: null, resolving: true, targetDayId: dayId });
    // Only the candidate an answer was asked for may take it: a newer tap or a closed card ignores a late reply.
    const settle = enrichment => { if (request === sequence.current) setCandidate(current => current?.coordinate === coordinate ? { ...current, enrichment, resolving: false } : current); };
    reversePlace(region, coordinate, config).then(settle, () => settle(null));
  };

  const tap = async ({ coordinate, placeId, zoom }) => {
    if (!writable) return;
    const request = ++sequence.current;
    const earlier = pending.current?.scope === scope ? pending.current : null;
    // A labelled icon is always its own pick, even right next to a waiting dot.
    const verdict = placeId ? 'restart' : classifySecondTap(earlier, coordinate, Date.now(), zoom);
    if (verdict === 'ignore') return;
    if (verdict === 'confirm') { pending.current = null; setHint(null); startCoordinate(coordinate, request); return; }
    pending.current = null;
    let place = null;
    try { place = region === 'global' ? (placeId ? await placeFromId(placeId, config) : null) : await nearbyPlace(coordinate, poiRadiusMeters(coordinate.latitude, zoom), config); } catch { place = null; }
    if (request !== sequence.current || scopeRef.current !== scope) return;
    if (place) { setHint(null); setCandidate({ kind: 'place', coordinate: place.coordinate, result: place, targetDayId: dayId, focus: false }); return; }
    pending.current = { coordinate, at: Date.now(), zoom, scope };
    setCandidate({ kind: 'tentative', coordinate }); setHint(request);
  };

  const choosePlace = result => {
    if (!writable) return;
    sequence.current += 1; pending.current = null; setHint(null);
    setCandidate({ kind: 'place', coordinate: result.coordinate, result, targetDayId: dayId, focus: true });
  };
  const close = () => { sequence.current += 1; pending.current = null; setHint(null); setCandidate(null); };
  const setTarget = targetDayId => setCandidate(current => current && current.kind !== 'tentative' ? { ...current, targetDayId } : current);
  const mapCandidate = candidate && { ...candidate.coordinate, tentative: candidate.kind === 'tentative', focus: Boolean(candidate.focus) };
  return { candidate, hint, mapCandidate, tap, choosePlace, close, setTarget };
}
