import React, { useEffect, useState } from 'react';
import { usePlan } from '../PlanContext';
import { TYPE_LABELS, PERIODS, TRANSPORT, chineseDate, externalMap } from '../utils';
import Modal from './Modal';
import EditorIcon from './ItemIcon';
import PlacePicker from './PlacePicker';
import { useMotionState } from '../motion';

function initial(item, day) {
  return { title: item?.title || '', type: item?.type || 'sightseeing', timeMode: item?.timeMode || 'none', period: item?.period || 'morning', startDate: item?.startDateTime?.slice(0,10) || day?.date || '', startTime: item?.startDateTime?.slice(11,16) || '', endDate: item?.endDateTime?.slice(0,10) || day?.date || '', endTime: item?.endDateTime?.slice(11,16) || '', note: item?.note || '', origin: item?.payload?.origin || '', destination: item?.payload?.destination || '', serviceNumber: item?.payload?.serviceNumber || '', transportMode: item?.payload?.mode || '', customLabel: item?.payload?.kind === 'custom' ? item.payload.label : '' };
}

export default function ItemEditor({ trip, dayId, item, initialPlace = null, onClose, onSaved }) {
  const { state, run, working, setDraftOpen } = usePlan();
  const day = state.days.find(day => day.id === dayId);
  const [itemBaseline] = useState(() => item ? structuredClone(item) : null);
  // `initialPlace` is a picker target ({kind:'search'} for a labelled place, {kind:'map-picker'} for a bare point) that becomes the editor's pending Place.
  const [draft, setDraft] = useState(() => ({ ...initial(item, day), ...(initialPlace && { title: (initialPlace.kind === 'search' ? initialPlace.result.name : initialPlace.enrichment?.name) || '' }) })), [placeTarget, setPlaceTarget] = useState(initialPlace), [page, setPage] = useMotionState('form');
  useEffect(() => { setDraftOpen(true); return () => setDraftOpen(false); }, [setDraftOpen]);
  const oldPlace = state.places.find(place => place.id === item?.placeId);
  const pendingPlace = placeTarget?.kind === 'search' ? placeTarget.result : placeTarget?.kind === 'map-picker' ? { ...placeTarget.enrichment, coordinate: placeTarget.coordinate, name: placeTarget.enrichment?.name || '地图上的选中地点' } : placeTarget?.kind === 'none' ? null : oldPlace;
  const set = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const captureTimeFields = element => {
    if (!element) return;
    const values = new FormData(element);
    setDraft(current => ({ ...current, ...Object.fromEntries(['startTime', 'endTime', 'startDate', 'endDate'].filter(name => values.has(name)).map(name => [name, values.get(name)])) }));
  };
  const choosePlace = event => {
    const element = event.currentTarget.closest('form');
    captureTimeFields(element);
    setPage('place');
  };
  const save = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startTime = form.get('startTime') || ''; const endTime = form.get('endTime') || '';
    const startDate = form.get('startDate') || draft.startDate; const endDate = form.get('endDate') || draft.endDate;
    const start = draft.timeMode === 'exact' && startTime ? `${startDate || day?.date || trip.startDate}T${startTime}` : null;
    const end = draft.timeMode === 'exact' && endTime ? `${endDate || day?.date || trip.startDate}T${endTime}` : null;
    const payload = draft.type === 'transport' ? { kind: 'transport', ...(draft.transportMode && { mode: draft.transportMode }), ...(draft.origin.trim() && { origin: draft.origin.trim() }), ...(draft.destination.trim() && { destination: draft.destination.trim() }), ...(draft.serviceNumber.trim() && { serviceNumber: draft.serviceNumber.trim() }) } : draft.type === 'hotel' ? { kind: 'hotel' } : draft.type === 'custom' && draft.customLabel.trim() ? { kind: 'custom', label: draft.customLabel.trim() } : null;
    const timeDetails = draft.type === 'hotel' ? {} : { timeMode: draft.timeMode === 'exact' && !start && !end ? 'none' : draft.timeMode, startDateTime: start, endDateTime: end, period: draft.timeMode === 'period' ? draft.period : null };
    const details = { title: draft.title.trim() || pendingPlace?.name || TYPE_LABELS[draft.type], type: draft.type, ...timeDetails, note: draft.note, payload };
    try {
      let saved;
      if (item) saved = await run('updateItemDetails', { itemId: item.id, ...details, ...(placeTarget && { placeTarget }) }, '行程详情已保存', { itemBaseline });
      else if (placeTarget?.kind === 'search') saved = await run('confirmPlaceSearchResult', { tripId: trip.id, dayId, result: placeTarget.result, draft: details }, '行程已添加');
      else if (placeTarget?.kind === 'map-picker') saved = await run('confirmMapPickerPlace', { tripId: trip.id, dayId, coordinate: placeTarget.coordinate, provider: placeTarget.provider, enrichment: placeTarget.enrichment, draft: details }, '行程已添加');
      else saved = await run('addItem', { tripId: trip.id, dayId, ...details }, '行程已添加');
      onSaved?.(saved.data?.item?.id || saved.data?.id || item?.id); onClose();
    } catch { /* draft stays mounted */ }
  };
  const actions = <div className="editor-actions"><button type="button" className="button editor-cancel" onClick={onClose}>取消</button><button type="submit" form="item-editor-form" className="button" disabled={working}>{working ? '保存中…' : '保存'}</button></div>;
  return <Modal title={item ? '编辑详情' : '添加行程'} onClose={onClose} wide className="item-editor-modal" footer={page === 'form' ? actions : null}>
    {page === 'place' ? <PlacePicker trip={trip} onBack={() => setPage('form')} onSelect={target => { setPlaceTarget(target); if (!draft.title) setDraft(current => ({ ...current, title: target.kind === 'search' ? target.result.name : target.enrichment?.name || '' })); setPage('form'); }} /> : <>
    <div className="editor-day">{day ? <><strong>第{day.dayIndex}天</strong><span>{chineseDate(day.date)}</span></> : <strong>未安排行程</strong>}</div>
    <form id="item-editor-form" className="item-form" onSubmit={save}>
      <section className="editor-identity" aria-label="名称与地点">
        <label className="editor-name">名称 <span>（可选）</span><input aria-label="行程名称" value={draft.title} onChange={event => set('title', event.target.value)} placeholder={pendingPlace?.name || '行程名称'} /></label>
        <div className="editor-linked-place">
          <button type="button" className="editor-place-main" aria-label={pendingPlace ? '更改地点' : '选择地点'} onClick={choosePlace}>
            <EditorIcon name="place"/>
            <span>{pendingPlace ? <><strong>{pendingPlace.name}</strong>{pendingPlace.address && <small>{pendingPlace.address}</small>}</> : <strong>添加地点</strong>}</span>
            <span className="editor-chevron" aria-hidden="true">›</span>
          </button>
          {pendingPlace && <details className="editor-place-menu"><summary aria-label="地点操作">⋯</summary><div>{item && !placeTarget && <a href={externalMap(oldPlace)} target="_blank" rel="noreferrer">在地图中打开 ↗</a>}<button type="button" aria-label="移除地点" onClick={() => setPlaceTarget({ kind: 'none' })}>移除地点</button></div></details>}
        </div>
      </section>
      <section className="editor-section" aria-labelledby="item-type-label">
        <h3 id="item-type-label">类型</h3>
        <div className="editor-types" role="group" aria-labelledby="item-type-label">{Object.entries(TYPE_LABELS).map(([type, name]) => <button type="button" key={type} className={draft.type === type ? 'editor-type active' : 'editor-type'} onClick={event => { captureTimeFields(event.currentTarget.closest('form')); set('type', type); }} aria-pressed={draft.type === type}><EditorIcon name={type}/><span>{name}</span></button>)}</div>
        {draft.type === 'custom' && <label className="editor-extra">类型名称（可选）<input value={draft.customLabel} maxLength={20} onChange={event => set('customLabel', event.target.value)} placeholder="例如：展会" /></label>}
      </section>
      {draft.type === 'transport' && <section className="editor-section"><h3>交通信息</h3><label className="editor-extra">班次／车次／航班号（可选）<input value={draft.serviceNumber} onChange={event => set('serviceNumber', event.target.value)} placeholder="例如：CA1234" /></label><div className="pill-options" role="group" aria-label="交通方式">{Object.entries(TRANSPORT).map(([mode, name]) => <button type="button" key={mode} className={draft.transportMode === mode ? 'pill active' : 'pill'} aria-pressed={draft.transportMode === mode} onClick={() => set('transportMode', draft.transportMode === mode ? '' : mode)}>{name}</button>)}</div></section>}
      {draft.type !== 'hotel' && <section className="editor-section" aria-labelledby="editor-time-heading"><h3 id="editor-time-heading">时间</h3><div className="editor-time-modes" role="group" aria-labelledby="editor-time-heading">{[['none','无时间'],['period','时段'],['exact','具体时间']].map(([mode, name]) => <button key={mode} type="button" aria-pressed={draft.timeMode === mode} className={draft.timeMode === mode ? 'active' : ''} onClick={event => { captureTimeFields(event.currentTarget.closest('form')); set('timeMode', mode); }}>{name}</button>)}</div>{draft.timeMode === 'period' && <div className="editor-periods" role="group" aria-label="时段">{Object.entries(PERIODS).map(([period, name]) => <button key={period} type="button" aria-pressed={draft.period === period} className={draft.period === period ? 'active' : ''} onClick={() => set('period', period)}>{name}</button>)}</div>}{draft.timeMode === 'exact' && <div className="time-fields">{[['start', '出发时间'],['end', '到达时间']].map(([field,name]) => <div className="time-row" key={field}><label htmlFor={`editor-${field}-time`}>{name}</label><div>{(!day || draft[`${field}Date`] !== day.date) && <input aria-label={`${name}日期`} name={`${field}Date`} type="date" lang="zh-CN" defaultValue={draft[`${field}Date`]} onInput={event => set(`${field}Date`,event.currentTarget.value)} />}<input id={`editor-${field}-time`} aria-label={name} name={`${field}Time`} type="time" lang="zh-CN" defaultValue={draft[`${field}Time`]} onInput={event => set(`${field}Time`,event.currentTarget.value)} /></div>{draft[`${field}Time`] && <button type="button" className="text-button" aria-label={`移除${name}`} onClick={event => { const input = event.currentTarget.parentElement.querySelector('input[type=time]'); if (input) input.value = ''; set(`${field}Time`,''); }}>清除</button>}</div>)}</div>}</section>}
      <section className="editor-section editor-note" aria-labelledby="editor-note-heading"><h3 id="editor-note-heading">备注</h3><textarea aria-label="备注" value={draft.note} onChange={event => set('note',event.target.value)} placeholder="添加备注" rows={3} /></section>
    </form></>}
  </Modal>;
}
