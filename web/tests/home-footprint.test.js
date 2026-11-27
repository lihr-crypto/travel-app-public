/* global test,expect,jest */
const {webHomeProjection,homeDisplayCoordinate,focusFootprintCamera}=require('../src/maps/home-projection');
const {clusterHomeMarkers}=require('../../src/application/projections/home-clusters');
const TODAY='2026-10-14';
const trip=(id,startDate='2026-10-20',endDate=startDate)=>({id,title:id,startDate,endDate,mapRegion:id==='china'?'china_mainland':'global'});
const day=(tripId,index=1,date='2026-10-20')=>({id:`${tripId}-${index}`,tripId,dayIndex:index,date});
const place=(id,provider,latitude,longitude)=>({id,name:id,provider,coordinate:{latitude,longitude,system:provider==='amap'?'gcj02':'wgs84'}});
const china=place('北京原名称','amap',39.91640428150164,116.41024449916938),japan=place('東京の元の名前','google',35.68,139.7);
const item=(id,tripId,dayId,placeId,sortOrder=0)=>({id,tripId,dayId,placeId,sortOrder});
const project=(state,options={})=>webHomeProjection(state,{today:TODAY,...options});
test('one canvas receives domestic and overseas trip anchors without rewriting names, coordinates, or saved sources',()=>{
 const state={trips:[trip('china'),trip('japan')],days:[day('china'),day('japan')],items:[item('c','china','china-1',china.id),item('j','japan','japan-1',japan.id)],places:[china,japan]};const before=JSON.stringify(state);
 const projection=project(state);expect(projection.markers.map(x=>x.tripId)).toEqual(['china','japan']);expect(projection.markers.every(x=>x.coordinate.system==='wgs84')).toBe(true);
 expect(projection.markers[0].label).toBe(china.name);expect(projection.markers[0].coordinate.latitude).toBeCloseTo(39.915,6);expect(projection.markers[0].coordinate.longitude).toBeCloseTo(116.404,6);
 expect(projection.markers[1].coordinate).toEqual(japan.coordinate);expect(JSON.stringify(state)).toBe(before);
});
test('a scheduled starting point takes priority and unscheduled-only trips remain on the footprint',()=>{
 const a=trip('a'),b=trip('b'),d1=day('a',1,'2026-10-20'),d2=day('a',2,'2026-10-21');
 const state={trips:[a,b],days:[d2,d1],places:[japan,china],items:[item('later','a',d2.id,china.id,0),item('earlier','a',d1.id,japan.id,8),item('unscheduled','b',null,china.id)]};
 const p=project(state);expect(p.markers.map(x=>[x.tripId,x.label])).toEqual([['a',japan.name],['b',china.name]]);expect(p.visibleTrips.find(x=>x.tripId==='a').placeCount).toBe(2);
});
test('the active trip focuses today rather than its anchor; filters use the App priority and weights',()=>{
 const state={trips:[trip('active','2026-10-13','2026-10-15'),trip('near','2026-10-16'),trip('far','2026-11-01'),trip('done','2026-09-01','2026-10-10')],days:[day('active',1,'2026-10-13'),day('active',2,TODAY)],places:[china,japan],items:[item('anchor','active','active-1',china.id),item('today','active','active-2',japan.id),item('near','near',null,china.id),item('far','far',null,japan.id),item('done','done',null,japan.id)]};
 const all=project(state);expect(all.focusedTripId).toBe('active');expect(all.cameraRequest.coordinates).toEqual([japan.coordinate]);expect(all.activeTrip).toMatchObject({dayId:'active-2',dayIndex:2,fromLabel:japan.name,toLabel:null});
 expect(Object.fromEntries(all.markers.map(x=>[x.tripId,x.weight]))).toEqual({active:'emphasized',near:'weak',far:'weak',done:'normal'});
 const planned=project(state,{filter:'planned'});expect(planned.markers.map(x=>x.tripId)).toEqual(['near','far']);expect(planned.focusedTripId).toBe('near');
 const completed=project(state,{filter:'completed'});expect(completed.focusedTripId).toBe('done');expect(completed.markers.map(x=>x.tripId)).toEqual(['done']);
});
test('home clusters count trips, not items, and retain the member IDs needed by the preview',()=>{
 const state={trips:[trip('one'),trip('two')],days:[],places:[japan],items:[item('a','one',null,japan.id),item('b','one',null,japan.id,1),item('c','two',null,japan.id)]};
 const p=project(state);expect(p.markers).toHaveLength(2);const grouped=clusterHomeMarkers(p.markers,{latitudeDelta:1});expect(grouped).toHaveLength(1);expect(grouped[0].clusterTripIds).toEqual(['one','two']);expect(grouped[0].sourceItemIds).toHaveLength(2);
});
test('unplaced/invalid legacy trips remain listed and cannot poison valid anchors or camera selection',()=>{
 const bad=place('bad','amap',Number.NaN,116),unknown=place('unknown','manual',40,116);
 const state={trips:[trip('bad'),trip('unknown'),trip('valid')],days:[],places:[bad,unknown,japan],items:[item('b','bad',null,bad.id),item('u','unknown',null,unknown.id),item('v','valid',null,japan.id)]};
 const p=project(state);expect(p.visibleTrips).toHaveLength(3);expect(p.unplacedTripIds).toEqual(['bad','unknown']);expect(p.markers.map(x=>x.tripId)).toEqual(['valid']);expect(p.focusedTripId).toBe('valid');
});
test('display conversion passes overseas WGS84 through and rejects invalid input',()=>{
 expect(homeDisplayCoordinate(japan.coordinate)).toEqual(japan.coordinate);expect(homeDisplayCoordinate(japan.coordinate)).not.toBe(japan.coordinate);
 expect(()=>homeDisplayCoordinate({latitude:91,longitude:116,system:'gcj02'})).toThrow();
});
test('camera changes jump directly and fitting today never animates a long flight',()=>{
 const map={jumpTo:jest.fn(),fitBounds:jest.fn()};focusFootprintCamera(map,{coordinates:[japan.coordinate]});expect(map.jumpTo).toHaveBeenCalledWith({center:[139.7,35.68]});expect(map.fitBounds).not.toHaveBeenCalled();
 focusFootprintCamera(map,{coordinates:[japan.coordinate,{latitude:35.8,longitude:140.4,system:'wgs84'}]});expect(map.fitBounds.mock.calls[0][1]).toMatchObject({duration:0,maxZoom:14});
 map.jumpTo.mockClear();map.fitBounds.mockClear();focusFootprintCamera(map,null);expect(map.jumpTo).not.toHaveBeenCalled();expect(map.fitBounds).not.toHaveBeenCalled();
});
