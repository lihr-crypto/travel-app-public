import React from 'react';
import { chineseDate } from '../utils';

// Floating confirmation for a place picked on the Trip map. It writes nothing: the button only opens the Item editor.
export function candidateTargetLabel(day) {
  return day ? `第${day.dayIndex}天` : '未安排行程';
}

const coordinatesLabel = ({ latitude, longitude }) => `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

export function candidateTitle(candidate) {
  return candidate.kind === 'place' ? candidate.result.name : candidate.enrichment?.name || '地图上的选中地点';
}

export function candidateDetail(candidate) {
  if (candidate.kind === 'place') return candidate.result.address || candidate.result.regionLabel || coordinatesLabel(candidate.coordinate);
  if (candidate.resolving) return '正在查询地点名称…';
  const { enrichment } = candidate;
  return enrichment?.address && enrichment.address !== enrichment.name ? enrichment.address : coordinatesLabel(candidate.coordinate);
}

export default function MapCandidateCard({ candidate, days, canChooseDay, bottom, onTargetChange, onConfirm, onClose }) {
  const target = days.find(day => day.id === candidate.targetDayId) || null, label = candidateTargetLabel(target);
  return <section className="map-candidate" aria-label="地图上选中的地点" style={bottom == null ? undefined : { bottom }}>
    <div className="map-candidate-head">
      <div className="map-candidate-text"><strong>{candidateTitle(candidate)}</strong><small>{candidateDetail(candidate)}</small></div>
      <button type="button" className="map-candidate-close" aria-label="关闭" onClick={onClose}>×</button>
    </div>
    <div className="map-candidate-foot">
      {canChooseDay
        ? <label className="map-candidate-target"><span>加入</span><select aria-label="加入到" value={candidate.targetDayId || ''} onChange={event => onTargetChange(event.target.value || null)}><option value="">未安排行程</option>{days.map(day => <option key={day.id} value={day.id}>第{day.dayIndex}天 · {chineseDate(day.date, false)}</option>)}</select></label>
        : <span className="map-candidate-target">加入<b>{label}</b></span>}
      <button type="button" className="button map-candidate-add" aria-label={`添加到${label}`} onClick={onConfirm}>添加</button>
    </div>
  </section>;
}
