import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getMapPinGeometry } from '@/infrastructure/map/map-pin';
import WebPin from './WebPin';
import { buildMarkerClusters, markerProjectionKey } from '@/infrastructure/map/marker-clustering';
import { loadProvider } from './providers';
import { fitMarkers as fit, activateMarkerGroup } from './camera';

// A pin press must not also count as a map tap if a provider follows it with a map click.
// (A map click followed by a pin press is harmless: the press discards the candidate.)
const PIN_PRESS_GUARD_MS = 400;

export default function WebMap({ region, config, onRetry, markers = [], mode = 'day', selectedId, onMarker, onPick, onTap, candidate = null, cameraKey = '', bottomPadding = 0 }) {
  const canvas = useRef(null), engine = useRef(null), cleanPins = useRef(() => {}), pinPressAt = useRef(0);
  // `onPick` reports every tap as a bare coordinate (the crosshair picker). `onTap` is for the Trip map: it also reports the
  // place id of a labelled Google icon and the zoom, and turns Google's clickable icons on.
  const markerRef = useRef(markers), pressRef = useRef(onMarker), pickRef = useRef(onPick), tapRef = useRef(onTap), selectedRef = useRef(selectedId), paddingRef = useRef(bottomPadding);
  useEffect(() => { markerRef.current = markers; pressRef.current = onMarker; pickRef.current = onPick; tapRef.current = onTap; selectedRef.current = selectedId; paddingRef.current = bottomPadding; }, [markers, onMarker, onPick, onTap, selectedId, bottomPadding]);
  const iconTaps = Boolean(onTap);
  const [ready, setReady] = useState(0), [message, setMessage] = useState('地图加载中…');
  const [projection, setProjection] = useState(null);
  const [retry, setRetry] = useState(0);
  const groups = useMemo(() => mode === 'day' || mode === 'picker' ? markers.map(marker => ({ marker, members: [marker] })) : buildMarkerClusters(markers, projection), [mode, markers, projection]);

  useEffect(() => {
    let cancelled = false;
    const element = canvas.current;
    const cleanup = [];
    if (!config) return;
    loadProvider(region, config).then(async SDK => {
      if (region === 'global') await SDK.importLibrary('marker');
      if (cancelled) return;
      setMessage('地图加载中…');
      const first = markerRef.current[0]?.coordinate;
      const center = first || (region === 'china_mainland' ? { latitude: 35.2, longitude: 104.2 } : { latitude: 35.68, longitude: 139.7 });
      const map = region === 'china_mainland'
        ? new SDK.Map(element, { zoom: first ? 12 : 4, center: [center.longitude, center.latitude], resizeEnable: true })
        : new SDK.Map(element, { zoom: first ? 12 : 4, center: { lat: center.latitude, lng: center.longitude }, mapId: 'DEMO_MAP_ID', disableDefaultUI: true, zoomControl: true, streetViewControl: false, fullscreenControl: false, clickableIcons: false });
      const state = { SDK, map, overlay: null, region, project: null }; engine.current = state;
      const project = () => {
        if (cancelled || !element.clientWidth || !element.clientHeight) return;
        const input = markerRef.current;
        let points;
        if (region === 'china_mainland') points = input.map(marker => { const p = map.lngLatToContainer([marker.coordinate.longitude, marker.coordinate.latitude]); return { id: marker.id, x: p.x, y: p.y }; });
        else {
          const projection = state.overlay?.getProjection(); if (!projection) return;
          points = input.map(marker => { const p = projection.fromLatLngToContainerPixel(new SDK.LatLng(marker.coordinate.latitude, marker.coordinate.longitude)); return { id: marker.id, x: p.x, y: p.y }; });
        }
        const next = { requestKey: markerProjectionKey(input), width: element.clientWidth, height: element.clientHeight, points };
        setProjection(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      };
      state.project = project;
      const loaded = () => { if (!cancelled) { setMessage(''); project(); } };
      const pick = (event) => {
        const tap = tapRef.current, choose = pickRef.current;
        if (!(tap || choose) || Date.now() - pinPressAt.current < PIN_PRESS_GUARD_MS) return;
        const p = region === 'china_mainland' ? event.lnglat : event.latLng;
        if (!p) return;
        const coordinate = { latitude: region === 'china_mainland' ? p.getLat() : p.lat(), longitude: region === 'china_mainland' ? p.getLng() : p.lng(), system: region === 'china_mainland' ? 'gcj02' : 'wgs84' };
        if (!tap) { choose(coordinate); return; }
        // A labelled Google icon arrives with its place id; stopping the event keeps Google's own info window closed.
        const placeId = region === 'global' ? event.placeId || null : null;
        if (placeId) event.stop?.();
        tap({ coordinate, placeId, zoom: map.getZoom() });
      };
      if (region === 'china_mainland') {
        for (const event of ['complete', 'moveend', 'zoomend', 'resize']) { const handler = event === 'complete' ? loaded : project; map.on(event, handler); cleanup.push(() => map.off(event, handler)); }
        map.on('click', pick); cleanup.push(() => map.off('click', pick));
      } else {
        const overlay = new SDK.OverlayView(); overlay.onAdd = () => {}; overlay.draw = project; overlay.onRemove = () => {}; overlay.setMap(map); state.overlay = overlay;
        for (const [event, handler] of [['tilesloaded', loaded], ['idle', project], ['click', pick]]) { const listener = map.addListener(event, handler); cleanup.push(() => listener.remove()); }
      }
      setReady(value => value + 1);
    }).catch(() => { if (!cancelled) setMessage('地图暂不可用，行程仍可查看和编辑'); });
    return () => { cancelled = true; cleanPins.current(); cleanup.forEach(fn => fn()); const old = engine.current; engine.current = null; old?.overlay?.setMap(null); if (old?.region === 'china_mainland') old.map.destroy(); element?.replaceChildren(); };
  }, [region, config, retry]);

  useEffect(() => {
    cleanPins.current();
    const instance = engine.current; if (!ready || !instance) return;
    const { SDK, map } = instance;
    const entries = groups.map(({ marker, members }) => {
      const selected = marker.id === selectedId || members.some(member => member.id === selectedId);
      const count = marker.clusterCount;
      const div = document.createElement('div'); div.title = marker.label || marker.name; div.setAttribute('aria-label', marker.label || marker.name); div.style.cursor = 'pointer';
      const root = createRoot(div); root.render(<WebPin variant={selected ? 'selected' : count ? 'cluster' : 'normal'} ordinal={mode === 'day' ? marker.ordinal : undefined} clusterCount={count} />);
      const geo = count ? { tipX: selected ? 26 : 24, tipY: selected ? 26 : 24 } : getMapPinGeometry(selected);
      const pin = region === 'china_mainland'
        ? new SDK.Marker({ map, position: [marker.coordinate.longitude, marker.coordinate.latitude], content: div, offset: new SDK.Pixel(-geo.tipX, -geo.tipY), zIndex: selected ? 1000 : 20 })
        : new SDK.marker.AdvancedMarkerElement({ map, position: { lat: marker.coordinate.latitude, lng: marker.coordinate.longitude }, title: marker.label || marker.name, anchorLeft: `-${geo.tipX}px`, anchorTop: `-${geo.tipY}px`, gmpClickable: true, zIndex: selected ? 1000 : 20 });
      if (region === 'global') pin.append(div);
      const press = () => { pinPressAt.current = Date.now(); activateMarkerGroup({marker,members},instance,bottomPadding,pressRef.current); };
      if (region === 'china_mainland') pin.on('click', press); else pin.addEventListener('gmp-click', press);
      return { pin, root, press };
    });
    let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; entries.forEach(({ pin, root, press }) => { if (region === 'china_mainland') { pin.off('click', press); map.remove(pin); } else { pin.removeEventListener('gmp-click', press); pin.map = null; } root.unmount(); }); };
    cleanPins.current = dispose; return dispose;
  }, [groups, ready, region, selectedId, mode, bottomPadding]);

  // The candidate is a separate, non-interactive pin: it never joins `markers`, so it cannot move the camera or clusters.
  // A tentative candidate (a first tap that found no labelled place) is drawn as a small dot instead of a pin.
  const candidateLat = candidate?.latitude, candidateLng = candidate?.longitude, candidateTentative = Boolean(candidate?.tentative);
  const candidateFocus = candidate?.focus ? `${candidateLat},${candidateLng}` : '';
  useEffect(() => {
    const instance = engine.current;
    if (!ready || !instance || candidateLat == null || candidateLng == null) return;
    const { SDK, map } = instance;
    const geo = candidateTentative ? { tipX: 10, tipY: 10 } : getMapPinGeometry(true);
    const div = document.createElement('div'); div.title = '待添加地点'; div.setAttribute('aria-label', '待添加地点'); div.style.pointerEvents = 'none';
    let root = null;
    if (candidateTentative) Object.assign(div.style, { width: '20px', height: '20px', boxSizing: 'border-box', borderRadius: '50%', background: '#086050', border: '3px solid #fff', boxShadow: '0 1px 4px #0004', opacity: '0.85' });
    else { root = createRoot(div); root.render(<WebPin variant="candidate" />); }
    const pin = region === 'china_mainland'
      ? new SDK.Marker({ map, position: [candidateLng, candidateLat], content: div, offset: new SDK.Pixel(-geo.tipX, -geo.tipY), zIndex: 1100 })
      : new SDK.marker.AdvancedMarkerElement({ map, position: { lat: candidateLat, lng: candidateLng }, title: '待添加地点', anchorLeft: `-${geo.tipX}px`, anchorTop: `-${geo.tipY}px`, zIndex: 1100 });
    if (region === 'global') pin.append(div);
    // The map may already be destroyed when the engine itself is rebuilt, so removal must not throw.
    return () => { try { if (region === 'china_mainland') map.remove(pin); else pin.map = null; } catch { /* map already gone */ } root?.unmount(); };
  }, [candidateLat, candidateLng, candidateTentative, ready, region]);

  // A place chosen from search may lie off screen: bring it into the area above the sheet, once per new choice.
  useEffect(() => {
    const instance = engine.current;
    if (!ready || !instance || !candidateFocus) return;
    const [latitude, longitude] = candidateFocus.split(',').map(Number);
    fit([{ coordinate: { latitude, longitude } }], instance, paddingRef.current);
  }, [candidateFocus, ready]);

  useEffect(() => { if (ready && region === 'global') engine.current?.map.setClickableIcons?.(iconTaps); }, [ready, region, iconTaps]);

  useEffect(() => { const current = engine.current; if (current && markerRef.current.length) { fit(markerRef.current, current, bottomPadding); current.project?.(); } }, [cameraKey, ready, bottomPadding]);
  useEffect(() => {
    const current = engine.current, marker = markerRef.current.find(marker => marker.id === selectedId);
    if (!current || !marker || mode !== 'day') return;
    if (region === 'china_mainland') current.map.setZoomAndCenter(16, [marker.coordinate.longitude, marker.coordinate.latitude], true);
    else current.map.moveCamera({ center: { lat: marker.coordinate.latitude, lng: marker.coordinate.longitude }, zoom: 16 });
  }, [selectedId, ready, mode, region]);

  return <div className="web-map"><div className="web-map-canvas" ref={canvas} aria-label={region === 'china_mainland' ? '大陆行程地图' : '海外行程地图'} />{message && <div className="map-message" role="status">{message}{message.includes('暂不可用')&&<button className="text-button" onClick={async()=>{setMessage('地图加载中…');await onRetry?.();setRetry(value=>value+1);}}>重新连接地图</button>}</div>}</div>;
}

