let amapLoad, googleLoad;
const loadScript = (url, callback) => new Promise((resolve, reject) => {
  const script = document.createElement('script'); const timeout = setTimeout(() => reject(new Error('地图连接超时')), 20000);
  script.src = url; script.async = true; script.onerror = () => { clearTimeout(timeout); reject(new Error('地图暂时无法连接')); };
  script.onload = () => { clearTimeout(timeout); resolve(callback?.()); };
  document.head.appendChild(script);
});
export function loadProvider(region, config) {
  if (region === 'china_mainland') {
    if (!config?.amapWebKey) return Promise.reject(new Error('国内地图尚未配置'));
    if (!amapLoad) {
      window._AMapSecurityConfig = { serviceHost: `${location.origin}/_AMapService` };
      amapLoad = loadScript(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.amapWebKey)}&plugin=AMap.PlaceSearch,AMap.Geocoder`, () => window.AMap).catch(error => { amapLoad = undefined; throw error; });
    }
    return amapLoad;
  }
  if (!config?.googleWebKey) return Promise.reject(new Error('海外地图尚未配置'));
  if (!googleLoad) googleLoad = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('海外地图连接超时')), 20000);
    window.__travelGoogleReady = () => { clearTimeout(timer); resolve(window.google.maps); };
    void loadScript(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleWebKey)}&v=weekly&loading=async&language=zh-CN&libraries=places,marker&callback=__travelGoogleReady`).catch(error => { clearTimeout(timer); reject(error); });
  }).catch(error => { googleLoad = undefined; throw error; });
  return googleLoad;
}

// A name in Chinese or Japanese (kana or CJK ideographs) reads better here than the English fallback Google often returns.
const CJK_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/;
export const hasCjk = text => CJK_TEXT.test(text || '');
const preferCjk = answers => answers.find(answer => hasCjk(answer?.name)) || answers[0] || null;
const GOOGLE_FIELDS = ['id', 'displayName', 'formattedAddress', 'location'];
const googleResult = place => ({ name: place.displayName, address: place.formattedAddress || null, provider: 'google', providerPlaceId: place.id, coordinate: { latitude: place.location.lat(), longitude: place.location.lng(), system: 'wgs84' }, regionLabel: null, metadata: { searchSnapshotAt: new Date().toISOString() } });
const amapPosition = location => typeof location.getLat === 'function' ? { latitude: location.getLat(), longitude: location.getLng() } : { latitude: location.lat, longitude: location.lng };

export async function searchPlaces(region, keyword, config, bias) {
  if (!keyword.trim()) return [];
  const SDK = await loadProvider(region, config);
  if (region === 'china_mainland') return new Promise((resolve, reject) => {
    new SDK.PlaceSearch({ pageSize: 20, citylimit: false, extensions: 'base' }).search(keyword, (status, result) => {
      if (status === 'no_data') { resolve([]); return; }
      if (status !== 'complete') { reject(new Error('地点搜索暂不可用，请稍后重试。')); return; }
      resolve((result.poiList?.pois ?? []).filter(poi => poi.location).map(poi => ({ name: poi.name, address: poi.address || null, provider: 'amap', providerPlaceId: poi.id || null, coordinate: { latitude: poi.location.getLat(), longitude: poi.location.getLng(), system: 'gcj02' }, regionLabel: poi.cityname || poi.adname || null, metadata: { city: poi.cityname || null, adcode: poi.adcode || null } })));
    });
  });
  const { Place } = await SDK.importLibrary('places');
  const ask = language => Place.searchByText({ textQuery: keyword, fields: GOOGLE_FIELDS, language, maxResultCount: 20, ...(bias ? { locationBias: { lat: bias.latitude, lng: bias.longitude } } : {}) }).then(({ places }) => places.filter(place => place.location).map(googleResult));
  // A Japanese query is answered in Japanese first, so it rarely needs the second request.
  const [first, second] = /[\u3040-\u30ff]/.test(keyword) ? ['ja', 'zh-CN'] : ['zh-CN', 'ja'];
  const results = await ask(first);
  if (results.every(result => hasCjk(result.name))) return results;
  // Only a naming aid: if the second answer fails, the first answer stands.
  const other = new Map((await ask(second).catch(() => [])).map(result => [result.providerPlaceId, result]));
  return results.map(result => hasCjk(result.name) ? result : hasCjk(other.get(result.providerPlaceId)?.name) ? other.get(result.providerPlaceId) : result);
}

// The Place behind a labelled icon the user tapped on the Google map.
const detailCache = new Map();
export async function placeFromId(placeId, config) {
  const SDK = await loadProvider('global', config);
  const { Place } = await SDK.importLibrary('places');
  // Tapping the same icon again within a session must not pay for the same Place Details twice.
  const fetch = async language => {
    const key = `${placeId}|${language}`;
    if (!detailCache.has(key)) {
      const place = new Place({ id: placeId, requestedLanguage: language });
      await place.fetchFields({ fields: GOOGLE_FIELDS });
      detailCache.set(key, place.location && place.displayName ? googleResult(place) : null);
    }
    return detailCache.get(key);
  };
  const first = await fetch('zh-CN');
  if (first && hasCjk(first.name)) return first;
  const local = await fetch('ja').catch(() => null);
  return preferCjk([first, local].filter(Boolean));
}

// The nearest labelled place within `radius` metres of a tap on the AMap map; the base map's own icons are not clickable.
export function nearbyPlace(coordinate, radius, config) {
  return loadProvider('china_mainland', config).then(SDK => new Promise(resolve => new SDK.Geocoder({ extensions: 'all', radius: Math.round(radius) }).getAddress([coordinate.longitude, coordinate.latitude], (status, result) => {
    const poi = (status === 'complete' ? result.regeocode?.pois ?? [] : []).filter(entry => entry.location && Number(entry.distance) <= radius).sort((a, b) => Number(a.distance) - Number(b.distance))[0];
    const city = result?.regeocode?.addressComponent?.city || null;
    resolve(poi ? { name: poi.name, address: poi.address || null, provider: 'amap', providerPlaceId: poi.id || null, coordinate: { ...amapPosition(poi.location), system: 'gcj02' }, regionLabel: city, metadata: { city, adcode: result.regeocode.addressComponent?.adcode || null } } : null);
  })));
}

// Google has no reverse-geocoding call on the Places-only key, so the nearest place within a small circle names the tap.
export const GOOGLE_REVERSE_RADIUS_METRES = 30;

export async function reversePlace(region, coordinate, config) {
  const SDK = await loadProvider(region, config);
  if (region === 'china_mainland') return new Promise(resolve => new SDK.Geocoder({ extensions: 'base' }).getAddress([coordinate.longitude, coordinate.latitude], (status, result) => {
    const address = status === 'complete' ? result.regeocode?.formattedAddress : null;
    resolve(address ? { name: address, address, coordinate, provider: 'amap', providerPlaceId: null, regionLabel: result.regeocode.addressComponent?.city || null, metadata: null } : null);
  }));
  const { Place } = await SDK.importLibrary('places');
  const nearest = async language => {
    const { places } = await Place.searchNearby({ fields: ['id', 'displayName', 'formattedAddress'], locationRestriction: { center: { lat: coordinate.latitude, lng: coordinate.longitude }, radius: GOOGLE_REVERSE_RADIUS_METRES }, rankPreference: 'DISTANCE', maxResultCount: 1, language });
    const place = places?.[0];
    return place?.displayName ? { name: place.displayName, address: place.formattedAddress || null, providerPlaceId: place.id || null } : null;
  };
  const first = await nearest('zh-CN');
  if (!first) return null;
  const best = hasCjk(first.name) ? first : preferCjk([first, await nearest('ja').catch(() => null)].filter(Boolean));
  // The echoed coordinate stays the tapped point: the command rejects an answer that describes a different pick.
  return { name: best.name, address: best.address, coordinate, provider: 'google', providerPlaceId: best.providerPlaceId, regionLabel: null, metadata: { searchSnapshotAt: new Date().toISOString() } };
}
