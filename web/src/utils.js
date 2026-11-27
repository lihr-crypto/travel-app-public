import { deviceLocalTravelDate } from '@/domain/common/travel-date';
import { deriveTripLifecycle } from '@/domain/trip/lifecycle';
export const today = deviceLocalTravelDate;
export const lifecycle = (trip) => deriveTripLifecycle(trip, today());
export const TYPE_LABELS = { sightseeing: '景点', food: '餐饮', hotel: '住宿', activity: '活动', transport: '交通', custom: '其他' };
export const PERIODS = { morning: '上午', noon: '中午', afternoon: '下午', night: '晚上' };
export const TRANSPORT = { flight: '航班', train: '火车', bus: '巴士', ferry: '轮渡', car: '用车' };
export function chineseDate(value, withYear = true) { if (!value) return ''; const [y, m, d] = value.split('-').map(Number); return `${withYear ? `${y}年` : ''}${m}月${d}日`; }
export const dateWithWeek = (date) => { const [y,m,d] = date.split('-').map(Number); return `${chineseDate(date, false)} 周${'日一二三四五六'[new Date(y,m-1,d,12).getDay()]}`; };
export function daysFor(state, tripId) { return state.days.filter(day => day.tripId === tripId).sort((a,b) => a.dayIndex-b.dayIndex || a.id.localeCompare(b.id)); }
export function itemsFor(state, tripId, dayId) { return state.items.filter(item => item.tripId === tripId && item.dayId === dayId).sort((a,b) => a.sortOrder-b.sortOrder || a.id.localeCompare(b.id)); }
export function matchingPlace(place, region) { return place && (region === 'china_mainland' ? place.provider === 'amap' && place.coordinate.system === 'gcj02' : place.provider === 'google' && place.coordinate.system === 'wgs84'); }
export function itemTime(item) { return item.timeMode === 'period' ? PERIODS[item.period] : (item.startDateTime || item.endDateTime)?.slice(11,16) || '待定'; }
export function externalMap(place) {
  if (!place) return '#';
  const { latitude, longitude } = place.coordinate;
  return place.provider === 'amap'
    ? `https://uri.amap.com/marker?position=${longitude},${latitude}&name=${encodeURIComponent(place.name)}`
    : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}${place.providerPlaceId ? `&query_place_id=${encodeURIComponent(place.providerPlaceId)}` : ''}`;
}
