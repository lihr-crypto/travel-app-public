/** @jest-environment jsdom */
/* global beforeEach,afterEach,test,expect */
const {styles,cloudStyles}=require('../src/styles');
let sheet;
beforeEach(()=>{sheet=document.createElement('style');sheet.textContent=styles+cloudStyles;document.head.append(sheet);});
afterEach(()=>{sheet.remove();document.body.innerHTML='';});

test('empty place results do not reserve a blank panel before choosing a map point',()=>{
 document.body.innerHTML='<div class="search-results"></div>';
 const results=document.querySelector('.search-results');
 expect(getComputedStyle(results).display).toBe('none');
 results.innerHTML='<button class="search-result">清水寺</button>';
 expect(getComputedStyle(results).display).not.toBe('none');
});

test('dialog headings align with form content in standard and item dialogs',()=>{
 for(const editor of [false,true]){
  document.body.innerHTML=`<section class="modal ${editor?'item-editor-modal':''}"><header class="modal-header"><h2>编辑详情</h2><button class="icon-button">×</button></header><div class="modal-content">内容</div></section>`;
  const header=getComputedStyle(document.querySelector('.modal-header'));
  const content=getComputedStyle(document.querySelector('.modal-content'));
  expect(header.paddingLeft).toBe(content.paddingLeft);
  expect(header.paddingRight).toBe(content.paddingRight);
 }
});

function menuRows(labels){
 document.body.innerHTML=`<div class="modal"><div class="menu-list">${labels.map((label,index)=>`<button class="${index===labels.length-1?'danger':''}">${label}</button>`).join('')}</div></div>`;
 return [...document.querySelectorAll('.menu-list button')];
}
const menus=[['编辑详情','调整行程日期','移到未安排行程','删除行程'],['在这天之前插入一天','在这天之后插入一天','删除这一天'],['修改旅行名称','修改旅行日期','共享旅行','同步与备份','删除整趟旅行']];
test('all action menu rows reserve the same width and minimum vertical space',()=>{
 const px=value=>Number.parseFloat(value)||0;
 for(const labels of menus){
  const sizes=menuRows(labels).map(row=>{
   const s=getComputedStyle(row);
   expect(s.width).toBe('100%');
   return Math.max(px(s.minHeight),px(s.lineHeight)+px(s.paddingTop)+px(s.paddingBottom)+px(s.borderTopWidth)+px(s.borderBottomWidth))+px(s.marginTop)+px(s.marginBottom);
  });
  expect(sizes).toEqual(labels.map(()=>58));
 }
});
test('action menu boundaries use only the preceding row bottom border',()=>{
 for(const labels of menus){
  const rows=menuRows(labels);
  rows.forEach((row,index)=>{
   const s=getComputedStyle(row);
   expect(s.borderTopWidth).toBe('0px');
   if(index<rows.length-1){
    expect(s.borderBottomWidth).toBe('1px');
    expect(s.borderBottomColor).not.toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
   }else expect(s.borderBottomWidth).toBe('0px');
  });
 }
});
