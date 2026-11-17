import test from 'node:test';
import assert from 'node:assert/strict';
import {spotifyResource,validateSpotify,validateListening} from '../src/lib/spotify.ts';
import {emptyMusic,musicStats,lastListenedAt} from '../src/lib/music.ts';
import {initial,validateData} from '../src/lib/store.ts';
import {mergeData} from '../src/lib/merge.ts';
import {handleSpotify} from '../worker/spotify.mjs';
import {handleApi} from '../worker/api.mjs';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';
const id='4aawyAB9vmqN3uQ7FjRGTy',playlistId='37i9dQZF1DXcBWIGoYBM5M';
const metadata=(type='album')=>({...spotifyResource(`spotify:${type}:${type==='album'?id:playlistId}`),title:'Test Spotify title',coverUrl:'https://i.scdn.co/image/cover',checkedAt:'2026-11-17T00:00:00Z'});
const session=(key='session-1')=>({id:key,date:'2026-11-17',track:'좋아하는 곡',equipment:'내 헤드폰',rating:4.5,note:'내 감상',createdAt:'2026-11-17T00:00:00Z'});
const record=(type='album')=>({id:type,kind:'music',title:'내 제목',detail:'기존 감상',category:'스트리밍',status:'컬렉션',url:'',date:'',done:false,createdAt:'2026-11-17T00:00:00Z',music:{...emptyMusic(),type,spotify:metadata(type),...(type==='playlist'?{favorite:true}:{}),listens:[session()]}});
const document=(...entries)=>({...structuredClone(initial),entries});
const request=(url=metadata().url,user='alice',method='GET')=>new Request('https://hub.test/api/music/spotify?'+new URLSearchParams({url}),{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Cookie:'secret'}});

test('Spotify 공유 링크·URI·언어 경로를 정규화하며 다른 호스트와 잘못된 종류를 거부한다',()=>{
  assert.deepEqual(spotifyResource(`https://open.spotify.com/intl-ko/album/${id}?si=tracking`),spotifyResource(`spotify:album:${id}`));
  for(const link of ['https://evil.test/album/'+id,'https://open.spotify.com.evil.test/album/'+id,`https://user@open.spotify.com/album/${id}`,`http://open.spotify.com/album/${id}`,`https://open.spotify.com/track/${id}`,`https://open.spotify.com/embed/album/${id}`,'https://spotify.link/short','spotify:album:bad'])assert.throws(()=>spotifyResource(link));
  assert.throws(()=>spotifyResource(metadata('playlist').url,'album'));assert.throws(()=>validateSpotify({...metadata(),coverUrl:'https://evil.test/private'}));assert.throws(()=>validateSpotify({...metadata(),id:playlistId}));
});
test('oEmbed는 인증 후 고정 Spotify 주소만 호출하고 HTML·개인 신원을 전달하거나 반환하지 않는다',async()=>{
  let calls=0;const fetcher=async(url,init)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://open.spotify.com');assert.equal(u.pathname,'/oembed');assert.equal(u.searchParams.get('url'),metadata().url);assert.equal(init.redirect,'manual');assert.deepEqual(init.headers,{Accept:'application/json'});return Response.json({provider_name:'Spotify',title:'Album',thumbnail_url:metadata().coverUrl,html:'<script>bad</script>'});};
  assert.equal((await handleSpotify(request(undefined,null),{},null,{fetcher})).status,401);assert.equal((await handleSpotify(request(undefined,'alice','POST'),{},null,{fetcher})).status,405);assert.equal((await handleSpotify(request('https://evil.test'),{},null,{fetcher})).status,400);assert.equal(calls,0);
  const result=await handleSpotify(request(),{},null,{fetcher});assert.equal(result.headers.get('Cache-Control'),'private, no-store');const body=await result.json();assert.equal(body.spotify.title,'Album');assert.equal('html' in body.spotify,false);assert.equal(calls,1);
});
test('Spotify 장애·이동·비JSON·과도한 응답을 빈 성공으로 바꾸지 않는다',async()=>{
  for(const response of [new Response('',{status:503}),new Response(null,{status:302,headers:{Location:'https://evil.test'}}),new Response('<html>',{headers:{'Content-Type':'text/html'}}),new Response('x',{headers:{'Content-Type':'application/json','Content-Length':'100001'}}),Response.json({provider_name:'Other',title:'fake'})])assert.equal((await handleSpotify(request(),{},null,{fetcher:async()=>response})).status,502);
  const response=await handleSpotify(request(),{},null,{fetcher:async()=>new Response('',{status:429})});assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'30');
});
test('플레이리스트와 여러 감상·별점 0점을 백업 왕복하며 앨범 통계에서 구분한다',()=>{
  const album=record(),playlist=record('playlist');playlist.music.listens.push({...session('second'),rating:0});const data=document(album,playlist);assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);assert.equal(musicStats(data.entries).count,1);
  for(const listens of [[{...session(),date:'2026-02-30'}],[{...session(),rating:4.3}],[session(),session()],Array.from({length:201},(_,i)=>session(String(i)))])assert.throws(()=>validateListening(listens));
  for(const music of [{...album.music,spotify:metadata('playlist')},{...playlist.music,favorite:'true'},{...playlist.music,type:'track'}])assert.throws(()=>validateData(document({...album,music})));
});
test('서로 다른 기기의 감상 수정은 Spotify 연결과 각 감상을 사본에 보존한다',()=>{
  const base=document(record('playlist')),local=structuredClone(base),remote=structuredClone(base);local.entries[0].music.listens[0].note='local';remote.entries[0].music.listens[0].note='remote';const result=mergeData(base,local,remote);assert.equal(result.conflicts,1);assert.deepEqual(result.data.entries.map(e=>e.music.listens[0].note).sort(),['local','remote']);for(const e of result.data.entries)assert.equal(e.music.spotify.id,playlistId);
});
test('최근 감상일은 직접 입력과 감상 기록 중 최신 날짜이며 수정·삭제 후 다시 계산한다',()=>{
  const music={...emptyMusic(),listenedAt:'2026-10-01',listens:[session(),{...session('older'),date:'2026-11-01'}]};assert.equal(lastListenedAt(music),'2026-11-17');music.listens[0].date='2026-09-01';assert.equal(lastListenedAt(music),'2026-11-01');music.listens=[];assert.equal(lastListenedAt(music),'2026-10-01');assert.equal(lastListenedAt(),'');
});
test('실제 DB에서 Spotify 연결·즐겨찾기·감상 기록을 계정별 저장·수정·삭제한다',async t=>{
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());let revision=0;
  const api=(user,init={})=>handleApi(new Request('https://hub.test/api/hub',{...init,headers:{'oai-authenticated-user-id':user,Origin:'https://hub.test','Content-Type':'application/json'}}),{DB});
  const put=async data=>{const response=await api('alice',{method:'PUT',body:JSON.stringify({data,expectedRevision:revision,mutationId:`spotify-${revision}`})});assert.equal(response.status,200);revision++;return (await response.json()).data;};
  const data=document(record(),record('playlist'));assert.deepEqual(await put(data),data);assert.equal((await (await api('bob')).json()).data.entries.length,0);
  data.entries[1].music.favorite=false;data.entries[0].music.listens[0].note='수정';assert.deepEqual(await put(data),data);data.entries[0].music.listens=[];delete data.entries[0].music.spotify;assert.deepEqual(await put(data),data);assert.deepEqual((await (await api('alice')).json()).data,data);
});
