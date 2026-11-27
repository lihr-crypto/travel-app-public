const fs=require('node:fs'),path=require('node:path');
const root=path.resolve('dist');
const target=process.argv[2];
if(!target)throw new Error('Provide the Site checkout path');
const files={};
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else files['/'+path.relative(root,file).split(path.sep).join('/')]={body:fs.readFileSync(file).toString('base64'),type:types[path.extname(file)]||'application/octet-stream'};}}
walk(root);
const esbuild=require('esbuild');
const api=`import {handleMapApi} from '../hosting/map-api.mjs';\nimport {handleCloudApi} from '../hosting/cloud/service.js';\n`;
const ending=`\nconst ASSETS=${JSON.stringify(files)};\nexport default {async fetch(request,env){const url=new URL(request.url);const cloud=await handleCloudApi(request,env);if(cloud)return cloud;const api=await handleMapApi(request,env);if(api)return api;if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const name=(url.pathname==='/'||url.pathname==='/install'||url.pathname==='/join'||url.pathname.startsWith('/trip/'))?'/index.html':url.pathname;const file=ASSETS[name];if(!file)return new Response('Not found',{status:404});const bytes=Uint8Array.from(atob(file.body),char=>char.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':file.type,'Cache-Control':name==='/sw.js'||name==='/index.html'?'no-store':'public,max-age=86400'}});}};\n`;
fs.mkdirSync('.runtime',{recursive:true});fs.writeFileSync('.runtime/worker-entry.mjs',api+ending);
esbuild.buildSync({entryPoints:['.runtime/worker-entry.mjs'],bundle:true,platform:'neutral',format:'esm',outfile:path.join(target,'worker/index.js'),tsconfig:'../tsconfig.json'});
fs.cpSync('hosting/drizzle',path.join(target,'drizzle'),{recursive:true});
const manifestPath=path.join(target,'.openai/hosting.json');const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.d1='DB';fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${Object.keys(files).length} static assets; runtime keys and user records excluded`);
