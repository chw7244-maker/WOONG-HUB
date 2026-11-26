import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyGame,gameStats,playTime,steamAppId,steamImageUrl,validateGame} from '../src/lib/games.ts';
import {initial,validateData} from '../src/lib/store.ts';
import {mergeData} from '../src/lib/merge.ts';
import {handleSteam,steamMetadata} from '../worker/steam.mjs';
import {handleApi} from '../worker/api.mjs';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';
import {SyncClient} from '../src/lib/sync-client.ts';

const upstream={620:{success:true,data:{steam_appid:620,type:'game',name:'Portal 2',developers:['Valve'],publishers:['Valve'],genres:[{description:'퍼즐 &amp; 모험'}],release_date:{date:'2011년 4월 18일',coming_soon:false},short_description:'<b>함께 푸는 퍼즐</b>',header_image:'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/header.jpg'}}};
const metadata=()=>steamMetadata(upstream,620,new Date('2026-11-17T00:00:00Z'));
const record=(id,game)=>({id,kind:'games',title:id,detail:'나의 감상',category:'PC',status:'플레이 중',url:'',date:'',done:false,createdAt:'2026-11-17T00:00:00Z',...(game?{game}:{})});
const full=()=>({...emptyGame(),playMinutes:750,rating:4.5,startedAt:'2026-11-01',completedAt:'2026-11-17',tags:['협동','퍼즐'],steam:metadata()});
const document=(...entries)=>({...structuredClone(initial),entries});
const request=(id='620',user='owner',method='GET')=>new Request('https://hub.test/api/games/steam?appId='+encodeURIComponent(id),{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Cookie:'private-session=never-forward'}});

test('Steam 상점 링크와 App ID만 받으며 외부 주소·위험한 이미지 주소는 거부한다',()=>{
  for(const value of ['620','https://store.steampowered.com/app/620/Portal_2/?snr=test','https://store.steampowered.com/app/620'])assert.equal(steamAppId(value),620);
  for(const value of ['0','-1','2147483648','1e3','https://evil.test/app/620/','http://store.steampowered.com/app/620/','https://store.steampowered.com.evil.test/app/620/','https://user@store.steampowered.com/app/620/','https://store.steampowered.com/app/620/../730/'])assert.equal(steamAppId(value),null);
  assert.equal(steamImageUrl('https://evil.test/steam/apps/620/header.jpg',620),'');assert.equal(steamImageUrl('data:image/svg+xml,test',620),'');
});

test('공개 Steam 응답은 짧은 일반 텍스트·허용된 필드로 정리하며 잘못된 게임은 거부한다',()=>{
  const s=metadata();assert.equal(s.description,'함께 푸는 퍼즐');assert.deepEqual(s.genres,['퍼즐 & 모험']);assert.equal(s.storeUrl,'https://store.steampowered.com/app/620/');assert.equal(Object.hasOwn(s,'price_overview'),false);
  assert.throws(()=>steamMetadata({620:{success:false}},620),/not_found/);
  assert.throws(()=>steamMetadata({620:{success:true,data:{...upstream[620].data,steam_appid:730}}},620));
});

test('기존 게임 기록과 새 플레이 기록은 백업 왕복에서 함께 보존한다',()=>{
  const data=document(record('legacy'),record('new',full()));assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);
  assert.equal(Object.hasOwn(validateData(data).entries[0],'game'),false);
  assert.deepEqual(validateGame({...full(),secret:'not persisted'}),full());
  for(const game of [{...full(),playMinutes:-1},{...full(),playMinutes:1.5},{...full(),rating:4.3},{...full(),rating:6},{...full(),startedAt:'2026-02-30'},{...full(),completedAt:'2026-10-01'},{...full(),tags:Array(9).fill('tag')},{...full(),steam:{...metadata(),storeUrl:'javascript:alert(1)'}}])assert.throws(()=>validateData(document(record('bad',game))));
  assert.throws(()=>validateData(document({...record('bad',full()),kind:'note'})));
});

test('Xbox 게임 연결은 백업과 복원에서 기존 Steam 정보와 수동 기록을 보존한다',()=>{
  const game={...full(),xboxTitleId:'4294967295'};
  const linked=record('linked',game);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(document(linked)))).entries[0],linked);
  assert.deepEqual(validateGame({...game,xboxTitleId:undefined}),full());
  for(const xboxTitleId of ['',123,'1e5','12345678901','https://example.test/123']){
    assert.throws(()=>validateGame({...game,xboxTitleId}),/Xbox 게임 연결/);
  }
});

test('플레이 시간 합계는 미기록과 0분을 구분하며 게임 기록만 계산한다',()=>{
  const data=[record('a',{...emptyGame(),playMinutes:125}),record('b',{...emptyGame(),playMinutes:0}),{...record('c'),status:'완료'},{...record('d'),status:'위시리스트'},{...record('ignored'),kind:'note'}];
  assert.deepEqual(gameStats(data),{count:4,playing:2,completed:1,wishlist:1,recorded:2,minutes:125});assert.equal(playTime(null),'시간 미기록');assert.equal(playTime(0),'0분');assert.equal(playTime(125),'2시간 5분');
});

test('Steam 조회는 인증을 확인하고 고정 주소만 요청하며 공개 메타데이터만 캐시한다',async()=>{
  let calls=0;const stored=new Map();const cache={match:async key=>stored.get(key.url)?.clone(),put:async(key,response)=>{assert.equal(key.headers.has('Cookie'),false);stored.set(key.url,response.clone());}};
  const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://store.steampowered.com/api/appdetails?appids=620&l=koreana&cc=kr');assert.equal(options.redirect,'manual');assert.deepEqual(options.headers,{Accept:'application/json'});return Response.json(upstream);};
  assert.equal((await handleSteam(request('620',null),{},null,{fetcher,cache})).status,401);assert.equal((await handleSteam(request('620','owner','POST'),{},null,{fetcher,cache})).status,405);
  assert.equal((await handleSteam(request('https://evil.test'),{},null,{fetcher,cache})).status,400);
  const first=await (await handleSteam(request(),{},null,{fetcher,cache})).json();assert.equal(first.cached,false);assert.equal(first.game.appId,620);
  const second=await (await handleSteam(request(),{},null,{fetcher,cache})).json();assert.equal(second.cached,true);assert.equal(calls,1);
  assert.equal((await handleSteam(request('620',null),{},null,{fetcher,cache})).status,401);
});

test('Steam 장애·리다이렉트·과도한 응답을 처리하고 캐시 장애는 조회를 막지 않는다',async()=>{
  assert.equal((await handleSteam(request(),{},null,{fetcher:async()=>Response.json({620:{success:false}})})).status,404);
  for(const response of [new Response('busy',{status:429}),new Response(null,{status:302,headers:{Location:'https://evil.test'}}),new Response('bad',{headers:{'Content-Type':'text/html'}}),new Response('x',{headers:{'Content-Type':'application/json','Content-Length':'1500001'}})])assert.ok((await handleSteam(request(),{},null,{fetcher:async()=>response})).status>=500);
  const failedCache={match:()=>{throw new Error('cache disabled');},put:()=>{throw new Error('cache disabled');}};
  assert.equal((await handleSteam(request(),{},null,{cache:failedCache,fetcher:async()=>Response.json(upstream)})).status,200);
});

test('게임 상세 동시 수정은 Steam 정보와 서로 다른 감상을 사본에 보존한다',()=>{
  const base=document(record('a',full())),local=structuredClone(base),remote=structuredClone(base);local.entries[0].game.rating=5;remote.entries[0].game.rating=4;
  const merged=mergeData(base,local,remote);assert.equal(merged.conflicts,1);assert.deepEqual(merged.data.entries.map(e=>e.game.rating).sort(),[4,5]);for(const e of merged.data.entries)assert.equal(e.game.steam.appId,620);
});

test('실제 DB에서 게임 상세의 계정 분리·오프라인 복구·기기 간 보존을 확인한다',async t=>{
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());
  const api=(user,init={})=>handleApi(new Request('https://hub.test/api/hub',{...init,headers:{'oai-authenticated-user-id':user,Origin:'https://hub.test','Content-Type':'application/json'}}),{DB});
  class MemoryStorage{values=new Map();get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}removeItem(k){this.values.delete(k);}}
  const store=new MemoryStorage();let online=true;const device=(storage=store)=>new SyncClient({storage,auto:false,online:()=>online,fetch:async(path,init={})=>{if(!online)throw new Error('offline');return api('alice',init);}});
  const a=device();await a.refresh();online=false;const data=document(record('a',{...full(),xboxTitleId:'123456'}));a.change(data);
  const restored=device();online=true;await restored.refresh();await restored.flush();const b=device(new MemoryStorage());await b.refresh();assert.deepEqual(b.getSnapshot().data,data);
  assert.equal((await (await api('bob')).json()).data.entries.length,0);
  const invalid=structuredClone(data);invalid.entries[0].game.rating=6;assert.equal((await api('alice',{method:'PUT',body:JSON.stringify({data:invalid,expectedRevision:1,mutationId:'invalid-game'})})).status,400);
  assert.deepEqual((await (await api('alice')).json()).data,data);
});
