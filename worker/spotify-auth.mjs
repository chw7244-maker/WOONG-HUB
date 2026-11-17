const API='https://api.spotify.com/v1';
const CALLBACK_PATH='/api/spotify/callback';
const COOKIE='__Host-woong-spotify-oauth';
const FEATURES={
  profile:['user-read-private'],
  playback:['user-read-playback-state','user-modify-playback-state'],
  browser:['streaming','user-read-email','user-read-private','user-read-playback-state','user-modify-playback-state'],
  library:['playlist-read-private','playlist-read-collaborative','user-read-recently-played','user-top-read'],
  manage:['playlist-modify-private','playlist-modify-public'],
};
export class SpotifyError extends Error{
  constructor(code,status=502,extra={}){super(code);this.code=code;this.status=status;this.extra=extra;}
}
export const privateJson=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers}});
export function spotifyErrorResponse(error){const known=error instanceof SpotifyError;const retry=known?error.extra.retryAfter:undefined;return privateJson({error:known?error.code:'spotify_unavailable',...(known?error.extra:{})},known?error.status:502,retry?{'Retry-After':String(retry)}:{});}
const bytes=value=>new TextEncoder().encode(value);
const b64=value=>btoa(String.fromCharCode(...value));
const unb64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const randomSecret=()=>b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value))),v=>v.toString(16).padStart(2,'0')).join('');}
function config(env,request){
  if(!env.SPOTIFY_CLIENT_ID||!env.SPOTIFY_CLIENT_SECRET||!env.SPOTIFY_REDIRECT_URI||!env.SPOTIFY_TOKEN_ENCRYPTION_KEY)throw new SpotifyError('spotify_not_configured',503);
  let redirect;try{redirect=new URL(env.SPOTIFY_REDIRECT_URI);}catch{throw new SpotifyError('spotify_configuration_invalid',503);}
  if(redirect.protocol!=='https:'||redirect.pathname!==CALLBACK_PATH||redirect.search||redirect.hash||redirect.username||redirect.password||redirect.origin!==new URL(request.url).origin)throw new SpotifyError('spotify_redirect_mismatch',503);
  return {clientId:env.SPOTIFY_CLIENT_ID,secret:env.SPOTIFY_CLIENT_SECRET,redirect:redirect.href};
}
async function encryptionKey(env){
  try{const key=unb64(env.SPOTIFY_TOKEN_ENCRYPTION_KEY);if(key.length!==32)throw new Error();return await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt','decrypt']);}catch{throw new SpotifyError('spotify_configuration_invalid',503);}
}
export async function encryptToken(env,userId,value){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(userId)},await encryptionKey(env),bytes(value));return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(cipher));}
export async function decryptToken(env,userId,value){try{const [version,iv,cipher]=value.split('.');if(version!=='v1')throw new Error();return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:bytes(userId)},await encryptionKey(env),unb64(cipher)));}catch{throw new SpotifyError('spotify_reconnect_required',401);}}
export function authenticatedUser(request){const user=request.headers.get('oai-authenticated-user-id');if(!user||user.length>200)throw new SpotifyError('authentication_required',401);return user;}
export function requireSameOrigin(request){if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw new SpotifyError('origin_not_allowed',403);if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw new SpotifyError('json_required',415);}
export async function requestJson(request,max=12000){if(Number(request.headers.get('Content-Length'))>max)throw new SpotifyError('request_too_large',413);const reader=request.body?.getReader();if(!reader)throw new SpotifyError('invalid_request',400);let size=0,value='';const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new SpotifyError('request_too_large',413);}value+=decoder.decode(part.value,{stream:true});}try{const result=JSON.parse(value+decoder.decode());if(!result||typeof result!=='object'||Array.isArray(result))throw new Error();return result;}catch{throw new SpotifyError('invalid_request',400);}}
export async function providerJson(response,max=1500000){
  if(Number(response.headers.get('Content-Length'))>max){await response.body?.cancel();throw new SpotifyError('spotify_invalid_response');}
  if(!response.headers.get('Content-Type')?.includes('json')){await response.body?.cancel();throw new SpotifyError('spotify_invalid_response');}
  const reader=response.body?.getReader();if(!reader)throw new SpotifyError('spotify_invalid_response');let size=0,value='';const decoder=new TextDecoder();while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max){await reader.cancel();throw new SpotifyError('spotify_invalid_response');}value+=decoder.decode(part.value,{stream:true});}try{return JSON.parse(value+decoder.decode());}catch{throw new SpotifyError('spotify_invalid_response');}
}
export async function providerFetch(fetcher,url,init={}){try{return await fetcher(url,{...init,redirect:'manual',signal:AbortSignal.timeout(12000)});}catch{throw new SpotifyError(init.method&&init.method!=='GET'?'spotify_command_outcome_unknown':'spotify_unavailable',502);}}
export async function connection(env,user){return env.DB.prepare('SELECT * FROM spotify_connections WHERE user_id = ?').bind(user).first();}
export function hasScopes(row,scopes){const granted=new Set(row?.scopes?.split(' ')??[]);return scopes.every(s=>granted.has(s));}
export function featureAccess(row){return Object.fromEntries(Object.entries(FEATURES).map(([name,scopes])=>[name,hasScopes(row,scopes)]));}
export function requireScopes(row,scopes){if(!row)throw new SpotifyError('spotify_not_connected',401);if(!hasScopes(row,scopes))throw new SpotifyError('spotify_scope_required',403,{requiredScopes:scopes});}
const cookie=value=>`${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${value?600:0}`;
const browserCookie=request=>request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';
const callbackRedirect=(request,result)=>new Response(null,{status:303,headers:{Location:new URL('/music/spotify/?spotify='+result+'#spotify-account',request.url).href,'Set-Cookie':cookie(''),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
async function tokenRequest(env,parameters,{fetcher,clock}){
  const response=await providerFetch(fetcher,'https://accounts.spotify.com/api/token',{method:'POST',headers:{Authorization:'Basic '+btoa(env.SPOTIFY_CLIENT_ID+':'+env.SPOTIFY_CLIENT_SECRET),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams(parameters).toString()});
  if(!response.ok){const body=await providerJson(response,50000).catch(()=>({}));if(response.status===429)throw new SpotifyError('spotify_rate_limited',429,{retryAfter:retrySeconds(response,clock())});throw new SpotifyError(body.error==='invalid_grant'?'spotify_reconnect_required':body.error==='invalid_client'?'spotify_credentials_invalid':'spotify_token_failed',response.status>=500?502:401);}
  const token=await providerJson(response,50000);
  if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>10000||token.token_type?.toLowerCase()!=='bearer'||!Number.isFinite(token.expires_in)||token.expires_in<1||token.expires_in>86400||token.refresh_token!==undefined&&(typeof token.refresh_token!=='string'||!token.refresh_token||token.refresh_token.length>10000)||token.scope!==undefined&&typeof token.scope!=='string')throw new SpotifyError('spotify_invalid_response');
  return token;
}
export function retrySeconds(response,now=Date.now()){const value=response.headers.get('Retry-After');const seconds=/^\d+$/.test(value??'')?Number(value):Math.ceil((Date.parse(value??'')-now)/1000);return Math.max(1,Math.min(86400,Number.isFinite(seconds)?seconds:30));}
export async function accessToken(env,user,{fetcher=fetch,clock=Date.now,force=false,previousToken}={}){
  let row=await connection(env,user);if(!row)throw new SpotifyError('spotify_not_connected',401);
  if(row.blocked_until>clock())throw new SpotifyError('spotify_rate_limited',429,{retryAfter:Math.ceil((row.blocked_until-clock())/1000)});
  if(previousToken){const current=await decryptToken(env,user,row.access_cipher);if(current!==previousToken)return {row,token:current};}
  if(!force&&row.expires_at>clock()+60000)return {row,token:await decryptToken(env,user,row.access_cipher)};
  const lockUntil=clock()+20000;const lock=await env.DB.prepare('UPDATE spotify_connections SET refresh_lock_until = ? WHERE user_id = ? AND version = ? AND refresh_lock_until <= ?').bind(lockUntil,user,row.version,clock()).run();
  if(lock.meta.changes!==1)throw new SpotifyError('spotify_refresh_pending',409,{retryAfter:2});
  try{
    const refresh=await decryptToken(env,user,row.refresh_cipher);const token=await tokenRequest(env,{grant_type:'refresh_token',refresh_token:refresh},{fetcher,clock});
    const access=await encryptToken(env,user,token.access_token),refreshCipher=token.refresh_token?await encryptToken(env,user,token.refresh_token):row.refresh_cipher;
    const updated=await env.DB.prepare('UPDATE spotify_connections SET access_cipher = ?, refresh_cipher = ?, expires_at = ?, scopes = ?, version = version + 1, refresh_lock_until = 0, updated_at = ? WHERE user_id = ? AND version = ? AND refresh_lock_until = ?').bind(access,refreshCipher,clock()+token.expires_in*1000,token.scope??row.scopes,new Date(clock()).toISOString(),user,row.version,lockUntil).run();
    if(updated.meta.changes!==1)throw new SpotifyError('spotify_connection_changed',409);
    row=await connection(env,user);return {row,token:token.access_token};
  }catch(error){
    if(error.code==='spotify_reconnect_required')await env.DB.prepare('DELETE FROM spotify_connections WHERE user_id = ? AND version = ? AND refresh_lock_until = ?').bind(user,row.version,lockUntil).run();
    throw error;
  }finally{await env.DB.prepare('UPDATE spotify_connections SET refresh_lock_until = 0 WHERE user_id = ? AND version = ? AND refresh_lock_until = ?').bind(user,row.version,lockUntil).run();}
}
export async function apiRequest(env,user,path,{fetcher=fetch,clock=Date.now,method='GET',body,scopes=[]}={}){
  if(!path.startsWith('/')||path.startsWith('//')||/[\r\n]/.test(path))throw new SpotifyError('invalid_spotify_operation',400);
  requireScopes(await connection(env,user),scopes);
  let auth=await accessToken(env,user,{fetcher,clock});
  const send=token=>providerFetch(fetcher,API+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  let response=await send(auth.token);
  if(response.status===401){await response.body?.cancel();auth=await accessToken(env,user,{fetcher,clock,force:true,previousToken:auth.token});response=await send(auth.token);}
  if(response.status===204){await response.body?.cancel();return null;}
  if(!response.ok){
    let provider={};try{provider=await providerJson(response,50000);}catch{}
    if(response.status===429){const retryAfter=retrySeconds(response,clock());await env.DB.prepare('UPDATE spotify_connections SET blocked_until = ? WHERE user_id = ?').bind(clock()+retryAfter*1000,user).run();throw new SpotifyError(provider.error?.reason==='QUOTA_EXCEEDED'?'spotify_quota_exceeded':'spotify_rate_limited',429,{retryAfter});}
    if(response.status===401)throw new SpotifyError('spotify_reconnect_required',401);
    if(response.status===403)throw new SpotifyError('spotify_forbidden',403);
    if(response.status===404)throw new SpotifyError(path.startsWith('/me/player')?'spotify_no_active_device':'spotify_not_found',404);
    throw new SpotifyError('spotify_request_failed',response.status>=500?502:400);
  }
  return providerJson(response);
}
export async function handleSpotifyAuth(request,env,ctx,{fetcher=fetch,clock=Date.now}={}){
  const path=new URL(request.url).pathname;
  try{
    const user=authenticatedUser(request);if(!env.DB)throw new SpotifyError('database_unavailable',503);
    if(path==='/api/spotify/status'&&request.method==='GET'){
      let configured=true,configurationError='';try{config(env,request);await encryptionKey(env);}catch(e){configured=false;configurationError=e.code;}
      const row=await connection(env,user);return privateJson({configured,configurationError,connected:!!row,account:row?{displayName:row.display_name,url:`https://open.spotify.com/user/${encodeURIComponent(row.spotify_user_id)}`} :null,features:featureAccess(row),expiresAt:row?.expires_at??null});
    }
    if(path==='/api/spotify/connect'&&request.method==='POST'){
      requireSameOrigin(request);const cfg=config(env,request);await encryptionKey(env);const input=await requestJson(request);const features=input.features??[input.feature??'profile'];if(!Array.isArray(features)||!features.length||features.length>5||features.some(feature=>typeof feature!=='string'||!Object.hasOwn(FEATURES,feature)))throw new SpotifyError('invalid_feature',400);
      const previous=await connection(env,user),scopes=[...new Set([...FEATURES.profile,...(previous?.scopes.split(' ')??[]),...features.flatMap(feature=>FEATURES[feature])])].sort().join(' '),state=randomSecret(),browser=randomSecret();
      await env.DB.prepare('DELETE FROM spotify_oauth_states WHERE expires_at <= ? OR user_id = ?').bind(clock(),user).run();
      await env.DB.prepare('INSERT INTO spotify_oauth_states (state_hash,user_id,browser_hash,scopes,connection_version,expires_at) VALUES (?,?,?,?,?,?)').bind(await hash(state),user,await hash(browser),scopes,previous?.version??0,clock()+600000).run();
      const url=new URL('https://accounts.spotify.com/authorize');url.search=new URLSearchParams({client_id:cfg.clientId,response_type:'code',redirect_uri:cfg.redirect,state,scope:scopes,show_dialog:'true'}).toString();
      return privateJson({authorizationUrl:url.href},200,{'Set-Cookie':cookie(browser)});
    }
    if(path===CALLBACK_PATH&&request.method==='GET'){
      const cfg=config(env,request),params=new URL(request.url).searchParams,state=params.get('state')??'',browser=browserCookie(request);
      if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(browser))return callbackRedirect(request,'invalid_state');
      const pending=await env.DB.prepare("UPDATE spotify_oauth_states SET browser_hash = 'used:' || browser_hash WHERE state_hash = ? AND user_id = ? AND browser_hash = ? AND expires_at > ? RETURNING scopes,connection_version,state_hash").bind(await hash(state),user,await hash(browser),clock()).first();
      if(!pending)return callbackRedirect(request,'invalid_state');
      if(params.has('error'))return callbackRedirect(request,params.get('error')==='access_denied'?'denied':'failed');
      const code=params.get('code');if(!code||code.length>4000)return callbackRedirect(request,'failed');
      const token=await tokenRequest(env,{grant_type:'authorization_code',code,redirect_uri:cfg.redirect},{fetcher,clock});
      if(!token.refresh_token)throw new SpotifyError('spotify_invalid_response');
      const profileResponse=await providerFetch(fetcher,API+'/me',{headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'}});
      if(!profileResponse.ok){await profileResponse.body?.cancel();throw new SpotifyError(profileResponse.status===403?'spotify_forbidden':'spotify_profile_failed');}
      const profile=await providerJson(profileResponse,100000);if(typeof profile.id!=='string'||!profile.id||profile.id.length>200||profile.account_id!==undefined&&typeof profile.account_id!=='string')throw new SpotifyError('spotify_invalid_response');
      const current=await connection(env,user);if((current?.version??0)!==pending.connection_version)throw new SpotifyError('spotify_connection_changed',409);
      const access=await encryptToken(env,user,token.access_token),refresh=await encryptToken(env,user,token.refresh_token),scope=token.scope??pending.scopes,version=(current?.version??0)+1,updatedAt=new Date(clock()).toISOString();
      const values=[profile.account_id??profile.id,profile.id,typeof profile.display_name==='string'?profile.display_name.slice(0,200):'Spotify 사용자',access,refresh,clock()+token.expires_in*1000,scope,version,updatedAt];
      const result=current?await env.DB.prepare('UPDATE spotify_connections SET account_id=?,spotify_user_id=?,display_name=?,access_cipher=?,refresh_cipher=?,expires_at=?,scopes=?,version=?,refresh_lock_until=0,blocked_until=0,updated_at=? WHERE user_id=? AND version=? AND EXISTS (SELECT 1 FROM spotify_oauth_states WHERE state_hash=? AND user_id=?)').bind(...values,user,current.version,pending.state_hash,user).run():await env.DB.prepare('INSERT OR IGNORE INTO spotify_connections (account_id,spotify_user_id,display_name,access_cipher,refresh_cipher,expires_at,scopes,version,updated_at,user_id) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM spotify_oauth_states WHERE state_hash=? AND user_id=?)').bind(...values,user,pending.state_hash,user).run();
      if(result.meta.changes!==1)throw new SpotifyError('spotify_connection_changed',409);
      await env.DB.prepare('DELETE FROM spotify_oauth_states WHERE state_hash = ? AND user_id = ?').bind(pending.state_hash,user).run();
      return callbackRedirect(request,'connected');
    }
    if(path==='/api/spotify/disconnect'&&request.method==='POST'){
      requireSameOrigin(request);await requestJson(request);await env.DB.batch([env.DB.prepare('DELETE FROM spotify_connections WHERE user_id = ?').bind(user),env.DB.prepare('DELETE FROM spotify_oauth_states WHERE user_id = ?').bind(user),env.DB.prepare('DELETE FROM spotify_mutations WHERE user_id = ?').bind(user)]);return privateJson({disconnected:true},200,{'Set-Cookie':cookie('')});
    }
    if(path==='/api/spotify/sdk-token'&&request.method==='POST'){
      requireSameOrigin(request);await requestJson(request);requireScopes(await connection(env,user),FEATURES.browser);const auth=await accessToken(env,user,{fetcher,clock});requireScopes(auth.row,FEATURES.browser);return privateJson({accessToken:auth.token,expiresAt:auth.row.expires_at});
    }
    return privateJson({error:'method_not_allowed'},405);
  }catch(error){if(path===CALLBACK_PATH&&error.code!=='authentication_required')return callbackRedirect(request,error.code==='spotify_forbidden'?'forbidden':error.code==='spotify_credentials_invalid'?'configuration_error':'failed');return spotifyErrorResponse(error);}
}
