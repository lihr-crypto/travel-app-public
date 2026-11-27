/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {act}=React;
const {createRoot}=require('react-dom/client');
let mockPlan;
jest.mock('../src/PlanContext',()=>({usePlan:()=>mockPlan}));
jest.mock('../src/components/PlacePicker',()=>({__esModule:true,default:({onBack})=>require('react').createElement('button',{onClick:onBack},'返回编辑')}));
const ItemEditor=require('../src/components/ItemEditor').default;
const {TripSharing,CloudDataTools}=require('../src/components/CloudTools');
const trip={id:'trip',title:'公开样例',startDate:'2026-10-13'};
const day={id:'day',tripId:'trip',dayIndex:1,date:'2026-10-13'};
const item={id:'item',tripId:'trip',dayId:'day',placeId:'place',title:'参观教堂',type:'sightseeing',timeMode:'exact',startDateTime:null,endDateTime:'2026-10-13T14:30',note:'提前预约'};
let container,root,onClose;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;
 container=document.createElement('div');document.body.append(container);root=createRoot(container);onClose=jest.fn();
 mockPlan={state:{days:[day],places:[{id:'place',name:'示例教堂',address:'示例街129号',provider:'amap',coordinate:{latitude:35.768,longitude:112.621,system:'gcj02'}}],extras:{}},run:jest.fn(async()=>({data:item})),working:false,setDraftOpen:jest.fn(),cloud:{},actor:{email:'example@example.com'},syncStatus:{phase:'saved'},isOwner:()=>true,setNotice:jest.fn()};
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const click=async node=>act(async()=>node.click());
const button=text=>[...container.querySelectorAll('button')].find(x=>x.textContent===text);
async function renderEditor(){await act(async()=>root.render(React.createElement(ItemEditor,{trip,dayId:day.id,item,onClose})));}
test('persistent footer submits its associated editor form with arrival-only time and original details',async()=>{
 await renderEditor();const save=button('保存');
 expect(save.closest('.modal-footer')).not.toBeNull();expect(save.closest('.modal-content')).toBeNull();expect(save.form.id).toBe('item-editor-form');
 await click(save);
 expect(mockPlan.run).toHaveBeenCalledWith('updateItemDetails',expect.objectContaining({title:item.title,type:'sightseeing',note:item.note,startDateTime:null,endDateTime:item.endDateTime}),'行程详情已保存',{itemBaseline:item});
 expect(onClose).toHaveBeenCalledTimes(1);
});
test('place picker round-trip preserves exact times and brings back the persistent save action',async()=>{
 await renderEditor();const time=container.querySelector('[name=endTime]');
 await act(async()=>{time.value='16:45';time.dispatchEvent(new Event('input',{bubbles:true}));});
 await click(container.querySelector('[aria-label=更改地点]'));expect(button('保存')).toBeUndefined();
 await click(button('返回编辑'));expect(container.querySelector('[name=endTime]').value).toBe('16:45');
 await click(button('保存'));expect(mockPlan.run.mock.calls[0][1].endDateTime).toBe('2026-10-13T16:45');
});
test('type and period selections expose their state and save the chosen values after removing a place',async()=>{
 await renderEditor();await click(button('餐饮'));await click(button('时段'));await click(button('下午'));
 expect(button('餐饮').getAttribute('aria-pressed')).toBe('true');expect(button('景点').getAttribute('aria-pressed')).toBe('false');expect(button('下午').getAttribute('aria-pressed')).toBe('true');
 await click(container.querySelector('[aria-label=地点操作]'));await click(button('移除地点'));await click(button('保存'));
 expect(mockPlan.run.mock.calls[0][1]).toMatchObject({type:'food',timeMode:'period',period:'afternoon',startDateTime:null,endDateTime:null,placeTarget:{kind:'none'},note:item.note});
});
test('sharing and sync tools expose no single-trip file input or download action',async()=>{
 await act(async()=>root.render(React.createElement(TripSharing,{trip,onClose})));
 expect(container.textContent).toContain('邀请朋友');expect(container.textContent).not.toMatch(/导入|导出/);expect(container.querySelector('input[type=file]')).toBeNull();
 await act(async()=>root.render(React.createElement(CloudDataTools)));
 expect(container.textContent).toContain('立即同步');expect(container.textContent).not.toMatch(/导入|导出/);expect(container.querySelector('input[type=file]')).toBeNull();
});
test('a tapped map point opens the editor with that Place pending and writes nothing until save',async()=>{
 const coordinate={latitude:30.25,longitude:120.16,system:'gcj02'};
 const enrichment={name:'西湖风景名胜区',address:'浙江省杭州市西湖区',coordinate,provider:'amap',providerPlaceId:null,regionLabel:'杭州市',metadata:null};
 const initialPlace={kind:'map-picker',coordinate,provider:'amap',enrichment};
 await act(async()=>root.render(React.createElement(ItemEditor,{trip,dayId:day.id,initialPlace,onClose})));
 expect(mockPlan.run).not.toHaveBeenCalled();
 expect(container.querySelector('[aria-label=行程名称]').value).toBe('西湖风景名胜区');expect(container.textContent).toContain('浙江省杭州市西湖区');
 await click(button('保存'));
 expect(mockPlan.run).toHaveBeenCalledTimes(1);
 expect(mockPlan.run).toHaveBeenCalledWith('confirmMapPickerPlace',expect.objectContaining({tripId:'trip',dayId:'day',coordinate,provider:'amap',enrichment,draft:expect.objectContaining({title:'西湖风景名胜区',type:'sightseeing'})}),'行程已添加');
 expect(onClose).toHaveBeenCalledTimes(1);
});
test('a coordinate-only tapped point still saves under the generic Place name',async()=>{
 const coordinate={latitude:34.6,longitude:135.5,system:'wgs84'};
 await act(async()=>root.render(React.createElement(ItemEditor,{trip,dayId:null,initialPlace:{kind:'map-picker',coordinate,provider:'google',enrichment:null},onClose})));
 expect(container.textContent).toContain('地图上的选中地点');expect(container.textContent).toContain('未安排行程');
 await click(button('保存'));
 expect(mockPlan.run).toHaveBeenCalledWith('confirmMapPickerPlace',expect.objectContaining({dayId:null,coordinate,provider:'google',enrichment:null,draft:expect.objectContaining({title:'地图上的选中地点'})}),'行程已添加');
});
test('a labelled place picked on the map opens the editor with it pending and saves it as a search result',async()=>{
 const result={name:'千貫門ビーチ',address:'静岡県賀茂郡松崎町',provider:'google',providerPlaceId:'ChIJ-beach',coordinate:{latitude:34.7,longitude:138.8,system:'wgs84'},regionLabel:null,metadata:null};
 await act(async()=>root.render(React.createElement(ItemEditor,{trip,dayId:day.id,initialPlace:{kind:'search',result},onClose})));
 expect(mockPlan.run).not.toHaveBeenCalled();
 expect(container.querySelector('[aria-label=行程名称]').value).toBe('千貫門ビーチ');expect(container.textContent).toContain('静岡県賀茂郡松崎町');
 await click(button('保存'));
 expect(mockPlan.run).toHaveBeenCalledTimes(1);
 expect(mockPlan.run).toHaveBeenCalledWith('confirmPlaceSearchResult',expect.objectContaining({tripId:'trip',dayId:'day',result,draft:expect.objectContaining({title:'千貫門ビーチ',type:'sightseeing'})}),'行程已添加');
 expect(onClose).toHaveBeenCalledTimes(1);
});
