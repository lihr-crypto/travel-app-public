import {digestStringAsync,CryptoDigestAlgorithm,randomUUID} from 'expo-crypto';
import {importTripPackage,restoreTripImport} from '@/application/transfer/import-trip-package';
import {createTripImportRunner,SqliteTripImportRepository} from './trip-import-transaction';
import {SqliteTripRepository} from './sqlite/trip-repository';
import {runInExclusiveTransaction,runInReadContext} from './index';
const dependencies={digest:(text:string)=>digestStringAsync(CryptoDigestAlgorithm.SHA256,text),createId:randomUUID,now:()=>new Date().toISOString(),runInTransaction:createTripImportRunner(runInExclusiveTransaction)};
export const importTripFile=(value:unknown,targetTripId?:string)=>importTripPackage(value,dependencies,targetTripId);
export const restoreImportedTrip=(tripId:string)=>restoreTripImport(tripId,dependencies);
export const listTripImports=()=>runInReadContext(async db=>{const rows=await new SqliteTripImportRepository(db).list();return Promise.all(rows.map(async row=>{const trip=await new SqliteTripRepository(db).getById(row.tripId);const count=await db.getFirstAsync<{count:number}>('SELECT COUNT(*) AS count FROM items WHERE trip_id=?',[row.tripId]);return{...row,title:trip?.title||'已导入的旅行',itemCount:count?.count||0};}));});
