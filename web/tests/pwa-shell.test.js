/* global test, expect, jest */
const vm=require('node:vm');
const {buildWorkerSource}=require('../pwa-worker.cjs');
function worker(response={ok:true,redirected:false,headers:{get:()=> 'application/javascript'}},assets=['/app.js']){
  const events={},cache={match:async()=>({cachedShell:true}),put:jest.fn()},deleted=[];
  const self={location:{origin:'https://private.example'},addEventListener:(name,handler)=>{events[name]=handler;}};
  const request=jest.fn(async()=>response);
  vm.runInNewContext(buildWorkerSource('test-build',assets),{self,URL,fetch:request,caches:{open:async()=>cache,delete:async name=>{deleted.push(name);},keys:async()=>[]}});
  return{events,cache,deleted,request};
}
test('Offline shell handles app routes and leaves authentication/API/map requests to the server',async()=>{
  const {events}=worker();
  for(const path of['/','/trip/trip-a','/trip/trip-a/day/day-b','/trip/trip-a/unscheduled']){
    let result;events.fetch({request:{method:'GET',mode:'navigate',url:`https://private.example${path}`},respondWith:value=>{result=value;}});expect(await result).toEqual({cachedShell:true});
  }
  for(const path of['/signin-with-chatgpt?return_to=%2F','/logout','/callback','/api/map-config','/_AMapService/v3/place/text']){
    const respondWith=jest.fn();events.fetch({request:{method:'GET',mode:'navigate',url:`https://private.example${path}`},respondWith});expect(respondWith).not.toHaveBeenCalled();
  }
});
test('An authentication redirect cannot replace a cached app asset during installation',async()=>{
  const {events,cache,deleted}=worker({ok:true,redirected:true});let installation;events.install({waitUntil:value=>{installation=value;}});
  await expect(installation).rejects.toThrow('SHELL_ACCESS_UNAVAILABLE');expect(cache.put).not.toHaveBeenCalled();expect(deleted).toEqual(['travel-web-plan-shell-test-build']);
});
test('HTML returned in place of a script is rejected without caching a broken update',async()=>{
  const {events,cache}=worker({ok:true,redirected:false,headers:{get:()=> 'text/html'}});let installation;events.install({waitUntil:value=>{installation=value;}});
  await expect(installation).rejects.toThrow('INVALID_SHELL_RESPONSE');expect(cache.put).not.toHaveBeenCalled();
});
test('a wrong CSS content type cannot mark the map shell as offline ready',async()=>{
 const {events,cache}=worker({ok:true,redirected:false,headers:{get:()=> 'text/html'}},['/map.css']);
 let installing;events.install({waitUntil:value=>installing=value});await expect(installing).rejects.toThrow('INVALID_SHELL_RESPONSE');expect(cache.put).not.toHaveBeenCalled();
});

test('shell requests identify AJAX; an expired session cannot cache a login response or delete old data',async()=>{
 const {events,cache,deleted,request}=worker({ok:false,status:401,redirected:false});let installation;
 events.install({waitUntil:value=>installation=value});await expect(installation).rejects.toThrow('SHELL_ACCESS_UNAVAILABLE');
 expect(request).toHaveBeenCalledWith('/app.js',expect.objectContaining({credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}}));
 expect(cache.put).not.toHaveBeenCalled();expect(deleted).toEqual(['travel-web-plan-shell-test-build']);
});
