/* global beforeEach, afterEach, test, expect, jest */
let script;
beforeEach(()=>{
  jest.resetModules();jest.useFakeTimers();
  global.document={createElement:()=>({}),head:{appendChild:element=>{script=element;}}};
  global.window={AMap:{publicSDK:true},google:{maps:{publicSDK:true}}};
  global.location={origin:'http://localhost'};
});
afterEach(()=>{jest.useRealTimers();delete global.document;delete global.window;delete global.location;});
test('AMap script load resolves and cancels its connection timeout',async()=>{
  const {loadProvider}=require('../src/maps/providers');const result=loadProvider('china_mainland',{amapWebKey:'synthetic-test-key'});
  script.onload();await expect(result).resolves.toEqual({publicSDK:true});expect(jest.getTimerCount()).toBe(0);
});
test('Google script onload and SDK callback cancel both timers',async()=>{
  const {loadProvider}=require('../src/maps/providers');const result=loadProvider('global',{googleWebKey:'synthetic-test-key'});
  script.onload();window.__travelGoogleReady();await expect(result).resolves.toEqual({publicSDK:true});expect(jest.getTimerCount()).toBe(0);
});
test('Google load failure rejects once and a later retry creates a fresh script',async()=>{
  const {loadProvider}=require('../src/maps/providers');const result=loadProvider('global',{googleWebKey:'synthetic-test-key'});script.onerror();
  await expect(result).rejects.toThrow('地图暂时无法连接');expect(jest.getTimerCount()).toBe(0);
  const previous=script;const retry=loadProvider('global',{googleWebKey:'synthetic-test-key'});expect(script).not.toBe(previous);script.onload();window.__travelGoogleReady();await expect(retry).resolves.toEqual({publicSDK:true});
});
