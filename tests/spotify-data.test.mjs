import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';
import {encryptToken} from '../worker/spotify-auth.mjs';
import {handleSpotifyData,normalizeEntity,normalizePlayback} from '../worker/spotify-data.mjs';
const id='4aawyAB9vmqN3uQ7FjRGTy',trackId='4iV5W9uYEdYUVa79Axb7Rh';
const track={id:trackId,type:'track',name:'Fixture song',artists:[{name:'Fixture artist'}],duration_ms:123000,explicit:true,album:{name:'Fixture album',images:[{url:'https://i.scdn.co/image/cover'}]}};
const playlist={id,type:'playlist',name:'Fixture playlist',owner:{id:'spotify-alice',display_name:'Alice'},public:false,collaborative:false,items:{total:1},snapshot_id:'snapshot'};
const scopes='user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative user-read-recently-played user-top-read playlist-modify-private playlist-modify-public';
async function harness(t,fetcher){const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());const env={DB,SPOTIFY_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};const access=await encryptToken(env,'alice','fixture-access'),refresh=await encryptToken(env,'alice','fixture-refresh');await DB.prepare('INSERT INTO spotify_connections (user_id,account_id,spotify_user_id,display_name,access_cipher,refresh_cipher,expires_at,scopes,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind('alice','stable-alice','spotify-alice','Alice',access,refresh,Date.now()+3600000,scopes,1,new Date().toISOString()).run();const calls=[];
  const fetch=async(url,init)=>{calls.push({url,init});assert.equal(new URL(url).origin,'https://api.spotify.com');assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer fixture-access');assert.equal(init.headers.Cookie,undefined);return fetcher?fetcher(url,init):Response.json({items:[],next:null,total:0});};
  const run=(path,input,user='alice',headers={})=>handleSpotifyData(new Request('https://hub.test/api/spotify/'+path,{method:input===undefined?'GET':'POST',headers:{...(user?{'oai-authenticated-user-id':user}:{}),Origin:'https://hub.test','Content-Type':'application/json',...headers},...(input!==undefined?{body:JSON.stringify(input)}:{})}),env,null,{fetcher:fetch});
  const command=(input,nonce='request-number-0001')=>run('command',{requestId:nonce,...input});return {DB,env,run,command,calls};
}
test('실제 Spotify 응답에서 삭제된 필드 없이 곡·커버·기기·제한을 안전하게 정리한다',()=>{
  const entity=normalizeEntity({...track,popularity:99,external_urls:{spotify:'https://evil.test'}});assert.equal(entity.url,`https://open.spotify.com/track/${trackId}`);assert.equal(entity.explicit,true);assert.equal(entity.coverUrl,'https://i.scdn.co/image/cover');assert.equal('popularity' in entity,false);assert.equal(normalizeEntity({...track,id:'bad'}),null);
  const value=normalizePlayback({is_playing:true,item:track,progress_ms:1000,shuffle_state:true,repeat_state:'track',device:{id:'device',name:'My phone',type:'Smartphone',volume_percent:0,supports_volume:true},actions:{disallows:{skipping_next:true,unknown:'bad'}}},123);assert.equal(value.device.volume,0);assert.equal(value.disallows.skipping_next,true);assert.equal('unknown' in value.disallows,false);assert.equal(value.item.name,track.name);assert.equal(value.checkedAt,123);assert.equal(normalizePlayback(null).item,null);assert.throws(()=>normalizePlayback({}));
});
test('신원·연결 계정·쓰기 출처와 기능 권한을 서버에서 검사한다',async t=>{
  const h=await harness(t);assert.equal((await h.run('playlists',undefined,null)).status,401);assert.equal((await h.run('playlists',undefined,'bob')).status,401);assert.equal((await h.run('command',{requestId:'request-number-0001',action:'pause'},'alice',{Origin:'https://evil.test'})).status,403);await h.DB.prepare('UPDATE spotify_connections SET scopes = ? WHERE user_id = ?').bind('user-read-private','alice').run();assert.equal((await h.run('playlists')).status,403);assert.equal((await h.command({action:'pause'})).status,403);assert.equal(h.calls.length,0);
});
test('2026 검색은 최대 10개·올바른 type과 페이지를 쓰고 임의 원본·잘못된 검색을 거부한다',async t=>{
  const h=await harness(t,async url=>{const u=new URL(url);assert.equal(u.pathname,'/v1/search');assert.equal(u.searchParams.get('limit'),'10');assert.equal(u.searchParams.get('type'),'track');assert.equal(u.searchParams.get('offset'),'10');return Response.json({tracks:{items:[track],next:'https://api.spotify.com/v1/search?offset=20',total:42}});});
  const r=await h.run('search?q=fixture&type=track&offset=10');assert.equal(r.status,200);const b=await r.json();assert.equal(b.items.length,1);assert.equal(b.nextOffset,20);assert.equal(b.hasMore,true);assert.equal((await h.run('search?q=fixture&type=episode')).status,400);assert.equal((await h.run('search?q=fixture&offset=-1')).status,400);assert.equal((await h.run('https://evil.test')).status,404);
});
test('내 플레이리스트·최근 재생·선호도 순위를 공식 개인 엔드포인트로만 조회한다',async t=>{
  const h=await harness(t,async url=>{const u=new URL(url);assert.ok(!u.pathname.includes('/users/'));if(u.pathname==='/v1/me/playlists')return Response.json({items:[playlist],next:null,total:1});if(u.pathname==='/v1/me/player/recently-played')return Response.json({items:[{track,played_at:'2026-11-17T12:00:00Z'}]});assert.equal(u.pathname,'/v1/me/top/tracks');assert.equal(u.searchParams.get('time_range'),'short_term');return Response.json({items:[track]});});
  const lists=await (await h.run('playlists')).json();assert.equal(lists.items[0].editable,true);assert.equal(lists.items[0].itemCount,1);const recent=await (await h.run('recent')).json();assert.equal(recent.items[0].playedAt,'2026-11-17T12:00:00Z');assert.equal((await h.run('top?range=short_term&type=tracks')).status,200);assert.equal((await h.run('top?range=all')).status,400);
});
test('플레이리스트 항목은 /items와 item 필드를 쓰고 타인 목록은 메타데이터만 반환한다',async t=>{
  let own=true;const h=await harness(t,async url=>{if(new URL(url).pathname.endsWith('/items'))return Response.json({items:[{item:track}],next:null,total:1});return Response.json({...playlist,owner:{id:own?'spotify-alice':'other-user'}});});
  const first=await (await h.run('playlist-items?id='+id)).json();assert.equal(first.items[0].id,trackId);assert.equal(first.itemsAvailable,true);own=false;h.calls.length=0;const other=await (await h.run('playlist-items?id='+id)).json();assert.equal(other.itemsAvailable,false);assert.equal(other.playlist.editable,false);assert.equal(h.calls.length,1);assert.equal((await h.run('playlist-items?id=bad')).status,400);
});
test('재생 제어는 고정 경로와 검증한 값만 보내며 중복 skip은 재실행하지 않는다',async t=>{
  const h=await harness(t,async()=>new Response(null,{status:204}));const r=await h.command({action:'next'});assert.equal(r.status,200);assert.equal(h.calls[0].url,'https://api.spotify.com/v1/me/player/next');assert.equal(h.calls[0].init.method,'POST');assert.equal((await h.command({action:'next'})).status,200);assert.equal(h.calls.length,1);assert.equal((await h.command({action:'previous'})).status,409);
  for(const [i,value] of [{action:'volume',volume:101},{action:'repeat',mode:'random'},{action:'shuffle',enabled:'true'},{action:'play',uri:'https://evil.test'},{action:'fetch',url:'https://evil.test'}].entries())assert.equal((await h.command(value,'request-invalid-'+i)).status,400);assert.equal(h.calls.length,1);
  assert.equal((await h.command({action:'volume',volume:0},'request-volume-0001')).status,200);assert.match(h.calls[1].url,/volume_percent=0/);
});
test('Spotify Connect 전환은 실제 조회한 제어 가능한 기기만 허용하고 자동 재생하지 않는다',async t=>{
  const h=await harness(t,async url=>new URL(url).pathname.endsWith('/devices')?Response.json({devices:[{id:'good-device',is_restricted:false},{id:'restricted-device',is_restricted:true}]}):new Response(null,{status:204}));
  assert.equal((await h.command({action:'transfer',deviceId:'restricted-device'},'request-transfer-1')).status,409);assert.equal((await h.command({action:'transfer',deviceId:'missing-device'},'request-transfer-2')).status,409);assert.equal((await h.command({action:'transfer',deviceId:'good-device'},'request-transfer-3')).status,200);const last=h.calls.at(-1);assert.equal(last.url,'https://api.spotify.com/v1/me/player');assert.deepEqual(JSON.parse(last.init.body),{device_ids:['good-device'],play:false});
});
test('플레이리스트 관리는 새 /me/playlists·/items를 사용하고 소유권과 비공개 생성을 보장한다',async t=>{
  let own=true;const h=await harness(t,async(url,init)=>{const path=new URL(url).pathname;if(path==='/v1/me/playlists'){assert.equal(init.method,'POST');assert.equal(JSON.parse(init.body).public,false);return Response.json(playlist,{status:201});}if(init.method==='GET')return Response.json({...playlist,owner:{id:own?'spotify-alice':'other-user'}});if(init.method==='DELETE'){assert.deepEqual(JSON.parse(init.body),{items:[{uri:'spotify:track:'+trackId}],snapshot_id:'snapshot'});}assert.ok(!path.endsWith('/tracks'));return init.method==='PUT'?new Response(null,{status:204}):Response.json({snapshot_id:'new-snapshot'});});
  assert.equal((await h.command({action:'playlist-create',name:'내 목록'},'request-create-001')).status,200);assert.equal((await h.command({action:'playlist-add',playlistId:id,uri:'spotify:track:'+trackId},'request-add-00001')).status,200);assert.equal((await h.command({action:'playlist-remove',playlistId:id,uri:'spotify:track:'+trackId,snapshotId:'snapshot'},'request-remove-01')).status,200);
  own=false;const before=h.calls.length;assert.equal((await h.command({action:'playlist-rename',playlistId:id,name:'changed'},'request-rename-01')).status,403);assert.equal(h.calls.length,before+1);
});
test('쓰기 결과가 불명확하면 같은 요청을 자동 재전송하지 않는다',async t=>{
  const h=await harness(t,async()=>{throw new Error('network failure');});const first=await h.command({action:'next'});assert.equal(first.status,502);assert.equal((await first.json()).error,'spotify_command_outcome_unknown');assert.equal((await h.command({action:'next'})).status,502);assert.equal(h.calls.length,1);
});

test('로컬 곡 복사는 순서를 유지하며 재시도에서 이미 추가한 곡을 중복 쓰지 않는다',async t=>{
  const uris=['spotify:track:'+trackId,'spotify:track:'+id];
  let current=[],writes=0,isPublic=false;
  const h=await harness(t,async(url,init)=>{
    const endpoint=new URL(url);
    if(endpoint.pathname==='/v1/playlists/'+id)return Response.json({...playlist,public:isPublic});
    assert.equal(endpoint.pathname,'/v1/playlists/'+id+'/items');
    if(init.method==='GET'){
      assert.equal(endpoint.searchParams.get('limit'),'25');
      return Response.json({items:current.map(uri=>({item:{uri}})),next:null,total:current.length});
    }
    assert.equal(init.method,'POST');
    assert.deepEqual(JSON.parse(init.body),{uris});
    current=uris;
    writes++;
    throw new Error('Spotify added the tracks but its response did not arrive');
  });
  const input={action:'playlist-fill',playlistId:id,uris};
  assert.equal((await h.command({...input,uris:[uris[0],'invalid']},'copy-invalid-0001')).status,400);
  assert.equal(h.calls.length,0);
  assert.equal((await h.command(input,'copy-fixture-0001')).status,502);
  assert.deepEqual(await (await h.command(input,'copy-fixture-0002')).json(),{accepted:true,added:2});
  const conflict=await h.command({...input,uris:uris.toReversed()},'copy-fixture-0003');
  assert.equal(conflict.status,409);
  assert.equal((await conflict.json()).error,'spotify_playlist_already_has_tracks');
  isPublic=true;
  assert.equal((await h.command(input,'copy-fixture-0004')).status,403);
  assert.equal(writes,1);
});
