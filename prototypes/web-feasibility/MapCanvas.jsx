import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapPin, getMapPinGeometry } from '@/infrastructure/map/map-pin';

let amapPromise;
let googlePromise;

function loadAmap(config) {
  if (!config.amapWebKey || !config.amapSecurityConfigured) throw new Error('高德网页 Key／安全密钥未配置');
  return amapPromise ??= new Promise((resolve, reject) => {
    window._AMapSecurityConfig = { serviceHost: `${location.origin}/_AMapService` };
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.amapWebKey)}&plugin=AMap.PlaceSearch`;
    script.onload = () => resolve(window.AMap);
    script.onerror = () => { amapPromise = undefined; reject(new Error('高德网页 SDK 无法加载')); };
    document.head.appendChild(script);
  });
}

function loadGoogle(config) {
  if (!config.googleWebKey) throw new Error('Google 网页 Key 未配置');
  return googlePromise ??= new Promise((resolve, reject) => {
    window.__travelWebGoogleReady = () => resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleWebKey)}&v=weekly&loading=async&libraries=places,marker&callback=__travelWebGoogleReady`;
    script.onerror = () => { googlePromise = undefined; reject(new Error('Google 网页 SDK 无法加载')); };
    document.head.appendChild(script);
  });
}

export async function searchWebPlaces(region, keyword, config) {
  if (!keyword.trim()) return [];
  if (region === 'china_mainland') {
    const AMap = await loadAmap(config);
    return new Promise((resolve, reject) => {
      new AMap.PlaceSearch({ city: '北京', citylimit: false, pageSize: 10 }).search(keyword, (status, result) => {
        if (status === 'no_data') return resolve([]);
        if (status !== 'complete') return reject(new Error(`高德搜索失败：${result?.info || status}`));
        resolve((result.poiList?.pois ?? []).map((poi) => ({
          name: poi.name, address: poi.address || null, provider: 'amap', providerPlaceId: poi.id || null,
          coordinate: { latitude: poi.location.getLat(), longitude: poi.location.getLng(), system: 'gcj02' },
          regionLabel: poi.cityname || poi.adname || null, metadata: { prototypeWebSearch: true },
        })));
      });
    });
  }
  const maps = await loadGoogle(config);
  const { Place } = await maps.importLibrary('places');
  const { places } = await Place.searchByText({
    textQuery: keyword, fields: ['id', 'displayName', 'formattedAddress', 'location'],
    language: 'zh-CN', region: 'JP', maxResultCount: 10,
    locationBias: { lat: 35.68, lng: 139.7 },
  });
  return places.filter((poi) => poi.location).map((poi) => ({
    name: poi.displayName, address: poi.formattedAddress || null, provider: 'google', providerPlaceId: poi.id || null,
    coordinate: { latitude: poi.location.lat(), longitude: poi.location.lng(), system: 'wgs84' },
    regionLabel: '日本', metadata: { prototypeWebSearch: true },
  }));
}

export default function MapCanvas({ region, config, markers, selectedId, onSelect, onStatus }) {
  const container = useRef(null);
  const instance = useRef(null);
  const markerCleanup = useRef(() => {});
  const [ready, setReady] = useState(0);
  const [message, setMessage] = useState('正在加载真实地图…');
  const configured = region === 'china_mainland'
    ? Boolean(config?.amapWebKey && config.amapSecurityConfigured)
    : Boolean(config?.googleWebKey);

  useEffect(() => {
    let cancelled = false;
    const canvas = container.current;
    if (!configured) {
      const text = config?.mapServicesUnavailable ? '地图服务暂不可用，行程仍可查看／编辑' : `${region === 'china_mainland' ? '高德' : 'Google'} 地图未验证：需要网页 Key`;
      onStatus(text);
      return;
    }
    const load = region === 'china_mainland' ? loadAmap(config) : loadGoogle(config);
    load.then(async (SDK) => {
      if (region === 'global') await SDK.importLibrary('marker');
      if (cancelled) return;
      const map = region === 'china_mainland'
        ? new SDK.Map(canvas, { zoom: 12, center: [116.39, 39.9], resizeEnable: true })
        : new SDK.Map(canvas, { zoom: 12, center: { lat: 35.68, lng: 139.7 }, mapId: 'DEMO_MAP_ID', disableDefaultUI: false });
      instance.current = { map, SDK, region };
      const loaded = () => {
        if (cancelled) return;
        const text = `${region === 'china_mainland' ? '高德' : 'Google'} 底图已加载；图钉位置仍需人工核对`;
        setMessage(text); onStatus(text);
      };
      if (region === 'china_mainland') map.on('complete', loaded);
      else SDK.event.addListenerOnce(map, 'tilesloaded', loaded);
      setMessage('地图已初始化，等待底图加载…');
      onStatus('地图已初始化，等待底图加载…');
      setReady((x) => x + 1);
    }).catch((error) => { if (!cancelled) { setMessage(error.message); onStatus(error.message); } });
    return () => {
      cancelled = true; markerCleanup.current();
      const old = instance.current; instance.current = null;
      if (old?.region === 'china_mainland') old.map.destroy();
      if (canvas) canvas.replaceChildren();
    };
  }, [configured, region, config, onStatus]);

  useEffect(() => {
    markerCleanup.current();
    if (!ready || !instance.current) return;
    const { map, SDK, region: provider } = instance.current;
    const entries = markers.map((marker, index) => {
      const element = document.createElement('div');
      element.title = marker.name;
      element.setAttribute('aria-label', marker.name);
      element.style.cursor = 'pointer';
      const root = createRoot(element);
      const selected = marker.id === selectedId;
      root.render(<MapPin variant={selected ? 'selected' : 'normal'} ordinal={index + 1} />);
      const geometry = getMapPinGeometry(selected);
      const pin = provider === 'china_mainland'
        ? new SDK.Marker({ map, position: [marker.coordinate.longitude, marker.coordinate.latitude], content: element, zIndex: selected ? 1000 : index + 10, offset: new SDK.Pixel(-geometry.tipX, -geometry.tipY) })
        : new SDK.marker.AdvancedMarkerElement({ map, position: { lat: marker.coordinate.latitude, lng: marker.coordinate.longitude }, zIndex: selected ? 1000 : index + 10, gmpClickable: true, title: marker.name, anchorLeft: `-${geometry.tipX}px`, anchorTop: `-${geometry.tipY}px` });
      const click = () => onSelect(marker.id);
      if (provider === 'china_mainland') pin.on('click', click);
      else { pin.append(element); pin.addEventListener('gmp-click', click); }
      return { pin, root, click };
    });
    if (markers.length) {
      const selected = markers.find((x) => x.id === selectedId);
      if (selected) {
        if (provider === 'china_mainland') map.setZoomAndCenter(16, [selected.coordinate.longitude, selected.coordinate.latitude], true);
        else { map.setZoom(16); map.setCenter({ lat: selected.coordinate.latitude, lng: selected.coordinate.longitude }); }
      } else if (provider === 'china_mainland') map.setFitView(entries.map((x) => x.pin), true, [64, 24, 48, 24]);
      else {
        const bounds = new SDK.LatLngBounds();
        markers.forEach((x) => bounds.extend({ lat: x.coordinate.latitude, lng: x.coordinate.longitude }));
        map.fitBounds(bounds, 24);
      }
    }
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      entries.forEach(({ pin, root, click }) => {
        if (provider === 'china_mainland') { pin.off('click', click); map.remove(pin); }
        else { pin.removeEventListener('gmp-click', click); pin.map = null; }
        root.unmount();
      });
    };
    markerCleanup.current = cleanup;
    return cleanup;
  }, [ready, markers, selectedId, onSelect]);

  return <div className="map-area">
    <div ref={container} className="map-canvas" aria-label="真实地图画布" />
    {!configured && <div className="map-unavailable"><strong>{config?.mapServicesUnavailable ? '地图服务暂不可用' : `${region === 'china_mainland' ? '高德' : 'Google'} 地图未验证：需要网页 Key`}</strong><p>{config?.mapServicesUnavailable ? '已保存的行程可继续查看／编辑；下方按钮代表保存的地点，不是离线底图。' : '下面是已有组件的样例预览，未冒充地图或搜索结果。'}</p><div className="sample-pins">{markers.map((marker, i) => <button key={marker.id} onClick={() => onSelect(marker.id)} aria-label={`已保存地点 ${i + 1}`}><MapPin variant={marker.id === selectedId ? 'selected' : 'normal'} ordinal={i + 1} /></button>)}</div></div>}
    {configured && <div className="map-status">{message}</div>}
  </div>;
}
