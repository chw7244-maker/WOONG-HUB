import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyMusic,musicDate,musicStats,validateAlbum} from '../src/lib/music.ts';
import {initial,validateData} from '../src/lib/store.ts';
import {mergeData} from '../src/lib/merge.ts';
import {albumQuery,albumResults,handleAlbums} from '../worker/music.mjs';
import {handleApi} from '../worker/api.mjs';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';
import {SyncClient} from '../src/lib/sync-client.ts';
const id='48117b90-a16e-34ca-a514-19c702df1158';
const row={id,title:'Discovery','artist-credit':[{name:'Daft Punk'}],'first-release-date':'2001-02-26','primary-type':'Album',tags:[{name:'not imported'}]};
const source={'release-groups':[row]};
const catalog=()=>albumResults(source,new Date('2026-11-17T00:00:00Z'))[0];
const record=(id,music)=>({id,kind:'music',title:id,detail:'내가 적은 감상',category:'FLAC',status:'컬렉션',url:'',date:'',done:false,createdAt:'2026-11-17T00:00:00Z',...(music?{music}:{})});
const details=()=>({...emptyMusic(),artist:'Daft Punk',genre:'일렉트로닉',releaseDate:'2001',rating:4.5,listenedAt:'2026-11-17',favoriteTrack:'Something About Us',tags:['출퇴근','반복감상'],catalog:catalog()});
const document=(...entries)=>({...structuredClone(initial),entries});
const request=(album='Discovery',artist='Daft Punk',user='owner',method='GET')=>new Request('https://hub.test/api/music/albums?'+new URLSearchParams({album,artist}),{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Cookie:'private-session=not-forwarded'}});
const options={throttle:()=>true};

test('검색어의 연산자를 문자로 처리하고 앨범 ID·원본·표지 주소를 검증한다',()=>{
  assert.equal(albumQuery('X','Ed Sheeran').album,'X');assert.throws(()=>albumQuery('X',''));assert.throws(()=>albumQuery('a'.repeat(121)));assert.throws(()=>albumQuery('album\nname'));
  const query=albumQuery('Discovery" OR artist:*','AC/DC').query;assert.ok(query.includes('\\"'));assert.ok(query.includes('artist\\:\\*'));assert.ok(query.includes('AC\\/DC'));
  const a=catalog();assert.equal(a.coverUrl,`https://coverartarchive.org/release-group/${id}/front-250`);assert.equal(a.sourceUrl,`https://musicbrainz.org/release-group/${id}`);
  for(const data of [{...a,id:'bad'},{...a,sourceUrl:'https://evil.test/'},{...a,coverUrl:'javascript:alert(1)'},{...a,firstReleaseDate:'2026-02-30'}])assert.throws(()=>validateAlbum(data));
});

test('앨범 검색은 협업 아티스트·부분 발매일·중복을 정리하고 핵심 정보만 반환한다',()=>{
  const collaboration={...row,'artist-credit':[{name:'A',joinphrase:' feat. '},{name:'B'}],'first-release-date':'2001-02'};
  const result=albumResults({'release-groups':[collaboration,collaboration]},new Date('2026-11-17T00:00:00Z'));
  assert.equal(result.length,1);assert.equal(result[0].artist,'A feat. B');assert.equal(result[0].firstReleaseDate,'2001-02');assert.equal(Object.hasOwn(result[0],'tags'),false);
  assert.deepEqual(albumResults({'release-groups':[]}),[]);assert.throws(()=>albumResults({}));assert.throws(()=>albumResults({'release-groups':[{id:'bad'}]}));
});

test('기존 앨범과 새 감상 기록은 백업 왕복에서 보존하고 잘못된 상세는 거부한다',()=>{
  const data=document(record('legacy'),record('new',details()));assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);assert.equal(Object.hasOwn(validateData(data).entries[0],'music'),false);
  assert.equal(musicDate('2001',true),true);assert.equal(musicDate('2001-02',true),true);assert.equal(musicDate('2026-02-30'),false);
  for(const music of [{...details(),rating:4.3},{...details(),rating:6},{...details(),releaseDate:'2001-13'},{...details(),listenedAt:'2026-02-30'},{...details(),favoriteTrack:'a'.repeat(201)},{...details(),tags:Array(9).fill('tag')}])assert.throws(()=>validateData(document(record('bad',music))));
  assert.throws(()=>validateData(document({...record('bad',details()),kind:'note'})));
});

test('평균 별점은 미평가와 0점을 구분하고 음악 기록만 계산한다',()=>{
  const data=[record('legacy'),record('zero',{...emptyMusic(),rating:0}),{...record('wish',{...emptyMusic(),rating:4.5}),status:'위시리스트'},{...record('ignore',details()),kind:'note'}];
  assert.deepEqual(musicStats(data),{count:3,collection:2,wishlist:1,rated:2,average:2.3});assert.equal(musicStats([record('old')]).average,null);
});

test('앨범 검색은 인증을 우선 검사하고 고정 원본·식별 User-Agent·공개 캐시만 사용한다',async()=>{
  const stored=new Map();let calls=0;const cache={match:async key=>stored.get(key.url)?.clone(),put:async(key,response)=>{assert.equal(key.headers.has('Cookie'),false);assert.ok(!key.url.includes('Discovery'));stored.set(key.url,response.clone());}};
  const fetcher=async(url,init)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://musicbrainz.org');assert.equal(u.pathname,'/ws/2/release-group/');assert.equal(u.searchParams.get('limit'),'8');assert.equal(init.redirect,'manual');assert.equal(Object.keys(init.headers).length,2);assert.match(init.headers['User-Agent'],/^WoongHub\/0.7/);return Response.json(source);};
  assert.equal((await handleAlbums(request('Discovery','',null),{},null,{...options,fetcher,cache})).status,401);
  assert.equal((await handleAlbums(request('Discovery','','owner','POST'),{},null,{...options,fetcher,cache})).status,405);
  const first=await handleAlbums(request(),{},null,{...options,fetcher,cache});assert.equal(first.headers.get('Cache-Control'),'private, no-store');assert.equal((await first.json()).cached,false);
  assert.equal((await (await handleAlbums(request(),{},null,{...options,fetcher,cache})).json()).cached,true);assert.equal(calls,1);
});

test('캐시되지 않은 빠른 반복 검색은 간격 제한 후 다시 허용한다',async()=>{
  let now=Date.parse('2026-11-17T00:00:00Z'),calls=0;const fetcher=async()=>{calls++;return Response.json(source);};
  const o={clock:()=>now,fetcher,cache:undefined};
  assert.equal((await handleAlbums(request(),{},null,o)).status,200);const limited=await handleAlbums(request(),{},null,o);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'2');assert.equal(calls,1);
  now+=1100;assert.equal((await handleAlbums(request(),{},null,o)).status,200);assert.equal(calls,2);
});

test('원본 장애와 잘못된 응답을 빈 검색 성공으로 바꾸지 않고 캐시 장애는 격리한다',async()=>{
  for(const response of [new Response('busy',{status:503}),new Response(null,{status:302,headers:{Location:'https://evil.test'}}),new Response('<html>',{headers:{'Content-Type':'text/html'}}),new Response('x',{headers:{'Content-Type':'application/json','Content-Length':'1500001'}}),Response.json({'release-groups':[{id:'bad'}]})])assert.ok((await handleAlbums(request(),{},null,{...options,fetcher:async()=>response})).status>=500);
  const cache={match:()=>{throw new Error('disabled');},put:()=>{throw new Error('disabled');}};assert.equal((await handleAlbums(request(),{},null,{...options,cache,fetcher:async()=>Response.json(source)})).status,200);
});

test('동시 감상 수정은 앨범 원본과 서로 다른 별점을 사본에 보존한다',()=>{
  const base=document(record('a',details())),local=structuredClone(base),remote=structuredClone(base);local.entries[0].music.rating=5;remote.entries[0].music.rating=4;
  const result=mergeData(base,local,remote);assert.equal(result.conflicts,1);assert.deepEqual(result.data.entries.map(e=>e.music.rating).sort(),[4,5]);for(const e of result.data.entries)assert.equal(e.music.catalog.id,id);
});

test('실제 DB의 앨범 상세는 계정별로 분리되고 오프라인 재시작 후 다른 기기에 복원된다',async t=>{
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());const api=(user,init={})=>handleApi(new Request('https://hub.test/api/hub',{...init,headers:{'oai-authenticated-user-id':user,Origin:'https://hub.test','Content-Type':'application/json'}}),{DB});
  class MemoryStorage{values=new Map();get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}removeItem(k){this.values.delete(k);}}
  const storage=new MemoryStorage();let online=true;const device=(s=storage)=>new SyncClient({storage:s,auto:false,online:()=>online,fetch:async(path,init={})=>{if(!online)throw new Error('offline');return api('alice',init);}});
  const first=device();await first.refresh();online=false;const data=document(record('a',details()));first.change(data);const restored=device();online=true;await restored.refresh();await restored.flush();const other=device(new MemoryStorage());await other.refresh();assert.deepEqual(other.getSnapshot().data,data);assert.equal((await (await api('bob')).json()).data.entries.length,0);
  const bad=structuredClone(data);bad.entries[0].music.rating=7;assert.equal((await api('alice',{method:'PUT',body:JSON.stringify({data:bad,expectedRevision:1,mutationId:'bad-album'})})).status,400);assert.deepEqual((await (await api('alice')).json()).data,data);
});
