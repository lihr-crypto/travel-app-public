/* global beforeEach, afterEach, test, expect, jest */
let script,FakePlace,geocoderOptions,geocode,amapAnswer;
const tapped={latitude:34.6873,longitude:135.5262,system:'wgs84'};
const googleConfig={googleWebKey:'synthetic'},amapConfig={amapWebKey:'synthetic'};
const place=(id,displayName,formattedAddress,lat=34.6873,lng=135.5262)=>({id,displayName,formattedAddress,location:{lat:()=>lat,lng:()=>lng}});
beforeEach(()=>{
  jest.resetModules();
  geocoderOptions=[];geocode=jest.fn();amapAnswer={status:'complete',result:{regeocode:{formattedAddress:'浙江省杭州市西湖区',addressComponent:{city:'杭州市',adcode:'330106'},pois:[]}}};
  FakePlace=class{constructor(options){FakePlace.created.push(options);this.id=options.id;this.requestedLanguage=options.requestedLanguage;}
    async fetchFields(){const answer=FakePlace.details[`${this.id}|${this.requestedLanguage}`];if(answer instanceof Error)throw answer;if(answer)Object.assign(this,answer);}};
  FakePlace.created=[];FakePlace.details={};FakePlace.searchNearby=jest.fn();FakePlace.searchByText=jest.fn();
  global.document={createElement:()=>({}),head:{appendChild:element=>{script=element;}}};
  global.window={AMap:{Geocoder:class{constructor(options){geocoderOptions.push(options);}getAddress(position,callback){geocode(position);callback(amapAnswer.status,amapAnswer.result);}}},google:{maps:{importLibrary:async()=>({Place:FakePlace})}}};
  global.location={origin:'http://localhost'};
});
afterEach(()=>{delete global.document;delete global.window;delete global.location;});
// The provider script is loaded once per module instance, so load it first and then call the helpers directly.
const api=async(region,config)=>{const mod=require('../src/maps/providers');const loading=mod.loadProvider(region,config);script.onload();if(region==='global')window.__travelGoogleReady();await loading;return mod;};
const withLngLat=(lat,lng)=>({getLat:()=>lat,getLng:()=>lng});

test('hasCjk accepts Chinese and Japanese text and rejects Latin-only names',async()=>{
  const {hasCjk}=await api('global',googleConfig);
  expect([hasCjk('西湖'),hasCjk('千貫門ビーチ'),hasCjk('ラーメン'),hasCjk('Senganmon Beach'),hasCjk(''),hasCjk(null)]).toEqual([true,true,true,false,false,false]);
});

test('Google names a tapped point from the nearest place and echoes the tapped coordinate',async()=>{
  const {reversePlace}=await api('global',googleConfig);
  FakePlace.searchNearby.mockResolvedValue({places:[place('ChIJ-osaka','大阪城天守阁','日本大阪府大阪市中央区大阪城')]});
  const result=await reversePlace('global',tapped,googleConfig);
  expect(FakePlace.searchNearby).toHaveBeenCalledTimes(1);
  expect(FakePlace.searchNearby).toHaveBeenCalledWith(expect.objectContaining({locationRestriction:{center:{lat:34.6873,lng:135.5262},radius:30},rankPreference:'DISTANCE',maxResultCount:1,language:'zh-CN'}));
  expect(result).toMatchObject({name:'大阪城天守阁',address:'日本大阪府大阪市中央区大阪城',provider:'google',providerPlaceId:'ChIJ-osaka'});
  // The command compares enrichment.coordinate with the pick by value, so it must be the tapped point and not the place's own location.
  expect(result.coordinate).toBe(tapped);
});

test('an English-only answer is retried in Japanese and the Japanese name wins',async()=>{
  const {reversePlace}=await api('global',googleConfig);
  FakePlace.searchNearby.mockImplementation(async({language})=>({places:[language==='ja'?place('ChIJ-beach','千貫門海岸','〒410-3615 静岡県賀茂郡松崎町雲見'):place('ChIJ-beach','Senganmon Beach','Kumomi, Matsuzaki, Shizuoka 410-3615')]}));
  const result=await reversePlace('global',tapped,googleConfig);
  expect(FakePlace.searchNearby.mock.calls.map(call=>call[0].language)).toEqual(['zh-CN','ja']);
  expect(result).toMatchObject({name:'千貫門海岸',address:'〒410-3615 静岡県賀茂郡松崎町雲見',providerPlaceId:'ChIJ-beach'});
});

test('when the Japanese retry also has no CJK name, or fails, the first answer stands',async()=>{
  const {reversePlace}=await api('global',googleConfig);
  FakePlace.searchNearby.mockImplementation(async({language})=>{if(language==='ja')throw new Error('quota');return{places:[place('ChIJ-x','Senganmon Beach','Shizuoka')]};});
  await expect(reversePlace('global',tapped,googleConfig)).resolves.toMatchObject({name:'Senganmon Beach'});
});

test('Google returns null without a second request when nothing is near the tap',async()=>{
  const {reversePlace}=await api('global',googleConfig);
  FakePlace.searchNearby.mockResolvedValue({places:[]});
  await expect(reversePlace('global',tapped,googleConfig)).resolves.toBeNull();expect(FakePlace.searchNearby).toHaveBeenCalledTimes(1);
});

test('a Google lookup failure rejects so the caller can fall back to coordinates',async()=>{
  const {reversePlace}=await api('global',googleConfig);
  FakePlace.searchNearby.mockRejectedValue(new Error('PERMISSION_DENIED'));
  await expect(reversePlace('global',tapped,googleConfig)).rejects.toThrow('PERMISSION_DENIED');
});

test('AMap keeps naming a tap from its reverse geocoder',async()=>{
  const {reversePlace}=await api('china_mainland',amapConfig);
  const result=await reversePlace('china_mainland',{latitude:30.25,longitude:120.16,system:'gcj02'},amapConfig);
  expect(geocode).toHaveBeenCalledWith([120.16,30.25]);
  expect(result).toMatchObject({name:'浙江省杭州市西湖区',provider:'amap',providerPlaceId:null,regionLabel:'杭州市'});
});

test('a tapped Google icon is fetched by place id, in Chinese first',async()=>{
  const {placeFromId}=await api('global',googleConfig);
  FakePlace.details['ChIJ-icon|zh-CN']=place('ChIJ-icon','松崎町','日本静冈县加茂郡松崎町',34.75,138.78);
  const result=await placeFromId('ChIJ-icon',googleConfig);
  expect(FakePlace.created).toEqual([{id:'ChIJ-icon',requestedLanguage:'zh-CN'}]);
  expect(result).toMatchObject({name:'松崎町',address:'日本静冈县加茂郡松崎町',provider:'google',providerPlaceId:'ChIJ-icon',coordinate:{latitude:34.75,longitude:138.78,system:'wgs84'}});
});

test('a place with only an English Chinese-language answer takes its Japanese name',async()=>{
  const {placeFromId}=await api('global',googleConfig);
  FakePlace.details['ChIJ-b|zh-CN']=place('ChIJ-b','Senganmon Beach','Shizuoka');
  FakePlace.details['ChIJ-b|ja']=place('ChIJ-b','千貫門ビーチ','静岡県賀茂郡松崎町');
  await expect(placeFromId('ChIJ-b',googleConfig)).resolves.toMatchObject({name:'千貫門ビーチ',address:'静岡県賀茂郡松崎町'});
  expect(FakePlace.created.map(options=>options.requestedLanguage)).toEqual(['zh-CN','ja']);
});

test('a place with no CJK name in either language keeps the first answer, and a failed Japanese request does not matter',async()=>{
  const {placeFromId}=await api('global',googleConfig);
  FakePlace.details['ChIJ-c|zh-CN']=place('ChIJ-c','Cafe Aqua','Somewhere');FakePlace.details['ChIJ-c|ja']=new Error('offline');
  await expect(placeFromId('ChIJ-c',googleConfig)).resolves.toMatchObject({name:'Cafe Aqua'});
});

test('the same icon tapped again in a session does not fetch its details twice',async()=>{
  const {placeFromId}=await api('global',googleConfig);
  FakePlace.details['ChIJ-d|zh-CN']=place('ChIJ-d','松崎町','日本');
  await placeFromId('ChIJ-d',googleConfig);await placeFromId('ChIJ-d',googleConfig);
  expect(FakePlace.created).toHaveLength(1);
});

test('a place without a location or name gives no candidate',async()=>{
  const {placeFromId}=await api('global',googleConfig);
  FakePlace.details['ChIJ-e|zh-CN']={displayName:'无坐标'};FakePlace.details['ChIJ-e|ja']={displayName:'無座標'};
  await expect(placeFromId('ChIJ-e',googleConfig)).resolves.toBeNull();
});

test('AMap takes the nearest listed place inside the radius and reads its LngLat',async()=>{
  const {nearbyPlace}=await api('china_mainland',amapConfig);
  amapAnswer.result.regeocode.pois=[
    {id:'far',name:'远处的店',address:'远',distance:'120',location:withLngLat(30.2511,120.1611)},
    {id:'near',name:'灵隐寺',address:'灵隐路',distance:'18',location:withLngLat(30.2501,120.1601)},
    {id:'mid',name:'茶馆',address:'中',distance:'40',location:{lat:30.2505,lng:120.1605}},
  ];
  const result=await nearbyPlace({latitude:30.25,longitude:120.16,system:'gcj02'},60.4,amapConfig);
  expect(geocoderOptions.at(-1)).toEqual({extensions:'all',radius:60});expect(geocode).toHaveBeenCalledWith([120.16,30.25]);
  expect(result).toMatchObject({name:'灵隐寺',address:'灵隐路',provider:'amap',providerPlaceId:'near',coordinate:{latitude:30.2501,longitude:120.1601,system:'gcj02'},regionLabel:'杭州市'});
});

test('AMap gives no place when everything listed is outside the radius or the lookup finds nothing',async()=>{
  const {nearbyPlace}=await api('china_mainland',amapConfig);
  amapAnswer.result.regeocode.pois=[{id:'far',name:'远',distance:'90',location:withLngLat(30.2,120.1)}];
  await expect(nearbyPlace({latitude:30.25,longitude:120.16,system:'gcj02'},50,amapConfig)).resolves.toBeNull();
  amapAnswer.status='no_data';await expect(nearbyPlace({latitude:30.25,longitude:120.16,system:'gcj02'},50,amapConfig)).resolves.toBeNull();
});

test('Google search asks in Chinese first and only repeats in Japanese when a name lacks CJK, merging by place id',async()=>{
  const {searchPlaces}=await api('global',googleConfig);
  FakePlace.searchByText.mockImplementation(async({language})=>({places:language==='zh-CN'?[place('a','Senganmon Beach','Shizuoka'),place('b','松崎町','日本'),place('c','Cafe Aqua','Somewhere')]:[place('a','千貫門ビーチ','静岡県'),place('c','Cafe Aqua','Somewhere')]}));
  const results=await searchPlaces('global','千貫门',googleConfig,{latitude:34.7,longitude:138.8});
  expect(FakePlace.searchByText.mock.calls.map(call=>call[0].language)).toEqual(['zh-CN','ja']);
  expect(results.map(result=>[result.providerPlaceId,result.name])).toEqual([['a','千貫門ビーチ'],['b','松崎町'],['c','Cafe Aqua']]);
  expect(FakePlace.searchByText.mock.calls[0][0]).toMatchObject({textQuery:'千貫门',locationBias:{lat:34.7,lng:138.8},maxResultCount:20});
});

test('Google search needs one request when every name already has CJK characters',async()=>{
  const {searchPlaces}=await api('global',googleConfig);
  FakePlace.searchByText.mockResolvedValue({places:[place('a','松崎町','日本')]});
  await searchPlaces('global','松崎',googleConfig);expect(FakePlace.searchByText).toHaveBeenCalledTimes(1);
});

test('a Japanese query is answered in Japanese first, and a failing second request keeps the first answer',async()=>{
  const {searchPlaces}=await api('global',googleConfig);
  FakePlace.searchByText.mockImplementation(async({language})=>{if(language==='zh-CN')throw new Error('offline');return{places:[place('a','Senganmon Beach','Shizuoka')]};});
  const results=await searchPlaces('global','ラーメン',googleConfig);
  expect(FakePlace.searchByText.mock.calls.map(call=>call[0].language)).toEqual(['ja','zh-CN']);expect(results[0].name).toBe('Senganmon Beach');
});
