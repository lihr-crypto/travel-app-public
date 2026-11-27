/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {create,act}=require('react-test-renderer');
const mockFit=jest.fn(),mockConstruct=jest.fn();
const mockMap={on:jest.fn(),off:jest.fn(),setFitView:mockFit,remove:jest.fn(),destroy:jest.fn(),lngLatToContainer:()=>({x:100,y:100})};
jest.mock('../src/maps/providers',()=>({loadProvider:async()=>({Map:class{constructor(){mockConstruct();return mockMap;}},Marker:class{on(){}off(){}},Pixel:class{}})}));
jest.mock('react-dom/client',()=>({createRoot:()=>({render:jest.fn(),unmount:jest.fn()})}));
const WebMap=require('../src/maps/WebMap').default;
let tree,previousDocument;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockFit.mockClear();mockConstruct.mockClear();
  previousDocument=global.document;
  global.document={createElement:()=>({style:{},setAttribute:jest.fn()})};
});
afterEach(async()=>{await act(async()=>tree?.unmount());global.document=previousDocument;});
test('a measured sheet height updates the camera without recreating the map',async()=>{
  const props={region:'china_mainland',config:{amapWebKey:'synthetic'},markers:[{id:'a',coordinate:{latitude:39.9,longitude:116.4}}],cameraKey:'day-1'};
  await act(async()=>{tree=create(React.createElement(WebMap,{...props,bottomPadding:312}),{createNodeMock:()=>({clientWidth:393,clientHeight:852,replaceChildren:jest.fn()})});});
  const initialCount=mockFit.mock.calls.length;
  await act(async()=>tree.update(React.createElement(WebMap,{...props,bottomPadding:408.96})));
  expect(mockFit.mock.calls.length).toBeGreaterThan(initialCount);
  expect(mockFit.mock.calls.at(-1)[2]).toEqual([64,440.96,24,24]);
  expect(mockConstruct).toHaveBeenCalledTimes(1);
});
