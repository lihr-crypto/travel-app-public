/* global beforeEach,afterEach,test,expect,jest */
const {appRequest}=require('../src/app-request');
const {cloudRequest,openCloud}=require('../src/cloud');
const {webcrypto}=require('node:crypto');
const {IDBFactory,IDBKeyRange}=require('fake-indexeddb');
let previous;const stores=[];
const response=(data,status=200,type='application/json')=>({ok:status>=200&&status<300,status,type:'basic',redirected:false,headers:{get:()=>type},json:async()=>data});
beforeEach(()=>{
 previous={fetch:global.fetch,location:global.location,indexedDB:global.indexedDB,IDBKeyRange:global.IDBKeyRange,crypto:global.crypto,BroadcastChannel:global.BroadcastChannel};
 global.location={hostname:'private.example'};global.indexedDB=new IDBFactory();global.IDBKeyRange=IDBKeyRange;global.crypto=webcrypto;global.BroadcastChannel=undefined;
});
afterEach(async()=>{for(const s of stores){await s.drop();await s.dispose();}stores.length=0;Object.assign(global,previous);});
test('cloud API requests identify AJAX and retain POST body and same-origin credentials',async()=>{
 global.fetch=jest.fn(async()=>response({saved:true}));const body={id:'operation-public'};
 await expect(cloudRequest('operations',body)).resolves.toEqual({saved:true});
 expect(global.fetch).toHaveBeenCalledWith('/api/cloud/operations',expect.objectContaining({method:'POST',body:JSON.stringify(body),credentials:'same-origin',redirect:'manual',headers:expect.objectContaining({'X-Requested-With':'XMLHttpRequest',Accept:'application/json','Content-Type':'application/json'})}));
});
test.each([
 ['Access 401',()=>response({},401)],
 ['manual auth redirect',()=>({...response({}),status:0,type:'opaqueredirect'})],
 ['followed login redirect',()=>({...response({}),redirected:true})],
 ['login HTML',()=>response({},200,'text/html')],
])('%s is reported as sign-in required rather than a network outage',async(_,make)=>{
 global.fetch=jest.fn(async()=>make());await expect(appRequest('/api/map-config')).rejects.toMatchObject({message:'SIGN_IN_REQUIRED',status:401});
});
test('a real network failure retains its identity while server errors retain their HTTP status',async()=>{
 const offline=new TypeError('Failed to fetch');global.fetch=jest.fn(async()=>{throw offline;});await expect(appRequest('/api/map-config')).rejects.toBe(offline);
 global.fetch.mockImplementation(async()=>response({error:'ACCESS_VERIFICATION_UNAVAILABLE'},503));await expect(appRequest('/api/map-config')).rejects.toMatchObject({message:'ACCESS_VERIFICATION_UNAVAILABLE',status:503});
});
test('a cached account and queued work survive an expired-session reopen; no operation is submitted',async()=>{
 const actor={id:'cached-owner',namespace:'cached-owner',email:'owner@example.invalid'};
 global.fetch=jest.fn(async()=>response(actor));const first=await openCloud();stores.push(first.store);
 global.fetch.mockRejectedValue(new TypeError('offline'));
 const {data:trip}=await first.run('createTrip',{title:'尚未同步的旅行',startDate:'2026-10-29',endDate:'2026-10-29',mapRegion:'china_mainland'});await first.sync();
 expect((await first.store.read()).state.extras.outbox).toHaveLength(1);
 global.fetch.mockImplementation(async()=>response({},401));global.fetch.mockClear();
 const reopened=await openCloud();stores.push(reopened.store);await reopened.sync();
 const saved=(await reopened.store.read()).state;expect(saved.trips[0].id).toBe(trip.id);expect(saved.extras.outbox).toHaveLength(1);expect(reopened.status.phase).toBe('signin');
 expect(global.fetch.mock.calls.every(([url])=>url==='/api/cloud/me')).toBe(true);
});
test('without a cached profile the app reports the expired session explicitly',async()=>{
 global.fetch=jest.fn(async()=>response({},401));await expect(openCloud()).rejects.toMatchObject({message:'SIGN_IN_REQUIRED',status:401});
});
