/* global test,expect */
const {interfaceStyles}=require('../src/interface-styles');
const rule=selector=>{const start=interfaceStyles.indexOf(`${selector}{`);if(start<0)throw new Error(`missing rule ${selector}`);return interfaceStyles.slice(start,interfaceStyles.indexOf('}',start)+1);};
test('a long address cannot widen the add card past its padding',()=>{
  expect(rule('.map-candidate')).toContain('grid-template-columns:minmax(0,1fr)');
  expect(rule('.map-candidate-head')).toContain('min-width:0');expect(rule('.map-candidate-foot')).toContain('min-width:0');
  expect(rule('.map-candidate-text strong')).toMatch(/white-space:nowrap.*text-overflow:ellipsis/);expect(rule('.map-candidate-text small')).toMatch(/white-space:nowrap.*text-overflow:ellipsis/);
});
test('the card and the search box undo the global input rules that offset them (margin-top, min-height, width: 100%)',()=>{
  const select=rule('.map-candidate-target select'),input=rule('.map-search-field input');
  expect(select).toContain('margin:0');expect(select).toContain('width:auto');
  expect(input).toContain('margin:0');expect(input).toContain('min-height:40px');expect(input).toContain('width:auto');expect(input).toContain('appearance:none');
});
test('the removed explanatory hint leaves no styles behind',()=>{expect(interfaceStyles).not.toContain('map-tap-hint');});
