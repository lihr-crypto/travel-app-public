/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect */
const {styles,cloudStyles}=require('../src/styles');
const {visualRefreshStyles}=require('../src/visual-refresh');
let sheet;
beforeEach(()=>{sheet=document.createElement('style');sheet.textContent=styles+cloudStyles;document.head.append(sheet);});
afterEach(()=>{sheet.remove();document.body.innerHTML='';});

const channels=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

test('surfaces and text come from one neutral ramp and the layer adds no accent hue',()=>{
 document.body.innerHTML='<div class="app-shell"></div>';
 const root=getComputedStyle(document.documentElement);
 for(const token of ['--bg','--surface','--quiet','--tint','--border','--line','--rail','--text','--secondary','--muted']){
  const rgb=channels(root.getPropertyValue(token).trim());
  expect(Math.max(...rgb)-Math.min(...rgb)).toBeLessThanOrEqual(4);
 }
 expect(root.getPropertyValue('--green').trim()).toBe('#086050');
 expect(root.getPropertyValue('--amber').trim()).toBe('');
});

test('buttons stay flat: no shadow of any colour on primary, quiet or cancel buttons',()=>{
 document.body.innerHTML='<button class="button primary">保存</button><button class="button button-ghost">取消</button><button class="button button-soft">更多</button><button class="button button-danger">删除</button><button class="button editor-cancel">取消</button>';
 for(const selector of ['.primary','.button-ghost','.button-soft','.button-danger','.editor-cancel']){
  expect(['','none']).toContain(getComputedStyle(document.querySelector(selector)).boxShadow);
 }
});

test('map overlays are white, not cream',()=>{
 document.body.innerHTML='<div class="map-message"></div><div class="map-hint"></div><div class="map-empty-label"></div><div class="map-trip-preview"></div><div class="footprint-map"><div class="maplibregl-ctrl-attrib"></div></div>';
 for(const selector of ['.map-message','.map-hint','.map-empty-label','.map-trip-preview','.maplibregl-ctrl-attrib']){
  expect(getComputedStyle(document.querySelector(selector)).backgroundColor).toMatch(/^rgba\(255, 255, 255, /);
 }
});

test('the layer paints no pills, tinted glows, rounded face, map filter or heavy weights',()=>{
 expect(visualRefreshStyles).not.toMatch(/999px/);
 expect(visualRefreshStyles).not.toMatch(/ui-rounded/);
 expect(visualRefreshStyles).not.toMatch(/sepia|hue-rotate/);
 expect(visualRefreshStyles).not.toMatch(/--amber|--pine|--mist/);
 expect(visualRefreshStyles).not.toMatch(/#0a5c4a[0-9a-f]{2}\b|#e6a23c/i);
 expect(visualRefreshStyles).not.toMatch(/font-weight:\s*(bold|bolder|6[1-9]\d|[7-9]\d\d)/);
});

test('rules for measured timeline rows and items only paint, they never size',()=>{
 const rules=[...visualRefreshStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
 const measured=rules.filter(([,selector])=>/timeline-(row|item)-/.test(selector)&&!selector.includes('::'));
 expect(measured.length).toBeGreaterThan(0);
 for(const [,selector,body] of measured){
  expect({selector,body}).toEqual({selector,body:expect.not.stringMatching(/(?:^|;)\s*(?:width|height|min-width|min-height|max-width|max-height|padding[\w-]*|margin[\w-]*|font-size|line-height)\s*:/)});
 }
});

test('the rail spine and the selected highlight paint behind the stop nodes',()=>{
 expect(visualRefreshStyles).toMatch(/timeline-row-\]::after\{[^}]*z-index:-1/);
 expect(visualRefreshStyles).toMatch(/aria-selected=true\]::before\{[^}]*z-index:-2/);
});

test('day timeline keeps its measured rows free of extra size while reserving a rail gutter',()=>{
 document.body.innerHTML='<main class="trip-workspace"><div data-testid="day-timeline"><div><div><div data-testid="timeline-row-a"></div></div></div></div></main>';
 const timeline=getComputedStyle(document.querySelector('[data-testid=day-timeline]'));
 expect(timeline.paddingLeft).toBe('28px');
 const row=getComputedStyle(document.querySelector('[data-testid=timeline-row-a]'));
 expect(row.position).toBe('relative');
 expect(row.borderBottomColor).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
});

test('overview day rows give up the old divider for the rail',()=>{
 document.body.innerHTML='<div><button class="day-card"></button><button class="day-card"></button></div>';
 const card=getComputedStyle(document.querySelector('.day-card'));
 expect(card.position).toBe('relative');
 expect(card.paddingLeft).toBe('32px');
});
