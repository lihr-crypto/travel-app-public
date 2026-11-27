/* global test, expect */
const {metersPerPixel,distanceMeters,poiRadiusMeters,classifySecondTap,SECOND_TAP_WINDOW_MS,SECOND_TAP_MIN_GAP_MS}=require('../src/maps/tap-rules');
const here={latitude:34.68,longitude:135.52};
const pending=(over={})=>({coordinate:here,at:10000,zoom:15,...over});
// 0.00005 degrees of latitude is about 5.6 m, i.e. a few pixels at zoom 15 (about 3.9 m per pixel at this latitude).
const near={latitude:34.68005,longitude:135.52};
test('ground resolution halves with each zoom level and shrinks with latitude',()=>{
  expect(metersPerPixel(0,0)).toBeCloseTo(156543.03392,3);expect(metersPerPixel(0,1)).toBeCloseTo(78271.51696,3);
  expect(metersPerPixel(60,10)).toBeCloseTo(metersPerPixel(0,10)/2,3);
});
test('distance between two points is measured on the ground',()=>{
  expect(distanceMeters({latitude:0,longitude:0},{latitude:1,longitude:0})).toBeCloseTo(111195,-2);expect(distanceMeters(here,here)).toBe(0);
});
test('the labelled-place radius follows the finger size and stays within bounds',()=>{
  expect(poiRadiusMeters(34.68,22)).toBe(15);expect(poiRadiusMeters(34.68,3)).toBe(150);
  const mid=poiRadiusMeters(34.68,16);expect(mid).toBeGreaterThan(15);expect(mid).toBeLessThan(150);
});
test('a deliberate second tap on the same spot confirms',()=>{
  expect(classifySecondTap(pending(),near,10000+SECOND_TAP_MIN_GAP_MS,15)).toBe('confirm');expect(classifySecondTap(pending(),near,10000+2000,15)).toBe('confirm');
});
test('a second tap that comes too soon is ignored, since it may be a double-tap zoom',()=>{
  expect(classifySecondTap(pending(),near,10000+SECOND_TAP_MIN_GAP_MS-1,15)).toBe('ignore');
});
test('a late, distant or after-zoom second tap starts over',()=>{
  expect(classifySecondTap(pending(),near,10000+SECOND_TAP_WINDOW_MS+1,15)).toBe('restart');
  expect(classifySecondTap(pending(),{latitude:34.69,longitude:135.52},10000+1000,15)).toBe('restart');
  expect(classifySecondTap(pending(),near,10000+1000,16)).toBe('restart');
  expect(classifySecondTap(null,near,10000,15)).toBe('restart');
});
