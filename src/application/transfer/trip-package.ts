import type { Trip, Day } from '@/domain/trip/types';
import type { Item } from '@/domain/item/types';
import type { Place } from '@/domain/place/types';
import { deriveInclusiveTravelDateRange, travelDateParts } from '@/domain/trip/date-range';
import { assertCoordinate } from '@/domain/common/coordinate';
import { assertItemTimeFields } from '@/domain/item/time';
import { normalizeItemPayload } from '@/domain/item/validation';

export interface PortableTripState { trips: Trip[]; days: Day[]; items: Item[]; places: Place[]; extras: Record<string, unknown> }
export interface TripPackage { format: 'travel-trip-package'; schemaVersion: 1; exportedAt: string; state: PortableTripState; integrity: {algorithm:'SHA-256';digest:string} }
export type Digest = (text: string) => Promise<string>;
export function stableJson(value: unknown): string {
  const order = (item: unknown): unknown => Array.isArray(item) ? item.map(order) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,order((item as Record<string,unknown>)[key])])) : item;
  return JSON.stringify(order(value));
}
export function validateTripState(value: unknown): asserts value is PortableTripState {
  if (!value || typeof value !== 'object') throw new Error('INVALID_TRIP_PACKAGE');
  const state=value as PortableTripState;
  const ids=new Set<string>();
  for (const key of ['trips','days','items','places'] as const) {
    if (!Array.isArray(state[key]) || state[key].length>10000) throw new Error('INVALID_TRIP_PACKAGE');
    for (const row of state[key]) { if(typeof row?.createdAt!=='string'||typeof row?.updatedAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||!Number.isFinite(Date.parse(row.updatedAt)))throw new Error('INVALID_TRIP_PACKAGE'); if (!row || typeof row.id!=='string' || !row.id || row.id.length>240 || ids.has(row.id)) throw new Error('INVALID_TRIP_PACKAGE_IDS'); ids.add(row.id); }
  }
  if(state.trips.length!==1)throw new Error('SINGLE_TRIP_REQUIRED');
  const trip=state.trips[0];travelDateParts(trip.startDate);travelDateParts(trip.endDate);
  if((trip.note!==null&&typeof trip.note!=='string')||typeof trip.title!=='string'||!trip.title.trim()||trip.endDate<trip.startDate||!['china_mainland','global'].includes(trip.mapRegion))throw new Error('INVALID_TRIP_PACKAGE');
  const span=(Date.parse(`${trip.endDate}T00:00:00.000Z`)-Date.parse(`${trip.startDate}T00:00:00.000Z`))/86400000+1;
  if(span!==state.days.length||span>10000)throw new Error('INVALID_TRIP_PACKAGE_DAYS');
  const dates=deriveInclusiveTravelDateRange(trip.startDate,trip.endDate);
  if(state.days.length!==dates.length||new Set(state.days.map(day=>day.date)).size!==dates.length)throw new Error('INVALID_TRIP_PACKAGE_DAYS');
  const days=new Map(state.days.map(day=>[day.id,day])),places=new Set(state.places.map(place=>place.id));
  for(const day of state.days){travelDateParts(day.date);if(day.tripId!==trip.id||!Number.isInteger(day.dayIndex)||day.dayIndex<1||dates[day.dayIndex-1]?.date!==day.date)throw new Error('INVALID_TRIP_PACKAGE_OWNER');}
  for(const place of state.places){assertCoordinate(place.coordinate);if(typeof place.name!=='string'||!place.name.trim())throw new Error('INVALID_TRIP_PACKAGE');}
  for(const item of state.items){
    assertItemTimeFields(item); normalizeItemPayload(item.type,item.payload);
    if(typeof item.isFixed!=='boolean'||(item.note!==null&&typeof item.note!=='string'))throw new Error('INVALID_TRIP_PACKAGE');
    if(item.tripId!==trip.id||(item.dayId!==null&&days.get(item.dayId)?.tripId!==trip.id)||(item.placeId!==null&&!places.has(item.placeId)))throw new Error('INVALID_TRIP_PACKAGE_OWNER');
    if(typeof item.title!=='string'||!Number.isFinite(item.sortOrder)||!['sightseeing','food','hotel','activity','transport','custom'].includes(item.type))throw new Error('INVALID_TRIP_PACKAGE');
  }
}
export function selectTrip(state: PortableTripState, tripId: string): PortableTripState {
  const trip=state.trips.find(row=>row.id===tripId);if(!trip)throw new Error('TRIP_NOT_FOUND');
  const items=state.items.filter(row=>row.tripId===tripId),ids=new Set(items.map(row=>row.placeId));
  // Explicit fields prevent account secrets, server permissions and whole-library archives travelling in files.
  const places=state.places.filter(row=>ids.has(row.id)).map(row=>({id:row.id,name:row.name,coordinate:{latitude:row.coordinate.latitude,longitude:row.coordinate.longitude,system:row.coordinate.system},address:row.address,provider:row.provider,providerPlaceId:row.providerPlaceId,metadata:row.metadata?Object.fromEntries(Object.entries(row.metadata).filter(([key])=>['city','adcode','regionLabel','userNamed','searchSnapshotAt'].includes(key)&&['string','boolean','number'].includes(typeof row.metadata![key]))):null,createdAt:row.createdAt,updatedAt:row.updatedAt}));
  const payload=(row: Item) => row.payload?.kind==='transport' ? {kind:'transport' as const,...Object.fromEntries(Object.entries(row.payload).filter(([key])=>['mode','serviceNumber','origin','destination'].includes(key)))} : row.payload?.kind==='custom' ? {kind:'custom' as const,label:row.payload.label} : row.payload?.kind==='hotel' ? {kind:'hotel' as const} : null;
  const selected: PortableTripState={trips:[{id:trip.id,title:trip.title,startDate:trip.startDate,endDate:trip.endDate,mapRegion:trip.mapRegion,note:trip.note,createdAt:trip.createdAt,updatedAt:trip.updatedAt}],days:state.days.filter(row=>row.tripId===tripId).map(row=>({id:row.id,tripId:row.tripId,date:row.date,dayIndex:row.dayIndex,createdAt:row.createdAt,updatedAt:row.updatedAt})),items:items.map(row=>({id:row.id,tripId:row.tripId,dayId:row.dayId,placeId:row.placeId,type:row.type,title:row.title,sortOrder:row.sortOrder,timeMode:row.timeMode,startDateTime:row.startDateTime,endDateTime:row.endDateTime,period:row.period,isFixed:row.isFixed,note:row.note,payload:payload(row),createdAt:row.createdAt,updatedAt:row.updatedAt})),places,extras:{}};
  validateTripState(selected);return selected;
}
export async function exportTripPackage(state: PortableTripState,tripId:string,digest:Digest,now=new Date().toISOString()):Promise<TripPackage>{
  const selected=selectTrip(state,tripId);return{format:'travel-trip-package',schemaVersion:1,exportedAt:now,state:selected,integrity:{algorithm:'SHA-256',digest:await digest(stableJson(selected))}};
}
export async function parseTripPackage(value:unknown,digest:Digest):Promise<TripPackage>{
  const pack=value as TripPackage;
  if(pack?.format!=='travel-trip-package'||pack.schemaVersion!==1||pack.integrity?.algorithm!=='SHA-256')throw new Error('INVALID_TRIP_PACKAGE');
  validateTripState(pack.state);if(!Number.isFinite(Date.parse(pack.exportedAt)))throw new Error('INVALID_TRIP_PACKAGE');if(await digest(stableJson(pack.state))!==pack.integrity.digest)throw new Error('BACKUP_CHECKSUM_MISMATCH');return {...pack,state:selectTrip(pack.state,pack.state.trips[0].id)};
}
export function copyTripState(source:PortableTripState,createId:()=>string,now=new Date().toISOString()):PortableTripState{
  validateTripState(source);source=selectTrip(source,source.trips[0].id);const ids=new Map<string,string>();for(const key of ['trips','days','places','items'] as const)for(const row of source[key])ids.set(row.id,createId());
  const copied={trips:source.trips.map(row=>({...row,id:ids.get(row.id)!,createdAt:now,updatedAt:now})),days:source.days.map(row=>({...row,id:ids.get(row.id)!,tripId:ids.get(row.tripId)!,createdAt:now,updatedAt:now})),places:source.places.map(row=>({...row,id:ids.get(row.id)!,coordinate:{...row.coordinate},createdAt:now,updatedAt:now})),items:source.items.map(row=>({...row,id:ids.get(row.id)!,tripId:ids.get(row.tripId)!,dayId:row.dayId===null?null:ids.get(row.dayId)!,placeId:row.placeId===null?null:ids.get(row.placeId)!,payload:row.payload?{...row.payload}:null,createdAt:now,updatedAt:now})),extras:{}};
  validateTripState(copied);return copied;
}

/** Replace only the selected imported copy; caller keeps the previous state in recovery. */
export function replaceImportedTrip(source:PortableTripState,tripId:string,createId:()=>string,now:string):PortableTripState{
 const copy=copyTripState(source,createId,now);const generated=copy.trips[0].id;copy.trips[0].id=tripId;copy.days=copy.days.map(day=>({...day,tripId}));copy.items=copy.items.map(item=>({...item,tripId}));if(generated===tripId)throw new Error('IMPORT_ID_COLLISION');validateTripState(copy);return copy;
}
