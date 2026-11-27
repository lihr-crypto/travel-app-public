import React from 'react';
import ItemIcon from './ItemIcon';
import { TYPE_LABELS, itemTime } from '../utils';
export default function ItemRow({ item, place, selected, onSelect, onActions }) {
  return <div className={`itinerary-row ${selected?'selected':''}`}><button className="row-main" onClick={onSelect}><span className="row-time">{itemTime(item)}</span><span className="row-body"><strong>{item.title}</strong><small><ItemIcon name={item.type}/><span>{TYPE_LABELS[item.type]}{place&&place.name!==item.title?` · ${place.name}`:''}</span></small>{item.note&&<span className="row-note">{item.note}</span>}</span></button>{onActions&&<button className="icon-button" aria-label={`${item.title} 的操作`} onClick={onActions}>⋯</button>}</div>;
}
