/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {act}=React;
const {createRoot}=require('react-dom/client');
const useDaySwipe=require('../src/use-day-swipe').default;
let root,host,onSwipe;
function Harness({enabled=true,resetKey='day-1',callback=onSwipe}){
 const ref=React.useRef(null);useDaySwipe(ref,{enabled,resetKey,onSwipe:callback});
 return React.createElement('main',{ref},
  React.createElement('div',{'data-testid':'map'}),
  React.createElement('div',{'data-testid':'web-day-sheet-gesture-content'},
   React.createElement('div',{'data-testid':'blank'}),
   React.createElement('div',{'data-testid':'timeline-select-item',role:'button'}),
   React.createElement('button',{'data-testid':'timeline-actions-item'},'⋯'),
   React.createElement('button',{'data-testid':'next-day'},'后一天')),
  React.createElement('div',{'data-testid':'web-day-sheet-handle'}));
}
beforeEach(async()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);onSwipe=jest.fn();await act(async()=>root.render(React.createElement(Harness)));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.restoreAllMocks();});
function target(id){return host.querySelector(`[data-testid="${id}"]`);}
function touch(id,type,x,y,count=1){const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:Array.from({length:count},(_,index)=>({identifier:index+1,clientX:x,clientY:y}))});target(id).dispatchEvent(event);return event;}
test('swiping an empty sheet/header area or a row changes the adjacent day once per gesture',()=>{
 for(const id of ['blank','timeline-select-item','web-day-sheet-handle']){
  onSwipe.mockClear();touch(id,'touchstart',240,100);touch(id,'touchmove',170,105);touch(id,'touchmove',100,104);touch(id,'touchend',100,104,0);
  expect(onSwipe.mock.calls).toEqual([['left']]);
  touch(id,'touchstart',100,100);touch(id,'touchmove',180,105);touch(id,'touchend',180,105,0);expect(onSwipe.mock.calls.at(-1)).toEqual(['right']);
 }
});
test('vertical sheet pan, button taps, map pan, cancelled touches, and pinch gestures never switch days',()=>{
 touch('blank','touchstart',100,100);touch('blank','touchmove',100,130);touch('blank','touchmove',210,150);touch('blank','touchend',210,150,0);
 for(const id of ['timeline-actions-item','next-day','map']){touch(id,'touchstart',100,100);touch(id,'touchmove',200,100);touch(id,'touchend',200,100,0);}
 touch('blank','touchstart',100,100);touch('blank','touchcancel',100,100,0);touch('blank','touchmove',200,100);
 touch('blank','touchstart',100,100,2);touch('blank','touchmove',200,100,2);
 expect(onSwipe).not.toHaveBeenCalled();
});
test('a long press belongs to row sorting and a completed swipe cannot generate a trailing click',()=>{
 let now=1000;jest.spyOn(Date,'now').mockImplementation(()=>now);
 touch('timeline-select-item','touchstart',100,100);now+=501;touch('timeline-select-item','touchmove',200,100);expect(onSwipe).not.toHaveBeenCalled();
 touch('timeline-select-item','touchstart',100,100);now+=20;touch('timeline-select-item','touchmove',200,100);touch('timeline-select-item','touchend',200,100,0);
 const click=new MouseEvent('click',{bubbles:true,cancelable:true});target('timeline-select-item').dispatchEvent(click);expect(click.defaultPrevented).toBe(true);
 now+=401;const later=new MouseEvent('click',{bubbles:true,cancelable:true});target('timeline-select-item').dispatchEvent(later);expect(later.defaultPrevented).toBe(false);
});
test('an open modal disables swipes and a new day uses its latest callback',async()=>{
 await act(async()=>root.render(React.createElement(Harness,{enabled:false})));touch('blank','touchstart',100,100);touch('blank','touchmove',200,100);expect(onSwipe).not.toHaveBeenCalled();
 const next=jest.fn();await act(async()=>root.render(React.createElement(Harness,{resetKey:'day-2',callback:next})));touch('blank','touchstart',100,100);touch('blank','touchmove',200,100);expect(next).toHaveBeenCalledWith('right');expect(onSwipe).not.toHaveBeenCalled();
});
