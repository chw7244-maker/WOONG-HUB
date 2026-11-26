import {SpotifyError,privateJson,spotifyErrorResponse,authenticatedUser,requireSameOrigin,requestJson,connection,apiRequest,requireScopes,hash} from './spotify-auth.mjs';
import {spotifyCover} from '../src/lib/spotify.ts';
import {playlistTrackLimit} from '../src/lib/local-playlist.ts';
const idPattern=/^[A-Za-z0-9]{22}$/;
const trackUriPattern=/^spotify:track:[A-Za-z0-9]{22}$/;
const plain=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const number=(v,max=86400000)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):0;
const array=v=>Array.isArray(v)?v:[];
const ID=value=>{if(typeof value!=='string'||!idPattern.test(value))throw new SpotifyError('invalid_spotify_id',400);return value;};
export function normalizeEntity(row,userId){
  if(!row||!idPattern.test(row.id??'')||!['track','album','artist','playlist','episode'].includes(row.type)||typeof row.name!=='string'||!row.name)return null;
  let coverUrl='';for(const image of [...array(row.images),...array(row.album?.images)])try{coverUrl=spotifyCover(image.url);if(coverUrl)break;}catch{}
  const type=row.type;return {id:row.id,type,name:row.name.slice(0,300),artist:array(row.artists).map(a=>plain(a.name)).filter(Boolean).join(', ').slice(0,500)||plain(row.owner?.display_name),albumName:plain(row.album?.name,300),coverUrl,url:`https://open.spotify.com/${type}/${row.id}`,uri:`spotify:${type}:${row.id}`,durationMs:number(row.duration_ms),explicit:row.explicit===true,playable:row.is_playable!==false&&!row.is_local,...(type==='playlist'?{ownerId:plain(row.owner?.id),editable:!!userId&&row.owner?.id===userId,itemCount:Number.isSafeInteger(row.items?.total??row.tracks?.total)?row.items?.total??row.tracks?.total:null}:{})};
}
export function normalizeDevice(device){return device&&typeof device.id==='string'&&device.id.length<=200?{id:device.id,name:plain(device.name),type:plain(device.type,60),active:device.is_active===true,restricted:device.is_restricted===true,volume:Number.isFinite(device.volume_percent)?number(device.volume_percent,100):null,supportsVolume:device.supports_volume===true}:null;}
export function normalizePlayback(body,now=Date.now()){
  if(body===null)return {item:null,playing:false,progressMs:0,durationMs:0,shuffle:false,repeat:'off',device:null,disallows:{},checkedAt:now};
  if(!body||typeof body.is_playing!=='boolean')throw new SpotifyError('spotify_invalid_response');const item=normalizeEntity(body.item),disallows={};for(const [name,value] of Object.entries(body.actions?.disallows??{}))if(typeof value==='boolean')disallows[name]=value;
  return {item,playing:body.is_playing,progressMs:number(body.progress_ms),durationMs:item?.durationMs??0,shuffle:body.shuffle_state===true,repeat:['off','track','context'].includes(body.repeat_state)?body.repeat_state:'off',device:normalizeDevice(body.device),disallows,checkedAt:now};
}
function page(body,offset,userId){if(!body||!Array.isArray(body.items))throw new SpotifyError('spotify_invalid_response');return {items:body.items.slice(0,20).map(v=>normalizeEntity(v,userId)).filter(Boolean),offset,hasMore:!!body.next,nextOffset:offset+20,total:Number.isSafeInteger(body.total)?body.total:null};}
function pageOffset(params){const raw=params.get('offset')??'0';if(!/^\d{1,6}$/.test(raw)||Number(raw)>100000)throw new SpotifyError('invalid_page',400);return Number(raw);}
async function playlist(env,user,id,options){const data=await apiRequest(env,user,`/playlists/${ID(id)}`,options);if(!data||data.id!==id||data.type!=='playlist')throw new SpotifyError('spotify_invalid_response');return data;}
async function ownPlaylist(env,user,id,options){const row=await connection(env,user),data=await playlist(env,user,id,options);if(data.owner?.id!==row?.spotify_user_id)throw new SpotifyError('spotify_playlist_read_only',403);return {row,data};}
async function recentlyCreatedPlaylist(env,user,owner,id,now){
  // A successful creation response is stored only after our public:false request.
  return env.DB.prepare(`SELECT 1 FROM spotify_mutations
    WHERE user_id = ? AND status = 'succeeded' AND expires_at > ?
    AND json_extract(response, '$.body.playlist.id') = ?
    AND json_extract(response, '$.body.playlist.ownerId') = ? LIMIT 1`)
    .bind(user,now,id,owner).first();
}
function deviceId(value){if(value===undefined)return '';if(typeof value!=='string'||!value||value.length>200||!/^[-_A-Za-z0-9]+$/.test(value))throw new SpotifyError('invalid_device',400);return value;}
function text(value,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new SpotifyError('invalid_playlist_details',400);return value.trim();}
async function executeCommand(input,env,user,options){
  const {action}=input;const opt={...options,scopes:['user-modify-playback-state']};let path,method='PUT',body;
  const params=new URLSearchParams(),device=deviceId(input.deviceId);if(device)params.set('device_id',device);
  if(action==='play'){
    path='/me/player/play';body={};if(input.uri!==undefined){if(typeof input.uri!=='string'||!/^spotify:(track|album|playlist):[a-zA-Z0-9]{22}$/.test(input.uri))throw new SpotifyError('invalid_spotify_uri',400);if(input.uri.startsWith('spotify:track:'))body={uris:[input.uri]};else body={context_uri:input.uri};}
  }else if(action==='pause')path='/me/player/pause';
  else if(action==='next'||action==='previous'){path='/me/player/'+action;method='POST';}
  else if(action==='volume'){if(!Number.isInteger(input.volume)||input.volume<0||input.volume>100)throw new SpotifyError('invalid_volume',400);path='/me/player/volume';params.set('volume_percent',String(input.volume));}
  else if(action==='shuffle'){if(typeof input.enabled!=='boolean')throw new SpotifyError('invalid_shuffle',400);path='/me/player/shuffle';params.set('state',String(input.enabled));}
  else if(action==='repeat'){if(!['off','track','context'].includes(input.mode))throw new SpotifyError('invalid_repeat',400);path='/me/player/repeat';params.set('state',input.mode);}
  else if(action==='transfer'){
    if(!device)throw new SpotifyError('invalid_device',400);const response=await apiRequest(env,user,'/me/player/devices',{...options,scopes:['user-read-playback-state']});const target=array(response?.devices).find(d=>d.id===device);if(!target||target.is_restricted)throw new SpotifyError('spotify_device_unavailable',409);params.delete('device_id');path='/me/player';body={device_ids:[device],play:false};
  }else if(action==='playlist-create'){
    const name=text(input.name,100),description=input.description===undefined?'':String(input.description);if(description.length>300)throw new SpotifyError('invalid_playlist_details',400);
    const result=await apiRequest(env,user,'/me/playlists',{...options,method:'POST',scopes:['playlist-modify-private'],body:{name,description,public:false}});const row=await connection(env,user);const value=normalizeEntity(result,row?.spotify_user_id);if(!value)throw new SpotifyError('spotify_command_outcome_unknown');return {accepted:true,playlist:value};
  }else if(action==='playlist-fill'){
    const {uris}=input;
    if(!Array.isArray(uris)||!uris.length||uris.length>playlistTrackLimit||
      uris.some(uri=>typeof uri!=='string'||!trackUriPattern.test(uri)))throw new SpotifyError('invalid_spotify_uri',400);
    const id=ID(input.playlistId),{data,row}=await ownPlaylist(env,user,id,options);
    const scopes=['playlist-read-private','playlist-modify-private'];
    requireScopes(row,scopes);
    if(data.public!==false&&!(await recentlyCreatedPlaylist(env,user,row.spotify_user_id,id,options.clock()))){
      throw new SpotifyError('spotify_playlist_visibility_required',403);
    }
    const itemsPath=`/playlists/${id}/items`;
    const current=await apiRequest(env,user,`${itemsPath}?limit=${playlistTrackLimit}`,{...options,scopes});
    if(!Array.isArray(current?.items))throw new SpotifyError('spotify_invalid_response');
    if(current.items.length||current.next||current.total>0){
      if(!current.next&&current.items.length===uris.length&&current.items.every((item,index)=>(item?.item??item?.track)?.uri===uris[index])){
        return {accepted:true,added:uris.length};
      }
      throw new SpotifyError('spotify_playlist_already_has_tracks',409);
    }
    if(data.public===true){
      await apiRequest(env,user,`/playlists/${id}`,{...options,method:'PUT',scopes,body:{public:false}});
    }
    await apiRequest(env,user,itemsPath,{...options,method:'POST',scopes,body:{uris}});
    return {accepted:true,added:uris.length};
  }else if(['playlist-rename','playlist-add','playlist-remove'].includes(action)){
    const id=ID(input.playlistId),{data}=await ownPlaylist(env,user,id,options);const scopes=[data.public===false?'playlist-modify-private':'playlist-modify-public'];
    if(action==='playlist-rename'){await apiRequest(env,user,`/playlists/${id}`,{...options,method:'PUT',scopes,body:{name:text(input.name,100)}});return {accepted:true};}
    if(typeof input.uri!=='string'||!/^spotify:track:[A-Za-z0-9]{22}$/.test(input.uri))throw new SpotifyError('invalid_spotify_uri',400);
    const result=await apiRequest(env,user,`/playlists/${id}/items`,{...options,method:action==='playlist-add'?'POST':'DELETE',scopes,body:action==='playlist-add'?{uris:[input.uri]}:{items:[{uri:input.uri}],...(typeof input.snapshotId==='string'&&input.snapshotId.length<=200?{snapshot_id:input.snapshotId}:{})}});return {accepted:true,snapshotId:plain(result?.snapshot_id)};
  }else throw new SpotifyError('invalid_spotify_operation',400);
  await apiRequest(env,user,path+(params.size?'?'+params:''),{...opt,method,...(body!==undefined?{body}:{})});return {accepted:true};
}
export async function handleSpotifyData(request,env,ctx,{fetcher=fetch,clock=Date.now}={}){
  try{
    const user=authenticatedUser(request);if(!env.DB)throw new SpotifyError('database_unavailable',503);const url=new URL(request.url),path=url.pathname,params=url.searchParams,options={fetcher,clock};
    const row=await connection(env,user);if(!row)throw new SpotifyError('spotify_not_connected',401);
    if(path==='/api/spotify/command'&&request.method==='POST'){
      requireSameOrigin(request);const input=await requestJson(request);if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId))throw new SpotifyError('invalid_request_id',400);
      const fingerprint=await hash(JSON.stringify(input));await env.DB.prepare('DELETE FROM spotify_mutations WHERE user_id = ? AND expires_at <= ?').bind(user,clock()).run();
      const claim=await env.DB.prepare('INSERT OR IGNORE INTO spotify_mutations (user_id,request_id,operation_hash,status,response,expires_at) VALUES (?,?,?,?,?,?)').bind(user,input.requestId,fingerprint,'pending','{}',clock()+86400000).run();
      if(claim.meta.changes!==1){const previous=await env.DB.prepare('SELECT * FROM spotify_mutations WHERE user_id = ? AND request_id = ?').bind(user,input.requestId).first();if(previous?.operation_hash!==fingerprint)throw new SpotifyError('spotify_request_reused',409);if(previous.status==='pending')throw new SpotifyError('spotify_request_pending',409);const saved=JSON.parse(previous.response);return privateJson(saved.body,saved.status,saved.body.retryAfter?{'Retry-After':String(saved.body.retryAfter)}:{});}
      let response,status=200;
      try{response=await executeCommand(input,env,user,options);}catch(error){const e=error instanceof SpotifyError?error:new SpotifyError('spotify_command_outcome_unknown');response={error:e.code,...e.extra};status=e.status;}
      await env.DB.prepare('UPDATE spotify_mutations SET status = ?, response = ? WHERE user_id = ? AND request_id = ?').bind(status===200?'succeeded':'failed',JSON.stringify({body:response,status}),user,input.requestId).run();
      return privateJson(response,status,response.retryAfter?{'Retry-After':String(response.retryAfter)}:{});
    }
    if(request.method!=='GET')return privateJson({error:'method_not_allowed'},405);
    if(path==='/api/spotify/player')return privateJson({playback:normalizePlayback(await apiRequest(env,user,'/me/player',{...options,scopes:['user-read-playback-state']}),clock())});
    if(path==='/api/spotify/devices'){const body=await apiRequest(env,user,'/me/player/devices',{...options,scopes:['user-read-playback-state']});if(!Array.isArray(body?.devices))throw new SpotifyError('spotify_invalid_response');return privateJson({devices:body.devices.slice(0,100).map(normalizeDevice).filter(Boolean)});}
    if(path==='/api/spotify/playlists'){const offset=pageOffset(params);return privateJson(page(await apiRequest(env,user,`/me/playlists?limit=20&offset=${offset}`,{...options,scopes:['playlist-read-private','playlist-read-collaborative']}),offset,row.spotify_user_id));}
    if(path==='/api/spotify/recent'){
      const body=await apiRequest(env,user,'/me/player/recently-played?limit=20',{...options,scopes:['user-read-recently-played']});if(!Array.isArray(body?.items))throw new SpotifyError('spotify_invalid_response');return privateJson({items:body.items.slice(0,20).map(r=>({item:normalizeEntity(r.track),playedAt:typeof r.played_at==='string'&&Number.isFinite(Date.parse(r.played_at))?r.played_at:''})).filter(r=>r.item)});
    }
    if(path==='/api/spotify/top'){
      const type=params.get('type')??'tracks',range=params.get('range')??'medium_term';if(!['tracks','artists'].includes(type)||!['short_term','medium_term','long_term'].includes(range))throw new SpotifyError('invalid_top_query',400);
      const body=await apiRequest(env,user,`/me/top/${type}?time_range=${range}&limit=10`,{...options,scopes:['user-top-read']});if(!Array.isArray(body?.items))throw new SpotifyError('spotify_invalid_response');return privateJson({items:body.items.slice(0,10).map(r=>normalizeEntity(r)).filter(Boolean),range,type});
    }
    if(path==='/api/spotify/search'){
      const q=params.get('q')?.trim()??'',type=params.get('type')??'track',offset=pageOffset(params);if(q.length<1||q.length>120||/[\u0000-\u001f\u007f]/.test(q)||!['track','album','artist','playlist'].includes(type))throw new SpotifyError('invalid_search',400);
      const result=await apiRequest(env,user,'/search?'+new URLSearchParams({q,type,limit:'10',offset:String(offset)}),{...options,scopes:['user-read-private']});const body=result?.[type+'s'];if(!Array.isArray(body?.items))throw new SpotifyError('spotify_invalid_response');return privateJson({items:body.items.slice(0,10).map(r=>normalizeEntity(r,row.spotify_user_id)).filter(Boolean),offset,hasMore:!!body.next,nextOffset:offset+10,total:Number.isSafeInteger(body.total)?body.total:null});
    }
    if(path==='/api/spotify/playlist-items'){
      requireScopes(row,['playlist-read-private']);const id=ID(params.get('id')),offset=pageOffset(params),metadata=await playlist(env,user,id,options),mine=metadata.owner?.id===row.spotify_user_id;
      if(!mine&&!metadata.collaborative)return privateJson({playlist:normalizeEntity(metadata,row.spotify_user_id),items:[],itemsAvailable:false,offset,hasMore:false,nextOffset:offset,total:null,snapshotId:plain(metadata.snapshot_id)});
      const body=await apiRequest(env,user,`/playlists/${id}/items?limit=20&offset=${offset}`,options);if(!Array.isArray(body?.items))throw new SpotifyError('spotify_invalid_response');return privateJson({playlist:normalizeEntity(metadata,row.spotify_user_id),items:body.items.slice(0,20).map(r=>normalizeEntity(r.item??r.track)).filter(Boolean),itemsAvailable:true,offset,hasMore:!!body.next,nextOffset:offset+20,total:Number.isSafeInteger(body.total)?body.total:null,snapshotId:plain(metadata.snapshot_id)});
    }
    return privateJson({error:'not_found'},404);
  }catch(error){return spotifyErrorResponse(error);}
}
