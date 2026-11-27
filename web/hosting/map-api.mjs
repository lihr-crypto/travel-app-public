const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function handleMapApi(request,env) {
  const url=new URL(request.url);
  if(url.pathname==='/api/map-config') {
    if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
    return json({amapWebKey:env.AMAP_WEB_API_KEY||'',amapSecurityConfigured:Boolean(env.AMAP_WEB_SECURITY_CODE),googleWebKey:env.GOOGLE_MAPS_WEB_API_KEY||''});
  }
  if(url.pathname==='/api/health')return json({application:'travel-web',version:'1.0.0'});
  if(!url.pathname.startsWith('/_AMapService/'))return null;
  if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
  if(!env.AMAP_WEB_API_KEY||!env.AMAP_WEB_SECURITY_CODE)return json({error:'MAP_UNAVAILABLE'},503);
  const suffix=url.pathname.slice('/_AMapService'.length);
  if(!/^\/v[345]\/[a-zA-Z0-9_/-]+$/.test(suffix))return json({error:'INVALID_PATH'},400);
  const origin=suffix==='/v4/map/styles'?'https://webapi.amap.com':suffix==='/v3/vectormap'?'https://fmap01.amap.com':'https://restapi.amap.com';
  const target=new URL(suffix,origin);
  for(const[name,value]of url.searchParams)if(name!=='key'&&name!=='jscode')target.searchParams.append(name,value);
  target.searchParams.set('key',env.AMAP_WEB_API_KEY);target.searchParams.set('jscode',env.AMAP_WEB_SECURITY_CODE);
  try{const result=await fetch(target,{signal:AbortSignal.timeout(15000)});return new Response(result.body,{status:result.status,headers:{'Content-Type':result.headers.get('content-type')||'application/json','Cache-Control':'no-store'}});}catch{return json({error:'MAP_NETWORK_UNAVAILABLE'},502);}
}
