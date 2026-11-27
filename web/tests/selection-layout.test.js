/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect */
const {styles,cloudStyles}=require('../src/styles');
let sheet;
beforeEach(()=>{sheet=document.createElement('style');sheet.textContent=styles+cloudStyles;document.head.append(sheet);});
afterEach(()=>{sheet.remove();document.body.innerHTML='';});
function metrics(node){const s=getComputedStyle(node);return {left:s.paddingLeft,right:s.paddingRight,inline:s.getPropertyValue('padding-inline'),top:s.paddingTop,bottom:s.paddingBottom,border:s.borderBottomWidth,font:s.fontWeight,transform:s.transform};}
test('date selection changes feedback without changing row content insets',()=>{
 document.body.innerHTML='<div class="day-choices"><button class="active"><strong>第1天</strong><span>10月13日</span></button><button><strong>第2天</strong><span>10月14日</span></button></div>';
 const [a,b]=document.querySelectorAll('button');expect(metrics(a)).toEqual(metrics(b));
 a.className='';b.className='active';expect(metrics(a)).toEqual(metrics(b));
});
test('checked date strategies reserve the same insets as unselected strategies',()=>{
 document.body.innerHTML='<div class="modal"><div class="strategy-options"><label class="radio-choice"><input type="radio" name="strategy" checked>整体平移<small>说明</small></label><label class="radio-choice"><input type="radio" name="strategy">保留日期<small>说明</small></label></div></div>';
 const [a,b]=document.querySelectorAll('label');expect(metrics(a)).toEqual(metrics(b));
});
test('selector labels keep the same typography in selected and unselected states',()=>{
 document.body.innerHTML='<div class="editor-time-modes"><button class="active">时段</button><button>具体时间</button></div>';
 const [a,b]=document.querySelectorAll('button');expect(metrics(a)).toEqual(metrics(b));
});
test('an empty arrival control cannot grow to fill the departure clear action',()=>{
 document.body.innerHTML='<div class="modal item-editor-modal"><section class="editor-section"><div class="time-fields"><div class="time-row"><label>出发时间</label><div><input type="time" value="09:40"></div><button class="text-button">清除</button></div><div class="time-row"><label>到达时间</label><div><input type="time"></div></div></div></section></div>';
 for(const input of document.querySelectorAll('input')){
  expect(getComputedStyle(input.parentElement).flexGrow).toBe('0');
  expect(getComputedStyle(input).height).toBe('44px');
 }
});
test('date highlights have breathing room and no adjoining separator',()=>{
 document.body.innerHTML='<div class="day-choices"><button><strong>第1天</strong><span>10月13日</span></button><button class="active"><strong>第2天</strong><span>10月14日</span></button><button><strong>第3天</strong><span>10月15日</span></button></div>';
 const [before,selected]=document.querySelectorAll('button');
 expect(getComputedStyle(selected).paddingLeft).toBe('16px');
 for(const row of [before,selected]) expect(getComputedStyle(row).borderBottomColor).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
});
