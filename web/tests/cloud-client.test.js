/* global __dirname,beforeAll,afterEach,test,expect */
const {webcrypto}=require('node:crypto');const path=require('node:path');const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
const {createBrowserStore}=require('../src/store');const {createCloudController}=require('../src/cloud');const {CloudPlans}=require('../hosting/cloud/service');const openDB=require('../hosting/cloud/local-db.cjs');
const {operationBase}=require('../src/cloud-contract');
beforeAll(()=>{global.indexedDB=indexedDB;global.IDBKeyRange=IDBKeyRange;global.crypto=webcrypto;global.BroadcastChannel=undefined;});
const stores=[];let db;afterEach(async()=>{for(const store of stores){await store.drop();await store.dispose();}stores.length=0;db?.close();});
async function setup(){db=openDB(':memory:',path.join(__dirname,'../hosting/drizzle/0000_high_doctor_faustus.sql'));const server=new CloudPlans(db),actor=await server.actor({id:'test-owner',email:'owner@example.invalid'});let offline=false;const make=(identity=actor)=>{const request=async(route,body)=>{if(offline)throw new Error('NETWORK_ERROR');if(route==='me')return identity;if(route==='plans')return{plans:await server.list(identity)};if(route==='operations')return server.command(identity,body);throw new Error(`UNKNOWN_ROUTE:${route}`);};const store=createBrowserStore(`cloud-test-${webcrypto.randomUUID()}`);stores.push(store);return createCloudController(store,identity,request);};return{server,actor,make,offline:value=>offline=value};}
test('offline mutation and queue survive reopen; shared account containers hydrate without local-library upload',async()=>{const env=await setup(),first=env.make();env.offline(true);const created=await first.run('createTrip',{title:'离线样例',startDate:'2026-10-13',endDate:'2026-10-13',mapRegion:'china_mainland'});await first.sync();await first.store.close();let local=(await first.store.read()).state;expect(local.trips[0].id).toBe(created.data.id);expect(local.extras.outbox).toHaveLength(1);expect(await env.server.list(env.actor)).toEqual([]);env.offline(false);await first.sync();expect((await first.store.read()).state.extras.outbox).toHaveLength(0);const installed=env.make();await installed.sync();expect((await installed.store.read()).state.trips[0].id).toBe(created.data.id);expect((await installed.store.read()).state.extras.cloudPlans[created.data.id].role).toBe('owner');const stableRevision=(await installed.store.read()).revision;await installed.sync();await installed.sync();expect((await installed.store.read()).revision).toBe(stableRevision);});
test('different fields merge; conflicting draft persists until explicit cloud choice',async()=>{const env=await setup(),a=env.make(),b=env.make();const created=await a.run('createTrip',{title:'样例',startDate:'2026-10-13',endDate:'2026-10-13',mapRegion:'china_mainland'});await a.sync();const day=(await a.store.read()).state.days[0];const {data:item}=await a.run('addItem',{tripId:created.data.id,dayId:day.id,type:'activity',title:'旧标题',note:'旧备注'});await a.sync();await b.sync();env.offline(true);await a.run('updateItemDetails',{itemId:item.id,title:'甲标题'});await b.run('updateItemDetails',{itemId:item.id,note:'乙备注'});await Promise.all([a.sync(),b.sync()]);env.offline(false);await a.sync();await b.sync();expect((await env.server.plan(env.actor,created.data.id)).state.items[0]).toMatchObject({title:'甲标题',note:'乙备注'});await a.sync();env.offline(true);await a.run('updateItemDetails',{itemId:item.id,note:'甲冲突'});await b.run('updateItemDetails',{itemId:item.id,note:'乙冲突'});await Promise.all([a.sync(),b.sync()]);env.offline(false);await a.sync();await b.sync();const state=(await b.store.read()).state;expect(state.items[0].note).toBe('乙冲突');expect(Object.values(state.extras.syncIssues)[0].code).toBe('EDIT_CONFLICT');await b.resolve(created.data.id,false);expect((await b.store.read()).state.items[0].note).toBe('甲冲突');expect((await b.store.read()).state.extras.outbox).toHaveLength(0);});

async function sharedFixture(){
 const env=await setup(),owner=env.make();
 const {data:trip}=await owner.run('createTrip',{title:'公开共享测试',startDate:'2026-10-13',endDate:'2026-10-13',mapRegion:'china_mainland'});await owner.sync();
 const day=(await owner.store.read()).state.days[0];const {data:item}=await owner.run('addItem',{tripId:trip.id,dayId:day.id,type:'activity',title:'原标题',note:'原备注'});await owner.sync();
 const actor=await env.server.actor({id:'test-friend',email:'friend@example.invalid'}),invite=await env.server.invite(env.actor,trip.id,actor.email,'editor');await env.server.claim(actor,invite.token);
 const friend=env.make(actor);await friend.sync();return{...env,owner,friend,friendActor:actor,trip,item};
}
test('an open editor keeps its original baseline after hydration; untouched fields preserve a friend edit',async()=>{
 const env=await sharedFixture(),opened=structuredClone(env.item);
 await env.friend.run('updateItemDetails',{itemId:opened.id,note:'朋友的新备注'});await env.friend.sync();await env.owner.sync();
 await env.owner.run('updateItemDetails',{...opened,itemId:opened.id,title:'我的新标题'},{itemBaseline:opened});await env.owner.sync();
 expect((await env.server.plan(env.actor,env.trip.id)).state.items[0]).toMatchObject({title:'我的新标题',note:'朋友的新备注'});
 expect((await env.owner.store.read()).state.items[0].note).toBe('朋友的新备注');
});
test('same-field edits from an open editor conflict even after hydration, and explicit keep resubmits only that edit',async()=>{
 const env=await sharedFixture(),opened=structuredClone(env.item);
 await env.friend.run('updateItemDetails',{itemId:opened.id,title:'朋友的新标题',note:'朋友的新备注'});await env.friend.sync();await env.owner.sync();
 await env.owner.run('updateItemDetails',{...opened,itemId:opened.id,title:'我的冲突标题'},{itemBaseline:opened});await env.owner.sync();
 const local=(await env.owner.store.read()).state;expect(local.items[0]).toMatchObject({title:'我的冲突标题',note:'朋友的新备注'});
 expect(Object.values(local.extras.syncIssues)[0]?.code).toBe('EDIT_CONFLICT');expect(local.extras.outbox).toHaveLength(1);
 expect((await env.server.plan(env.actor,env.trip.id)).state.items[0].title).toBe('朋友的新标题');
 await env.owner.resolve(env.trip.id,true);
 expect((await env.server.plan(env.actor,env.trip.id)).state.items[0]).toMatchObject({title:'我的冲突标题',note:'朋友的新备注'});
 expect((await env.owner.store.read()).state.extras.outbox).toHaveLength(0);
});
test('open trip-name and date forms use their opening baseline after remote hydration',async()=>{
 const env=await sharedFixture(),opened=(await env.owner.store.read()).state;
 await env.friend.run('renameTrip',{tripId:env.trip.id,title:'朋友的新旅行名称'});await env.friend.sync();await env.owner.sync();
 const rename={tripId:env.trip.id,title:'我的旅行名称'};await env.owner.run('renameTrip',rename,{baseline:operationBase(opened,'renameTrip',rename)});await env.owner.sync();
 expect(Object.values((await env.owner.store.read()).state.extras.syncIssues)[0]?.code).toBe('EDIT_CONFLICT');await env.owner.resolve(env.trip.id,false);
 const dateOpened=(await env.owner.store.read()).state,day=dateOpened.days[0];await env.friend.run('insertTripDay',{tripId:env.trip.id,dayId:day.id,position:'after'});await env.friend.sync();await env.owner.sync();
 const dates={tripId:env.trip.id,startDate:'2026-10-15',endDate:'2026-10-15',strategy:'keepCalendarDates'};await env.owner.run('changeTripDateRange',dates,{baseline:operationBase(dateOpened,'changeTripDateRange',dates)});await env.owner.sync();
 expect(Object.values((await env.owner.store.read()).state.extras.syncIssues)[0]?.code).toBe('EDIT_CONFLICT');expect((await env.server.plan(env.actor,env.trip.id)).state.days).toHaveLength(2);
});
test('revoked offline work stays exportable; an imported personal copy remains independent and editable',async()=>{
 const env=await sharedFixture();env.offline(true);await env.friend.run('updateItemDetails',{itemId:env.item.id,note:'撤权前的离线草稿'});await env.friend.sync();
 await env.server.revoke(env.actor,env.trip.id,env.friendActor.id);env.offline(false);await env.friend.sync();
 const local=(await env.friend.store.read()).state;expect(local.extras.cloudPlans[env.trip.id].revoked).toBe(true);expect(local.items[0].note).toBe('撤权前的离线草稿');
 await expect(env.friend.run('updateItemDetails',{itemId:env.item.id,title:'撤权后新修改'})).rejects.toThrow('TRIP_ACCESS_DENIED');
 const pack=await env.friend.exportTrip(env.trip.id);const {data:copy}=await env.friend.run('importTripPackage',{package:pack});await env.friend.sync();
 await env.friend.run('renameTrip',{tripId:copy.id,title:'我的独立副本'});await env.friend.sync();
 const original=await env.server.plan(env.actor,env.trip.id),copied=await env.server.plan(env.friendActor,copy.id);
 expect(original.state.trips[0].title).toBe('公开共享测试');expect(original.state.items[0].note).toBe('原备注');expect(copied.role).toBe('owner');expect(copied.state.trips[0].title).toBe('我的独立副本');expect(copied.state.items[0].note).toBe('撤权前的离线草稿');
 await env.friend.resolve(env.trip.id,false);expect((await env.friend.store.read()).state.trips.map(x=>x.id)).toEqual([copy.id]);
});
