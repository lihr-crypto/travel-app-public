import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppButton } from '@/components/ui/app-button';
import { TripBottomSheet } from '@/components/trip-bottom-sheet';
import { DayTimeline } from '@/components/day-timeline';
import { useDaySheetPan } from '@/components/use-day-sheet-pan';
import { DaySwipeGuardProvider, useDaySwipeGuardState } from '@/components/day-swipe-guard';
import { buildTimelineProjection } from '@/application/projections/timeline';
import { colors } from '@/theme/tokens';
import { createBrowserStore } from './browser-store';
import { commandsFor, seedTwoTrips } from './probe-commands';
import { runProbeChecks, verifyLocalLegacyBackup } from './probe-checks';
import MapCanvas, { searchWebPlaces } from './MapCanvas';
import PwaReadiness, { useVisibleViewport } from './PwaReadiness';

const store = createBrowserStore();
const commands = commandsFor(store);

const css = `
  *{box-sizing:border-box}body{overflow:auto;margin:0;background:#eeeee8;color:#26392f;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}button,input,textarea,select{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}
  .layout{max-width:1080px;margin:0 auto;padding:24px;display:grid;grid-template-columns:minmax(320px,430px) minmax(280px,1fr);gap:24px;align-items:start}.phone{height:800px;max-height:calc(100dvh - 48px);min-height:620px;position:relative;display:flex;flex-direction:column;overflow:hidden;border-radius:24px;background:#f5f2ea;box-shadow:0 12px 48px #1d302d18}.phone-header{padding:18px 18px 12px}.phone-header h1{font-size:23px;margin:0 0 6px}.quiet{color:#69756d;font-size:13px;line-height:1.55}.tabs{display:flex;gap:8px;margin-top:14px}.tabs button,.small-button{border:1px solid #d7ded7;border-radius:10px;background:#fffdf6;color:#17584c;padding:10px 12px}.tabs button.active{background:#17584c;color:white}.map-area{height:46%;position:relative}.map-canvas{position:absolute;inset:0}.map-unavailable{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;background:#e4eceb;color:#506d77}.map-unavailable p{font-size:13px;line-height:1.6;max-width:280px}.sample-pins{display:flex;gap:12px}.sample-pins button{padding:0;background:none;border:none}.map-status{position:absolute;top:4px;left:8px;right:8px;font-size:11px;background:#fffdf6dd;padding:4px 8px;max-width:100%}.selected-place{position:absolute;top:44px;left:12px;right:12px;z-index:2;border-radius:10px;background:#fffdf6ed;padding:8px 10px;font-size:12px;line-height:1.5;pointer-events:none}.selected-place small{color:#506d77}.day-nav{display:flex;align-items:center;justify-content:space-between;padding:4px 20px 12px}.day-nav strong{font-size:24px}.day-nav button{border:none;background:none;color:#17584c;font-size:24px;min-width:44px;height:44px}.date{text-align:center;color:#69756d;font-size:14px;margin-top:6px}.search-row{display:flex;gap:6px;padding:8px 16px}.search-row input{width:0;flex:1;border:1px solid #d6ddd5;background:#fffdf6;border-radius:10px;padding:10px;min-height:44px}.search-results{margin:0 16px 8px}.search-results button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #d6ddd5;background:#fffdf6;padding:10px}.search-results small{display:block;color:#69756d}.toast{font-size:13px;line-height:1.5;background:#e5eeeb;color:#17584c;padding:9px 16px;min-height:36px}.report{background:#fffdf6;border:1px solid #dce2da;border-radius:18px;padding:20px}.report h2{margin:0 0 10px;font-size:22px}.report h3{font-size:16px;margin:20px 0 8px}.report p{line-height:1.65;font-size:14px}.report-actions{display:grid;gap:8px}.check{padding:8px 0;border-bottom:1px solid #e2e6de;font-size:13px;line-height:1.6}.pass{color:#17584c}.fail{color:#a03935}.status-list{display:grid;gap:6px;font-size:13px;line-height:1.5}.mono{font:11px ui-monospace,monospace;word-break:break-all;white-space:pre-wrap}.backup-input{width:100%;height:110px;margin-top:8px;border:1px solid #ccd6cd;border-radius:8px;background:#fafaf4;padding:8px}.editor-layer{position:fixed;left:0;right:0;top:var(--visual-top,0px);height:var(--visual-height,100dvh);z-index:1000;background:#19332c44;display:flex;align-items:center;justify-content:center;padding:16px}.editor{width:min(440px,100%);max-height:calc(var(--visual-height,100dvh) - 32px);overflow:auto;background:#fffdf6;border-radius:20px;padding:20px}.editor h2{font-size:21px;margin:0 0 16px}.editor label{display:block;font-size:14px;font-weight:600;margin:14px 0 7px}.editor input,.editor textarea,.editor select{width:100%;border:1px solid #ccd6cd;border-radius:10px;padding:12px;background:white;min-height:44px}.editor textarea{min-height:110px}.editor-actions{position:sticky;bottom:-20px;background:#fffdf6;padding:16px 0 4px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.editor-place{background:#e7eef0;border-radius:12px;padding:12px;font-size:13px;line-height:1.5}.counter{font-size:12px;color:#69756d;padding:4px 16px}.title-line{display:flex;justify-content:space-between;align-items:center}.legend{font-size:12px;background:#f0ece0;border-radius:10px;padding:10px;line-height:1.6}
  @media(max-width:760px){.layout{display:block;padding:0}.phone{max-width:430px;margin:0 auto;border-radius:0;height:100dvh;max-height:none;min-height:560px;box-shadow:none}.report{margin:16px;max-width:430px;margin-inline:auto}.editor-layer{align-items:flex-end}.editor{border-radius:20px 20px 0 0}}
`;

function Workspace({ snapshot, trip, config, onRefresh, onNotice, onMapStatus, onSearchStatus, onDraftChange }) {
  const [dayIndex, setDayIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [snap, setSnap] = useState('half');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(null);
  const days = snapshot.state.days.filter((x) => x.tripId === trip.id).sort((a, b) => a.dayIndex - b.dayIndex);
  const day = days[Math.min(dayIndex, days.length - 1)];
  const items = useMemo(() => snapshot.state.items.filter((x) => x.dayId === day.id).sort((a, b) => a.sortOrder - b.sortOrder), [snapshot, day.id]);
  const placesById = useMemo(() => Object.fromEntries(snapshot.state.places.map((x) => [x.id, x])), [snapshot]);
  const markers = useMemo(() => items.filter((x) => x.placeId && placesById[x.placeId]).map((x) => ({ ...placesById[x.placeId], id: x.id })), [items, placesById]);
  const projection = buildTimelineProjection({ day, items, placesById });
  const {
    sheetRef, scrollRef, position, contentGesture, timelineGestureRef,
    onPanStart, onPanDelta, onPanEnd, onTimelineTouchChange, onScroll,
    onContainerLayout, onScrollLayout, onContentSizeChange,
  } = useDaySheetPan(snap, day.id);
  const guard = useDaySwipeGuardState();
  const select = useCallback((id) => setSelectedId(id), []);
  const selectedPlace = markers.find((x) => x.id === selectedId);
  const configured = trip.mapRegion === 'china_mainland' ? config?.amapWebKey && config.amapSecurityConfigured : config?.googleWebKey;

  useEffect(() => { onSearchStatus('当前来源的真实搜索尚未验证'); }, [onSearchStatus, trip.id]);
  useEffect(() => { onDraftChange(Boolean(editing) || searching); return () => onDraftChange(false); }, [editing, searching, onDraftChange]);

  const openEditor = (id) => {
    const item = items.find((x) => x.id === id);
    setEditing({ item, title: item.title, type: item.type, note: item.note ?? '', start: item.startDateTime?.slice(11) ?? '', end: item.endDateTime?.slice(11) ?? '' });
  };
  const reorder = async (id, position) => {
    try { await commands.reorderItem({ itemId: id, position }); await onRefresh(); onNotice('排序已保存到浏览器'); }
    catch (error) { onNotice(`排序失败：${error.message}`); }
  };
  const move = (id, direction) => {
    const index = items.findIndex((x) => x.id === id);
    const adjacent = items[index + (direction === 'up' ? -1 : 1)];
    if (adjacent) void reorder(id, { type: direction === 'up' ? 'before' : 'after', itemId: adjacent.id });
  };
  const search = async () => {
    setSearching(true);
    try {
      const found = await searchWebPlaces(trip.mapRegion, query, config);
      setResults(found); setSnap('expanded');
      onSearchStatus(`${trip.mapRegion === 'china_mainland' ? '高德' : 'Google'} 真实搜索返回 ${found.length} 个结果`);
    } catch (error) { onNotice(error.message); onSearchStatus(error.message); }
    finally { setSearching(false); }
  };
  const addResult = async (result) => {
    try { const saved = await commands.confirmPlaceSearchResult({ tripId: trip.id, dayId: day.id, result, itemType: 'sightseeing' }); setResults([]); await onRefresh(); setSelectedId(saved.data.item.id); setSnap('half'); onNotice('搜索结果已保存；地图已聚焦选中地点，请核对位置'); }
    catch (error) { onNotice(`保存失败：${error.message}`); }
  };
  const addPlaceLess = async () => {
    await commands.addItem({ tripId: trip.id, dayId: day.id, title: `无地点测试行程 ${items.length + 1}`, type: 'activity' });
    await onRefresh(); onNotice('测试行程已保存；无地点项目不产生图钉');
  };
  const saveEditor = async (event) => {
    event.preventDefault();
    // Read the submitted native HTML controls, including Safari's time picker.
    const submitted = new FormData(event.currentTarget);
    const startTime = submitted.get('start');
    const endTime = submitted.get('end');
    const start = startTime ? `${day.date}T${startTime}` : null;
    const end = endTime ? `${day.date}T${endTime}` : null;
    try {
      await commands.updateItemDetails({ itemId: editing.item.id, title: submitted.get('title'), type: submitted.get('type'), note: submitted.get('note'), timeMode: start || end ? 'exact' : 'none', startDateTime: start, endDateTime: end, period: null });
      await onRefresh(); setEditing(null); onNotice('名称、时间、备注已保存；可刷新页面核对');
    } catch (error) { onNotice(`保存失败，原数据保留：${error.message}`); }
  };

  return <>
    <View style={{ flex: 1, position: 'relative' }} onLayout={onContainerLayout}>
      <MapCanvas region={trip.mapRegion} config={config} markers={markers} selectedId={selectedId} onSelect={select} onStatus={onMapStatus} />
      {selectedPlace && <div className="selected-place" aria-label="选中地点核验"><strong>{selectedPlace.name}</strong><br />{selectedPlace.address}<br /><small>{selectedPlace.provider} · {selectedPlace.coordinate.system} · {selectedPlace.coordinate.latitude.toFixed(6)}, {selectedPlace.coordinate.longitude.toFixed(6)}</small></div>}
      <DaySwipeGuardProvider guard={guard}>
        <TripBottomSheet ref={sheetRef} snap={snap} onSnapChange={setSnap} scrollable unmanagedScroll scrollViewRef={scrollRef} animatedPosition={position} contentGesture={contentGesture} contentPanningGesture={false} scrollEnabled={false} cancelContentTouches={false} simultaneousHandlers={timelineGestureRef} onScroll={onScroll} onScrollLayout={onScrollLayout} onContentSizeChange={onContentSizeChange}
          header={<View><div className="day-nav"><button aria-label="前一天" disabled={dayIndex === 0} onClick={() => setDayIndex((x) => x - 1)}>‹</button><div><strong>第 {day.dayIndex} 天</strong><div className="date">{day.date.replace(/-/g, ' / ')}</div></div><button aria-label="后一天" disabled={dayIndex >= days.length - 1} onClick={() => setDayIndex((x) => x + 1)}>›</button></div><div className="search-row"><input aria-label="地点关键词" placeholder={trip.mapRegion === 'china_mainland' ? '搜索示例街区／示例站' : '搜索示例庭园／成田机场'} value={query} onChange={(event) => setQuery(event.target.value)} /><button className="small-button" disabled={!configured || searching} onClick={search}>{searching ? '搜索中' : '搜索'}</button></div><Text style={{ paddingHorizontal: 16, fontSize: 12, color: colors.textSubtle }}>Sheet 状态：{snap} · 拖动手柄／内容验证</Text></View>}
          testID="prototype-trip-sheet">
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}><AppButton title="添加无地点测试行程" variant="ghost" onPress={() => void addPlaceLess()} /></View>
          <div className="search-results">{results.map((result, i) => <button key={i} onClick={() => void addResult(result)}>{result.name}<small>{result.address}</small></button>)}</div>
          <DayTimeline projection={projection} selectedItemId={selectedId} onSelectItem={select} onOpenItemDetails={openEditor} onOpenItemActions={openEditor} onMoveItem={move} onReorderDrop={reorder} gestureRef={timelineGestureRef} onGestureTouchChange={onTimelineTouchChange} onPanScrollStart={onPanStart} onPanScrollDelta={onPanDelta} onPanScrollEnd={onPanEnd} onPanSwipe={(direction) => setDayIndex((x) => Math.max(0, Math.min(days.length - 1, x + (direction === 'left' ? 1 : -1))))} onScrollToOffset={(offset) => scrollRef.current?.scrollTo({ y: offset, animated: false })} resetKey={day.id} emptyState={{ title: '这一天还没有测试行程' }} />
          <Text style={{ padding: 16, color: colors.textSubtle, fontSize: 12 }}>当前仅验证原 Timeline／Sheet 的 Web 表现；真实手机触摸仍需独立核验。</Text>
        </TripBottomSheet>
      </DaySwipeGuardProvider>
    </View>
    {editing && <div className="editor-layer" role="dialog" aria-modal="true" aria-label="编辑测试行程"><form className="editor" onSubmit={saveEditor}>
      <h2>编辑详情</h2><div className="editor-place">地点：{placesById[editing.item.placeId]?.name ?? '无地点'}<br />名称与备注保留原字段；时间使用网页控件。</div>
      <label htmlFor="edit-title">名称</label><input id="edit-title" name="title" required defaultValue={editing.title} />
      <label htmlFor="edit-type">类型</label><select id="edit-type" name="type" defaultValue={editing.type}>{[['sightseeing', '景点'], ['food', '餐饮'], ['hotel', '住宿'], ['activity', '活动'], ['transport', '交通'], ['custom', '其他']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label htmlFor="edit-start">出发时间（可留空）</label><input id="edit-start" name="start" type="time" defaultValue={editing.start} />
      <label htmlFor="edit-end">到达时间（可单独设置）</label><input id="edit-end" name="end" type="time" defaultValue={editing.end} />
      <label htmlFor="edit-note">备注</label><textarea id="edit-note" name="note" defaultValue={editing.note} />
      <div className="editor-actions"><button className="small-button" type="button" onClick={() => setEditing(null)}>取消</button><button className="small-button" style={{ background: colors.primary, color: '#fff' }} type="submit">保存</button></div>
    </form></div>}
  </>;
}

export default function App() {
  useVisibleViewport();
  const [snapshot, setSnapshot] = useState(null);
  const [tripId, setTripId] = useState(null);
  const [config, setConfig] = useState(null);
  const [notice, setNotice] = useState('独立 IndexedDB 测试库；不会读取或写入手机 App 数据。');
  const [checks, setChecks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [legacyReport, setLegacyReport] = useState(null);
  const [mapStatus, setMapStatus] = useState('等待网页 Key');
  const [searchStatus, setSearchStatus] = useState('真实搜索尚未验证');
  const [backupText, setBackupText] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const refresh = useCallback(async () => { const value = await store.read(); setSnapshot(value); return value; }, []);
  useEffect(() => {
    (async () => {
      let value = await store.read();
      if (value.state.trips.length === 0) value = await seedTwoTrips(store);
      setSnapshot(value); setTripId(value.state.trips[0]?.id);
      try { const response = await fetch('/__probe/config'); if (!response.ok) throw new Error('MAP_CONFIG_UNAVAILABLE'); setConfig(await response.json()); }
      catch { setConfig({ mapServicesUnavailable: true }); setNotice('地图服务暂不可用；已保存行程仍可查看与编辑。'); }
    })().catch((error) => setNotice(`初始化失败：${error.message}`));
  }, []);
  const runChecks = async () => {
    setBusy(true); setChecks([]);
    try { const report = await runProbeChecks(setChecks); setNotice(report.pass ? '数据自检全部通过；真实地图和实机触摸仍待验证。' : '发现失败项，见右侧报告。'); }
    catch (error) { setNotice(`自检失败：${error.message}`); }
    finally { setBusy(false); }
  };
  const legacy = async () => {
    setBusy(true);
    try { setLegacyReport(await verifyLocalLegacyBackup()); setNotice('已有备份的导入、重开和再次恢复完全一致；未清理原有问题。'); }
    catch (error) { setLegacyReport({ status: 'FAIL', message: error.message }); setNotice('旧备份验证失败，原备份未被改写。'); }
    finally { setBusy(false); }
  };
  const exportBackup = async () => {
    const text = JSON.stringify(await store.export(), null, 2); setBackupText(text);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'travel-web-prototype-backup.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('已导出当前交互测试库，可复制下方 JSON 恢复。');
  };
  const restoreBackup = async () => {
    try { await store.import(JSON.parse(backupText)); await refresh(); setNotice('已恢复到当前交互测试库。'); }
    catch (error) { setNotice(`恢复失败，当前测试库保留：${error.message}`); }
  };
  const trip = snapshot?.state.trips.find((x) => x.id === tripId) ?? snapshot?.state.trips[0];
  return <SafeAreaProvider><GestureHandlerRootView style={{ flex: 1 }}><style>{css}</style><div className="layout">
    <main className="phone"><header className="phone-header"><div className="title-line"><h1>Travel Web 验证</h1><span className="quiet">PROTOTYPE</span></div><div className="quiet">复用现有规则与原组件 · 独立测试数据</div><nav className="tabs">{snapshot?.state.trips.map((candidate) => <button key={candidate.id} className={candidate.id === trip?.id ? 'active' : ''} onClick={() => setTripId(candidate.id)}>{candidate.title}</button>)}</nav></header>
      <div className="toast" role="status">{notice}</div><div className="counter">保存版本 {snapshot?.revision ?? '…'} · {snapshot?.state.items.length ?? 0} 项测试行程</div>
      {trip && <Workspace key={trip.id} snapshot={snapshot} trip={trip} config={config} onRefresh={refresh} onNotice={setNotice} onMapStatus={setMapStatus} onSearchStatus={setSearchStatus} onDraftChange={setHasDraft} />}
    </main>
    <aside className="report"><h2>验证证据</h2><div className="legend">此页面验证迁移技术。离线样例不是搜索结果，桌面浏览器通过也不等于 iPhone 实机通过。</div><h3>地图与搜索</h3><div className="status-list"><span>{mapStatus}</span><span>{searchStatus}</span><span>原生 iOS Key 未被复用或暴露。</span></div><h3>数据保存与回滚</h3><div className="report-actions"><AppButton title={busy ? '检查中…' : '运行数据自检'} disabled={busy} onPress={runChecks} /><AppButton title="验证已有旧备份" variant="secondary" disabled={busy} onPress={legacy} /></div><div aria-label="数据自检结果">{checks.map((check) => <div key={check.name} className={`check ${check.status === 'PASS' ? 'pass' : 'fail'}`}><strong>{check.status}</strong> {check.name}{check.detail && <div className="quiet">{check.detail}</div>}</div>)}</div>{legacyReport && <><h3>旧备份本地恢复</h3><pre className="mono" aria-label="旧备份验证结果">{JSON.stringify(legacyReport, null, 2)}</pre></>}
      <h3>交互测试库的导出／恢复</h3><p>可以改名称、到达时间、备注和顺序，再刷新或关闭重开。本页只覆盖当前测试库。新备份含校验值，发现内容损坏会拒绝恢复；旧版备份仍可读取。</p><div className="report-actions"><AppButton title="导出测试备份" variant="secondary" onPress={exportBackup} /><label>选择备份文件<input aria-label="选择备份文件" type="file" accept="application/json,.json" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setBackupText(await file.text()); setNotice('备份文件已读取，点击恢复后才会写入测试库。'); } }} /></label><AppButton title="恢复下方测试备份" variant="secondary" disabled={!backupText || hasDraft || busy} onPress={restoreBackup} /></div><textarea className="backup-input" aria-label="测试备份 JSON" placeholder="导出的 JSON，或粘贴当前测试库备份" value={backupText} onChange={(event) => setBackupText(event.target.value)} /><PwaReadiness blocked={hasDraft || busy} /><h3>仍需核验</h3><p>Safari 手机键盘、触摸和主屏幕使用需实机验收；桌面结果不代替手机验收。</p>
    </aside>
  </div></GestureHandlerRootView></SafeAreaProvider>;
}
