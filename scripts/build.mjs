import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';

const nextBuild=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'],{stdio:'inherit',env:process.env,windowsHide:true});
if(nextBuild.status!==0)process.exit(nextBuild.status??1);
const assets={};
async function collect(dir) {
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())await collect(file);
    else if(entry.isFile()){
      const key='/'+path.relative('out',file).split(path.sep).join('/');
      const bytes=(await readFile(file)).toString('base64');assets[key]=bytes;
      // Next's segment prefetch uses a flat name for exported dynamic page segments.
      const alias=key.replace(/(\/__next\.[^/]+)\/(__PAGE__\.txt)$/,'$1.$2');
      if(alias!==key)assets[alias]=bytes;
    }
    else throw new Error('Static assets must be regular files.');
  }
}
await collect('out');
const bundled=await build({entryPoints:['worker/index.mjs'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'hub-assets',setup(builder){builder.onResolve({filter:/^hub:assets$/},()=>({path:'hub:assets',namespace:'hub'}));builder.onLoad({filter:/.*/,namespace:'hub'},()=>({contents:`export const STATIC_ASSETS=${JSON.stringify(assets)};`,loader:'js'}));}}]});
const source=bundled.outputFiles[0].text;
if(Buffer.byteLength(source)>9*1024*1024)throw new Error('Worker exceeds the embedded asset budget.');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',source);
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log(`Worker built with ${Object.keys(assets).length} assets (${Math.round(Buffer.byteLength(source)/1024)} KB).`);
