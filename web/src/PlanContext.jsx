import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserStore } from './store';
import {openCloud} from './cloud';
import {appRequest} from './app-request';

export const legacyStore = createBrowserStore();
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
const Context = createContext(null);

export function readableError(error) {
  const message = String(error?.message ?? error);
  const known = {
    SERVICE_UNAVAILABLE: '服务暂时不可用，请稍后重试。', FIRST_CONNECTION_REQUIRED: '首次使用云端行程需要联网并登录。', SIGN_IN_REQUIRED:'请重新登录站点。', ACCOUNT_CHANGED:'登录账号发生变化，请重新打开页面。', TRIP_ACCESS_DENIED:'当前账号没有这趟旅行的编辑权限，未同步的内容已保留。', EDIT_CONFLICT:'这项内容已被另一位编辑者更改，请到同步状态中处理。', INVALID_TRIP_PACKAGE:'请选择 Travel 单趟行程文件。', INVALID_TRIP_PACKAGE_OWNER:'行程文件中的关联不完整，未执行导入。',
    BACKUP_CHECKSUM_MISMATCH: '备份内容校验失败，当前行程已保留。', INVALID_BACKUP_FORMAT: '这不是可识别的 Travel 行程备份。',
    WRITE_CONFLICT: '另一页面刚更新了行程，请刷新后重试。', DATABASE_BLOCKED: '其它旧页面占用了数据，请关闭旧页面后重试。',
    CONFLICT_RETRY_LIMIT: '当前操作较多，请稍后再试。', RECOVERY_NOT_FOUND: '找不到这份恢复记录。',
    IMPORT_REFERENCE_CONFLICT: '重复记录的归属冲突，合并未执行。请检查备份或选择替换，当前行程已保留。',
  };
  if (known[message]) return known[message];
  if (/INVALID_BACKUP_RECORD|INVALID_COLLECTION|INVALID_ID|Invalid TravelDate/.test(message)) return '备份中的记录格式不完整，当前行程已保留。';
  if (/quota/i.test(message) || error?.name === 'QuotaExceededError') return '浏览器空间不足，保存未完成，原数据已保留。请先导出备份。';
  if (/time|datetime|END_BEFORE_START/i.test(message)) return '时间填写不正确，请检查日期和到达／出发时间。';
  if (/TITLE|title.*empty|blank/i.test(message)) return '请填写有效的名称。';
  if (/REGION|provider|coordinate system/i.test(message)) return '地点来源与这趟旅行的范围不一致，请重新选择。';
  return message;
}

function Inner({ children }) {
  const resource=useQuery({queryKey:['cloud-controller'],queryFn:openCloud});
  const cloud=resource.data;
  const query = useQuery({ queryKey: ['travel-plan',cloud?.actor?.id], queryFn: ()=>cloud.store.read(),enabled:!!cloud });
  const [syncStatus,setSyncStatus]=useState({phase:'connecting'});
  const cache = useQueryClient();
  const [notice, setNotice] = useState(null);
  const [working, setWorking] = useState(0);
  const [draftOpen, setDraftOpen] = useState(false);
  const [config, setConfig] = useState(null);
  const [mapAuthRequired, setMapAuthRequired] = useState(false);
  useEffect(() => {
    if (!notice || notice.error || notice.action) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => cloud?.store.subscribe(() => { void cache.invalidateQueries({ queryKey: ['travel-plan'] }); }), [cache,cloud]);
  useEffect(()=>{if(!cloud)return;const unsub=cloud.subscribe(setSyncStatus),update=()=>void cloud.sync(),visible=()=>{if(document.visibilityState==='visible')update();};update();const timer=setInterval(update,5000);window.addEventListener('online',update);document.addEventListener('visibilitychange',visible);return()=>{unsub();clearInterval(timer);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',visible);};},[cloud]);
  const refreshMaps = useCallback(async () => {
    try {
      const next = await appRequest('/api/map-config');
      setMapAuthRequired(false);
      setConfig(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    } catch (error) { if (error.status === 401) setMapAuthRequired(true); setConfig(previous => previous ?? { unavailable: true }); }
  }, []);
  useEffect(() => {
    const reconnect = () => { void refreshMaps(); };
    const visible = () => { if (document.visibilityState === 'visible') reconnect(); };
    reconnect(); window.addEventListener('online', reconnect); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('online', reconnect); document.removeEventListener('visibilitychange', visible); };
  }, [refreshMaps]);
  const run = async (command, input, success, options) => {
    setWorking(value => value + 1);
    try { const result = await cloud.run(command,input,options); await cache.invalidateQueries({ queryKey: ['travel-plan'] }); if (success) setNotice({ text: success }); return result; }
    catch (error) { setNotice({ text: readableError(error), error: true }); throw error; }
    finally { setWorking(value => value - 1); }
  };
  const reload = () => resource.error?resource.refetch():cache.invalidateQueries({ queryKey: ['travel-plan'] });
  const value = { cloud, syncStatus, store:cloud?.store, actor:cloud?.actor, canEdit:id=>{const meta=query.data?.state.extras.cloudPlans?.[id];return !!meta&&!meta.revoked&&['owner','editor'].includes(meta.role);}, isOwner:id=>query.data?.state.extras.cloudPlans?.[id]?.role==='owner', snapshot: query.data, state: query.data?.state, loading: resource.isPending||(!!cloud&&query.isPending), error: resource.error||query.error, run, reload, refreshMaps, working: working > 0, notice, setNotice, config, mapAuthRequired, draftOpen, setDraftOpen };
  return <Context.Provider value={value}>{children}{notice && <div className={`notice ${notice.error ? 'notice-error' : ''}`} role="status"><span>{notice.text}</span>{notice.action && <button onClick={notice.action}>{notice.actionLabel || '撤销'}</button>}<button aria-label="关闭提示" onClick={() => setNotice(null)}>×</button></div>}</Context.Provider>;
}

export function PlanProvider({ children }) { return <QueryClientProvider client={client}><Inner>{children}</Inner></QueryClientProvider>; }
export function usePlan() { return useContext(Context); }
