import {appRequest} from './app-request';
import {createBrowserStore,repositories} from './store';
import {createWebCommands} from './commands';
import {assertCloudDateRange,operationBase,idsFor,itemDetailsChanges} from './cloud-contract';
import {copyTripState,replaceImportedTrip,parseTripPackage,exportTripPackage} from '../../src/application/transfer/trip-package';
export const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const local=()=>['127.0.0.1','localhost'].includes(location.hostname);
export async function cloudRequest(path,body){
 const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(local()&&sessionStorage.getItem('travel-test-user'))headers['x-travel-test-user']=sessionStorage.getItem('travel-test-user');
 return appRequest(`/api/cloud/${path}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
}
async function profile(value){
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('travel-cloud-profile',1);q.onupgradeneeded=()=>q.result.createObjectStore('profile');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('profile',value?'readwrite':'readonly'),q=value?tx.objectStore('profile').put(value,'last'):tx.objectStore('profile').get('last');let result;q.onsuccess=()=>result=q.result;tx.oncomplete=()=>resolve(value||result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function openCloud(){
 let actor;try{actor=await cloudRequest('me');await profile(actor);}catch(error){if(error.status&&error.status!==401)throw error;actor=await profile();if(!actor){if(error.status===401)throw error;throw Object.assign(new Error('FIRST_CONNECTION_REQUIRED'),{cause:error});}}
 const store=createBrowserStore(`travel-web-cloud-${actor.id}`);return createCloudController(store,actor);
}
export function replacePlan(state,plan){
 const oldItemIds=new Set(state.items.filter(x=>x.tripId===plan.id).map(x=>x.id));const oldPlaceIds=new Set(state.items.filter(x=>x.tripId===plan.id).map(x=>x.placeId));
 state.trips=state.trips.filter(x=>x.id!==plan.id);state.days=state.days.filter(x=>x.tripId!==plan.id);state.items=state.items.filter(x=>x.tripId!==plan.id);
 const retainedPlaces=new Set(state.items.map(x=>x.placeId));state.places=state.places.filter(x=>!oldPlaceIds.has(x.id)||retainedPlaces.has(x.id));
 for(const key of ['trips','days','items'])state[key].push(...structuredClone(plan.state[key]));
 for(const place of plan.state.places){state.places=state.places.filter(x=>x.id!==place.id);state.places.push(structuredClone(place));}
 state.extras.trash=(state.extras.trash||[]).filter(x=>x.item.tripId!==plan.id&&!oldItemIds.has(x.item.id));state.extras.trash.push(...structuredClone(plan.state.extras.trash||[]));state.extras.imports??={};if(plan.state.extras.importedFrom)state.extras.imports[plan.id]=plan.state.extras.importedFrom;else delete state.extras.imports[plan.id];
}
export function needsHydration(state,plans){
 const metadata=state.extras.cloudPlans||{},pending=new Set((state.extras.outbox||[]).map(op=>op.planId)),ids=new Set(plans.map(plan=>plan.id));
 return !state.extras.lastCloudSync||plans.some(plan=>!metadata[plan.id]||metadata[plan.id].revision!==plan.revision||metadata[plan.id].role!==plan.role||!!metadata[plan.id].deleted!==plan.deleted)||Object.entries(metadata).some(([id,meta])=>!ids.has(id)&&(!pending.has(id)||(meta.revision>0&&!meta.revoked)));
}
const commandsOwned=new Set(['deleteTrip','permanentlyDeleteItem','emptyTrashItem','restorePlanVersion','updateImportedTripPackage']);
export function createCloudController(store,actor,request=cloudRequest){
 let syncing=null,status={phase:'connecting'},listeners=new Set();
 const notify=next=>{status={...status,...next};listeners.forEach(fn=>fn(status));};
 const planFor=(state,input)=>input.tripId||input.planId||state.items.find(x=>x.id===input.itemId)?.tripId||input.snapshot?.item?.tripId||state.extras.trash?.find(x=>x.item.id===input.itemId)?.item.tripId;
 const run=async(command,input,options={})=>{
  assertCloudDateRange(command,input);const id=crypto.randomUUID(),timestamp=new Date().toISOString();let result;
  await store.edit(async state=>{
   const fresh=command==='createTrip'||command==='importTripPackage',planId=fresh?`${actor.namespace}:${id}:0`:planFor(state,input),meta=state.extras.cloudPlans?.[planId];
   if(!fresh&&(!meta||meta.revoked||meta.role==='viewer'||(commandsOwned.has(command)&&meta.role!=='owner')))throw new Error('TRIP_ACCESS_DENIED');
   const base=structuredClone(options.baseline||operationBase(state,command,input)),createId=idsFor(actor.namespace,id);
   if(command==='updateItemDetails'&&options.itemBaseline){
    if(options.itemBaseline.id!==input.itemId)throw new Error('INVALID_EDIT_BASELINE');
    base.item=structuredClone(options.itemBaseline);input=itemDetailsChanges(input,base.item);
   }
   if(command==='importTripPackage'||command==='updateImportedTripPackage'){
    const pack=await parseTripPackage(input.package,digest),copy=command==='updateImportedTripPackage'?replaceImportedTrip(pack.state,planId,createId,timestamp):copyTripState(pack.state,createId,timestamp);if(command==='updateImportedTripPackage')replacePlan(state,{id:planId,state:copy});else for(const key of ['trips','days','items','places'])state[key].push(...copy[key]);state.extras.imports??={};state.extras.imports[planId]={sourceTripId:pack.state.trips[0].id,sourceDigest:pack.integrity.digest,importedAt:timestamp};result={data:copy.trips[0]};
   }else if(command==='restorePlanVersion'){
    replacePlan(state,{id:planId,state:input.versionState});result={data:input.versionState.trips[0]};
   }else result=await createWebCommands({runInTransaction:async task=>task(repositories(state))},{createId,now:()=>timestamp})[command](input);
   const wireInput=structuredClone(input);delete wireInput.versionState;
   state.extras.cloudPlans??={};state.extras.cloudPlans[planId]={...meta,id:planId,revision:meta?.revision||0,role:meta?.role||'owner',title:state.trips.find(x=>x.id===planId)?.title||meta?.title};
   state.extras.outbox??=[];state.extras.outbox.push({id,planId,command,input:wireInput,timestamp,baseRevision:meta?.revision||0,base});
  });notify({phase:'pending'});void sync();return result;
 };
 const sync=()=>syncing??=(async()=>{
  try{
   const identity=await request('me');if(identity.id!==actor.id)throw new Error('ACCOUNT_CHANGED');
   notify({phase:'syncing'});
   let state=(await store.read()).state;
   for(let count=0;count<100;count++){
    const pending=state.extras.outbox||[],issues=state.extras.syncIssues||{};
    const op=pending.find(x=>!issues[x.id]&&!pending.some(y=>y.planId===x.planId&&issues[y.id]));if(!op)break;
    try{
     const response=await request('operations',op);
     await store.edit(draft=>{
      draft.extras.outbox=(draft.extras.outbox||[]).filter(x=>x.id!==op.id);if(draft.extras.syncIssues)delete draft.extras.syncIssues[op.id];
      draft.extras.cloudPlans??={};draft.extras.cloudPlans[op.planId]={...draft.extras.cloudPlans[op.planId],id:op.planId,revision:response.plan.revision,role:response.plan.role,deleted:response.plan.deleted,title:response.plan.state.trips[0]?.title||draft.extras.cloudPlans[op.planId]?.title};
      if(!draft.extras.outbox.some(x=>x.planId===op.planId))replacePlan(draft,response.plan);
     });
    }catch(error){if([400,403,404,409,413].includes(error.status)){await store.edit(draft=>{draft.extras.syncIssues??={};draft.extras.syncIssues[op.id]={code:error.message,at:new Date().toISOString()};});}else throw error;}
    state=(await store.read()).state;
   }
   const remote=await request('plans');
   if(needsHydration((await store.read()).state,remote.plans))await store.edit(draft=>{
    const pendingIds=new Set((draft.extras.outbox||[]).map(x=>x.planId)),ids=new Set(remote.plans.map(x=>x.id));draft.extras.cloudPlans??={};
    for(const [id,meta] of Object.entries(draft.extras.cloudPlans)){if(!ids.has(id)&&!pendingIds.has(id)){replacePlan(draft,{id,state:{trips:[],days:[],items:[],places:[],extras:{}}});delete draft.extras.cloudPlans[id];}else if(!ids.has(id)&&pendingIds.has(id)&&meta.revision>0)meta.revoked=true;}
    for(const plan of remote.plans){draft.extras.cloudPlans[plan.id]={...draft.extras.cloudPlans[plan.id],id:plan.id,revision:plan.revision,role:plan.role,deleted:plan.deleted,revoked:false,title:plan.state.trips[0]?.title||draft.extras.cloudPlans[plan.id]?.title};if(!pendingIds.has(plan.id))replacePlan(draft,plan);}
    draft.extras.lastCloudSync=new Date().toISOString();
   });
   const snapshot=await store.read();notify({phase:snapshot.state.extras.outbox?.length?'pending':'saved',lastSaved:snapshot.state.extras.lastCloudSync});
  }catch(error){notify({phase:error.status===401?'signin':error.message==='ACCOUNT_CHANGED'?'account-changed':error.status?'error':'offline',error:error.message});}
  finally{syncing=null;}
 })();
 const resolve=async(planId,keep)=>{
  const {plans}=await request('plans'),plan=plans.find(x=>x.id===planId);if(keep&&(!plan||plan.role==='viewer'))throw new Error('TRIP_ACCESS_DENIED');
  await store.edit(draft=>{
   const pending=draft.extras.outbox||[],op=pending.find(x=>x.planId===planId&&draft.extras.syncIssues?.[x.id]);if(!op)return;
   if(keep){op.base=operationBase(plan.state,op.command,op.input);op.baseRevision=plan.revision;delete draft.extras.syncIssues[op.id];}
   else{draft.extras.outbox=pending.filter(x=>x.planId!==planId);for(const x of pending.filter(x=>x.planId===planId))delete draft.extras.syncIssues?.[x.id];replacePlan(draft,plan||{id:planId,state:{trips:[],days:[],items:[],places:[],extras:{}}});}
  });return sync();
 };
 return{actor,store,run,sync,resolve,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},get status(){return status;},exportTrip:async id=>exportTripPackage((await store.read()).state,id,digest),join:async token=>{const result=await request('join',{token});await sync();return result;},restore:async(id,revision)=>{const version=await request(`plans/${encodeURIComponent(id)}/versions/${revision}`);return run('restorePlanVersion',{planId:id,revision,versionState:version.state});}};
}
