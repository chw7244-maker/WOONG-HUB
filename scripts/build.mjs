import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import path from 'node:path';

const nextBuild=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build'],{stdio:'inherit',env:process.env,windowsHide:true});
if(nextBuild.status!==0)process.exit(nextBuild.status??1);
const assets={};
async function collect(dir) {
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())await collect(file);
    else if(entry.isFile())assets['/'+path.relative('out',file).split(path.sep).join('/')]=(await readFile(file)).toString('base64');
    else throw new Error('Static assets must be regular files.');
  }
}
await collect('out');
const storeSource=await readFile('src/lib/store.ts','utf8');
const shared=transpileModule(storeSource,{compilerOptions:{target:ScriptTarget.ES2022,module:ModuleKind.ES2022}}).outputText.replace(/^export /gm,'');
const api=(await readFile('worker/api.mjs','utf8')).replace(/^import .+;\r?$/gm,'').replace(/^export /gm,'');
const worker=(await readFile('worker/index.mjs','utf8')).replace(/^import .+;\r?$/gm,'');
const source=`// Generated from the current source. No runtime filesystem or credentials.\nconst STATIC_ASSETS=${JSON.stringify(assets)};\n${shared}\n${api}\n${worker}`;
if(Buffer.byteLength(source)>9*1024*1024)throw new Error('Worker exceeds the embedded asset budget.');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',source);
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log(`Worker built with ${Object.keys(assets).length} assets (${Math.round(Buffer.byteLength(source)/1024)} KB).`);
