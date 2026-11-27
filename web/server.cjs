/* global __dirname */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const { Buffer }=require('node:buffer');
const root=path.join(__dirname,'dist');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const openDB=require('./hosting/cloud/local-db.cjs');fs.mkdirSync(path.join(__dirname,'.runtime'),{recursive:true});const db=openDB(path.join(__dirname,'.runtime/cloud.sqlite'),path.join(__dirname,'hosting/drizzle/0000_high_doctor_faustus.sql'));
void Promise.all([import('./hosting/map-api.mjs'),import('./hosting/cloud/service.bundle.mjs')]).then(([{handleMapApi},{handleCloudApi}])=>{
  http.createServer(async(request,response)=>{
    try{
      const url=new URL(request.url,'http://127.0.0.1:8098');
      if(url.pathname==='/api/health'){response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({application:'travel-web',version:'1.0.0',pid:process.pid}));return;}
      let body;if(!['GET','HEAD'].includes(request.method)){const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>2*1024*1024){response.writeHead(413);response.end('File too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
      const input=new Request(url,{method:request.method,headers:request.headers,body});
      const api=await handleCloudApi(input,{...process.env,DB:db,LOCAL_DEV:'1'})||await handleMapApi(input,process.env);
      if(api){response.writeHead(api.status,Object.fromEntries(api.headers));response.end(Buffer.from(await api.arrayBuffer()));return;}
      if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
      const name=decodeURIComponent(url.pathname);let file=path.resolve(root,'.'+name);
      if(name==='/'||name==='/install'||name==='/join'||name.startsWith('/trip/'))file=path.join(root,'index.html');
      if(!file.startsWith(root+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
      response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      if(request.method==='HEAD')response.end();else fs.createReadStream(file).pipe(response);
    }catch{response.writeHead(400);response.end('Invalid request');}
  }).listen(8098,'127.0.0.1',()=>console.log('Travel Web: http://127.0.0.1:8098'));
});
