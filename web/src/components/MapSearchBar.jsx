import React, { useEffect, useRef, useState } from 'react';
import { readableError } from '../PlanContext';
import { searchPlaces } from '../maps/providers';

// Search box floating on the Trip map. A result is only proposed (onSelect); nothing is saved from here.
export default function MapSearchBar({ trip, config, bias, onSelect }) {
  const [query, setQuery] = useState(''), [results, setResults] = useState([]), [busy, setBusy] = useState(false), [note, setNote] = useState(''), [open, setOpen] = useState(false);
  const latest = useRef(0), box = useRef(null);
  // Tapping anywhere outside the box closes the result list.
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const unavailable = !config || config.unavailable;
  const submit = async event => {
    event.preventDefault();
    const text = query.trim();
    if (!text || unavailable) return;
    // A late answer to an older search must never replace a newer one.
    const request = ++latest.current;
    setBusy(true); setNote('');
    try {
      const found = await searchPlaces(trip.mapRegion, text, config, bias);
      if (request !== latest.current) return;
      setResults(found); setNote(found.length ? '' : '没有找到地点，换个关键词试试。'); setOpen(true);
    } catch (error) {
      if (request !== latest.current) return;
      setResults([]); setNote(readableError(error)); setOpen(true);
    } finally { if (request === latest.current) setBusy(false); }
  };
  const clear = () => { latest.current += 1; setQuery(''); setResults([]); setNote(''); setOpen(false); setBusy(false); };
  const choose = result => { setOpen(false); onSelect(result); };
  return <div className="map-search" ref={box}>
    <form role="search" className="map-search-field" onSubmit={submit}>
      <input type="search" aria-label="搜索地点" enterKeyHint="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder={trip.mapRegion === 'china_mainland' ? '搜索地点、酒店或车站' : '搜索城市、景点或酒店'} />
      {query && <button type="button" className="map-search-clear" aria-label="清除搜索" onClick={clear}>×</button>}
      <button type="submit" className="map-search-go" disabled={busy || !query.trim() || unavailable}>{busy ? '搜索中…' : '搜索'}</button>
    </form>
    {open && (results.length > 0 || note) && <div className="map-search-results">
      {note && <p className="map-search-note" role="status">{note}</p>}
      {results.map((result, index) => <button type="button" key={`${result.providerPlaceId}-${index}`} className="map-search-result" onClick={() => choose(result)}><strong>{result.name}</strong><small>{result.address || result.regionLabel || ''}</small></button>)}
      {trip.mapRegion === 'global' && results.length > 0 && <p className="provider-attribution" translate="no">Google Maps</p>}
    </div>}
  </div>;
}
