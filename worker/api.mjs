import { initial, validateData } from '../src/lib/store.ts';
import { handleNews } from './news.mjs';
import { handleCalendar } from './calendar.mjs';
import { handleSteam } from './steam.mjs';
import { handleSteamAccounts } from './steam-account.mjs';
import { handleAlbums } from './music.mjs';
import { handleSpotify } from './spotify.mjs';
import { handleSpotifyAuth } from './spotify-auth.mjs';
import { handleSpotifyData } from './spotify-data.mjs';
import { footballSnapshot, handleFootball } from './football.mjs';
import { handleWatchSearch } from './watch.mjs';
import { handleWeather, weatherForecast } from './weather.mjs';
import { defaultWeatherCity } from '../src/lib/weather-cities.ts';

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

export async function handleApi(request, env, ctx) {
  const url=new URL(request.url),path=url.pathname;
  // Read-only readiness endpoint. The private Sites gate still protects this path.
  if(path==='/api/health' && request.method==='GET') {
    try {
      if(!env.DB) throw new Error();
      await env.DB.prepare('SELECT revision FROM hub_documents LIMIT 1').first();
      await env.DB.prepare('SELECT id FROM news_articles LIMIT 1').first();
      await env.DB.prepare('SELECT revision FROM notion_calendar_snapshots LIMIT 1').first();
    } catch {return json({ok:false,error:'database_unavailable'},503);}
    const health={ok:true,storage:'d1',schema:3,news:true,calendar:true};
    if(url.searchParams.get('integrations')!=='1')return json(health);
    const [football,weather]=await Promise.all([
      footballSnapshot(request,ctx,false),weatherForecast(request,ctx,defaultWeatherCity)
    ]);
    return json({...health,integrations:{fixtures:football.fixtures?.items.length??null,standings:football.standings?.items.length??null,results:football.results?.items.length??null,weather:!!weather}});
  }
  if(path.startsWith('/api/news'))return handleNews(request,env,ctx);
  if(path==='/api/calendar'||path==='/api/calendar/sync')return handleCalendar(request,env);
  if(path==='/api/football')return handleFootball(request,ctx);
  if(path==='/api/watch/search')return handleWatchSearch(request,env);
  if(path==='/api/weather')return handleWeather(request,ctx);
  if(path==='/api/games/steam')return handleSteam(request,env,ctx);
  if(path.startsWith('/api/steam/'))return handleSteamAccounts(request,env,ctx);
  if(path==='/api/music/albums')return handleAlbums(request,env,ctx);
  if(path==='/api/music/spotify')return handleSpotify(request,env,ctx);
  if(['/api/spotify/status','/api/spotify/connect','/api/spotify/callback','/api/spotify/disconnect','/api/spotify/sdk-token'].includes(path))return handleSpotifyAuth(request,env,ctx);
  if(path.startsWith('/api/spotify/'))return handleSpotifyData(request,env,ctx);
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
