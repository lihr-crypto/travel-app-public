/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {act,useState}=React;
const {createRoot}=require('react-dom/client');
const {transitionUpdate,useMotionState}=require('../src/motion');
const Modal=require('../src/components/Modal').default;
let originalApi,originalMedia,originalVisibility,records,container,root;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>act(async()=>{await Promise.resolve();});
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;
 originalApi=Object.getOwnPropertyDescriptor(document,'startViewTransition');
 originalVisibility=Object.getOwnPropertyDescriptor(document,'visibilityState');
 originalMedia=window.matchMedia;
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 window.matchMedia=jest.fn(()=>({matches:false}));
 records=[];
 document.startViewTransition=jest.fn(update=>{
  const ready=deferred(),done=deferred(),finished=deferred();
  const record={update,ready,done,finished,ran:false};
  record.transition={ready:ready.promise,updateCallbackDone:done.promise,finished:finished.promise,skipTransition:jest.fn(()=>ready.reject(new Error('skipped')))};
  records.push(record);return record.transition;
 });
 document.body.innerHTML='';document.body.removeAttribute('style');
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
async function capture(record){
 await act(async()=>{if(!record.ran){record.ran=true;record.update();}record.done.resolve();record.ready.resolve();});
}
async function finish(record){await act(async()=>record.finished.resolve());}
afterEach(async()=>{
 for(const record of records){await capture(record);await finish(record);}
 await act(async()=>root.unmount());await tick();
 document.body.innerHTML='';document.body.removeAttribute('style');document.documentElement.removeAttribute('data-travel-motion');
 if(originalApi)Object.defineProperty(document,'startViewTransition',originalApi);else delete document.startViewTransition;
 if(originalVisibility)Object.defineProperty(document,'visibilityState',originalVisibility);else delete document.visibilityState;
 window.matchMedia=originalMedia;
});

test('same-event close and open share one capture and each update runs once',async()=>{
 const close=jest.fn(),open=jest.fn();
 transitionUpdate(close);transitionUpdate(open);await tick();
 expect(records).toHaveLength(1);expect(close).not.toHaveBeenCalled();
 await capture(records[0]);await finish(records[0]);
 expect(close).toHaveBeenCalledTimes(1);expect(open).toHaveBeenCalledTimes(1);
 expect(document.documentElement.hasAttribute('data-travel-motion')).toBe(false);
});
test('rapid intents awaiting a capture coalesce and do not leak route motion into the next dialog',async()=>{
 const updates=[];transitionUpdate(()=>updates.push('menu'));await tick();
 transitionUpdate(()=>updates.push('day'),{kind:'route'});await tick();
 expect(records).toHaveLength(1);expect(document.documentElement.dataset.travelMotion).toBe('route');
 await capture(records[0]);await finish(records[0]);expect(updates).toEqual(['menu','day']);
 transitionUpdate(()=>updates.push('editor'));await tick();
 expect(document.documentElement.dataset.travelMotion).toBe('dialog');
 await capture(records[1]);await finish(records[1]);
});
test('an interrupted animation cannot clear or overwrite its replacement',async()=>{
 const updates=[];transitionUpdate(()=>updates.push('day'),{kind:'route'});await tick();await capture(records[0]);
 transitionUpdate(()=>updates.push('editor'));await tick();
 expect(records[0].transition.skipTransition).toHaveBeenCalledTimes(1);
 await finish(records[0]);expect(document.documentElement.dataset.travelMotion).toBe('dialog');
 await capture(records[1]);await finish(records[1]);expect(updates).toEqual(['day','editor']);
});
test('unsupported browsers and reduced motion apply state immediately without capture',async()=>{
 const update=jest.fn();delete document.startViewTransition;
 transitionUpdate(update);expect(update).toHaveBeenCalledTimes(1);
 document.startViewTransition=jest.fn();window.matchMedia=jest.fn(()=>({matches:true}));
 transitionUpdate(update);expect(update).toHaveBeenCalledTimes(2);
 expect(document.startViewTransition).not.toHaveBeenCalled();
});
test('changing to reduced motion drains pending intent once and ignores the old callback',async()=>{
 const updates=[];transitionUpdate(()=>updates.push('open'));await tick();
 window.matchMedia=jest.fn(()=>({matches:true}));transitionUpdate(()=>updates.push('close'));
 expect(updates).toEqual(['open','close']);await capture(records[0]);await finish(records[0]);
 expect(updates).toEqual(['open','close']);expect(document.documentElement.hasAttribute('data-travel-motion')).toBe(false);
});
test('native browser navigation can bypass a second app animation',()=>{
 const update=jest.fn();transitionUpdate(update,{kind:'route',animate:false});
 expect(update).toHaveBeenCalledTimes(1);expect(document.startViewTransition).not.toHaveBeenCalled();
});
test('a hidden page applies navigation without waiting for a suspended capture',()=>{
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
 const update=jest.fn();transitionUpdate(update,{kind:'route'});
 expect(update).toHaveBeenCalledTimes(1);expect(document.startViewTransition).not.toHaveBeenCalled();
});
test('map picking stays live instead of snapshotting a WebGL dialog',()=>{
 container.innerHTML='<section class="modal"><div class="picker-map"><canvas></canvas></div></section>';
 const update=jest.fn();transitionUpdate(update);
 expect(update).toHaveBeenCalledTimes(1);expect(document.startViewTransition).not.toHaveBeenCalled();
 container.innerHTML='';
});
test('capture startup failure never drops the requested update',async()=>{
 const update=jest.fn();document.startViewTransition=jest.fn(()=>{throw new Error('unsupported capture');});
 transitionUpdate(update);await tick();expect(update).toHaveBeenCalledTimes(1);
 expect(document.documentElement.hasAttribute('data-travel-motion')).toBe(false);
});
test('capture rejection still applies state and cleans up without replay',async()=>{
 const update=jest.fn();transitionUpdate(update);await tick();
 await act(async()=>{records[0].done.reject(new Error('capture failed'));records[0].ready.reject(new Error('capture failed'));});
 expect(update).toHaveBeenCalledTimes(1);await capture(records[0]);await finish(records[0]);
 expect(update).toHaveBeenCalledTimes(1);expect(document.documentElement.hasAttribute('data-travel-motion')).toBe(false);
});

function Windows(){
 const [menu,setMenu]=useMotionState(false),[editor,setEditor]=useMotionState(false),[text,setText]=useState('保留的草稿');
 return React.createElement(React.Fragment,null,
  React.createElement('button',{id:'trigger',onClick:()=>setMenu(true)},'打开'),
  menu&&React.createElement(Modal,{title:'行程操作',onClose:()=>setMenu(false)},React.createElement('button',{id:'edit',onClick:()=>{setMenu(false);setEditor(true);}},'编辑详情')),
  editor&&React.createElement(Modal,{title:'编辑详情',onClose:()=>setEditor(false)},React.createElement('input',{value:text,onChange:e=>setText(e.target.value),'aria-label':'名称'})));
}
async function click(selector){await act(async()=>container.querySelector(selector).click());await tick();}
test('menu-to-editor replaces one live dialog and Escape restores focus and scroll locking',async()=>{
 await act(async()=>root.render(React.createElement(Windows)));
 const trigger=container.querySelector('#trigger');trigger.focus();
 await click('#trigger');await capture(records[0]);await finish(records[0]);
 await click('#edit');expect(records).toHaveLength(2);await capture(records[1]);await finish(records[1]);
 expect(container.querySelectorAll('[role=dialog]')).toHaveLength(1);
 expect(container.querySelector('[role=dialog]').getAttribute('aria-label')).toBe('编辑详情');
 expect(document.activeElement.getAttribute('aria-label')).toBe('关闭');
 expect(container.querySelector('input').value).toBe('保留的草稿');expect(document.body.style.overflow).toBe('hidden');
 const input=container.querySelector('input');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'立即输入');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(container.querySelector('input').value).toBe('立即输入');expect(records).toHaveLength(2);
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 await tick();await capture(records[2]);await finish(records[2]);
 expect(container.querySelector('[role=dialog]')).toBeNull();
 expect(document.body.style.overflow).not.toBe('hidden');
 expect(document.activeElement).toBe(trigger);
});
