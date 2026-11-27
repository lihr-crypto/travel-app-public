/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {create,act}=require('react-test-renderer');
let mockPlan,mockMapProps,mockSheetProps;
const mockMount=jest.fn(),mockUnmount=jest.fn();
jest.mock('../src/PlanContext',()=>({usePlan:()=>mockPlan}));
jest.mock('../src/components/Modal',()=>({__esModule:true,default:({children})=>children}));
jest.mock('../src/components/CloudTools',()=>({CloudStatus:()=>null}));
jest.mock('../src/components/TripForms',()=>({CreateTrip:()=>null,TripManagement:()=>null}));
jest.mock('../../src/components/trip-bottom-sheet',()=>({TripBottomSheet:props=>{mockSheetProps=props;return props.children;}}));
jest.mock('../src/maps/FootprintMap',()=>({__esModule:true,default:props=>{const React=require('react');mockMapProps=props;React.useEffect(()=>{mockMount();return mockUnmount;},[]);return null;}}));
const Home=require('../src/components/Home').default;
const {HomeTripListSheet}=require('../../src/components/home-trip-list-sheet');
const {HomeTripPreviewCard}=require('../../src/components/home-trip-preview-card');
const {HomeActiveTripCard}=require('../../src/components/home-active-trip-card');
const {CreateTrip,TripManagement}=require('../src/components/TripForms');
let tree,openTrip,openDay,openSettings;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-14T12:00:00Z'));mockMount.mockClear();mockUnmount.mockClear();
 mockPlan={syncStatus:{phase:'saved'},setDraftOpen:jest.fn(),state:{trips:[{id:'china',title:'国内测试',startDate:'2026-10-13',endDate:'2026-10-15',mapRegion:'china_mainland'},{id:'japan',title:'海外测试',startDate:'2026-11-01',endDate:'2026-11-02',mapRegion:'global'}],days:[{id:'c-2',tripId:'china',dayIndex:2,date:'2026-10-14'}],items:[{id:'c',tripId:'china',dayId:'c-2',placeId:'cn',sortOrder:0},{id:'j',tripId:'japan',dayId:null,placeId:'jp',sortOrder:0}],places:[{id:'cn',name:'北京原名称',provider:'amap',coordinate:{latitude:39.9,longitude:116.4,system:'gcj02'}},{id:'jp',name:'東京元名',provider:'google',coordinate:{latitude:35.68,longitude:139.7,system:'wgs84'}}],extras:{}}};
 openTrip=jest.fn();openDay=jest.fn();openSettings=jest.fn();
});
afterEach(async()=>{await act(async()=>tree?.unmount());jest.useRealTimers();});
async function render(){await act(async()=>{tree=create(React.createElement(Home,{openTrip,openDay,openSettings}));});}
test('Home uses the native sheet/list/filter/create components and the same half/expanded geometry',async()=>{
 await render();expect(mockSheetProps).toMatchObject({snap:'half',scrollable:true,testID:'web-home-sheet'});
 expect(tree.root.findByType(HomeTripListSheet).props.trips).toHaveLength(2);expect(tree.root.findByProps({testID:'home-create-trip'})).toBeDefined();expect(tree.root.findByProps({testID:'home-trip-filter'})).toBeDefined();
 expect(tree.root.findAllByType('article')).toHaveLength(0);expect(tree.root.findAllByProps({className:'brand'})).toHaveLength(0);
 await act(async()=>mockSheetProps.onSnapChange('expanded'));expect(tree.root.findByType('main').props.style['--home-sheet-height']).toBe('88%');
});
test('filter changes keep one map instance and update the native list, markers, and direct camera request together',async()=>{
 await render();expect(mockMapProps.markers.map(x=>x.tripId)).toEqual(['china','japan']);expect(mockMount).toHaveBeenCalledTimes(1);const firstKey=mockMapProps.cameraKey;
 await act(async()=>tree.root.findByType(HomeTripListSheet).props.onFilterChange('planned'));
 expect(tree.root.findByType(HomeTripListSheet).props.trips.map(x=>x.tripId)).toEqual(['japan']);expect(mockMapProps.markers.map(x=>x.tripId)).toEqual(['japan']);expect(mockMapProps.cameraKey).not.toBe(firstKey);expect(mockMapProps.cameraRequest.coordinates[0]).toMatchObject({latitude:35.68,longitude:139.7});expect(mockMount).toHaveBeenCalledTimes(1);expect(mockUnmount).not.toHaveBeenCalled();
});
test('year changes keep one map instance, narrow list and recap, key the camera, and reset with the lifecycle filter',async()=>{
 mockPlan.state.trips.push({id:'old',title:'去年',startDate:'2025-05-01',endDate:'2025-05-04',mapRegion:'china_mainland'});
 mockPlan.state.items.push({id:'o',tripId:'old',dayId:null,placeId:'cn2',sortOrder:0});
 mockPlan.state.places.push({id:'cn2',name:'故宫',provider:'amap',coordinate:{latitude:39.916,longitude:116.397,system:'gcj02'}});
 await render();const sheet=()=>tree.root.findByType(HomeTripListSheet).props;
 expect(sheet().availableYears).toEqual([2026,2025]);expect(sheet().year).toBeNull();expect(sheet().recap.tripCount).toBe(3);const firstKey=mockMapProps.cameraKey;
 await act(async()=>sheet().onYearChange(2025));
 expect(sheet().year).toBe(2025);expect(sheet().trips.map(x=>x.tripId)).toEqual(['old']);expect(sheet().recap).toMatchObject({tripCount:1,placeCount:1});
 expect(mockMapProps.markers.map(x=>x.tripId)).toEqual(['old']);expect(mockMapProps.cameraKey).not.toBe(firstKey);expect(mockMapProps.cameraKey).toContain(':2025:');expect(mockMount).toHaveBeenCalledTimes(1);expect(mockUnmount).not.toHaveBeenCalled();
 // 已完成 holds only the 2025 Trip: one year, so the stale choice must not linger as a hidden filter.
 await act(async()=>sheet().onFilterChange('completed'));
 expect(sheet().year).toBeNull();expect(sheet().availableYears).toEqual([2025]);expect(sheet().trips.map(x=>x.tripId)).toEqual(['old']);
 await act(async()=>sheet().onFilterChange('all'));
 expect(sheet().year).toBeNull();expect(sheet().trips).toHaveLength(3);
});
test('the native active card expands before continuing today and map clusters require a selected trip before entry',async()=>{
 await render();expect(tree.root.findByType(HomeActiveTripCard)).toBeDefined();await act(async()=>tree.root.findByProps({testID:'home-active-trip-toggle'}).props.onPress());expect(openDay).not.toHaveBeenCalled();
 await act(async()=>tree.root.findByProps({testID:'home-active-trip-continue'}).props.onPress());expect(openDay).toHaveBeenCalledWith('china','c-2');
 await act(async()=>mockMapProps.onMarker({id:'cluster',variant:'cluster',label:'公开足迹 · 2 次旅行',clusterTripIds:['china','japan']}));expect(openTrip).not.toHaveBeenCalled();
 let preview=tree.root.findByType(HomeTripPreviewCard);expect(preview.props.preview.trips).toHaveLength(2);expect(tree.root.findAllByProps({testID:'home-trip-preview-enter'})).toHaveLength(0);
 await act(async()=>preview.props.onSelectTrip('japan'));await act(async()=>tree.root.findByProps({testID:'home-trip-preview-enter'}).props.onPress());expect(openTrip).toHaveBeenCalledWith('japan');
});
test('Web create and manage remain available without a trip-file import entry',async()=>{
 await render();await act(async()=>tree.root.findByType(HomeTripListSheet).props.onCreateTrip());expect(tree.root.findByType(CreateTrip)).toBeDefined();await act(async()=>tree.root.findByType(CreateTrip).props.onClose());
 expect(tree.root.findByType(HomeTripListSheet).props.onImportTrip).toBeUndefined();
 expect(tree.root.findAllByProps({accessibilityLabel:'导入旅行文件'})).toHaveLength(0);
 await act(async()=>tree.root.findByType(HomeTripListSheet).props.onManageTrip('china'));expect(tree.root.findByType(TripManagement).props.onOpenSettings).toBe(openSettings);expect(openTrip).not.toHaveBeenCalled();
});
test('first-use keeps native create controls and only sync problems add a floating status control',async()=>{
 mockPlan.state={trips:[],days:[],items:[],places:[],extras:{}};await render();expect(tree.root.findByType(HomeTripListSheet).props.isFirstUse).toBe(true);expect(tree.root.findByProps({testID:'home-trip-list-first-use'})).toBeDefined();expect(tree.root.findAllByProps({className:'home-sync-alert'})).toHaveLength(0);
 mockPlan.syncStatus={phase:'offline'};await act(async()=>tree.update(React.createElement(Home,{openTrip,openDay,openSettings})));expect(tree.root.findAllByProps({className:'home-sync-alert'})).toHaveLength(1);
});
