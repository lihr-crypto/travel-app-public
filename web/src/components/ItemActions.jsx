import React from 'react';
import Modal from './Modal';
import { usePlan } from '../PlanContext';
import { daysFor, chineseDate } from '../utils';
import { useMotionState } from '../motion';

export default function ItemActions({ item, trip, onClose, onEdit }) {
  const { state, run, working, isOwner } = usePlan(); const [page,setPage]=useMotionState('menu');
  const days=daysFor(state,trip.id);
  const move=async day=>{try{await run('moveItemToDay',{itemId:item.id,targetDayId:day.id},'行程日期已安排');onClose();}catch{}};
  const unschedule=async()=>{try{await run('moveItemToUnscheduled',{itemId:item.id},'已移到未安排行程');onClose();}catch{}};
  const remove=async()=>{try{await run('permanentlyDeleteItem',{itemId:item.id},'行程已删除');onClose();}catch{}};
  return <Modal title={page==='date'?'安排到某一天':page==='delete'?'删除行程':item.title} onClose={onClose}>{page==='menu'?<div className="menu-list"><button onClick={()=>{onClose();onEdit(item);}}>编辑详情 <span>›</span></button><button onClick={()=>setPage('date')}>{item.dayId?'调整行程日期':'安排到某一天'} <span>›</span></button>{item.dayId && <button onClick={unschedule} disabled={working}>移到未安排行程</button>}{isOwner(trip.id)&&<button className="danger" disabled={working} onClick={()=>setPage('delete')}>删除行程</button>}</div>:page==='date'?<div className="day-choices">{days.map(day=><button key={day.id} disabled={working || day.id===item.dayId} onClick={()=>move(day)}><strong>第{day.dayIndex}天</strong><span>{chineseDate(day.date,false)}</span>{day.id===item.dayId&&<span>当前</span>}</button>)}</div>:<div className="confirmation"><p>删除“{item.title}”？此操作为永久删除，不进入回收站。</p><div className="form-save"><button className="button button-ghost" onClick={()=>setPage('menu')}>取消</button><button className="button button-danger" disabled={working} onClick={remove}>删除行程</button></div></div>}</Modal>;
}
