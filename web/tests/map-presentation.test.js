/* global test, expect, jest */
const {activateMarkerGroup,fitMarkers}=require('../src/maps/camera');
const {itineraryMarkers,showUnscheduledMarkers}=require('../src/maps/projection');
const marker=(id,lat)=>({id,coordinate:{latitude:lat,longitude:139.7,system:'wgs84'}});
test('AMap reserves the sheet area below the markers rather than on their left',()=>{
  const map={setFitView:jest.fn()},SDK={Marker:class{constructor(options){this.options=options;}}};
  fitMarkers([marker('a',35.68),marker('b',35.7)],{map,SDK,region:'china_mainland'},400);
  const [pins,immediately,padding,maxZoom]=map.setFitView.mock.calls[0];
  expect(pins).toHaveLength(2);expect(immediately).toBe(true);
  // AMap: top, bottom, left, right. The horizontal margins must be equal.
  expect(padding).toEqual([64,432,24,24]);expect(maxZoom).toBe(16);
});
test('Google fits the same visible area with named edge padding',()=>{
  const map={fitBounds:jest.fn()},SDK={LatLngBounds:class{extend(){}},event:{addListenerOnce:jest.fn()}};
  fitMarkers([marker('a',35.68)],{map,SDK,region:'global'},400);
  expect(map.fitBounds.mock.calls[0][1]).toEqual({top:64,bottom:432,left:24,right:24});
});
test('Google keeps a single pin above the sheet when limiting an overly close initial zoom',()=>{
  let idle;const fromPointToLatLng=jest.fn(point=>({lat:point.y,lng:point.x}));
  const map={fitBounds:jest.fn(),getZoom:()=>21,setZoom:jest.fn(),moveCamera:jest.fn(),getProjection:()=>({fromLatLngToPoint:()=>({x:100,y:120}),fromPointToLatLng})};
  const SDK={LatLngBounds:class{extend(){}getCenter(){return{};}},Point:class{constructor(x,y){this.x=x;this.y=y;}},event:{addListenerOnce:(_map,_event,callback)=>{idle=callback;}}};
  fitMarkers([marker('a',35.68)],{map,SDK,region:'global'},400);idle();
  expect(map.moveCamera).toHaveBeenCalledWith({zoom:16,center:{lat:120+(432-64)/2/2**16,lng:100}});
});
test('Nearby clusters can zoom past16 and open their occurrences at18',()=>{
  let clamp;const map={getZoom:jest.fn(()=>16),fitBounds:jest.fn(),setZoom:jest.fn(),getProjection:()=>undefined};const SDK={LatLngBounds:class{extend(){}},event:{addListenerOnce:(_map,_name,callback)=>{clamp=callback;}}};
  const group={marker:marker('a',35.68),members:[marker('a',35.68),marker('b',35.68005)]},preview=jest.fn();
  activateMarkerGroup(group,{map,SDK,region:'global'},200,preview);expect(map.fitBounds).toHaveBeenCalled();map.getZoom.mockReturnValue(21);clamp();expect(map.setZoom).toHaveBeenCalledWith(18);
  map.getZoom.mockReturnValue(18);activateMarkerGroup(group,{map,SDK,region:'global'},200,preview);expect(preview).toHaveBeenCalledWith(group);
});
test('Co-located occurrences open a list directly, and AMap close clusters use18 as well',()=>{
  const map={getZoom:()=>16,setFitView:jest.fn()},SDK={Marker:class{}};const first=marker('a',35.68);const preview=jest.fn();
  activateMarkerGroup({marker:first,members:[first,marker('b',35.68)]},{map,SDK,region:'china_mainland'},100,preview);expect(preview).toHaveBeenCalled();expect(map.setFitView).not.toHaveBeenCalled();
  activateMarkerGroup({marker:first,members:[first,marker('b',35.68005)]},{map,SDK,region:'china_mainland'},100,preview);expect(map.setFitView.mock.calls[0][3]).toBe(18);
});
test('Legacy source omissions preserve Day occurrence numbers while Place-less rows do not create gaps',()=>{
  const places={foreign:{name:'海外',provider:'google',coordinate:{latitude:35.68,longitude:139.7,system:'wgs84'}},domestic:{name:'国内',provider:'amap',coordinate:{latitude:35.7,longitude:112.6,system:'gcj02'}}};
  const items=[{id:'none',placeId:null},{id:'old-foreign',placeId:'foreign'},{id:'domestic',placeId:'domestic'}];
  const markers=itineraryMarkers(items,places,'china_mainland','day');expect(markers.map(x=>[x.id,x.ordinal])).toEqual([['domestic',2]]);expect(items[1].placeId).toBe('foreign');
});
test('Unscheduled locations are visible below the native density threshold and remain explicitly toggleable',()=>{
  expect(showUnscheduledMarkers(19)).toBe(true);expect(showUnscheduledMarkers(20)).toBe(false);expect(showUnscheduledMarkers(20,true)).toBe(true);expect(showUnscheduledMarkers(1,false)).toBe(false);
});
