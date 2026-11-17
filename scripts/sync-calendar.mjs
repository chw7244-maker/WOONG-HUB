// Manual agent bridge. Source data and Site service access travel through hidden stdin only.
import {randomUUID} from 'node:crypto';
let input='';if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.resume();console.log('Ready for manual calendar sync JSON on stdin (input is hidden).');
await new Promise((resolve,reject)=>{const handle=chunk=>{input+=chunk.toString();if(input.includes('\u0003'))reject(new Error('Cancelled'));if(input.includes('\n')||input.includes('\r')){process.stdin.off('data',handle);resolve();}};process.stdin.on('data',handle);});
if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();
const {url,token,snapshot}=JSON.parse(input.trim());input='';
const origin=new URL(url);if(origin.protocol!=='https:'||!origin.hostname.endsWith('.chatgpt.site'))throw new Error('Expected the verified private Site URL');
const headers={'OAI-Sites-Authorization':`Bearer ${token}`},endpoint=new URL('/api/calendar/sync',origin);
const before=await fetch(endpoint,{headers,signal:AbortSignal.timeout(20000)});if(!before.ok)throw new Error(`Calendar read failed (${before.status})`);const previous=await before.json();
if(!snapshot){console.log(JSON.stringify({revision:previous.revision,sources:previous.snapshot?.sources??[],rangeStart:previous.snapshot?.rangeStart??null,rangeEnd:previous.snapshot?.rangeEnd??null,syncedAt:previous.snapshot?.syncedAt??null}));process.exit(0);}
const response=await fetch(endpoint,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:previous.revision,mutationId:randomUUID(),snapshot}),signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error(`Calendar write failed (${response.status})`);
const after=await fetch(endpoint,{headers,signal:AbortSignal.timeout(20000)});if(!after.ok)throw new Error('Calendar readback failed');const saved=await after.json();
if(JSON.stringify(saved.snapshot)!==JSON.stringify(snapshot))throw new Error('Calendar readback mismatch');
console.log(JSON.stringify({ok:true,revision:saved.revision,sourceCount:saved.snapshot.sources.length,eventCount:saved.snapshot.events.length,rangeStart:saved.snapshot.rangeStart,rangeEnd:saved.snapshot.rangeEnd}));
