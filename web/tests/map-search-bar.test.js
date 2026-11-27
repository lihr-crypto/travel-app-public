/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {act}=React;
const {createRoot}=require('react-dom/client');
let mockSearch;
jest.mock('../src/PlanContext',()=>({readableError:error=>`错误：${error.message}`}));
jest.mock('../src/maps/providers',()=>({searchPlaces:(...args)=>mockSearch(...args)}));
const MapSearchBar=require('../src/components/MapSearchBar').default;
const china={id:'t',mapRegion:'china_mainland'},world={id:'g',mapRegion:'global'};
const config={},bias={latitude:34.7,longitude:135.5};
const found=[{name:'灵隐寺',address:'灵隐路',providerPlaceId:'a',coordinate:{latitude:30.24,longitude:120.1,system:'gcj02'}},{name:'龙井村',address:null,regionLabel:'杭州',providerPlaceId:'b',coordinate:{latitude:30.2,longitude:120.1,system:'gcj02'}}];
let container,root,onSelect;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);onSelect=jest.fn();mockSearch=jest.fn(async()=>found);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
const mount=async(props={})=>act(async()=>root.render(React.createElement(MapSearchBar,{trip:china,config,bias,onSelect,...props})));
const input=()=>container.querySelector('input[type=search]');
const type=async text=>act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input(),text);input().dispatchEvent(new Event('input',{bubbles:true}));});
const submit=async()=>act(async()=>{container.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
const button=text=>[...container.querySelectorAll('button')].find(x=>x.textContent===text);

test('a search runs only on submit, with the Trip region, the bias and the trimmed text',async()=>{
  await mount();await type('  灵隐寺 ');expect(mockSearch).not.toHaveBeenCalled();
  await submit();
  expect(mockSearch).toHaveBeenCalledTimes(1);expect(mockSearch).toHaveBeenCalledWith('china_mainland','灵隐寺',config,bias);
  expect([...container.querySelectorAll('.map-search-result')].map(row=>row.textContent)).toEqual(['灵隐寺灵隐路','龙井村杭州']);
});

test('choosing a result proposes it and closes the list without saving anything',async()=>{
  await mount();await type('灵隐');await submit();
  await act(async()=>container.querySelector('.map-search-result').click());
  expect(onSelect).toHaveBeenCalledWith(found[0]);expect(container.querySelector('.map-search-results')).toBeNull();
});

test('search stays disabled for empty text and when the map service is unavailable',async()=>{
  await mount();expect(button('搜索').disabled).toBe(true);await type('x');expect(button('搜索').disabled).toBe(false);
  await mount({config:{unavailable:true}});expect(button('搜索').disabled).toBe(true);
});

test('an empty result and a failure are reported in words',async()=>{
  mockSearch.mockResolvedValueOnce([]);await mount();await type('没有的地方');await submit();
  expect(container.querySelector('.map-search-note').textContent).toBe('没有找到地点，换个关键词试试。');
  mockSearch.mockRejectedValueOnce(new Error('地点搜索暂不可用'));await submit();
  expect(container.querySelector('.map-search-note').textContent).toBe('错误：地点搜索暂不可用');expect(container.querySelectorAll('.map-search-result')).toHaveLength(0);
});

test('a late answer to an older search never replaces a newer one',async()=>{
  let releaseOld;mockSearch.mockImplementationOnce(()=>new Promise(resolve=>{releaseOld=()=>resolve([found[1]]);}));
  await mount();await type('旧');await submit();
  mockSearch.mockResolvedValueOnce([found[0]]);await type('新');await submit();
  expect([...container.querySelectorAll('.map-search-result strong')].map(x=>x.textContent)).toEqual(['灵隐寺']);
  await act(async()=>releaseOld());
  expect([...container.querySelectorAll('.map-search-result strong')].map(x=>x.textContent)).toEqual(['灵隐寺']);
});

test('clearing resets the box and a tap outside closes the list',async()=>{
  await mount();await type('灵隐');await submit();
  await act(async()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));expect(container.querySelector('.map-search-results')).toBeNull();
  await submit();expect(container.querySelector('.map-search-results')).not.toBeNull();
  await act(async()=>container.querySelector('[aria-label=清除搜索]').click());
  expect(input().value).toBe('');expect(container.querySelector('.map-search-results')).toBeNull();expect(container.querySelector('[aria-label=清除搜索]')).toBeNull();
});

test('Google results carry the required attribution and AMap results do not',async()=>{
  await mount({trip:world});await type('osaka');await submit();expect(container.querySelector('.provider-attribution').textContent).toBe('Google Maps');
  expect(mockSearch.mock.calls[0][0]).toBe('global');
  await mount({trip:china});await submit();expect(container.querySelector('.provider-attribution')).toBeNull();
});
