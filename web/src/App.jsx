import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlanProvider, usePlan, readableError } from './PlanContext';
import Home from './components/Home';
import TripWorkspace from './components/TripWorkspace';
import Settings from './components/Settings';
import {JoinTrip} from './components/CloudTools';
import { usePwa, useVisibleViewport } from './pwa';
import {freshSignInPath,recoveryReturnPath} from './invite-link';
import SessionRecovery from './components/SessionRecovery';
import { styles,cloudStyles } from './styles';
import { transitionUpdate, useMotionState } from './motion';
import { motionStyles } from './motion-styles';

function Shell() {
  useVisibleViewport();
  const { state, loading, error, reload, draftOpen, working, setNotice, syncStatus, mapAuthRequired }=usePlan();
  const [path,setPath]=useState(window.location.pathname),[settings,setSettings]=useMotionState(false);
  useEffect(()=>{const target=recoveryReturnPath(window.location);if(target){history.replaceState({},'',target);setPath(window.location.pathname);}},[]);
  const currentPath=useRef(path),blocked=useRef(false);
  useEffect(()=>{currentPath.current=path;},[path]);
  useEffect(()=>{blocked.current=draftOpen||working;},[draftOpen,working]);
  const pwa=usePwa(draftOpen||working);
  useEffect(()=>{
    const pop=event=>{if(blocked.current){history.pushState({},'',currentPath.current);setNotice({text:'请先保存或取消当前编辑。'});return;}const next=window.location.pathname;transitionUpdate(()=>setPath(next),{kind:'route',animate:!event.hasUAVisualTransition});};
    const unload=event=>{if(blocked.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('popstate',pop);window.addEventListener('beforeunload',unload);
    return()=>{window.removeEventListener('popstate',pop);window.removeEventListener('beforeunload',unload);};
  },[setNotice]);
  const navigate=next=>transitionUpdate(()=>{history.pushState({},'',next);setPath(next);},{kind:'route'});
  const sessionRequired=syncStatus?.phase==='signin'||mapAuthRequired;
  const match=path.match(/^\/trip\/([^/]+)(?:\/(day)\/([^/]+)|\/(unscheduled))?\/?$/);
  if(loading)return <div className="boot-screen"><img src="/pwa-icon-180.png" alt=""/><h1>Travel</h1><p>正在打开你的行程…</p></div>;
  if(error)return <div className="boot-screen"><h1>行程暂时无法打开</h1><p>{readableError(error)}</p><button className="button" onClick={()=>void reload()}>重试</button><a className="button button-soft" href={freshSignInPath(`${location.pathname}${location.search}${location.hash}`)} target="_top">登录站点</a></div>;
  if(!state)return null;
  return <div className={`app-shell ${match?'workspace-shell':'home-shell'} ${sessionRequired?'session-required':''}`}>{match?<TripWorkspace key={match[1]} tripId={decodeURIComponent(match[1])} dayId={match[3]?decodeURIComponent(match[3]):undefined} view={match[2]?'day':match[4]?'unscheduled':'overview'} navigate={navigate} back={()=>navigate('/')}/>:<Home openDay={(id,dayId)=>navigate(`/trip/${id}/day/${dayId}`)} openTrip={id=>navigate(`/trip/${id}`)} openSettings={()=>setSettings(true)}/>} {sessionRequired&&<SessionRecovery blocked={draftOpen||working}/>} {path==='/join'&&<JoinTrip navigate={navigate}/>} {settings&&<Settings onClose={()=>setSettings(false)} pwa={pwa}/>} {pwa.update&&!settings&&!draftOpen&&<button className="update-pill" onClick={pwa.apply}>新版本已就绪 · 更新</button>}</div>;
}
export default function App(){return <SafeAreaProvider><GestureHandlerRootView style={{flex:1}}><style>{styles+cloudStyles+motionStyles}</style><PlanProvider><Shell/></PlanProvider></GestureHandlerRootView></SafeAreaProvider>;}
