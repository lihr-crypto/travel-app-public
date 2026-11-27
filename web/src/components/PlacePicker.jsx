import React, { useMemo, useRef, useState } from 'react';
import { usePlan, readableError } from '../PlanContext';
import { matchingPlace } from '../utils';
import { searchPlaces, reversePlace } from '../maps/providers';
import WebMap from '../maps/WebMap';
import ItemIcon from './ItemIcon';

export default function PlacePicker({ trip, onSelect, onBack, initialQuery = '' }) {
  const { state, config, refreshMaps } = usePlan();
  const [query, setQuery] = useState(initialQuery), [results, setResults] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [mapMode, setMapMode] = useState(false), [picked, setPicked] = useState(null), [label, setLabel] = useState('');
  const latestPick = useRef(null), userNamed = useRef(false);
  const bias = useMemo(() => { const item = state.items.find(item => item.tripId === trip.id && matchingPlace(state.places.find(place => place.id === item.placeId), trip.mapRegion)); return state.places.find(place => place.id === item?.placeId)?.coordinate; }, [state, trip]);
  const search = async event => {
    event.preventDefault(); setLoading(true); setError('');
    try { const found = await searchPlaces(trip.mapRegion, query, config, bias); setResults(found); if (!found.length) setError('没有找到地点，换个关键词或在地图上选点。'); }
    catch (error) { setError(readableError(error)); }
    finally { setLoading(false); }
  };
  const pick = async coordinate => {
    latestPick.current = coordinate; userNamed.current = false;
    setPicked({ coordinate, enrichment: null }); setLabel('');
    try { const enrichment = await reversePlace(trip.mapRegion, coordinate, config); if (latestPick.current !== coordinate) return; setPicked({ coordinate, enrichment }); if (enrichment?.name && !userNamed.current) setLabel(enrichment.name); } catch { /* coordinate-only remains usable */ }
  };
  const choose = () => {
    const provider = trip.mapRegion === 'china_mainland' ? 'amap' : 'google';
    const enrichment = label.trim() ? { name: label.trim(), address: picked.enrichment?.address || null, coordinate: picked.coordinate, provider, providerPlaceId: null, regionLabel: picked.enrichment?.regionLabel || null, metadata: { userNamed: true } } : picked.enrichment;
    onSelect({ kind: 'map-picker', coordinate: picked.coordinate, provider, enrichment });
  };
  return <div className="place-picker"><div className="subpage-title"><button className="text-button" onClick={onBack}>‹ 返回填写</button><span>{mapMode ? '在地图上选择地点' : '选择地点'}</span></div>{!mapMode ? <><form className="place-search" onSubmit={search}><input aria-label="搜索地点" placeholder={trip.mapRegion === 'china_mainland' ? '搜索地点、酒店或车站' : '搜索城市、景点或酒店'} value={query} onChange={event => setQuery(event.target.value)} autoFocus /><button className="button" disabled={loading || !query.trim() || config?.unavailable}>{loading ? '搜索中…' : '搜索'}</button></form>{error && <p className="inline-error" role="status">{error}</p>}<div className="search-results">{results.map((result, index) => <button key={`${result.providerPlaceId}-${index}`} className="search-result" onClick={() => onSelect({ kind: 'search', result })}><span className="result-icon"><ItemIcon name="place"/></span><span><strong>{result.name}</strong><small>{result.address || result.regionLabel}</small></span><span>›</span></button>)}</div>{trip.mapRegion === 'global' && results.length > 0 && <p className="provider-attribution" translate="no">Google Maps</p>}<button className="button button-soft picker-map-action" onClick={() => setMapMode(true)}>在地图上选择地点</button></> : <><div className="picker-map"><WebMap onRetry={refreshMaps} region={trip.mapRegion} config={config} mode="picker" onPick={pick} markers={picked ? [{ id: 'picked', coordinate: picked.coordinate, label: label || '选中地点', variant: 'selected', ordinal: 1 }] : []} cameraKey="picker" /><span className="map-hint">点击地图选择准确位置</span></div>{picked && <div className="picked-info"><label>地点名称（可选）<input value={label} onChange={event => { userNamed.current = true; setLabel(event.target.value); }} placeholder="填写便于辨认的名称" /></label><small>{picked.coordinate.latitude.toFixed(6)}, {picked.coordinate.longitude.toFixed(6)}</small><button className="button full-width" onClick={choose}>使用这个地点</button></div>}<button className="text-button" onClick={() => setMapMode(false)}>返回搜索</button></>}</div>;
}
