import React from 'react';
import { freshSignInPath } from '../invite-link';

export default function SessionRecovery({ blocked = false }) {
  return <aside className="session-recovery" role="status">
    <div><strong>登录已过期</strong><p>{blocked ? '请先保存或取消当前编辑，再重新登录。' : '本机行程和待同步修改已保留。'}</p></div>
    {blocked ? <button className="button" disabled>重新登录</button> : <a className="button" href={freshSignInPath(`${location.pathname}${location.search}${location.hash}`)} target="_top">重新登录</a>}
  </aside>;
}
