/* global __dirname */
const path=require('node:path');const esbuild=require('esbuild');
esbuild.buildSync({entryPoints:[path.join(__dirname,'../hosting/cloud/service.js')],bundle:true,platform:'neutral',format:'esm',outfile:path.join(__dirname,'../hosting/cloud/service.bundle.mjs'),tsconfig:path.join(__dirname,'../../tsconfig.json')});
