/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {create,act}=require('react-test-renderer');
let mockHandlers,mockMarkers;
const mockMap={on:jest.fn((event,handler)=>{mockHandlers[event]=handler;}),off:jest.fn(),setFitView:jest.fn(),remove:jest.fn(),destroy:jest.fn(),setZoomAndCenter:jest.fn(),getZoom:()=>14,lngLatToContainer:()=>({x:100,y:100})};
class MockMarker{constructor(options){this.options=options;this.handlers={};mockMarkers.push(this);}on(event,handler){this.handlers[event]=handler;}off(){}}
const mockGoogleListeners={};
const mockGoogleMap={addListener:jest.fn((event,handler)=>{mockGoogleListeners[event]=handler;return{remove:jest.fn()};}),fitBounds:jest.fn(),moveCamera:jest.fn(),setClickableIcons:jest.fn(),getZoom:()=>10,getProjection:()=>undefined};
class MockAdvancedMarker{constructor(options){this.options=options;this.children=[];this.listeners={};mockMarkers.push(this);}append(element){this.children.push(element);}addEventListener(event,handler){this.listeners[event]=handler;}removeEventListener(){}}
const mockGoogleSdk=()=>({importLibrary:async()=>({}),Map:class{constructor(){return mockGoogleMap;}},OverlayView:class{setMap(){}getProjection(){return undefined;}},LatLngBounds:class{extend(){}},event:{addListenerOnce(){}},marker:{AdvancedMarkerElement:MockAdvancedMarker}});
jest.mock('../src/maps/providers',()=>({loadProvider:async region=>region==='global'?mockGoogleSdk():({Map:class{constructor(){return mockMap;}},Marker:MockMarker,Pixel:class{constructor(x,y){this.x=x;this.y=y;}}})}));
jest.mock('react-dom/client',()=>({createRoot:()=>({render:jest.fn(),unmount:jest.fn()})}));
const WebMap=require('../src/maps/WebMap').default;
// A stable config object, as in the app: a new object per render would rebuild the whole map.
const config={amapWebKey:'synthetic'};
const pinned={id:'a',coordinate:{latitude:30.24,longitude:120.1,system:'gcj02'},label:'灵隐寺'};
const click=(latitude,longitude)=>({lnglat:{getLat:()=>latitude,getLng:()=>longitude}});
let tree,previousDocument,now;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;mockHandlers={};mockMarkers=[];
  [mockMap.on,mockMap.off,mockMap.remove,mockMap.setFitView,mockGoogleMap.fitBounds,mockGoogleMap.setClickableIcons].forEach(mock=>mock.mockClear());
  previousDocument=global.document;global.document={createElement:()=>({style:{},setAttribute:jest.fn()})};
  now=1000;jest.spyOn(Date,'now').mockImplementation(()=>now);
});
afterEach(async()=>{await act(async()=>tree?.unmount());global.document=previousDocument;jest.restoreAllMocks();});
const mount=async props=>{await act(async()=>{tree=create(React.createElement(WebMap,{region:'china_mainland',config,mode:'day',cameraKey:'k',...props}),{createNodeMock:()=>({clientWidth:393,clientHeight:852,replaceChildren:jest.fn()})});});};
const update=async props=>act(async()=>tree.update(React.createElement(WebMap,{region:'china_mainland',config,mode:'day',cameraKey:'k',...props})));

test('a map tap reports the raw provider coordinate and its coordinate system',async()=>{
  const onPick=jest.fn();await mount({markers:[pinned],onPick});
  mockHandlers.click(click(30.25,120.16));
  expect(onPick).toHaveBeenCalledWith({latitude:30.25,longitude:120.16,system:'gcj02'});
});

test('no tap handler means a map tap is ignored',async()=>{
  await mount({markers:[pinned]});expect(()=>mockHandlers.click(click(30.25,120.16))).not.toThrow();
});

test('a pin press is not also counted as a map tap, but later taps work again',async()=>{
  const onPick=jest.fn(),onMarker=jest.fn();await mount({markers:[pinned],onPick,onMarker});
  const pin=mockMarkers.find(marker=>marker.handlers.click);
  pin.handlers.click();expect(onMarker).toHaveBeenCalledTimes(1);
  now+=50;mockHandlers.click(click(30.25,120.16));expect(onPick).not.toHaveBeenCalled();
  now+=600;mockHandlers.click(click(30.25,120.16));expect(onPick).toHaveBeenCalledTimes(1);
});

test('the candidate pin is separate from itinerary pins, follows the tap, and leaves the camera alone',async()=>{
  const markers=[pinned],onPick=jest.fn(),candidates=()=>mockMarkers.filter(marker=>marker.options.zIndex===1100);
  await mount({markers,onPick});
  const fits=mockMap.setFitView.mock.calls.length;expect(candidates()).toHaveLength(0);
  await update({markers,onPick,candidate:{latitude:30.25,longitude:120.16}});
  const [first]=candidates();
  expect(candidates()).toHaveLength(1);expect(first.options).toMatchObject({position:[120.16,30.25],zIndex:1100});expect(first.options.content.style.pointerEvents).toBe('none');expect(first.handlers.click).toBeUndefined();
  await update({markers,onPick,candidate:{latitude:30.3,longitude:120.2}});
  expect(mockMap.remove).toHaveBeenCalledWith(first);expect(candidates()).toHaveLength(2);const second=candidates()[1];expect(second.options.position).toEqual([120.2,30.3]);
  await update({markers,onPick,candidate:null});
  expect(mockMap.remove).toHaveBeenCalledWith(second);expect(candidates()).toHaveLength(2);
  expect(mockMap.setFitView.mock.calls.length).toBe(fits);
});

const googleConfig={googleWebKey:'synthetic'};
const googlePinned={id:'g',coordinate:{latitude:34.67,longitude:135.5,system:'wgs84'},label:'大阪城'};

test('Google map taps report the raw WGS84 coordinate',async()=>{
  const onPick=jest.fn();await mount({region:'global',config:googleConfig,markers:[googlePinned],onPick});
  mockGoogleListeners.click({latLng:{lat:()=>34.7,lng:()=>135.52}});
  expect(onPick).toHaveBeenCalledWith({latitude:34.7,longitude:135.52,system:'wgs84'});
});

test('a Google pin press is not also counted as a map tap',async()=>{
  const onPick=jest.fn(),onMarker=jest.fn();await mount({region:'global',config:googleConfig,markers:[googlePinned],onPick,onMarker});
  const pin=mockMarkers.find(marker=>marker.listeners['gmp-click']);
  pin.listeners['gmp-click']();expect(onMarker).toHaveBeenCalledTimes(1);
  now+=50;mockGoogleListeners.click({latLng:{lat:()=>34.7,lng:()=>135.52}});expect(onPick).not.toHaveBeenCalled();
  now+=600;mockGoogleListeners.click({latLng:{lat:()=>34.7,lng:()=>135.52}});expect(onPick).toHaveBeenCalledTimes(1);
});

test('the Google candidate pin is a separate, non-interactive marker that is removed with the candidate',async()=>{
  const markers=[googlePinned],onPick=jest.fn(),candidates=()=>mockMarkers.filter(marker=>marker.options.zIndex===1100);
  await mount({region:'global',config:googleConfig,markers,onPick});expect(candidates()).toHaveLength(0);
  await update({region:'global',config:googleConfig,markers,onPick,candidate:{latitude:34.7,longitude:135.52}});
  const [pin]=candidates();
  expect(pin.options).toMatchObject({position:{lat:34.7,lng:135.52},zIndex:1100});expect(pin.children).toHaveLength(1);expect(pin.children[0].style.pointerEvents).toBe('none');expect(pin.options.gmpClickable).toBeUndefined();
  await update({region:'global',config:googleConfig,markers,onPick,candidate:null});
  expect(pin.map).toBeNull();
});

test('the Trip map reports taps with the zoom and no place id on AMap',async()=>{
  const onTap=jest.fn(),onPick=jest.fn();await mount({markers:[pinned],onTap,onPick});
  mockHandlers.click(click(30.25,120.16));
  expect(onTap).toHaveBeenCalledWith({coordinate:{latitude:30.25,longitude:120.16,system:'gcj02'},placeId:null,zoom:14});
  expect(onPick).not.toHaveBeenCalled();
});

test('a labelled Google icon is reported with its place id and its own info window is suppressed',async()=>{
  const onTap=jest.fn(),stop=jest.fn();await mount({region:'global',config:googleConfig,markers:[googlePinned],onTap});
  mockGoogleListeners.click({latLng:{lat:()=>34.7,lng:()=>135.52},placeId:'ChIJ-icon',stop});
  expect(stop).toHaveBeenCalledTimes(1);
  expect(onTap).toHaveBeenCalledWith({coordinate:{latitude:34.7,longitude:135.52,system:'wgs84'},placeId:'ChIJ-icon',zoom:10});
  mockGoogleListeners.click({latLng:{lat:()=>34.71,lng:()=>135.53},stop});
  expect(stop).toHaveBeenCalledTimes(1);expect(onTap.mock.calls[1][0].placeId).toBeNull();
});

test('Google icons are clickable only while the Trip map has a tap handler',async()=>{
  const markers=[googlePinned],onTap=jest.fn();
  await mount({region:'global',config:googleConfig,markers,onTap});
  expect(mockGoogleMap.setClickableIcons).toHaveBeenLastCalledWith(true);
  await update({region:'global',config:googleConfig,markers});
  expect(mockGoogleMap.setClickableIcons).toHaveBeenLastCalledWith(false);
});

test('a tentative candidate is a small centred dot rather than a pin',async()=>{
  const markers=[pinned];await mount({markers});
  await update({markers,candidate:{latitude:30.25,longitude:120.16,tentative:true}});
  const dot=mockMarkers.find(marker=>marker.options.zIndex===1100);
  expect(dot.options.offset).toMatchObject({x:-10,y:-10});expect(dot.options.content.style).toMatchObject({width:'20px',height:'20px',borderRadius:'50%'});
});

test('a focused candidate brings itself above the sheet once, and an unfocused one never moves the camera',async()=>{
  const markers=[pinned];await mount({markers,bottomPadding:300});
  const fits=mockMap.setFitView.mock.calls.length;
  await update({markers,bottomPadding:300,candidate:{latitude:30.25,longitude:120.16}});expect(mockMap.setFitView.mock.calls.length).toBe(fits);
  await update({markers,bottomPadding:300,candidate:{latitude:30.3,longitude:120.2,focus:true}});
  expect(mockMap.setFitView.mock.calls.length).toBe(fits+1);expect(mockMap.setFitView.mock.calls.at(-1)[2]).toEqual([64,332,24,24]);
  await update({markers,bottomPadding:300,candidate:{latitude:30.3,longitude:120.2,focus:true}});
  expect(mockMap.setFitView.mock.calls.length).toBe(fits+1);
});

test('a focused Google candidate fits the same way', async()=>{
  const markers=[googlePinned];await mount({region:'global',config:googleConfig,markers,bottomPadding:300});
  const fits=mockGoogleMap.fitBounds.mock.calls.length;
  await update({region:'global',config:googleConfig,markers,bottomPadding:300,candidate:{latitude:34.7,longitude:135.52,focus:true}});
  expect(mockGoogleMap.fitBounds.mock.calls.length).toBe(fits+1);expect(mockGoogleMap.fitBounds.mock.calls.at(-1)[1]).toEqual({top:64,right:24,bottom:332,left:24});
});
