import {travelDateParts} from '../../src/domain/trip/date-range';
import {stableJson} from '../../src/application/transfer/trip-package';
export const same=(a,b)=>stableJson(a)===stableJson(b);
const cleanItem=item=>item?Object.fromEntries(Object.entries(item).filter(([key])=>key!=='updatedAt')):null;
const itemCommands=new Set(['updateItemDetails','changeItemPlace','reorderItem','moveItemToDay','moveItemToUnscheduled','deleteItem','permanentlyDeleteItem']);
const detailGroups=[['title'],['note'],['isFixed'],['type','payload'],['timeMode','startDateTime','endDateTime','period']];
export function itemDetailsChanges(input,original){
 const patch={itemId:input.itemId};
 for(const fields of detailGroups)if(fields.some(key=>key in input&&!same(input[key],original[key])))for(const key of fields)if(key in input)patch[key]=input[key];
 if(input.placeTarget)patch.placeTarget=input.placeTarget;
 return patch;
}
export function operationBase(state,command,input){
 const item=state.items.find(x=>x.id===input.itemId),trip=state.trips.find(x=>x.id===(input.tripId||item?.tripId||input.snapshot?.item?.tripId));
 const targetDayId=input.dayId||input.targetDayId;const day=state.days.find(x=>x.id===targetDayId);
 const order=scope=>state.items.filter(x=>x.dayId===scope&&x.tripId===trip?.id).sort((a,b)=>a.sortOrder-b.sortOrder).map(x=>[x.id,x.sortOrder]);
 return{item:structuredClone(item||null),trip:trip?{title:trip.title,startDate:trip.startDate,endDate:trip.endDate}:null,day:day?{id:day.id,date:day.date}:null,orders:{from:order(item?.dayId??null),to:order(targetDayId??null)},structural:state.days.filter(x=>x.tripId===trip?.id).map(x=>[x.id,x.date,x.dayIndex]).sort(),times:state.items.filter(x=>x.tripId===trip?.id).map(x=>[x.id,x.dayId,x.sortOrder,x.timeMode,x.startDateTime,x.endDateTime,x.type]).sort()};
}
export function rebase(state,op){
 const input=structuredClone(op.input),base=op.base,current=state.items.find(x=>x.id===input.itemId),trip=state.trips[0];
 const conflict=()=>{throw Object.assign(new Error('EDIT_CONFLICT'),{status:409,details:{state}});};
 if(op.command==='updateItemDetails'){
  if(!base?.item||!current)conflict();
  const patch={itemId:input.itemId};
  for(const fields of detailGroups){
   if(fields.some(key=>key in input&&!same(input[key],base.item[key]))){
    if(fields.some(key=>!same(current[key],base.item[key])&&!(key in input&&same(current[key],input[key]))))conflict();
    for(const key of fields)if(key in input)patch[key]=input[key];
   }
  }
  if(input.placeTarget){if(current.placeId!==base.item.placeId)conflict();patch.placeTarget=input.placeTarget;}
  return patch;
 }
 if(itemCommands.has(op.command)){
  if(!base?.item||!current)conflict();
  if(['deleteItem','permanentlyDeleteItem','changeItemPlace'].includes(op.command)&&!same(cleanItem(current),cleanItem(base.item)))conflict();
  if(['reorderItem','moveItemToDay','moveItemToUnscheduled'].includes(op.command)){
   const now=operationBase(state,op.command,input);if(!same(now.orders,base.orders)||current.dayId!==base.item.dayId)conflict();
  }
 }
 if(op.command==='renameTrip'&&base?.trip&&trip.title!==base.trip.title&&trip.title!==input.title.trim())conflict();
 if(['insertTripDay','deleteTripDay','changeTripDateRange','deleteTrip'].includes(op.command)){
  const now=operationBase(state,op.command,input);if(!same(now.structural,base?.structural)||!same(now.times,base?.times))conflict();
 }
 if(['addItem','confirmPlaceSearchResult','confirmMapPickerPlace','moveItemToDay'].includes(op.command)&&(input.dayId||input.targetDayId)){
  const now=state.days.find(x=>x.id===(input.dayId||input.targetDayId));if(!now||now.date!==base?.day?.date)conflict();
 }
 if(op.command==='restoreDeletedItem'){
  const stored=state.extras.trash?.find(x=>x.item.id===input.snapshot?.item?.id);if(!stored)conflict();input.snapshot=stored;
 }
 return input;
}
export function idsFor(namespace,opId){let counter=0;return()=>`${namespace}:${opId}:${counter++}`;}

export function assertCloudDateRange(command,input){
 if(!['createTrip','changeTripDateRange'].includes(command))return;
 travelDateParts(input.startDate);travelDateParts(input.endDate);
 const days=(Date.parse(`${input.endDate}T00:00:00.000Z`)-Date.parse(`${input.startDate}T00:00:00.000Z`))/86400000+1;
 if(days>10000)throw new Error('旅行日期范围过长，请控制在 10000 天以内');
}
