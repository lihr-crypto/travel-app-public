/* global beforeEach, afterEach, test, expect, jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {create,act}=require('react-test-renderer');
let tree;const render=element=>{tree=create(element);};
jest.mock('@tanstack/react-query',()=>({
  QueryClient:class{},QueryClientProvider:({children})=>children,
  useQuery:({queryKey})=>queryKey[0]==='cloud-controller'?{data:{actor:{id:'test'},store:{read:async()=>({}),subscribe:()=>()=>{}},sync:()=>Promise.resolve(),subscribe:()=>()=>{},status:{phase:'saved'}},isPending:false}:({data:{revision:0,state:{trips:[],days:[],items:[],places:[],extras:{}}},isPending:false}),
  useQueryClient:()=>({invalidateQueries:async()=>{}}),
}));
jest.mock('../src/store',()=>({createBrowserStore:()=>({read:async()=>({}),subscribe:()=>()=>{}})}));
jest.mock('../src/commands',()=>({createWebCommands:()=>({})}));
const {PlanProvider,usePlan}=require('../src/PlanContext');
let plan,online,visible,previous;
function Probe(){const value=usePlan();React.useEffect(()=>{plan=value;},[value]);return null;}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  previous={window:global.window,document:global.document,fetch:global.fetch};
  const networkListeners=new Set(),visibilityListeners=new Set();online=()=>networkListeners.forEach(fn=>fn());visible=()=>visibilityListeners.forEach(fn=>fn());
  global.window={addEventListener:(event,listener)=>{if(event==='online')networkListeners.add(listener);},removeEventListener:(event,listener)=>networkListeners.delete(listener)};
  global.document={visibilityState:'visible',addEventListener:(event,listener)=>{if(event==='visibilitychange')visibilityListeners.add(listener);},removeEventListener:(event,listener)=>visibilityListeners.delete(listener)};
});
afterEach(async()=>{await act(async()=>{tree?.unmount();});Object.assign(global,previous);});
const configured={amapWebKey:'synthetic-amap',amapSecurityConfigured:true,googleWebKey:'synthetic-google'};
const response=()=>({ok:true,json:async()=>({...configured})});
test('A cold offline launch reconnects maps when the network comes back',async()=>{
  global.fetch=jest.fn().mockRejectedValue(new Error('offline'));
  await act(async()=>{render(React.createElement(PlanProvider,null,React.createElement(Probe)));});
  expect(plan.config).toEqual({unavailable:true});
  global.fetch.mockImplementation(async()=>response());
  await act(async()=>{online();});
  expect(plan.config).toEqual(configured);
});
test('Returning to the app rechecks configuration without recreating an unchanged map; failures keep the loaded config',async()=>{
  global.fetch=jest.fn(async()=>response());
  await act(async()=>{render(React.createElement(PlanProvider,null,React.createElement(Probe)));});
  const loaded=plan.config;
  await act(async()=>{visible();});expect(plan.config).toBe(loaded);
  global.fetch.mockRejectedValue(new Error('offline'));
  await act(async()=>{await plan.refreshMaps();});expect(plan.config).toBe(loaded);
});
test('map configuration detects an expired session and recovers on return without replacing existing data',async()=>{
 global.fetch=jest.fn(async()=>({ok:false,status:401,json:async()=>({})}));
 await act(async()=>{render(React.createElement(PlanProvider,null,React.createElement(Probe)));});
 expect(plan.mapAuthRequired).toBe(true);expect(plan.config).toEqual({unavailable:true});
 expect(global.fetch).toHaveBeenCalledWith('/api/map-config',expect.objectContaining({headers:expect.objectContaining({'X-Requested-With':'XMLHttpRequest'})}));
 global.fetch.mockImplementation(async()=>response());await act(async()=>{visible();});
 expect(plan.mapAuthRequired).toBe(false);expect(plan.config).toEqual(configured);
});
