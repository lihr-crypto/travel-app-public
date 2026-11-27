import {type TripImportRecord,type TripImportRepository,type TripImportContext} from '@/application/transfer/import-trip-package';
import type {DatabaseExecutor,DatabaseRuntime} from './runtime';
import {SqliteTripRepository} from './sqlite/trip-repository';
import {SqliteDayRepository} from './sqlite/day-repository';
import {SqliteItemRepository} from './sqlite/item-repository';
import {SqlitePlaceRepository} from './sqlite/place-repository';
export class SqliteTripImportRepository implements TripImportRepository{
 constructor(private db:DatabaseExecutor){}
 private map(row:{trip_id:string;source_trip_id:string;source_digest:string;imported_at:string;previous_state_json:string|null}):TripImportRecord{return{tripId:row.trip_id,sourceTripId:row.source_trip_id,sourceDigest:row.source_digest,importedAt:row.imported_at,previousState:row.previous_state_json?JSON.parse(row.previous_state_json):null};}
 async get(id:string){const row=await this.db.getFirstAsync<Parameters<SqliteTripImportRepository['map']>[0]>('SELECT * FROM trip_imports WHERE trip_id=?',[id]);return row?this.map(row):null;}
 async list(){return(await this.db.getAllAsync<Parameters<SqliteTripImportRepository['map']>[0]>('SELECT * FROM trip_imports',[])).map(row=>this.map(row));}
 async save(record:TripImportRecord){await this.db.runAsync('INSERT INTO trip_imports(trip_id,source_trip_id,source_digest,imported_at,previous_state_json) VALUES(?,?,?,?,?)',[record.tripId,record.sourceTripId,record.sourceDigest,record.importedAt,record.previousState?JSON.stringify(record.previousState):null]);}
}
export function createTripImportRunner(run:DatabaseRuntime['runInExclusiveTransaction']){
 return <T>(task:(context:TripImportContext)=>Promise<T>)=>run(async db=>{
  // Expo opens a separate connection for exclusive transactions. A PRAGMA after
  // BEGIN cannot enable FK enforcement; the iOS SQLite build sets the default.
  if((await db.getFirstAsync<{foreign_keys:number}>('PRAGMA foreign_keys',[]))?.foreign_keys!==1)throw new Error('IMPORT_FOREIGN_KEYS_DISABLED');
  return task({trips:new SqliteTripRepository(db),days:new SqliteDayRepository(db),items:new SqliteItemRepository(db),places:new SqlitePlaceRepository(db),imports:new SqliteTripImportRepository(db)});
 });
}
