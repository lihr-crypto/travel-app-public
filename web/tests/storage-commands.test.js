/* global beforeAll, beforeEach, afterEach, test, expect */
const { webcrypto } = require('node:crypto');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const { createBrowserStore, fingerprint } = require('../src/store');
const { createWebCommands } = require('../src/commands');

beforeAll(() => { global.indexedDB=indexedDB;global.IDBKeyRange=IDBKeyRange;global.crypto=webcrypto;global.BroadcastChannel=undefined; });
let store,commands;
beforeEach(()=>{store=createBrowserStore(`travel-web-test-${webcrypto.randomUUID()}`);commands=createWebCommands(store);});
afterEach(async()=>{await store.drop();await store.dispose();});
const create=async()=>{const {data}=await commands.createTrip({title:'旅行',startDate:'2026-10-13',endDate:'2026-10-15',mapRegion:'china_mainland'});return{trip:data,days:(await store.read()).state.days};};

test('Trip deletion matches SQLite cascade but preserves independent Place rows',async()=>{
  const {trip,days}=await create();
  await commands.confirmPlaceSearchResult({tripId:trip.id,dayId:days[0].id,itemType:'sightseeing',result:{name:'地点',address:'地址',provider:'amap',providerPlaceId:'public-fixture',coordinate:{latitude:39.9,longitude:116.4,system:'gcj02'}}});
  await commands.deleteTrip({tripId:trip.id});
  const state=(await store.read()).state;expect(state.trips).toHaveLength(0);expect(state.days).toHaveLength(0);expect(state.items).toHaveLength(0);expect(state.places).toHaveLength(1);
});
test('Delete and durable Undo snapshot commit together and restore the original ID/order',async()=>{
  const {trip,days}=await create();
  const ids=[];for(const title of['甲','乙','丙'])ids.push((await commands.addItem({tripId:trip.id,dayId:days[0].id,type:'activity',title})).data.id);
  const deleted=await commands.deleteItem({itemId:ids[1]});await store.close();
  const snapshot=(await store.read()).state.extras.trash[0];expect(snapshot.item.id).toBe(ids[1]);
  await commands.restoreDeletedItem({snapshot:deleted.data});
  const state=(await store.read()).state;expect(state.items.sort((a,b)=>a.sortOrder-b.sortOrder).map(item=>item.id)).toEqual(ids);expect(state.extras.trash).toEqual([]);
});
test('Deleting a Day moves its Items to Unscheduled, preserving name/time/payload',async()=>{
  const {trip,days}=await create();
  const {data:item}=await commands.addItem({tripId:trip.id,dayId:days[0].id,type:'transport',title:'到达',timeMode:'exact',startDateTime:null,endDateTime:'2026-10-13T09:35',period:null,note:'東京 ✈️',payload:{kind:'transport',mode:'flight',serviceNumber:'TEST'}});
  await commands.deleteTripDay({tripId:trip.id,dayId:days[0].id});
  const state=(await store.read()).state,after=state.items.find(row=>row.id===item.id);expect(after.dayId).toBeNull();expect(after.endDateTime).toBe(item.endDateTime);expect(after.note).toBe(item.note);expect(after.payload).toEqual(item.payload);expect(state.days.map(row=>row.dayIndex).sort()).toEqual([1,2]);
});
test('permanent item deletion does not create a trash entry and stays deleted after reopen',async()=>{
 const {trip,days}=await create();const {data:item}=await commands.addItem({tripId:trip.id,dayId:days[0].id,type:'activity',title:'永久删除测试'});
 await commands.permanentlyDeleteItem({itemId:item.id});await store.close();
 const state=(await store.read()).state;expect(state.items.some(x=>x.id===item.id)).toBe(false);expect(state.extras.trash||[]).toEqual([]);
});
test('Insert and date shift use the existing structural commands and preserve IDs',async()=>{
  const {trip,days}=await create();const {data:item}=await commands.addItem({tripId:trip.id,dayId:days[1].id,type:'activity',title:'活动',timeMode:'exact',startDateTime:null,endDateTime:'2026-10-14T10:00',period:null});
  await commands.insertTripDay({tripId:trip.id,dayId:days[0].id,position:'after'});
  expect((await store.read()).state.items.find(row=>row.id===item.id).endDateTime).toBe('2026-10-15T10:00');
  await commands.changeTripDateRange({tripId:trip.id,startDate:'2026-11-01',endDate:'2026-11-04',strategy:'shiftItems'});
  const state=(await store.read()).state;expect(state.items[0].id).toBe(item.id);expect(state.days.find(row=>row.id===days[1].id).date).toBe('2026-11-03');expect(state.items[0].endDateTime).toBe('2026-11-03T10:00');
});
test('Integrity rejection is non-mutating; merge keeps current data; replace has a recoverable prior revision',async()=>{
  const {trip}=await create();const backup=await store.export();await commands.renameTrip({tripId:trip.id,title:'现在的名称'});
  const before=await store.read();const broken=structuredClone(backup);broken.state.trips[0].title='内容损坏';
  await expect(store.import(broken)).rejects.toThrow('BACKUP_CHECKSUM_MISMATCH');expect(await fingerprint((await store.read()).state)).toBe(await fingerprint(before.state));
  await store.import(backup,'merge','current');expect((await store.read()).state.trips[0].title).toBe('现在的名称');
  const prior=(await store.read()).revision;await store.import(backup,'replace');expect((await store.read()).state.trips[0].title).toBe('旅行');await store.restoreRevision(prior);expect((await store.read()).state.trips[0].title).toBe('现在的名称');
});
test('Concurrent clients retry without dropping writes and history stays bounded',async()=>{
  const {trip,days}=await create();const peer=createBrowserStore(store.name);const other=createWebCommands(peer);
  try{await Promise.all(Array.from({length:8},(_,i)=>(i%2?commands:other).addItem({tripId:trip.id,dayId:days[0].id,type:'activity',title:`项目${i}`})));expect((await store.read()).state.items).toHaveLength(8);expect(store.conflictCount+peer.conflictCount).toBeGreaterThan(0);for(let i=0;i<24;i++)await commands.renameTrip({tripId:trip.id,title:`名称${i}`});expect(await store.recovery()).toHaveLength(20);}finally{await peer.dispose();}
});

test('Legacy import preserves source-native names, coordinates, payloads and raw tables on reopen/re-export',async()=>{
  const {trip,days}=await create();
  await commands.confirmPlaceSearchResult({tripId:trip.id,dayId:days[0].id,itemType:'transport',result:{name:'旧地点 東京 ✈️',address:'旧地址',provider:'amap',providerPlaceId:'legacy-fixture',coordinate:{latitude:35.76,longitude:112.63,system:'gcj02'}}});
  const state=(await store.read()).state;
  state.items[0].note='保留全部备注';state.items[0].payload={kind:'transport',mode:'train',origin:'甲',destination:'乙',serviceNumber:'K101'};
  state.extras={sourceTables:{apple_place_bindings:[{id:'binding-a',provider_name:'原名称'}],schema_migrations:[{version:1}],items:[{id:state.items[0].id,payload_json:'original bytes'}]},sourceForeignKeyProblems:['legacy only']};
  const backup={format:'travel-web-prototype-backup',schemaVersion:1,state};
  await store.import(backup,'replace');await store.close();
  expect((await store.export()).state).toEqual(state);
  const another=structuredClone(backup);another.state.extras.sourceTables.apple_place_bindings.push({id:'binding-b',provider_name:'另一个旧名称'});
  await store.import(another,'merge');
  const after=(await store.export()).state;expect(after.places).toEqual(state.places);expect(after.items).toEqual(state.items);
  expect(after.extras.sourceTables.apple_place_bindings).toHaveLength(2);expect(after.extras.sourceTables.items).toEqual(state.extras.sourceTables.items);
});
test('Malformed calendar data and newly conflicting merged ownership are rejected atomically',async()=>{
  const {trip,days}=await create();const second=(await commands.createTrip({title:'另一趟',startDate:'2026-10-13',endDate:'2026-10-15',mapRegion:'china_mainland'})).data;
  const backup=await store.export();const bad=structuredClone(backup);delete bad.integrity;bad.state.days[0].date='2026-02-30';
  const before=await fingerprint((await store.read()).state);await expect(store.import(bad,'replace')).rejects.toThrow('Invalid TravelDate');
  const peer=structuredClone(backup);delete peer.integrity;peer.state.days.find(row=>row.id===days[0].id).tripId=second.id;
  peer.state.items.push({id:'incoming-owner-conflict',tripId:second.id,dayId:days[0].id,placeId:null,type:'activity',title:'冲突',sortOrder:0,timeMode:'none',startDateTime:null,endDateTime:null,period:null});
  await expect(store.import(peer,'merge','current')).rejects.toThrow('IMPORT_REFERENCE_CONFLICT');
  expect(await fingerprint((await store.read()).state)).toBe(before);expect((await store.read()).state.trips.some(row=>row.id===trip.id)).toBe(true);
});
