// Read-only checks. A private Site service token is accepted through hidden stdin only.
let input='';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.resume();
process.stdout.write('Ready for deployment verification JSON on stdin (input is hidden).\n');
await new Promise((resolve,reject)=>{
  const handle=chunk=>{
    input+=chunk.toString();
    if(input.includes('\u0003'))reject(new Error('Cancelled'));
    if(input.includes('\n')||input.includes('\r')){process.stdin.off('data',handle);resolve();}
  };
  process.stdin.on('data',handle);
});
if(process.stdin.isTTY)process.stdin.setRawMode(false);
process.stdin.pause();
const {url,token}=JSON.parse(input.trim());input='';
const origin=new URL(url);
if(origin.protocol!=='https:'||!origin.hostname.endsWith('.chatgpt.site'))throw new Error('Expected a verified Sites URL.');
const headers={'OAI-Sites-Authorization':`Bearer ${token}`};
const health=await fetch(new URL('/api/health',origin),{headers,signal:AbortSignal.timeout(20000)});
const result=await health.json().catch(()=>({}));
const unauthenticated=await fetch(new URL('/api/hub',origin),{headers,signal:AbortSignal.timeout(20000)});
const news=await fetch(new URL('/api/news',origin),{headers,signal:AbortSignal.timeout(20000)});
const calendar=await fetch(new URL('/api/calendar',origin),{headers,signal:AbortSignal.timeout(20000)});
console.log(JSON.stringify({databaseHealth:health.status,schema:result.schema,storage:result.storage,userApiWithoutIdentity:unauthenticated.status,newsApiWithoutIdentity:news.status,calendarApiWithoutIdentity:calendar.status}));
if(health.status!==200||result.ok!==true||result.schema!==3||unauthenticated.status!==401||news.status!==401||calendar.status!==401)process.exitCode=1;
