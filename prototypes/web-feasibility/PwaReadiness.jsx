import React, { useEffect, useRef, useState } from 'react';

export function useVisibleViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      document.documentElement.style.setProperty('--visual-height', `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty('--visual-top', `${viewport?.offsetTop ?? 0}px`);
    };
    resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); window.removeEventListener('resize', resize); };
  }, []);
}

export default function PwaReadiness({ blocked }) {
  const registration = useRef(null);
  const applying = useRef(false);
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);
  const supported = window.isSecureContext && 'serviceWorker' in navigator;
  const [status, setStatus] = useState(() => supported ? '正在检查网页缓存…' : '此浏览器／地址不支持网页缓存；主屏幕与离线需 HTTPS 浏览器验证');
  const [waiting, setWaiting] = useState(false);
  const [storage, setStorage] = useState('浏览器持久保存尚未检查');
  const [standalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);

  const storageText = async (request = false) => {
    if (!navigator.storage?.persisted) return '此浏览器未提供持久保存接口；请保留独立备份';
    let persistent = await navigator.storage.persisted();
    if (request && !persistent && navigator.storage.persist) persistent = await navigator.storage.persist();
    return persistent ? '浏览器持久保存已获准；独立备份仍需保留' : '浏览器尚未保证持久保存；请保留独立备份';
  };

  useEffect(() => {
    if (!supported) return;
    let stopped = false;
    const pending = () => { if (!stopped) setWaiting(Boolean(registration.current?.waiting)); };
    const message = (event) => {
      if (event.data?.type === 'SHELL_STATUS') setStatus(event.data.ready ? `网页缓存就绪 · ${event.data.assets} 项资源 · ${event.data.build}` : '网页缓存尚未完整，暂不能确认离线可用');
    };
    const controlled = () => {
      if (applying.current && !blockedRef.current) { window.location.reload(); return; }
      registration.current?.active?.postMessage({ type: 'SHELL_STATUS' }); pending();
    };
    const installed = () => {
      const worker = registration.current?.installing;
      worker?.addEventListener('statechange', () => { pending(); if (worker.state === 'activated') controlled(); });
    };
    navigator.serviceWorker.addEventListener('message', message);
    navigator.serviceWorker.addEventListener('controllerchange', controlled);
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(async (value) => {
      if (stopped) return;
      registration.current = value; value.addEventListener('updatefound', installed); installed(); pending();
      const active = await navigator.serviceWorker.ready;
      if (!stopped) active.active?.postMessage({ type: 'SHELL_STATUS' });
    }).catch(() => { if (!stopped) setStatus('网页缓存注册失败；行程仍保存在浏览器，先导出备份'); });
    void storageText().then(setStorage).catch(() => setStorage('无法读取持久保存状态；请保留独立备份'));
    return () => {
      stopped = true; registration.current?.removeEventListener('updatefound', installed);
      navigator.serviceWorker.removeEventListener('message', message);
      navigator.serviceWorker.removeEventListener('controllerchange', controlled);
    };
  }, [supported]);

  const checkUpdate = async () => {
    try { await registration.current?.update(); setWaiting(Boolean(registration.current?.waiting)); registration.current?.active?.postMessage({ type: 'SHELL_STATUS' }); }
    catch { setStatus('暂时无法检查更新；现有缓存和行程保留'); }
  };
  const update = () => {
    if (blocked || !registration.current?.waiting) return;
    applying.current = true; registration.current.waiting.postMessage({ type: 'APPLY_UPDATE' });
  };

  return <section aria-label="网页安装与保存验证"><h3>主屏幕、离线与更新</h3><div className="status-list"><span>{status}</span><span>{standalone ? '当前为主屏幕独立窗口' : '当前为浏览器窗口'}</span><span>{storage}</span></div><p>缓存供行程查看／编辑使用，地图和搜索仍需网络。更新不会自动重开正在编辑的页面。</p><div className="report-actions"><button className="small-button" onClick={checkUpdate}>检查网页更新</button>{waiting && <button className="small-button" disabled={blocked} onClick={update}>更新并重新打开</button>}<button className="small-button" onClick={() => void storageText(true).then(setStorage).catch(() => setStorage('持久保存请求未完成；请保留独立备份'))}>申请浏览器持久保存</button></div>{blocked && waiting && <p>完成保存或取消编辑后再更新。</p>}</section>;
}
