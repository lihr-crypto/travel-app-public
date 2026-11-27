/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {create,act}=require('react-test-renderer');
let mockPlan,mockMapProps,mockEditorProps,mockSheetProps,mockReverse,mockPlaceFromId,mockNearby,mockSearch;
jest.mock('../src/PlanContext',()=>({usePlan:()=>mockPlan,readableError:error=>String(error)}));
jest.mock('../src/maps/WebMap',()=>({__esModule:true,default:props=>{mockMapProps=props;return null;}}));
jest.mock('../src/maps/providers',()=>({reversePlace:(...args)=>mockReverse(...args),placeFromId:(...args)=>mockPlaceFromId(...args),nearbyPlace:(...args)=>mockNearby(...args),searchPlaces:(...args)=>mockSearch(...args)}));
jest.mock('../src/motion',()=>({useMotionState:initial=>require('react').useState(initial)}));
jest.mock('../src/use-day-swipe',()=>({__esModule:true,default:()=>{}}));
jest.mock('../src/components/Modal',()=>({__esModule:true,default:({children})=>children}));
jest.mock('../src/components/ItemEditor',()=>({__esModule:true,default:props=>{mockEditorProps=props;return null;}}));
jest.mock('../src/components/ItemActions',()=>({__esModule:true,default:()=>null}));
jest.mock('../src/components/ItemRow',()=>({__esModule:true,default:()=>null}));
jest.mock('../src/components/TripForms',()=>({TripManagement:()=>null,DayManagement:()=>null}));
jest.mock('../../src/components/trip-bottom-sheet',()=>({TRIP_SHEET_SNAP_PERCENTAGES:{collapsed:14,half:48,expanded:88},TripBottomSheet:props=>{mockSheetProps=props;return props.children;}}));
jest.mock('../../src/components/day-timeline',()=>({DayTimeline:()=>null}));
jest.mock('../../src/components/day-swipe-guard',()=>({DaySwipeGuardProvider:({children})=>children,useDaySwipeGuardState:()=>({})}));
jest.mock('../../src/components/use-day-sheet-pan',()=>({useDaySheetPan:()=>({sheetRef:{current:null},scrollRef:{current:null},position:null,contentGesture:null,timelineGestureRef:{current:null},onPanStart(){},onPanDelta(){},onPanEnd(){},onTimelineTouchChange(){},onScroll(){},onContainerLayout(){},onScrollLayout(){},onContentSizeChange(){}})}));
const TripWorkspace=require('../src/components/TripWorkspace').default;
const MapCandidateCard=require('../src/components/MapCandidateCard').default;
const MapSearchBar=require('../src/components/MapSearchBar').default;

const spot={latitude:30.25,longitude:120.16,system:'gcj02'};
const spotAgain={latitude:30.25005,longitude:120.16,system:'gcj02'};
const spotFar={latitude:30.26,longitude:120.17,system:'gcj02'};
const icon={name:'灵隐寺',address:'灵隐路1号',provider:'amap',providerPlaceId:'poi-1',coordinate:{latitude:30.2501,longitude:120.1601,system:'gcj02'},regionLabel:'杭州',metadata:null};
const named={name:'西湖风景名胜区',address:'浙江省杭州市西湖区',coordinate:spotAgain,provider:'amap',providerPlaceId:null,regionLabel:'杭州市',metadata:null};
const gIcon={name:'千貫門ビーチ',address:'静岡県賀茂郡松崎町',provider:'google',providerPlaceId:'ChIJ-beach',coordinate:{latitude:34.7,longitude:138.8,system:'wgs84'},regionLabel:null,metadata:null};
let tree,writable,navigate;
const baseState=()=>({
  trips:[{id:'trip',title:'杭州',startDate:'2026-10-13',endDate:'2026-10-14',mapRegion:'china_mainland'},{id:'gtrip',title:'松崎',startDate:'2026-11-22',endDate:'2026-11-23',mapRegion:'global'}],
  days:[{id:'d1',tripId:'trip',dayIndex:1,date:'2026-10-13'},{id:'d2',tripId:'trip',dayIndex:2,date:'2026-10-14'},{id:'g1',tripId:'gtrip',dayIndex:1,date:'2026-11-22'}],
  items:[
    {id:'i1',tripId:'trip',dayId:'d1',placeId:'p1',title:'灵隐寺',type:'sightseeing',timeMode:'none',startDateTime:null,endDateTime:null,period:null,note:null,sortOrder:0},
    {id:'gi',tripId:'gtrip',dayId:'g1',placeId:'gp',title:'海边',type:'sightseeing',timeMode:'none',startDateTime:null,endDateTime:null,period:null,note:null,sortOrder:0},
  ],
  places:[{id:'p1',name:'灵隐寺',provider:'amap',coordinate:{latitude:30.24,longitude:120.1,system:'gcj02'}},{id:'gp',name:'海边',provider:'google',coordinate:{latitude:34.68,longitude:138.78,system:'wgs84'}}],extras:{},
});
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.setSystemTime(new Date('2026-11-20T12:00:00Z'));
  writable=true;mockEditorProps=undefined;navigate=jest.fn();
  mockReverse=jest.fn(async()=>named);mockPlaceFromId=jest.fn(async()=>gIcon);mockNearby=jest.fn(async()=>icon);mockSearch=jest.fn(async()=>[icon]);
  mockPlan={state:baseState(),config:{synthetic:true},refreshMaps:jest.fn(),run:jest.fn(),canEdit:()=>writable};
});
afterEach(async()=>{await act(async()=>tree?.unmount());jest.useRealTimers();});
const element=props=>React.createElement(TripWorkspace,{tripId:'trip',view:'day',dayId:'d1',navigate,back:jest.fn(),...props});
const render=async props=>{await act(async()=>{tree=create(element(props));});};
const rerender=async props=>act(async()=>tree.update(element(props)));
const card=()=>tree.root.findAllByType(MapCandidateCard)[0];
const waiting=()=>mockMapProps.candidate?.tentative===true;
const tap=async(coordinate,extra={})=>act(async()=>mockMapProps.onTap({coordinate,placeId:null,zoom:15,...extra}));
const advance=async ms=>act(async()=>{jest.advanceTimersByTime(ms);});

test('on AMap one tap picks the nearest labelled place, and nothing is written until the editor saves',async()=>{
  await render();
  expect(mockMapProps.onTap).toEqual(expect.any(Function));expect(mockMapProps.onPick).toBeUndefined();expect(card()).toBeUndefined();
  await tap(spot);
  expect(mockNearby).toHaveBeenCalledTimes(1);const [asked,radius,config]=mockNearby.mock.calls[0];
  expect(asked).toBe(spot);expect(radius).toBeGreaterThanOrEqual(15);expect(radius).toBeLessThanOrEqual(150);expect(config).toBe(mockPlan.config);
  expect(card().props.candidate).toMatchObject({kind:'place',result:icon,targetDayId:'d1'});
  expect(mockMapProps.candidate).toMatchObject({latitude:icon.coordinate.latitude,longitude:icon.coordinate.longitude,tentative:false,focus:false});
  expect(waiting()).toBe(false);expect(mockPlan.run).not.toHaveBeenCalled();expect(mockMapProps.markers.map(marker=>marker.id)).toEqual(['i1']);
  await act(async()=>card().props.onConfirm());
  expect(mockEditorProps).toMatchObject({dayId:'d1',item:undefined,initialPlace:{kind:'search',result:icon}});
  expect(tree.root.findAllByType(MapCandidateCard)).toHaveLength(0);expect(mockPlan.run).not.toHaveBeenCalled();
});

test('on Google a tapped labelled icon is fetched by its place id; a tap without one never asks Google',async()=>{
  await render({tripId:'gtrip',dayId:'g1'});
  await tap({latitude:34.7,longitude:138.8,system:'wgs84'},{placeId:'ChIJ-beach'});
  expect(mockPlaceFromId).toHaveBeenCalledWith('ChIJ-beach',mockPlan.config);expect(mockNearby).not.toHaveBeenCalled();
  expect(card().props.candidate).toMatchObject({kind:'place',result:gIcon,targetDayId:'g1'});
  await act(async()=>card().props.onConfirm());expect(mockEditorProps.initialPlace).toEqual({kind:'search',result:gIcon});
  await act(async()=>mockEditorProps.onClose());await act(async()=>card().props.onClose());
  mockPlaceFromId.mockClear();await tap({latitude:34.71,longitude:138.81,system:'wgs84'});
  expect(mockPlaceFromId).not.toHaveBeenCalled();expect(mockNearby).not.toHaveBeenCalled();expect(card()).toBeUndefined();expect(waiting()).toBe(true);
});

test('a tap where nothing is displayed opens no card and only marks the spot with a dot',async()=>{
  mockNearby.mockResolvedValue(null);await render();
  await tap(spot);
  expect(card()).toBeUndefined();expect(tree.root.findAllByProps({className:'map-tap-hint'})).toHaveLength(0);
  expect(mockMapProps.candidate).toMatchObject({latitude:spot.latitude,longitude:spot.longitude,tentative:true});
  expect(mockReverse).not.toHaveBeenCalled();expect(mockPlan.run).not.toHaveBeenCalled();
});

test('a deliberate second tap on the same spot makes the coordinate candidate, named by a reverse lookup',async()=>{
  mockNearby.mockResolvedValue(null);await render();
  await tap(spot);await advance(1000);await tap(spotAgain);
  expect(mockNearby).toHaveBeenCalledTimes(1);expect(mockReverse).toHaveBeenCalledWith('china_mainland',spotAgain,mockPlan.config);
  expect(waiting()).toBe(false);expect(card().props.candidate).toMatchObject({kind:'coordinate',coordinate:spotAgain,enrichment:named,resolving:false,targetDayId:'d1'});
  expect(mockMapProps.candidate).toMatchObject({tentative:false,focus:false});
  await act(async()=>card().props.onConfirm());
  expect(mockEditorProps).toMatchObject({dayId:'d1',initialPlace:{kind:'map-picker',coordinate:spotAgain,provider:'amap',enrichment:named}});expect(mockPlan.run).not.toHaveBeenCalled();
});

test('a failed reverse lookup keeps a coordinate-only candidate that can still be added',async()=>{
  mockNearby.mockResolvedValue(null);mockReverse.mockRejectedValue(new Error('offline'));await render();
  await tap(spot);await advance(1000);await tap(spotAgain);
  expect(card().props.candidate).toMatchObject({kind:'coordinate',enrichment:null,resolving:false});
  await act(async()=>card().props.onConfirm());expect(mockEditorProps.initialPlace).toMatchObject({kind:'map-picker',coordinate:spotAgain,enrichment:null});
});

test('a second tap that is too soon is ignored, and one that is far away starts over',async()=>{
  mockNearby.mockResolvedValue(null);await render();
  await tap(spot);await advance(100);await tap(spotAgain);
  expect(mockNearby).toHaveBeenCalledTimes(1);expect(card()).toBeUndefined();expect(waiting()).toBe(true);expect(mockMapProps.candidate.tentative).toBe(true);
  await advance(900);await tap(spotFar);
  expect(mockNearby).toHaveBeenCalledTimes(2);expect(card()).toBeUndefined();expect(mockMapProps.candidate).toMatchObject({latitude:spotFar.latitude,tentative:true});
});

test('the waiting dot expires with the window, after which a tap is a new first tap',async()=>{
  mockNearby.mockResolvedValue(null);await render();
  await tap(spot);expect(waiting()).toBe(true);await advance(4500);
  expect(waiting()).toBe(false);expect(mockMapProps.candidate).toBeNull();
  await tap(spotAgain);expect(mockNearby).toHaveBeenCalledTimes(2);expect(card()).toBeUndefined();expect(waiting()).toBe(true);
});

test('a newer tap replaces the one being looked up, and a slow older answer is ignored',async()=>{
  let releaseOld;const other={...icon,name:'龙井村',providerPlaceId:'poi-2'};
  mockNearby.mockImplementationOnce(()=>new Promise(resolve=>{releaseOld=()=>resolve(icon);})).mockResolvedValueOnce(other);
  await render();await tap(spot);await tap(spotFar);
  expect(card().props.candidate).toMatchObject({kind:'place',result:other});
  await act(async()=>releaseOld());
  expect(card().props.candidate.result).toBe(other);
});

test('closing the card, changing Day, or pressing a pin discards the candidate and the waiting dot',async()=>{
  await render();await tap(spot);await act(async()=>card().props.onClose());
  expect(card()).toBeUndefined();expect(mockMapProps.candidate).toBeNull();
  await tap(spot);await rerender({dayId:'d2'});expect(card()).toBeUndefined();
  mockNearby.mockResolvedValueOnce(null);await tap(spot);expect(waiting()).toBe(true);await rerender({dayId:'d1'});expect(waiting()).toBe(false);expect(mockMapProps.candidate).toBeNull();
  await tap(spot);await act(async()=>mockMapProps.onMarker({marker:{id:'i1'},members:[{sourceItemIds:['i1']}]}));
  expect(card()).toBeUndefined();expect(mockMapProps.candidate).toBeNull();
});

test('a lookup that finishes after the Day changed does not appear on the new Day',async()=>{
  let release;mockNearby.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(icon);}));
  await render();await tap(spot);await rerender({dayId:'d2'});await act(async()=>release());
  expect(card()).toBeUndefined();expect(mockMapProps.candidate).toBeNull();
});

test('Unscheduled view targets no Day and Overview lets the user choose the Day',async()=>{
  await render({view:'unscheduled',dayId:undefined});await tap(spot);
  expect(card().props.candidate.targetDayId).toBeNull();expect(card().props.canChooseDay).toBe(false);
  await act(async()=>card().props.onConfirm());expect(mockEditorProps).toMatchObject({dayId:null});
  await act(async()=>tree.unmount());
  await render({view:'overview',dayId:undefined});await tap(spot);
  expect(card().props.canChooseDay).toBe(true);expect(card().props.candidate.targetDayId).toBeNull();
  await act(async()=>card().props.onTargetChange('d2'));expect(card().props.candidate.targetDayId).toBe('d2');
  await act(async()=>card().props.onConfirm());expect(mockEditorProps).toMatchObject({dayId:'d2',initialPlace:{kind:'search'}});
});

test('members who cannot edit get no tap handler, no search box and no card',async()=>{
  writable=false;await render();
  expect(mockMapProps.onTap).toBeUndefined();expect(card()).toBeUndefined();expect(tree.root.findAllByType(MapSearchBar)).toHaveLength(0);
});

test('losing edit permission while a candidate or waiting dot is open removes it',async()=>{
  await render();await tap(spot);expect(card()).toBeDefined();
  writable=false;await rerender({});
  expect(card()).toBeUndefined();expect(mockMapProps.candidate).toBeNull();expect(tree.root.findAllByType(MapSearchBar)).toHaveLength(0);
});

test('a saved add clears the candidate while cancelling the editor keeps it',async()=>{
  await render();await tap(spot);await act(async()=>card().props.onConfirm());
  await act(async()=>mockEditorProps.onClose());expect(card()).toBeDefined();
  await act(async()=>card().props.onConfirm());await act(async()=>{mockEditorProps.onSaved('new-item');mockEditorProps.onClose();});
  expect(card()).toBeUndefined();expect(mockMapProps.candidate).toBeNull();
});

test('choosing a search result proposes it as a place candidate and asks the map to focus on it',async()=>{
  await render();
  const bar=tree.root.findByType(MapSearchBar);
  expect(bar.props.bias).toEqual(mockPlan.state.places[0].coordinate);expect(bar.props.trip.id).toBe('trip');
  await act(async()=>bar.props.onSelect(icon));
  expect(card().props.candidate).toMatchObject({kind:'place',result:icon,focus:true,targetDayId:'d1'});
  expect(mockMapProps.candidate).toMatchObject({latitude:icon.coordinate.latitude,tentative:false,focus:true});
  await act(async()=>card().props.onConfirm());expect(mockEditorProps.initialPlace).toEqual({kind:'search',result:icon});expect(mockPlan.run).not.toHaveBeenCalled();
});

test('the card floats just above the sheet, and over it only when the sheet is fully open',async()=>{
  await render();await tap(spot);
  expect(card().props.bottom).toBe(Math.round(650*0.48)+12);
  await act(async()=>mockSheetProps.onSnapChange('collapsed'));expect(card().props.bottom).toBe(Math.round(650*0.14)+12);
  await act(async()=>mockSheetProps.onSnapChange('expanded'));expect(card().props.bottom).toBe(16);
});

test('leaving a screen and coming back forgets the first tap',async()=>{
  mockNearby.mockResolvedValue(null);await render();
  await tap(spot);await rerender({dayId:'d2'});await rerender({dayId:'d1'});await advance(1000);
  await tap(spotAgain);
  expect(mockNearby).toHaveBeenCalledTimes(2);expect(card()).toBeUndefined();expect(mockMapProps.candidate).toMatchObject({tentative:true});
});

test('a lookup started before leaving the screen and finishing after coming back is dropped',async()=>{
  let release;mockNearby.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve(icon);}));
  await render();await tap(spot);await rerender({dayId:'d2'});await rerender({dayId:'d1'});await act(async()=>release());
  expect(card()).toBeUndefined();expect(mockMapProps.candidate).toBeNull();
});

test('a labelled Google icon next to a waiting dot is its own place, not a coordinate confirmation',async()=>{
  await render({tripId:'gtrip',dayId:'g1'});
  const here={latitude:34.7,longitude:138.8,system:'wgs84'},beside={latitude:34.70003,longitude:138.8,system:'wgs84'};
  await tap(here);expect(waiting()).toBe(true);await advance(1000);
  await tap(beside,{placeId:'ChIJ-beach'});
  expect(mockPlaceFromId).toHaveBeenCalledWith('ChIJ-beach',mockPlan.config);expect(mockReverse).not.toHaveBeenCalled();
  expect(card().props.candidate).toMatchObject({kind:'place',result:gIcon});expect(waiting()).toBe(false);
});
