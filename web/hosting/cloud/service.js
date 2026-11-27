import { assertCloudDateRange, operationBase, rebase, idsFor } from '../../src/cloud-contract';
import { repositories, diagnoseState } from '../../src/store';
import { createWebCommands } from '../../src/commands';
import { copyTripState, replaceImportedTrip, parseTripPackage, exportTripPackage, stableJson } from '../../../src/application/transfer/trip-package';
const empty=()=>({trips:[],days:[],items:[],places:[],extras:{}});
export const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export class CloudError extends Error{constructor(status,code,details){super(code);this.status=status;this.details=details;}}
const ownerOnly=new Set(['deleteTrip','permanentlyDeleteItem','emptyTrashItem','restorePlanVersion','updateImportedTripPackage']);
export class CloudPlans{
 constructor(db){this.db=db;}
 async actor(identity){if(!identity?.id)throw new CloudError(401,'SIGN_IN_REQUIRED');const existing=await this.db.prepare('SELECT * FROM travel_users WHERE user_id=?').bind(identity.id).first();if(existing)return{...identity,namespace:existing.namespace};const ns=crypto.randomUUID();await this.db.prepare('INSERT OR IGNORE INTO travel_users(user_id,namespace,name,email) VALUES (?,?,?,?)').bind(identity.id,ns,identity.name||identity.email||'旅行者',identity.email||'').run();return{...identity,namespace:(await this.db.prepare('SELECT namespace FROM travel_users WHERE user_id=?').bind(identity.id).first()).namespace};}
 async list(actor){const rows=(await this.db.prepare("SELECT p.*,CASE WHEN p.owner_id=? THEN 'owner' ELSE m.role END AS role FROM travel_plans p LEFT JOIN travel_members m ON m.plan_id=p.id AND m.user_id=? WHERE p.owner_id=? OR m.user_id=? ORDER BY p.created_at").bind(actor.id,actor.id,actor.id,actor.id).all()).results;return rows.map(row=>({id:row.id,revision:row.revision,role:row.role,deleted:!!row.deleted,state:JSON.parse(row.state_json)}));}
 async plan(actor,id,write=false,onlyOwner=false){const row=await this.db.prepare('SELECT * FROM travel_plans WHERE id=?').bind(id).first();if(!row)throw new CloudError(404,'TRIP_NOT_FOUND');const member=await this.db.prepare('SELECT role FROM travel_members WHERE plan_id=? AND user_id=?').bind(id,actor.id).first();const role=row.owner_id===actor.id?'owner':member?.role;if(!role||(onlyOwner&&role!=='owner')||(write&&role==='viewer'))throw new CloudError(403,'TRIP_ACCESS_DENIED');return{...row,role,state:JSON.parse(row.state_json)};}
 async command(actor,op){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(op.id)||typeof op.command!=='string'||!op.input||!op.base||!Number.isFinite(Date.parse(op.timestamp)))throw new CloudError(400,'INVALID_OPERATION');
  assertCloudDateRange(op.command,op.input);const payloadHash=await digest(stableJson(op));const prior=await this.db.prepare('SELECT * FROM travel_operations WHERE user_id=? AND operation_id=?').bind(actor.id,op.id).first();
  if(prior){if(prior.payload_hash!==payloadHash)throw new CloudError(409,'OPERATION_ID_REUSED');await this.plan(actor,prior.plan_id,true,ownerOnly.has(op.command));return JSON.parse(prior.result_json);}
  const fresh=op.command==='createTrip'||op.command==='importTripPackage',createId=idsFor(actor.namespace,op.id);
  for(let attempt=0;attempt<8;attempt++){
   const before=fresh?null:await this.plan(actor,op.planId,true,ownerOnly.has(op.command));if(before?.deleted&&op.command!=='restorePlanVersion')throw new CloudError(409,'TRIP_DELETED');
   let state=before?structuredClone(before.state):empty();let result;
   if(op.command==='importTripPackage'||op.command==='updateImportedTripPackage'){
    const pack=await parseTripPackage(op.input.package,digest);if(before&&before.revision!==op.baseRevision)throw new CloudError(409,'EDIT_CONFLICT',{state:before.state,revision:before.revision});if(before&&before.state.extras.importedFrom?.sourceTripId!==pack.state.trips[0].id)throw new CloudError(400,'IMPORT_SOURCE_MISMATCH');state=before?replaceImportedTrip(pack.state,op.planId,createId,op.timestamp):copyTripState(pack.state,createId,op.timestamp);state.extras.importedFrom={sourceTripId:pack.state.trips[0].id,sourceDigest:pack.integrity.digest,importedAt:op.timestamp};result={data:state.trips[0]};
   }else if(op.command==='restorePlanVersion'){
    const saved=await this.db.prepare('SELECT state_json FROM travel_versions WHERE plan_id=? AND revision=?').bind(op.planId,op.input.revision).first();if(!saved)throw new CloudError(404,'RECOVERY_NOT_FOUND');if(before.revision!==op.baseRevision)throw new CloudError(409,'EDIT_CONFLICT',{state:before.state,revision:before.revision});state=JSON.parse(saved.state_json);result={data:state.trips[0]};
   }else{
    const input=fresh?op.input:rebase(state,op);
    const memory={runInTransaction:async task=>task(repositories(state))};const commands=createWebCommands(memory,{createId:idsFor(actor.namespace,op.id),now:()=>op.timestamp});
    if(!commands[op.command])throw new CloudError(400,'UNKNOWN_COMMAND');result=await commands[op.command](input);
   }
   const issues=diagnoseState(state);if(issues.length)throw new CloudError(400,'INVALID_PLAN_REFERENCES');
   const planId=before?.id||state.trips[0]?.id;if(!planId)throw new CloudError(400,'INVALID_PLAN');if(fresh&&planId!==op.planId)throw new CloudError(400,'INVALID_OPERATION_IDS');
   const revision=(before?.revision||0)+1,deleted=state.trips.length===0;const response={result,plan:{id:planId,revision,role:before?.role||'owner',deleted,state}};const serialized=JSON.stringify(response),time=new Date().toISOString();
   let statements;
   if(fresh){statements=[this.db.prepare('INSERT INTO travel_plans(id,owner_id,revision,state_json,deleted,last_operation_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(planId,actor.id,revision,JSON.stringify(state),0,op.id,time,time)];}
   else{const permission=ownerOnly.has(op.command)?'owner_id=?':"(owner_id=? OR EXISTS(SELECT 1 FROM travel_members WHERE plan_id=travel_plans.id AND user_id=? AND role='editor'))";const args=[JSON.stringify(state),deleted?1:0,op.id,time,planId,before.revision,actor.id];if(!ownerOnly.has(op.command))args.push(actor.id);statements=[this.db.prepare(`UPDATE travel_plans SET state_json=?,deleted=?,last_operation_id=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND ${permission}`).bind(...args),this.db.prepare('INSERT INTO travel_versions(plan_id,revision,state_json,saved_at) SELECT ?,?,?,? FROM travel_plans WHERE id=? AND last_operation_id=?').bind(planId,before.revision,JSON.stringify(before.state),time,planId,op.id)];}
   statements.push(this.db.prepare('INSERT INTO travel_operations(user_id,operation_id,plan_id,payload_hash,result_json) SELECT ?,?,?,?,? FROM travel_plans WHERE id=? AND last_operation_id=?').bind(actor.id,op.id,planId,payloadHash,serialized,planId,op.id));
   try{const committed=await this.db.batch(statements);if(committed[0].meta.changes===1)return response;const done=await this.db.prepare('SELECT payload_hash,result_json FROM travel_operations WHERE user_id=? AND operation_id=?').bind(actor.id,op.id).first();if(done&&done.payload_hash===payloadHash)return JSON.parse(done.result_json);}
   catch(error){const done=await this.db.prepare('SELECT payload_hash,result_json FROM travel_operations WHERE user_id=? AND operation_id=?').bind(actor.id,op.id).first();if(done&&done.payload_hash===payloadHash)return JSON.parse(done.result_json);if(fresh)throw new CloudError(409,'OPERATION_CONFLICT');throw error;}
  }
  throw new CloudError(409,'RETRY_REQUIRED');
 }
 async export(actor,id){const row=await this.plan(actor,id);if(row.deleted)throw new CloudError(404,'TRIP_NOT_FOUND');return exportTripPackage(row.state,id,digest);}
 async members(actor,id){await this.plan(actor,id,false,true);return{members:(await this.db.prepare('SELECT m.user_id,m.role,u.name,u.email FROM travel_members m JOIN travel_users u ON u.user_id=m.user_id WHERE m.plan_id=?').bind(id).all()).results,invites:(await this.db.prepare('SELECT token_hash,email,role,expires_at,accepted_by FROM travel_invites WHERE plan_id=?').bind(id).all()).results};}
 async invite(actor,id,email,role){await this.plan(actor,id,true,true);if(!['editor','viewer'].includes(role)||!/^\S+@\S+\.\S+$/.test(email))throw new CloudError(400,'INVALID_INVITE');const token=crypto.randomUUID()+crypto.randomUUID();const hash=await digest(token),expires=new Date(Date.now()+7*86400000).toISOString();await this.db.prepare('INSERT INTO travel_invites(token_hash,plan_id,email,role,expires_at) VALUES (?,?,?,?,?)').bind(hash,id,email.trim().toLowerCase(),role,expires).run();return{token,expiresAt:expires,email,role};}
 async claim(actor,token){
  if(typeof token!=='string'||token.length>200)throw new CloudError(400,'INVALID_INVITE');
  const hash=await digest(token);const invite=await this.db.prepare('SELECT * FROM travel_invites WHERE token_hash=?').bind(hash).first();
  if(!invite||invite.expires_at<new Date().toISOString())throw new CloudError(404,'INVITE_EXPIRED');
  if(actor.email?.toLowerCase()!==invite.email)throw new CloudError(403,'INVITE_ACCOUNT_MISMATCH');
  if(invite.accepted_by){if(invite.accepted_by!==actor.id)throw new CloudError(409,'INVITE_ALREADY_USED');await this.plan(actor,invite.plan_id);return{planId:invite.plan_id};}
  await this.db.batch([
   this.db.prepare("INSERT INTO travel_members(plan_id,user_id,role) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM travel_invites i JOIN travel_plans p ON p.id=i.plan_id WHERE i.token_hash=? AND i.accepted_by IS NULL AND i.expires_at>=? AND p.deleted=0) ON CONFLICT(plan_id,user_id) DO UPDATE SET role=excluded.role").bind(invite.plan_id,actor.id,invite.role,hash,new Date().toISOString()),
   this.db.prepare('UPDATE travel_invites SET accepted_by=? WHERE token_hash=? AND accepted_by IS NULL').bind(actor.id,hash)
  ]);
  const accepted=await this.db.prepare('SELECT accepted_by FROM travel_invites WHERE token_hash=?').bind(hash).first();if(accepted?.accepted_by!==actor.id)throw new CloudError(409,'INVITE_ALREADY_USED');await this.plan(actor,invite.plan_id);return{planId:invite.plan_id};
 }
 async revoke(actor,id,userId,tokenHash){await this.plan(actor,id,true,true);
  const statements=[];if(tokenHash)statements.push(this.db.prepare('DELETE FROM travel_invites WHERE plan_id=? AND token_hash=?').bind(id,tokenHash));
  if(userId){statements.push(this.db.prepare('DELETE FROM travel_invites WHERE plan_id=? AND (accepted_by=? OR email=lower((SELECT email FROM travel_users WHERE user_id=?)))').bind(id,userId,userId),this.db.prepare('DELETE FROM travel_members WHERE plan_id=? AND user_id=?').bind(id,userId));}
  if(statements.length)await this.db.batch(statements);return{ok:true};
 }
}
export async function handleCloudApi(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/cloud/'))return null;
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!env.DB)return json({error:'CLOUD_NOT_CONFIGURED'},503);
 if(request.method!=='GET'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'INVALID_ORIGIN'},403);
 const local=env.LOCAL_DEV==='1'&&['localhost','127.0.0.1'].includes(url.hostname);
 const localId=request.headers.get('x-travel-test-user')||'local-owner';
 const identity=local?{id:localId,email:`${localId}@example.invalid`,name:localId}:{id:request.headers.get('oai-authenticated-user-id'),email:request.headers.get('oai-authenticated-user-email'),name:request.headers.get('oai-authenticated-user-full-name')};
 try{
  const service=new CloudPlans(env.DB);const actor=await service.actor(identity);const path=url.pathname.slice('/api/cloud/'.length);
  if(path==='me'&&request.method==='GET')return json(actor);
  if(path==='plans'&&request.method==='GET')return json({plans:await service.list(actor)});
  let body={};if(request.method!=='GET'){const raw=await request.text();if(raw.length>2*1024*1024)throw new CloudError(413,'FILE_TOO_LARGE');body=JSON.parse(raw);}
  if(path==='operations'&&request.method==='POST')return json(await service.command(actor,body));
  if(path==='join'&&request.method==='POST')return json(await service.claim(actor,body.token));
  const version=path.match(/^plans\/([^/]+)\/versions\/(\d+)$/);if(version&&request.method==='GET'){const id=decodeURIComponent(version[1]);await service.plan(actor,id,false,true);const row=await env.DB.prepare('SELECT state_json FROM travel_versions WHERE plan_id=? AND revision=?').bind(id,Number(version[2])).first();if(!row)throw new CloudError(404,'RECOVERY_NOT_FOUND');return json({state:JSON.parse(row.state_json)});}
  const match=path.match(/^plans\/([^/]+)\/(export|members|invite|revoke|versions)$/);if(!match)return json({error:'NOT_FOUND'},404);const id=decodeURIComponent(match[1]);
  if(match[2]==='export'&&request.method==='GET')return json(await service.export(actor,id));
  if(match[2]==='members'&&request.method==='GET')return json(await service.members(actor,id));
  if(match[2]==='invite'&&request.method==='POST')return json(await service.invite(actor,id,body.email,body.role));
  if(match[2]==='revoke'&&request.method==='POST')return json(await service.revoke(actor,id,body.userId,body.tokenHash));
  if(match[2]==='versions'&&request.method==='GET'){await service.plan(actor,id,false,true);return json({versions:(await env.DB.prepare('SELECT revision,saved_at FROM travel_versions WHERE plan_id=? ORDER BY revision DESC LIMIT 20').bind(id).all()).results});}
  return json({error:'METHOD_NOT_ALLOWED'},405);
 }catch(error){return json({error:error.message,details:error.details},error.status||400);}
}
export {operationBase,idsFor};
