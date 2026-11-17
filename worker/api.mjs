import { initial, validateData } from '../src/lib/store.ts';

const MAX_BYTES = 1024 * 1024;
function json(body, status = 200) {
  return Response.json(body, {status, headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
}
async function readDocument(db, userId) {
  return db.prepare('SELECT revision, data, mutation_id, updated_at FROM hub_documents WHERE user_id = ?').bind(userId).first();
}
function documentResponse(row, userId) {
  return {userId,revision:row?.revision ?? 0,data:row?validateData(JSON.parse(row.data)):initial,updatedAt:row?.updated_at??null};
}
async function boundedBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES + 1024) throw new Error('too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  const chunks=[];let size=0;
  while (true) {
    const {done,value}=await reader.read(); if(done) break;
    size+=value.byteLength;
    if(size>MAX_BYTES+1024){await reader.cancel();throw new Error('too_large');}
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);let position=0;
  for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('invalid_json');}
}

export async function handleApi(request, env) {
  const path=new URL(request.url).pathname;
  // Read-only readiness endpoint. The private Sites gate still protects this path.
  if(path==='/api/health' && request.method==='GET') {
    try {
      if(!env.DB) throw new Error();
      await env.DB.prepare('SELECT revision FROM hub_documents LIMIT 1').first();
      return json({ok:true,storage:'d1',schema:1});
    } catch {return json({ok:false,error:'database_unavailable'},503);}
  }
  if(path!=='/api/hub')return json({error:'not_found'},404);
  // Only dispatch-injected identity is accepted. A private service token supplies no user identity.
  const userId=request.headers.get('oai-authenticated-user-id');
  if(!userId || userId.length>200)return json({error:'authentication_required'},401);
  if(!env.DB)return json({error:'database_unavailable'},503);
  if(!['GET','PUT'].includes(request.method))return json({error:'method_not_allowed'},405);
  try {
    if(request.method==='GET')return json(documentResponse(await readDocument(env.DB,userId),userId));
    const origin=request.headers.get('Origin');
    if(origin!==new URL(request.url).origin || request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'origin_not_allowed'},403);
    if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'json_required'},415);
    let input;
    try {input=await boundedBody(request);}catch(e){return json({error:e.message},e.message==='too_large'?413:400);}
    if(!input || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision<0 || typeof input.mutationId!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.mutationId))return json({error:'invalid_request'},400);
    let data;
    try{data=validateData(input.data);}catch{return json({error:'invalid_data'},400);}
    const serialized=JSON.stringify(data);
    if(new TextEncoder().encode(serialized).byteLength>MAX_BYTES)return json({error:'too_large'},413);
    const before=await readDocument(env.DB,userId);
    if(before?.mutation_id===input.mutationId) {
      if(before.data!==serialized)return json({error:'mutation_reused'},409);
      return json(documentResponse(before,userId));
    }
    if((before?.revision??0)!==input.expectedRevision)return json({error:'revision_conflict',...documentResponse(before,userId)},409);
    const updatedAt=new Date().toISOString();const revision=input.expectedRevision+1;
    const result=input.expectedRevision===0
      ?await env.DB.prepare('INSERT OR IGNORE INTO hub_documents (user_id, revision, data, mutation_id, updated_at) VALUES (?, ?, ?, ?, ?)').bind(userId,revision,serialized,input.mutationId,updatedAt).run()
      :await env.DB.prepare('UPDATE hub_documents SET revision = ?, data = ?, mutation_id = ?, updated_at = ? WHERE user_id = ? AND revision = ?').bind(revision,serialized,input.mutationId,updatedAt,userId,input.expectedRevision).run();
    if(result.meta.changes!==1)return json({error:'revision_conflict',...documentResponse(await readDocument(env.DB,userId),userId)},409);
    return json({userId,revision,data,updatedAt});
  } catch {
    // Do not return SQL, account identifiers, or record contents in an error response.
    return json({error:'database_unavailable'},503);
  }
}
