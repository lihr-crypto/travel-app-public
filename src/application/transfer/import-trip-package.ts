import type {Trip} from '@/domain/trip/types';
import type {TripRepository} from '@/repositories/trip-repository';
import type {DayRepository} from '@/repositories/day-repository';
import type {ItemRepository} from '@/repositories/item-repository';
import type {PlaceRepository} from '@/repositories/place-repository';
import {copyTripState,parseTripPackage,replaceImportedTrip,selectTrip,type Digest,type PortableTripState} from './trip-package';
export interface TripImportRecord {tripId:string;sourceTripId:string;sourceDigest:string;importedAt:string;previousState:PortableTripState|null}
export interface TripImportRepository {get(tripId:string):Promise<TripImportRecord|null>;list():Promise<TripImportRecord[]>;save(record:TripImportRecord):Promise<void>}
export interface TripImportContext {trips:TripRepository;days:DayRepository;items:ItemRepository;places:PlaceRepository;imports:TripImportRepository}
export interface TripImportDependencies {digest:Digest;createId:()=>string;now:()=>string;runInTransaction:<T>(task:(context:TripImportContext)=>Promise<T>)=>Promise<T>}
export async function readImportedTrip(context:TripImportContext,id:string):Promise<PortableTripState>{
 const trip=await context.trips.getById(id);if(!trip)throw new Error('TRIP_NOT_FOUND');const days=await context.days.listByTripId(id),items=[...await context.items.listUnscheduledByTripId(id),...(await Promise.all(days.map(day=>context.items.listByDayId(day.id)))).flat()];const places=await context.places.listByIds([...new Set(items.map(item=>item.placeId).filter((x):x is string=>x!==null))]);return selectTrip({trips:[trip],days,items,places,extras:{}},id);
}
export async function importTripPackage(value:unknown,dependencies:TripImportDependencies,targetTripId?:string):Promise<Trip>{
 const pack=await parseTripPackage(value,dependencies.digest),timestamp=dependencies.now();const copy=targetTripId?replaceImportedTrip(pack.state,targetTripId,dependencies.createId,timestamp):copyTripState(pack.state,dependencies.createId,timestamp);
 return dependencies.runInTransaction(async context=>{
  let previousState:PortableTripState|null=null;
  if(targetTripId){const record=await context.imports.get(targetTripId);if(record?.sourceTripId!==pack.state.trips[0].id)throw new Error('IMPORT_SOURCE_MISMATCH');previousState=await readImportedTrip(context,targetTripId);previousState.extras.importedFrom={sourceTripId:record.sourceTripId,sourceDigest:record.sourceDigest};await context.trips.delete(targetTripId);}
  await context.trips.insert(copy.trips[0]);await context.days.insertMany(copy.days);for(const place of copy.places)await context.places.insert(place);for(const item of copy.items)await context.items.insert(item);
  await context.imports.save({tripId:copy.trips[0].id,sourceTripId:pack.state.trips[0].id,sourceDigest:pack.integrity.digest,importedAt:timestamp,previousState});return copy.trips[0];
 });
}
export async function restoreTripImport(tripId:string,dependencies:TripImportDependencies):Promise<Trip>{
 return dependencies.runInTransaction(async context=>{
  const record=await context.imports.get(tripId);if(!record?.previousState)throw new Error('RECOVERY_NOT_FOUND');const before=await readImportedTrip(context,tripId);before.extras.importedFrom={sourceTripId:record.sourceTripId,sourceDigest:record.sourceDigest};const restoredSource=record.previousState.extras.importedFrom as {sourceDigest?:string}|undefined,copy=replaceImportedTrip(record.previousState,tripId,dependencies.createId,dependencies.now());
  await context.trips.delete(tripId);await context.trips.insert(copy.trips[0]);await context.days.insertMany(copy.days);for(const place of copy.places)await context.places.insert(place);for(const item of copy.items)await context.items.insert(item);await context.imports.save({...record,sourceDigest:restoredSource?.sourceDigest||record.sourceDigest,importedAt:dependencies.now(),previousState:before});return copy.trips[0];
 });
}
