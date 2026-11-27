/* global __dirname */
const assert=require('node:assert/strict');const path=require('node:path');
const openDB=require('../hosting/cloud/local-db.cjs');
async function main(){
const {CloudPlans,operationBase}=await import('../hosting/cloud/service.bundle.mjs');
const db=openDB(':memory:',path.join(__dirname,'../hosting/drizzle/0000_high_doctor_faustus.sql')),api=new CloudPlans(db);
const owner=await api.actor({id:'owner',email:'owner@example.invalid'}),friend=await api.actor({id:'friend',email:'friend@example.invalid'}),stranger=await api.actor({id:'stranger',email:'stranger@example.invalid'});
const make=(actor,command,input,state,planId,revision=1)=>{const id=crypto.randomUUID();return{id,command,input,timestamp:new Date().toISOString(),planId:planId||`${actor.namespace}:${id}:0`,baseRevision:revision,base:operationBase(state||{trips:[],days:[],items:[],places:[]},command,input)}};
let created=await api.command(owner,make(owner,'createTrip',{title:'协作测试',startDate:'2026-10-13',endDate:'2026-10-14',mapRegion:'china_mainland'}));const id=created.plan.id;
await assert.rejects(api.plan(stranger,id),/TRIP_ACCESS_DENIED/);await assert.rejects(api.members(friend,id),/TRIP_ACCESS_DENIED/);
const invitation=await api.invite(owner,id,friend.email,'editor');await assert.rejects(api.claim(stranger,invitation.token),/INVITE_ACCOUNT_MISMATCH/);await api.claim(friend,invitation.token);const pendingSecondInvite=await api.invite(owner,id,friend.email,'editor');
const dayId=created.plan.state.days[0].id;
const addOperation=make(friend,'addItem',{tripId:id,dayId,title:'公开样例',type:'transport',timeMode:'exact',startDateTime:null,endDateTime:'2026-10-13T10:20',period:null,isFixed:false,note:'原备注',payload:{kind:'transport',mode:'train'}},created.plan.state,id);
let added=await api.command(friend,addOperation);
const item=added.plan.state.items[0];
const a=make(owner,'updateItemDetails',{itemId:item.id,title:'新标题'},added.plan.state,id),b=make(friend,'updateItemDetails',{itemId:item.id,note:'朋友的备注'},added.plan.state,id);
await api.command(owner,a);let updated=await api.command(friend,b);assert.equal(updated.plan.state.items[0].title,'新标题');assert.equal(updated.plan.state.items[0].note,'朋友的备注');
assert.deepEqual(await api.command(owner,a),await api.command(owner,a));
const c=make(owner,'updateItemDetails',{itemId:item.id,note:'甲'},updated.plan.state,id),d=make(friend,'updateItemDetails',{itemId:item.id,note:'乙'},updated.plan.state,id);await api.command(owner,c);await assert.rejects(api.command(friend,d),/EDIT_CONFLICT/);
let exported=await api.export(friend,id);assert.equal(exported.format,'travel-trip-package');assert.deepEqual(exported.state.extras,{});assert.equal(exported.state.items[0].startDateTime,null);assert.equal(exported.state.items[0].endDateTime,'2026-10-13T10:20');
let imported=await api.command(stranger,make(stranger,'importTripPackage',{package:exported}));assert.notEqual(imported.plan.id,id);assert.notEqual(imported.plan.state.items[0].id,item.id);assert.equal(imported.plan.state.items[0].title,'新标题');
await assert.rejects(api.members(friend,id),/TRIP_ACCESS_DENIED/);await assert.rejects(api.command(friend,make(friend,'deleteTrip',{tripId:id},updated.plan.state,id)),/TRIP_ACCESS_DENIED/);
const member=await api.members(owner,id);assert.equal(member.members.length,1);await api.revoke(owner,id,friend.id);await assert.rejects(api.claim(friend,invitation.token),/INVITE_EXPIRED/);await assert.rejects(api.claim(friend,pendingSecondInvite.token),/INVITE_EXPIRED/);await assert.rejects(api.command(friend,make(friend,'renameTrip',{tripId:id,title:'已撤销'},updated.plan.state,id)),/TRIP_ACCESS_DENIED/);
await assert.rejects(api.command(friend,addOperation),/TRIP_ACCESS_DENIED/);
const viewer=await api.invite(owner,id,friend.email,'viewer');await api.claim(friend,viewer.token);assert.equal((await api.list(friend))[0].role,'viewer');await assert.rejects(api.command(friend,make(friend,'renameTrip',{tripId:id,title:'无权修改'},updated.plan.state,id)),/TRIP_ACCESS_DENIED/);
assert.ok((await api.list(owner)).length===1);assert.ok((await api.list(stranger)).length===1);db.close();const fs=require('node:fs'),os=require('node:os');const temp=fs.mkdtempSync(path.join(os.tmpdir(),'travel-cloud-reopen-')),file=path.join(temp,'test.sqlite');let reopened=openDB(file,path.join(__dirname,'../hosting/drizzle/0000_high_doctor_faustus.sql'));await reopened.prepare('INSERT INTO travel_users(user_id,namespace,name,email) VALUES (?,?,?,?)').bind('persisted','ns','public','public@example.invalid').run();reopened.close();reopened=openDB(file,path.join(__dirname,'../hosting/drizzle/0000_high_doctor_faustus.sql'));assert.equal((await reopened.prepare('SELECT user_id FROM travel_users').first()).user_id,'persisted');reopened.close();fs.rmSync(temp,{recursive:true});console.log('Cloud SQL acceptance: permissions, independent copy, arrival-only, idempotency, field merge, conflict, invite/revoke passed');
}main().catch(e=>{console.error(e);process.exitCode=1});
