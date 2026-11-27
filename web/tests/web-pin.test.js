/* global beforeEach,test,expect,jest */
const React=require('react');
jest.mock('react',()=>jest.requireActual('../../node_modules/react'));
const {create,act}=require('react-test-renderer');
const WebPin=require('../src/maps/WebPin').default;
const {getMapPinGeometry}=require('../../src/infrastructure/map/map-pin');
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;});
const render=props=>{let tree;act(()=>{tree=create(React.createElement(WebPin,props));});return tree.root;};
const all=(root,type)=>root.findAllByType(type);

// The teardrop's tip is (12, 32) on its own 24 x 32 grid; after the group's translate and scale it must land on the shared tip point.
test('the frame and the tip match the shared pin geometry, so the saved coordinate stays under the tip',()=>{
  for(const [variant,selected] of [['normal',false],['selected',true],['candidate',true]]){
    const root=render({variant,ordinal:1}),g=getMapPinGeometry(selected),svg=all(root,'svg')[0];
    expect([svg.props.width,svg.props.height]).toEqual([g.frameWidth,g.frameHeight]);
    const match=/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+) ([\d.]+)\)/.exec(all(root,'g')[0].props.transform).slice(1).map(Number);
    const [left,top,sx,sy]=match;
    expect(left+12*sx).toBeCloseTo(g.tipX,5);expect(top+32*sy).toBeCloseTo(g.tipY,5);
  }
});

test('a Day pin shows its number in a white disc and is hidden from assistive tech',()=>{
  const root=render({variant:'normal',ordinal:3}),texts=all(root,'text');
  expect(texts).toHaveLength(1);expect(texts[0].props.children).toBe('3');expect(all(root,'svg')[0].props['aria-hidden']).toBe('true');
  expect(all(root,'circle')[0].props.fill).toBe('#FFFFFF');
});

test('two-digit numbers use a smaller size, and a pin without a number shows a dot instead of text',()=>{
  expect(Number(all(render({variant:'normal',ordinal:12}),'text')[0].props.fontSize)).toBeLessThan(Number(all(render({variant:'normal',ordinal:3}),'text')[0].props.fontSize));
  const dot=render({variant:'normal'});expect(all(dot,'text')).toHaveLength(0);expect(all(dot,'circle')).toHaveLength(2);
});

test('selected pins are deeper than normal ones, and a candidate is a white pin with a plus',()=>{
  const fillOf=root=>all(root,'path')[0].props.fill;
  expect(fillOf(render({variant:'normal',ordinal:1}))).toBe('#086050');expect(fillOf(render({variant:'selected',ordinal:1}))).toBe('#053F35');
  const candidate=render({variant:'candidate'});expect(fillOf(candidate)).toBe('#FFFFFF');expect(all(candidate,'text')).toHaveLength(0);expect(all(candidate,'path')).toHaveLength(2);
});

test('an Overview count is a round badge without a pin body',()=>{
  const normal=render({variant:'cluster',clusterCount:12}),selected=render({variant:'selected',clusterCount:8});
  expect(all(normal,'path')).toHaveLength(0);expect(all(normal,'text')[0].props.children).toBe('12');
  expect([all(normal,'svg')[0].props.width,all(selected,'svg')[0].props.width]).toEqual([48,52]);
});
