import { useEffect, useRef, useState } from 'react';
export function useVisibleViewport() {
  useEffect(()=>{
    const viewport=window.visualViewport;
    const update=()=>{
      const style=document.documentElement.style;
      style.setProperty('--visual-height',`${viewport?.height||window.innerHeight}px`);
      style.setProperty('--visual-width',`${viewport?.width||window.innerWidth}px`);
      style.setProperty('--visual-top',`${Math.max(0,viewport?.offsetTop||0)}px`);
      style.setProperty('--visual-left',`${Math.max(0,viewport?.offsetLeft||0)}px`);
    };
    update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('resize',update);
    return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
}
export function usePwa(blocked) {
  const registration=useRef(null),busy=useRef(blocked),applying=useRef(false);
  useEffect(()=>{busy.current=blocked;},[blocked]);
  const [ready,setReady]=useState(false),[update,setUpdate]=useState(false),[persistent,setPersistent]=useState(null);
  const supported=window.isSecureContext&&'serviceWorker'in navigator;
  useEffect(()=>{
    if(!supported)return;
    let cancelled=false;
    const inspect=()=>{if(!cancelled){setUpdate(Boolean(registration.current?.waiting));registration.current?.active?.postMessage({type:'SHELL_STATUS'});}};
    const message=event=>{if(event.data?.type==='SHELL_STATUS')setReady(Boolean(event.data.ready));};
    const changed=()=>{if(applying.current&&!busy.current)window.location.reload();else inspect();};
    const install=()=>registration.current?.installing?.addEventListener('statechange',inspect);
    navigator.serviceWorker.addEventListener('message',message);navigator.serviceWorker.addEventListener('controllerchange',changed);
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(async value=>{if(cancelled)return;registration.current=value;value.addEventListener('updatefound',install);install();const active=await navigator.serviceWorker.ready;if(!cancelled){registration.current=active;inspect();}}).catch(()=>{});
    if(navigator.storage?.persisted)void navigator.storage.persisted().then(setPersistent).catch(()=>{});
    return()=>{cancelled=true;navigator.serviceWorker.removeEventListener('message',message);navigator.serviceWorker.removeEventListener('controllerchange',changed);registration.current?.removeEventListener('updatefound',install);};
  },[supported]);
  return {ready,update,persistent,supported,standalone:window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,
    check:async()=>{await registration.current?.update();setUpdate(Boolean(registration.current?.waiting));},
    apply:()=>{if(!busy.current&&registration.current?.waiting){applying.current=true;registration.current.waiting.postMessage({type:'APPLY_UPDATE'});}},
    persist:async()=>{if(navigator.storage?.persist)setPersistent(await navigator.storage.persist());},
  };
}
