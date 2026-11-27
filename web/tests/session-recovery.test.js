/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {act}=React;const {createRoot}=require('react-dom/client');
const SessionRecovery=require('../src/components/SessionRecovery').default;
let container,root,previousURL,previousParams;
beforeEach(()=>{previousURL=Object.getOwnPropertyDescriptor(global,'URL');previousParams=Object.getOwnPropertyDescriptor(global,'URLSearchParams');Object.defineProperty(global,'URL',{configurable:true,value:require('node:url').URL});Object.defineProperty(global,'URLSearchParams',{configurable:true,value:require('node:url').URLSearchParams});global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);history.replaceState({},'','/trip/public/day/day-1');});
afterEach(async()=>{await act(async()=>root?.unmount());container?.remove();Object.defineProperty(global,'URL',previousURL);Object.defineProperty(global,'URLSearchParams',previousParams);});
test('expired-session recovery preserves the active route and reloads through the uncached entry',async()=>{
 await act(async()=>root.render(React.createElement(SessionRecovery)));
 expect(container.textContent).toContain('本机行程和待同步修改已保留');
 const link=new URL(container.querySelector('a').href);const fresh=new URL(link.searchParams.get('return_to'),link.origin);
 expect(fresh.pathname).toBe('/install');expect(fresh.searchParams.get('return_to')).toBe('/trip/public/day/day-1');
});
test('an unsaved editor cannot be discarded by the login recovery control',async()=>{
 await act(async()=>root.render(React.createElement(SessionRecovery,{blocked:true})));
 expect(container.querySelector('a')).toBeNull();expect(container.querySelector('button').disabled).toBe(true);
 expect(container.textContent).toContain('请先保存或取消当前编辑');
});
