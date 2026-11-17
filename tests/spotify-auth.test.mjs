import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';
import {handleSpotifyAuth,encryptToken,decryptToken,connection,accessToken,apiRequest} from '../worker/spotify-auth.mjs';
import {handleApi} from '../worker/api.mjs';
const owner='alice',scope='user-read-private';
const token=(extra={})=>({access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'Bearer',expires_in:3600,scope,...extra});
async function harness(t,override={}){
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());let now=Date.parse('2026-11-17T12:00:00Z'),calls=[];
  const env={DB,SPOTIFY_CLIENT_ID:'fixture-client-id',SPOTIFY_CLIENT_SECRET:'fixture-client-secret',SPOTIFY_REDIRECT_URI:'https://hub.test/api/spotify/callback',SPOTIFY_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
  const fetcher=async(url,init)=>{calls.push({url,init});if(override.fetcher)return override.fetcher(url,init);if(url==='https://accounts.spotify.com/api/token')return Response.json(token());if(url==='https://api.spotify.com/v1/me')return Response.json({id:'spotify-alice',account_id:'stable-alice',display_name:'Alice'});return Response.json({ok:true});};
  const request=(path,body,user=owner,headers={})=>new Request('https://hub.test/api/spotify/'+path,{method:body===undefined?'GET':'POST',headers:{...(user?{'oai-authenticated-user-id':user}:{}),...(body!==undefined?{Origin:'https://hub.test','Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const run=(path,body,user=owner,headers={})=>handleSpotifyAuth(request(path,body,user,headers),env,null,{fetcher,clock:()=>now});
  async function start(feature='profile',user=owner){const r=await run('connect',{feature},user);assert.equal(r.status,200);const data=await r.json();return {url:new URL(data.authorizationUrl),cookie:r.headers.get('Set-Cookie').split(';')[0]};}
  const finish=(flow,user=owner,params={code:'fixture-code'})=>run('callback?'+new URLSearchParams({state:flow.url.searchParams.get('state'),...params}),undefined,user,{Cookie:flow.cookie});
  return {DB,env,calls,run,request,start,finish,fetcher,clock:()=>now,advance:ms=>{now+=ms;}};
}
test('Spotify 인증은 HUB 신원·동일 출처·JSON·정확한 리다이렉트를 먼저 검사한다',async t=>{
  const h=await harness(t);assert.equal((await h.run('status',undefined,null)).status,401);assert.equal((await h.run('connect',{},owner,{Origin:'https://evil.test'})).status,403);assert.equal((await h.run('connect',{},owner,{'Content-Type':'text/plain'})).status,415);assert.equal((await h.run('connect',{feature:'all'})).status,400);
  h.env.SPOTIFY_REDIRECT_URI='https://evil.test/api/spotify/callback';assert.equal((await h.run('connect',{})).status,503);assert.equal(h.calls.length,0);
  const unauthenticated=await handleApi(h.request('status',undefined,null),h.env);assert.equal(unauthenticated.status,401);
});
test('최소 기본 권한으로 시작하고 암호화한 계정별 토큰만 저장하며 응답·상태에는 비밀을 넣지 않는다',async t=>{
  const h=await harness(t),flow=await h.start();assert.equal(flow.url.origin,'https://accounts.spotify.com');assert.equal(flow.url.searchParams.get('scope'),scope);assert.equal(flow.url.searchParams.has('client_secret'),false);assert.equal(flow.cookie.startsWith('__Host-woong-spotify-oauth='),true);
  const r=await h.finish(flow);assert.equal(r.status,303);assert.match(r.headers.get('Location'),/spotify=connected/);assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
  const row=await connection(h.env,owner);assert.equal(row.account_id,'stable-alice');assert.ok(!row.access_cipher.includes('fixture-access'));assert.equal(await decryptToken(h.env,owner,row.refresh_cipher),'fixture-refresh');assert.equal(await connection(h.env,'bob'),null);
  const status=await (await h.run('status')).json();assert.equal(status.connected,true);assert.equal(status.features.profile,true);assert.equal(status.features.browser,false);assert.ok(!JSON.stringify(status).includes('fixture-'));
  const send=h.calls[0];assert.equal(send.url,'https://accounts.spotify.com/api/token');assert.equal(send.init.redirect,'manual');assert.equal(send.init.headers.Cookie,undefined);assert.equal(new URLSearchParams(send.init.body).get('redirect_uri'),h.env.SPOTIFY_REDIRECT_URI);assert.equal(send.init.headers.Authorization,'Basic '+Buffer.from('fixture-client-id:fixture-client-secret').toString('base64'));
});
test('AES-GCM은 다른 계정·키·변조된 암호문을 거부한다',async t=>{
  const h=await harness(t),cipher=await encryptToken(h.env,owner,'fixture-refresh');assert.equal(await decryptToken(h.env,owner,cipher),'fixture-refresh');await assert.rejects(()=>decryptToken(h.env,'bob',cipher));await assert.rejects(()=>decryptToken({...h.env,SPOTIFY_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,8).toString('base64')},owner,cipher));await assert.rejects(()=>decryptToken(h.env,owner,cipher.slice(0,-4)+'AAAA'));
});
test('인증 state·브라우저 쿠키·HUB 계정·만료·재사용을 검증한다',async t=>{
  const h=await harness(t),flow=await h.start();const state=flow.url.searchParams.get('state');
  for(const [user,cookie] of [['bob',flow.cookie],[owner,''],[owner,'__Host-woong-spotify-oauth='+'x'.repeat(43)]]){const r=await h.run('callback?'+new URLSearchParams({state,code:'code'}),undefined,user,{Cookie:cookie});assert.match(r.headers.get('Location'),/invalid_state/);}
  assert.equal(h.calls.length,0);assert.match((await h.finish(flow)).headers.get('Location'),/connected/);assert.match((await h.finish(flow)).headers.get('Location'),/invalid_state/);
  const expired=await h.start();h.advance(600001);assert.match((await h.finish(expired)).headers.get('Location'),/invalid_state/);
});
test('승인 취소는 기존 연결을 유지하고 기능 권한은 추가 요청한 것만 확장한다',async t=>{
  const h=await harness(t);await h.finish(await h.start());const before=await connection(h.env,owner);const flow=await h.start('library');const scopes=new Set(flow.url.searchParams.get('scope').split(' '));assert.ok(scopes.has('playlist-read-private'));assert.ok(scopes.has('user-read-recently-played'));assert.ok(!scopes.has('streaming'));assert.ok(!scopes.has('playlist-modify-public'));assert.match((await h.finish(flow,owner,{error:'access_denied'})).headers.get('Location'),/denied/);assert.equal((await connection(h.env,owner)).access_cipher,before.access_cipher);
});
test('연결 해제 중 늦게 도착한 OAuth 응답은 연결을 복구하지 않는다',async t=>{
  let release,entered;const waiting=new Promise(resolve=>{entered=resolve;});const h=await harness(t,{fetcher:async url=>{if(url.endsWith('/api/token')){entered();await new Promise(resolve=>{release=resolve;});return Response.json(token());}return Response.json({id:'spotify-alice',account_id:'stable-alice',display_name:'Alice'});}});
  const flow=await h.start(),pending=h.finish(flow);await waiting;assert.equal((await h.run('disconnect',{})).status,200);release();assert.match((await pending).headers.get('Location'),/failed/);assert.equal(await connection(h.env,owner),null);
});
test('만료 토큰은 한 번 갱신하고 새 refresh token이 없으면 이전 값을 보존한다',async t=>{
  const h=await harness(t);await h.finish(await h.start());const before=await connection(h.env,owner);h.advance(3600000);h.calls.length=0;
  const fetcher=async(url,init)=>{assert.equal(url,'https://accounts.spotify.com/api/token');assert.equal(new URLSearchParams(init.body).get('grant_type'),'refresh_token');assert.equal(new URLSearchParams(init.body).get('refresh_token'),'fixture-refresh');return Response.json(token({access_token:'renewed-access',refresh_token:undefined}));};
  const auth=await accessToken(h.env,owner,{fetcher,clock:h.clock});assert.equal(auth.token,'renewed-access');assert.equal(await decryptToken(h.env,owner,auth.row.refresh_cipher),'fixture-refresh');assert.equal(auth.row.version,before.version+1);assert.equal(auth.row.refresh_lock_until,0);
});
test('401은 한 번만 갱신하고 403·429 및 Retry-After를 구분하며 비밀 응답을 노출하지 않는다',async t=>{
  const h=await harness(t);await h.finish(await h.start());let count=0;
  const fetcher=async url=>{if(url.includes('/api/token'))return Response.json(token({access_token:'new-token'}));count++;return count===1?Response.json({error:{message:'secret'}},{status:401}):Response.json({devices:[]});};
  assert.deepEqual(await apiRequest(h.env,owner,'/me/player/devices',{fetcher,clock:h.clock}),{devices:[]});assert.equal(count,2);
  await assert.rejects(()=>apiRequest(h.env,owner,'/me',{fetcher:async()=>Response.json({error:{message:'private'}},{status:403}),clock:h.clock}),e=>e.code==='spotify_forbidden');
  await assert.rejects(()=>apiRequest(h.env,owner,'/me',{fetcher:async()=>Response.json({error:{reason:'QUOTA_EXCEEDED'}},{status:429,headers:{'Retry-After':'120'}}),clock:h.clock}),e=>e.code==='spotify_quota_exceeded'&&e.extra.retryAfter===120);
  await assert.rejects(()=>apiRequest(h.env,owner,'/me',{fetcher:()=>{throw new Error('should not request');},clock:h.clock}),e=>e.status===429);h.advance(120001);
});
test('중복 갱신을 잠그고 인증이 철회되면 다시 연결하도록 처리한다',async t=>{
  const h=await harness(t);await h.finish(await h.start());h.advance(3600000);await h.DB.prepare('UPDATE spotify_connections SET refresh_lock_until = ? WHERE user_id = ?').bind(h.clock()+20000,owner).run();await assert.rejects(()=>accessToken(h.env,owner,{clock:h.clock,fetcher:h.fetcher}),e=>e.code==='spotify_refresh_pending');h.advance(20001);
  await assert.rejects(()=>accessToken(h.env,owner,{clock:h.clock,fetcher:async()=>Response.json({error:'invalid_grant'},{status:400})}),e=>e.code==='spotify_reconnect_required');assert.equal(await connection(h.env,owner),null);
});
test('SDK 단기 토큰은 권한과 동일 출처를 요구하고 연결 해제는 HUB 기록을 보존한다',async t=>{
  const h=await harness(t);await h.finish(await h.start());assert.equal((await h.run('sdk-token',{})).status,403);
  await h.DB.prepare('UPDATE spotify_connections SET scopes = ? WHERE user_id = ?').bind('streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state',owner).run();const r=await h.run('sdk-token',{});assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(Object.keys(await r.json()).sort(),['accessToken','expiresAt']);
  const hub=await handleApi(new Request('https://hub.test/api/hub',{headers:{'oai-authenticated-user-id':owner}}),h.env);const before=await hub.json();assert.equal((await h.run('disconnect',{})).status,200);assert.equal((await h.run('status')).status,200);assert.equal((await connection(h.env,owner)),null);assert.deepEqual((await (await handleApi(new Request('https://hub.test/api/hub',{headers:{'oai-authenticated-user-id':owner}}),h.env)).json()).data,before.data);
});
