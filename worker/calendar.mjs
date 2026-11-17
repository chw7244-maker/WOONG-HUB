import {validateCalendar} from '../src/lib/calendar.ts';
const KEY='notion-calendar-v1',MAX=1024*1024;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
const read=db=>db.prepare('SELECT revision,data,mutation_id,updated_at FROM notion_calendar_snapshots WHERE key=?').bind(KEY).first();
const result=row=>({revision:row?.revision??0,snapshot:row?validateCalendar(JSON.parse(row.data)):null});
async function body(request){if(Number(request.headers.get('Content-Length'))>MAX)throw new Error('too_large');const reader=request.body?.getReader();if(!reader)throw new Error('invalid_json');let size=0,text='';const decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX){await reader.cancel();throw new Error('too_large');}text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}
export async function handleCalendar(request,env){
  const path=new URL(request.url).pathname,service=path==='/api/calendar/sync';
  // /sync is an unattended writer behind Sites' OWNER-PRIVATE service gate.
  // It does not write visitor-owned Hub documents. Never make this Site public.
  if(!service&&!request.headers.get('oai-authenticated-user-id'))return json({error:'authentication_required'},401);
  if(!env.DB)return json({error:'database_unavailable'},503);
  if(!service&&request.method!=='GET')return json({error:'read_only'},405);
  if(service&&!['GET','PUT'].includes(request.method))return json({error:'method_not_allowed'},405);
  try{
    if(request.method==='GET')return json(result(await read(env.DB)));
    if(request.headers.get('Origin')||request.headers.get('Sec-Fetch-Site'))return json({error:'service_update_required'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'json_required'},415);
    let input;try{input=await body(request);}catch(e){return json({error:e.message==='too_large'?'too_large':'invalid_json'},e.message==='too_large'?413:400);}
    if(!input||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||typeof input.mutationId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.mutationId))return json({error:'invalid_request'},400);
    let snapshot;try{snapshot=validateCalendar(input.snapshot);}catch{return json({error:'invalid_calendar'},400);}
    const before=await read(env.DB);
    if(before?.mutation_id===input.mutationId)return json({ok:true,revision:before.revision,count:snapshot.events.length});
    if((before?.revision??0)!==input.expectedRevision)return json({error:'revision_conflict',revision:before?.revision??0},409);
    if(before&&Date.parse(snapshot.syncedAt)<Date.parse(JSON.parse(before.data).syncedAt))return json({error:'older_snapshot'},409);
    const serialized=JSON.stringify(snapshot),updatedAt=new Date().toISOString();let changed;
    if(before)changed=await env.DB.prepare('UPDATE notion_calendar_snapshots SET revision=revision+1,data=?,mutation_id=?,updated_at=? WHERE key=? AND revision=?').bind(serialized,input.mutationId,updatedAt,KEY,input.expectedRevision).run();
    else changed=await env.DB.prepare('INSERT INTO notion_calendar_snapshots(key,revision,data,mutation_id,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(key) DO NOTHING').bind(KEY,serialized,input.mutationId,updatedAt).run();
    if(changed.meta.changes!==1)return json({error:'revision_conflict'},409);
    return json({ok:true,revision:input.expectedRevision+1,count:snapshot.events.length,sourceCount:snapshot.sources.length});
  }catch{return json({error:'calendar_unavailable'},503);}
}
