/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {act}=React;
const {createRoot}=require('react-dom/client');
const Modal=require('../src/components/Modal').default;
const {styles,cloudStyles}=require('../src/styles');
const {useVisibleViewport}=require('../src/pwa');
let root,container,style,oldViewport;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;
 oldViewport=Object.getOwnPropertyDescriptor(window,'visualViewport');
 document.body.innerHTML='';document.body.removeAttribute('style');
 style=document.createElement('style');style.textContent=styles+cloudStyles;document.head.append(style);
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{
 await act(async()=>root.unmount());style.remove();document.body.innerHTML='';document.body.removeAttribute('style');
 for(const name of ['--visual-height','--visual-top','--visual-width','--visual-left'])document.documentElement.style.removeProperty(name);
 if(oldViewport)Object.defineProperty(window,'visualViewport',oldViewport);else delete window.visualViewport;
});
test('opening an editing dialog focuses its close control, locks background scroll, and restores the previous focus without scrolling',async()=>{
 const trigger=document.createElement('button');document.body.prepend(trigger);trigger.focus();const restore=jest.spyOn(trigger,'focus');
 document.body.style.setProperty('overflow','scroll','important');
 await act(async()=>root.render(React.createElement(Modal,{title:'编辑详情',onClose:jest.fn()},React.createElement('label',null,'名称',React.createElement('input',{type:'text'})))));
 expect(document.activeElement.getAttribute('aria-label')).toBe('关闭');
 expect(document.body.style.getPropertyValue('overflow')).toBe('hidden');expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
 await act(async()=>root.render(null));expect(document.body.style.getPropertyValue('overflow')).toBe('scroll');expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
 expect(document.activeElement).toBe(trigger);expect(restore).toHaveBeenCalledWith({preventScroll:true});
});
test('rendered editable controls stay at least 16px inside small form labels and compact time/file layouts',async()=>{
 const fields=['text','date','time','email','search','number','file'].map(type=>React.createElement('label',{key:type,className:type==='file'?'file-choice':'time-row'},type,React.createElement('input',{type})));
 fields.push(React.createElement('label',{key:'note'},'备注',React.createElement('textarea')),React.createElement('label',{key:'select'},'权限',React.createElement('select',null,React.createElement('option',null,'可编辑'))));
 await act(async()=>root.render(React.createElement(Modal,{title:'新建旅行',onClose:jest.fn()},...fields)));
 for(const field of container.querySelectorAll('input,textarea,select'))expect(Number.parseFloat(getComputedStyle(field).fontSize)).toBeGreaterThanOrEqual(16);
});
test('keyboard focus wraps through collapsed settings disclosures without entering their hidden controls',async()=>{
 // WebKit returns a rectangle even for controls hidden in closed details.
 const rects=jest.spyOn(HTMLElement.prototype,'getClientRects').mockImplementation(function(){return [this.getBoundingClientRect()];});
 try{
  await act(async()=>root.render(React.createElement(Modal,{title:'同步与备份',onClose:jest.fn()},React.createElement('details',null,React.createElement('summary',null,'个人备份'),React.createElement('button',null,'导出')))));
  const summary=container.querySelector('summary'),close=container.querySelector('[aria-label="关闭"]');
  summary.focus();const next=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});
  document.dispatchEvent(next);expect(next.defaultPrevented).toBe(true);expect(document.activeElement).toBe(close);
  const previous=new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});
  document.dispatchEvent(previous);expect(previous.defaultPrevented).toBe(true);expect(document.activeElement).toBe(summary);
  container.querySelector('details').open=true;close.focus();
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
  expect(document.activeElement.textContent).toBe('导出');
 }finally{rects.mockRestore();}
});
function ViewportProbe(){useVisibleViewport();return null;}
test('keyboard resize and visual panning update all visible bounds, then restore the full screen on dismissal',async()=>{
 const viewport=new EventTarget();Object.assign(viewport,{width:310,height:332,offsetTop:84,offsetLeft:22});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
 const remove=jest.spyOn(viewport,'removeEventListener');await act(async()=>root.render(React.createElement(ViewportProbe)));
 const value=name=>document.documentElement.style.getPropertyValue(name);
 expect([value('--visual-width'),value('--visual-height'),value('--visual-left'),value('--visual-top')]).toEqual(['310px','332px','22px','84px']);
 Object.assign(viewport,{width:393,height:852,offsetTop:0,offsetLeft:0});await act(async()=>viewport.dispatchEvent(new Event('resize')));
 expect([value('--visual-width'),value('--visual-height'),value('--visual-left'),value('--visual-top')]).toEqual(['393px','852px','0px','0px']);
 viewport.offsetLeft=12;await act(async()=>viewport.dispatchEvent(new Event('scroll')));expect(value('--visual-left')).toBe('12px');
 await act(async()=>root.render(null));expect(remove).toHaveBeenCalledWith('resize',expect.any(Function));expect(remove).toHaveBeenCalledWith('scroll',expect.any(Function));
});
test('browsers without VisualViewport still follow window resize and keep a zero origin',async()=>{
 Object.defineProperty(window,'visualViewport',{configurable:true,value:undefined});await act(async()=>root.render(React.createElement(ViewportProbe)));
 expect(document.documentElement.style.getPropertyValue('--visual-width')).toBe(`${window.innerWidth}px`);
 await act(async()=>window.dispatchEvent(new Event('resize')));expect(document.documentElement.style.getPropertyValue('--visual-left')).toBe('0px');
});
