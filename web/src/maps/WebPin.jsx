import React from 'react';
import { getMapPinGeometry } from '@/infrastructure/map/map-pin';

// Web-only map pins, drawn as SVG so they stay sharp at any pixel ratio. The native app keeps its own PNG pins; the frame size
// and tip position here are the shared geometry, so the saved coordinate stays under the pin's tip.
const GREEN = '#086050', DEEP = '#053F35', WHITE = '#FFFFFF';
// A teardrop on a 24 x 32 grid: round head, soft point. The head centre is (12, 12).
const DROP = 'M12 0C5.4 0 0 5.3 0 11.9c0 4.6 2.6 8.7 5.5 12.2C8.2 27.4 12 32 12 32s3.8-4.6 6.5-7.9C21.4 20.6 24 16.5 24 11.9 24 5.3 18.6 0 12 0z';
const SHADOW = 'drop-shadow(0 2px 2.5px rgba(23,23,23,.32))';

function Badge({ count, selected }) {
  const size = selected ? 52 : 48, circle = selected ? 44 : 40, text = String(count);
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible', filter: SHADOW }}>
    <circle cx={size / 2} cy={size / 2} r={circle / 2 - 1.5} fill={selected ? DEEP : GREEN} stroke={WHITE} strokeWidth={selected ? 3 : 2.5} />
    <text x={size / 2} y={size / 2} textAnchor="middle" dy=".35em" fill={WHITE} fontSize={text.length > 2 ? 13 : selected ? 17 : 16} fontWeight="700" fontFamily="-apple-system, system-ui, sans-serif">{text}</text>
  </svg>;
}

// variant: 'normal' | 'selected' | 'candidate' (a place waiting to be added). `ordinal` is the Day order number; without one the pin
// shows a small dot. `clusterCount` draws the round count badge used in Overview instead.
export default function WebPin({ variant = 'normal', ordinal, clusterCount }) {
  const selected = variant === 'selected', candidate = variant === 'candidate';
  if (clusterCount !== undefined) return <Badge count={clusterCount} selected={selected} />;
  const g = getMapPinGeometry(selected || candidate);
  const sx = g.pinWidth / 24, sy = (g.tipY - g.pinTop) / 32, headX = g.pinLeft + 12 * sx, headY = g.pinTop + 12 * sy, disc = 7.2 * sx;
  const text = ordinal !== undefined ? String(ordinal) : null;
  const fill = candidate ? WHITE : selected ? DEEP : GREEN, ink = candidate || !selected ? GREEN : DEEP;
  return <svg width={g.frameWidth} height={g.frameHeight} viewBox={`0 0 ${g.frameWidth} ${g.frameHeight}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible', filter: SHADOW }}>
    <g transform={`translate(${g.pinLeft} ${g.pinTop}) scale(${sx} ${sy})`}>
      <path d={DROP} fill={fill} stroke={candidate ? GREEN : WHITE} strokeWidth={(candidate ? 2.6 : selected ? 2.4 : 1.8) / Math.min(sx, sy)} strokeLinejoin="round" />
    </g>
    {candidate
      ? <g stroke={GREEN} strokeWidth="2.6" strokeLinecap="round"><path d={`M${headX - 5} ${headY}H${headX + 5}M${headX} ${headY - 5}V${headY + 5}`} /></g>
      : <>
        <circle cx={headX} cy={headY} r={disc} fill={WHITE} />
        {text === null
          ? <circle cx={headX} cy={headY} r={selected ? 3.6 : 3.1} fill={ink} />
          : <text x={headX} y={headY + 0.5} textAnchor="middle" dy=".35em" fill={ink} fontSize={text.length > 1 ? (selected ? 11 : 10) : (selected ? 13 : 12)} fontWeight="700" fontFamily="-apple-system, system-ui, sans-serif">{text}</text>}
      </>}
  </svg>;
}
