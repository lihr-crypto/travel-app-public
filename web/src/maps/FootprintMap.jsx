import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { clusterHomeMarkers } from '@/application/projections/home-clusters';
import { focusFootprintCamera } from './home-projection';

export default function FootprintMap({ markers, cameraRequest, cameraKey, selectedId, onMarker, onMapPress }) {
  const canvas = useRef(null), engine = useRef(null);
  const latest = useRef({ markers, cameraRequest, onMarker, onMapPress });
  useEffect(() => { latest.current = { markers, cameraRequest, onMarker, onMapPress }; }, [markers, cameraRequest, onMarker, onMapPress]);
  const [ready, setReady] = useState(0), [retry, setRetry] = useState(0), [message, setMessage] = useState('地图加载中…');
  const [viewport, setViewport] = useState({ latitudeDelta: 120, viewportHeightPx: 700 });
  const groups = useMemo(() => clusterHomeMarkers(markers, viewport), [markers, viewport]);

  useEffect(() => {
    const element = canvas.current;
    let map, observer, timer, disposed = false, loaded = false;
    try {
      const coordinate = latest.current.cameraRequest?.coordinates[0] || latest.current.markers[0]?.coordinate;
      map = new maplibregl.Map({
        container: element, style: 'https://tiles.openfreemap.org/styles/positron',
        center: coordinate ? [coordinate.longitude, coordinate.latitude] : [105, 35], zoom: coordinate ? 11 : 2,
        minZoom: 1, maxZoom: 18, renderWorldCopies: false, dragRotate: false, pitchWithRotate: false,
        attributionControl: { compact: true },
        locale: { 'NavigationControl.ZoomIn': '放大', 'NavigationControl.ZoomOut': '缩小', 'Map.Title': '旅行足迹地图', 'AttributionControl.ToggleAttribution': '地图版权信息' },
      });
      engine.current = map;
      map.touchZoomRotate.disableRotation();
      const project = () => {
        if (disposed) return;
        const bounds = map.getBounds();
        const next = { latitudeDelta: Math.max(0.00001, bounds.getNorth() - bounds.getSouth()), viewportHeightPx: element.clientHeight || 700 };
        setViewport(previous => previous.latitudeDelta === next.latitudeDelta && previous.viewportHeightPx === next.viewportHeightPx ? previous : next);
      };
      map.on('load', () => {
        if (disposed) return;
        loaded = true; clearTimeout(timer); setMessage(''); setReady(value => value + 1); project();
      });
      map.on('moveend', project);
      map.on('resize', project);
      map.on('click', () => latest.current.onMapPress?.());
      map.on('error', () => { if (!disposed && !loaded) setMessage('首页地图暂不可用'); });
      timer = setTimeout(() => { if (!disposed && !loaded) setMessage('首页地图暂不可用'); }, 20000);
      observer = new ResizeObserver(() => map.resize()); observer.observe(element);
    } catch { timer = setTimeout(() => { if (!disposed) setMessage('首页地图暂不可用'); }, 0); }
    return () => { disposed = true; clearTimeout(timer); observer?.disconnect(); engine.current = null; map?.remove(); };
  }, [retry]);

  useEffect(() => {
    const map = engine.current;
    if (!ready || !map) return;
    const pins = groups.map(marker => {
      const cluster = marker.variant === 'cluster', selected = marker.id === selectedId;
      const button = document.createElement('button');
      button.className = `footprint-marker ${marker.weight}${cluster ? ' cluster' : ''}${selected ? ' selected' : ''}`;
      button.type = 'button'; button.textContent = cluster ? String(marker.clusterTripIds.length) : '•';
      button.setAttribute('aria-label', cluster ? marker.label : `${marker.tripTitle} · ${marker.label}`);
      button.title = button.getAttribute('aria-label');
      button.addEventListener('click', event => { event.stopPropagation(); latest.current.onMarker?.(marker); });
      return new maplibregl.Marker({ element: button, anchor: 'center' }).setLngLat([marker.coordinate.longitude, marker.coordinate.latitude]).addTo(map);
    });
    return () => { pins.forEach(pin => pin.remove()); };
  }, [groups, ready, selectedId]);

  useEffect(() => { if (ready && engine.current) focusFootprintCamera(engine.current, latest.current.cameraRequest); }, [cameraKey, ready]);

  return <div className="web-map footprint-map"><div className="web-map-canvas" ref={canvas} aria-label="旅行足迹地图" />{message && <div className="map-message" role="status">{message}{message.includes('暂不可用') && <button className="text-button" onClick={() => { setMessage('地图加载中…'); setRetry(value => value + 1); }}>重新连接地图</button>}</div>}</div>;
}
