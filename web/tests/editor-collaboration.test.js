/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {create,act}=require('react-test-renderer');
let mockPlan;
jest.mock('../src/PlanContext',()=>({usePlan:()=>mockPlan}));
jest.mock('../src/components/Modal',()=>({__esModule:true,default:({children})=>children}));
jest.mock('../src/components/PlacePicker',()=>({__esModule:true,default:()=>null}));
jest.mock('../src/components/CloudTools',()=>({TripSharing:()=>null}));
const ItemEditor=require('../src/components/ItemEditor').default;
const ItemActions=require('../src/components/ItemActions').default;
const {TripManagement}=require('../src/components/TripForms');
let tree,previousFormData;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;previousFormData=global.FormData;global.FormData=class{get(){return null;}};});
afterEach(async()=>{await act(async()=>tree?.unmount());global.FormData=previousFormData;});
test('saving an editor opened before a remote update forwards the opening snapshot rather than the hydrated item',async()=>{
 const trip={id:'trip',title:'公开样例',startDate:'2026-10-13'},day={id:'day',tripId:'trip',dayIndex:1,date:'2026-10-13'};
 const opened={id:'item',tripId:'trip',dayId:'day',placeId:null,title:'原标题',type:'activity',timeMode:'none',startDateTime:null,endDateTime:null,period:null,note:'原备注',payload:null};
 const run=jest.fn(async()=>({data:{id:'item'}}));mockPlan={state:{days:[day],items:[opened],places:[]},run,working:false,setDraftOpen:jest.fn()};
 await act(async()=>{tree=create(React.createElement(ItemEditor,{trip,dayId:day.id,item:opened,onClose:jest.fn()}));});
 await act(async()=>tree.root.findByProps({'aria-label':'行程名称'}).props.onChange({target:{value:'我的新标题'}}));
 const hydrated={...opened,note:'朋友的新备注'};mockPlan={...mockPlan,state:{...mockPlan.state,items:[hydrated]}};
 await act(async()=>tree.update(React.createElement(ItemEditor,{trip,dayId:day.id,item:hydrated,onClose:jest.fn()})));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){},currentTarget:{}}));
 expect(run).toHaveBeenCalledWith('updateItemDetails',expect.objectContaining({itemId:'item',title:'我的新标题',note:'原备注'}),'行程详情已保存',{itemBaseline:opened});
});
test('trip rename forwards its opening title after a remote update',async()=>{
 const trip={id:'trip',title:'原旅行名称',startDate:'2026-10-13',endDate:'2026-10-13'},day={id:'day',tripId:'trip',dayIndex:1,date:'2026-10-13'},run=jest.fn(async()=>({}));
 mockPlan={state:{trips:[trip],days:[day],items:[],places:[],extras:{}},run,working:false,setDraftOpen:jest.fn(),canEdit:()=>true,isOwner:()=>true};
 await act(async()=>{tree=create(React.createElement(TripManagement,{trip,onClose:jest.fn()}));});
 await act(async()=>tree.root.findAllByType('button').find(x=>x.children.some(child=>child?.props?.children==='修改旅行名称')).props.onClick());
 await act(async()=>tree.root.findByProps({'aria-label':'新的旅行名称'}).props.onChange({target:{value:'我的新名称'}}));
 const remote={...trip,title:'朋友的新名称'};mockPlan={...mockPlan,state:{...mockPlan.state,trips:[remote]}};
 await act(async()=>tree.update(React.createElement(TripManagement,{trip:remote,onClose:jest.fn()})));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
 expect(run).toHaveBeenCalledWith('renameTrip',{tripId:'trip',title:'我的新名称'},'旅行名称已修改',expect.objectContaining({baseline:expect.objectContaining({trip:expect.objectContaining({title:'原旅行名称'})})}));
});
test('hidden hotel dates are omitted from edits, so saving a note cannot erase or overwrite them',async()=>{
 const trip={id:'trip',title:'住宿测试',startDate:'2026-10-13'},day={id:'day',tripId:'trip',dayIndex:1,date:'2026-10-13'};
 const item={id:'hotel',tripId:'trip',dayId:'day',type:'hotel',title:'酒店',timeMode:'exact',startDateTime:'2026-10-13T15:00',endDateTime:'2026-10-15T11:00',period:null,note:'原备注',payload:{kind:'hotel'}};
 const run=jest.fn(async()=>({data:item}));mockPlan={state:{days:[day],places:[]},run,working:false,setDraftOpen:jest.fn()};
 await act(async()=>{tree=create(React.createElement(ItemEditor,{trip,dayId:day.id,item,onClose:jest.fn()}));});
 expect(tree.root.findAllByType('input').some(node=>node.props.type==='time'||node.props.type==='date')).toBe(false);
 await act(async()=>tree.root.findByProps({'aria-label':'备注'}).props.onChange({target:{value:'新备注'}}));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){},currentTarget:{}}));
 const input=run.mock.calls[0][1];expect(input.note).toBe('新备注');for(const field of ['timeMode','startDateTime','endDateTime','period'])expect(input).not.toHaveProperty(field);
});
test('removing transport endpoint inputs preserves the original payload when the service number changes',async()=>{
 const trip={id:'trip',title:'交通测试',startDate:'2026-10-13'},day={id:'day',tripId:'trip',dayIndex:1,date:'2026-10-13'};
 const item={id:'flight',tripId:'trip',dayId:'day',type:'transport',title:'航班',timeMode:'none',note:'',payload:{kind:'transport',origin:'南京禄口机场',destination:'成田机场',serviceNumber:'OLD',mode:'flight'}};
 const run=jest.fn(async()=>({data:item}));mockPlan={state:{days:[day],places:[]},run,working:false,setDraftOpen:jest.fn()};
 await act(async()=>{tree=create(React.createElement(ItemEditor,{trip,dayId:day.id,item,onClose:jest.fn()}));});
 const service=tree.root.findAllByType('input').find(x=>x.props.value==='OLD');await act(async()=>service.props.onChange({target:{value:'NEW'}}));
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){},currentTarget:{}}));
 expect(run.mock.calls[0][1].payload).toEqual({...item.payload,serviceNumber:'NEW'});
});
test('the single delete action requires confirmation and uses permanent deletion only for an owner',async()=>{
 const item={id:'item',tripId:'trip',dayId:null,title:'公开测试'},trip={id:'trip'},run=jest.fn(async()=>({})),onClose=jest.fn();
 mockPlan={state:{days:[]},run,working:false,isOwner:()=>true};
 await act(async()=>{tree=create(React.createElement(ItemActions,{trip,item,onClose,onEdit:jest.fn()}));});
 const remove=()=>tree.root.findAllByType('button').filter(x=>x.props.children==='删除行程');expect(remove()).toHaveLength(1);
 await act(async()=>remove()[0].props.onClick());expect(run).not.toHaveBeenCalled();
 await act(async()=>tree.root.findAllByType('button').find(x=>x.props.children==='取消').props.onClick());expect(run).not.toHaveBeenCalled();
 await act(async()=>remove()[0].props.onClick());await act(async()=>remove()[0].props.onClick());
 expect(run).toHaveBeenCalledWith('permanentlyDeleteItem',{itemId:item.id},'行程已删除');expect(onClose).toHaveBeenCalled();
 mockPlan={...mockPlan,isOwner:()=>false};await act(async()=>tree.update(React.createElement(ItemActions,{key:'editor',trip,item,onClose,onEdit:jest.fn()})));expect(remove()).toHaveLength(0);
});
