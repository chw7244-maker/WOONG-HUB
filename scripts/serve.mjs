import http from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createLocalDatabase,applyLocalMigrations} from './local-db.mjs';
import {handleApi} from '../worker/api.mjs';
const root=path.resolve('out');
await mkdir('.sites-runtime',{recursive:true});
const DB=createLocalDatabase('.sites-runtime/local.sqlite');
await applyLocalMigrations(DB);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const loopback=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);
const server=http.createServer(async(req,res)=>{
  try {
    if(!loopback.has(req.socket.remoteAddress)){res.writeHead(403);res.end();return;}
    if(req.headers.host!=='127.0.0.1:3000'&&req.headers.host!=='localhost:3000'){res.writeHead(403);res.end();return;}
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname.startsWith('/api/')) {
      const headers=new Headers();
      for(const [key,value] of Object.entries(req.headers))if(value&&!key.startsWith('oai-authenticated-user-'))headers.set(key,Array.isArray(value)?value.join(','):value);
      // Injected only by this loopback-only development server; never packaged for deployment.
      headers.set('oai-authenticated-user-id','local-preview-owner');
      const chunks=[];let length=0;
      for await(const chunk of req){length+=chunk.length;if(length>16*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const result=await handleApi(request,{DB},{waitUntil:promise=>{promise.catch(()=>{});}});// Bytes as they are: images (covers, crests) must not go through a text decode.
      let body=Buffer.from(await result.arrayBuffer());
      if(url.pathname==='/api/hub'){const value=JSON.parse(body.toString('utf8'));value.localPreview=true;body=Buffer.from(JSON.stringify(value));}
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(body);return;
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch{res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await readFile(path.join(root,'404.html')).catch(()=>Buffer.from('Not found')));}
});
server.listen(3000,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:3000 · isolated SQLite preview, not the production DB'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>{DB.sqlite.close();process.exit(0);});});
