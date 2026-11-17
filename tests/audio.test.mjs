import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,validateData} from '../src/lib/store.ts';
import {audioStats,emptyGear,setupDevices,validateAudio} from '../src/lib/audio.ts';
import {mergeData} from '../src/lib/merge.ts';
import {handleApi} from '../worker/api.mjs';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';
import {SyncClient} from '../src/lib/sync-client.ts';

const record=(id,audio)=>({id,kind:'audio',title:id,detail:'기존 청음 메모',category:'이어폰',status:'보유 중',url:'',date:'',done:false,createdAt:'2026-11-17T00:00:00Z',...(audio?{audio}:{})});
const gear=(id,price=0)=>record(id,{...emptyGear(),manufacturer:'테스트 제조사',model:'모델 A',purchasedAt:'2026-11-17',priceKRW:price,sound:'보컬과 공간감',connection:'4.4mm'});
const setup=(ids)=>({...record('setup',{type:'setup',deviceIds:ids}),category:'조합',status:'사용 중'});
const document=(...entries)=>({...structuredClone(initial),entries});

test('기존 오디오 기록과 새 상세 정보는 백업 왕복에서 함께 보존한다',()=>{
  const old=record('legacy'),next=gear('new',129000),combo=setup(['legacy','new']);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(document(old,next,combo)))),document(old,next,combo));
  assert.equal(Object.hasOwn(validateData(document(old)).entries[0],'audio'),false);
  assert.deepEqual(validateAudio({...next.audio,unexpected:'not persisted'}),next.audio);
});

test('오디오 상세의 날짜·구매가·길이·조합 중복 및 자기 참조를 검증한다',()=>{
  for(const audio of [{...emptyGear(),priceKRW:-1},{...emptyGear(),priceKRW:1.5},{...emptyGear(),priceKRW:'1000'},{...emptyGear(),priceKRW:10000000001},{...emptyGear(),purchasedAt:'2026-02-30'},{...emptyGear(),sound:'a'.repeat(1001)},{...emptyGear(),model:null},{type:'unknown'},{type:'setup',deviceIds:[]},{type:'setup',deviceIds:['a','a']},{type:'setup',deviceIds:Array.from({length:13},(_,i)=>String(i))}])assert.throws(()=>validateData(document(record('bad',audio))));
  assert.throws(()=>validateData(document(setup(['setup']))));
  assert.throws(()=>validateData(document({...gear('x'),kind:'note'})));
});

test('보유 구매가 합계는 가격을 기록한 보유 장비만 포함하고 0원도 구분한다',()=>{
  const data=[gear('free',0),gear('owned',500000),{...gear('wish',900000),status:'위시리스트'},{...gear('sold',200000),status:'판매 완료'},record('legacy'),setup(['free','owned'])];
  assert.deepEqual(audioStats(data),{gear:5,owned:3,wishlist:1,setups:1,priced:2,total:500000});
});

test('조합의 연결 순서를 유지하고 삭제된 장비도 표시 가능한 참조로 보존한다',()=>{
  const combo=setup(['b','missing','a']);
  const result=setupDevices(combo,[gear('a'),gear('b')]);
  assert.deepEqual(result.map(x=>x.id),['b','missing','a']);assert.equal(result[1].entry,undefined);
  assert.deepEqual(validateData(document(combo)).entries[0].audio.deviceIds,['b','missing','a']);
});

test('다른 기기의 오디오 상세 동시 수정은 사본과 조합을 모두 보존한다',()=>{
  const base=document(gear('a'),setup(['a']));
  const local=structuredClone(base),remote=structuredClone(base);
  local.entries[0].audio.sound='PC에서 적은 인상';remote.entries[0].audio.sound='폰에서 적은 인상';
  const merged=mergeData(base,local,remote);
  assert.equal(merged.conflicts,1);
  assert.deepEqual(merged.data.entries.filter(e=>e.audio?.type==='gear').map(e=>e.audio.sound).sort(),['PC에서 적은 인상','폰에서 적은 인상'].sort());
  assert.deepEqual(merged.data.entries.find(e=>e.id==='setup').audio.deviceIds,['a']);
});

async function harness(t){
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());
  const request=(user,init={})=>handleApi(new Request('https://hub.test/api/hub',{...init,headers:{'oai-authenticated-user-id':user,Origin:'https://hub.test','Content-Type':'application/json'}}),{DB});
  const put=(data,expectedRevision=0)=>({method:'PUT',body:JSON.stringify({data,expectedRevision,mutationId:crypto.randomUUID()})});
  return {request,put};
}

test('실제 DB API는 장비 상세·조합을 계정별로 저장하고 잘못된 변경은 거부한다',async t=>{
  const {request,put}=await harness(t),data=document(gear('a',650000),setup(['a']));
  assert.equal((await request('alice',put(data))).status,200);
  assert.deepEqual((await (await request('alice')).json()).data,data);
  assert.equal((await (await request('bob')).json()).data.entries.length,0);
  const bad=structuredClone(data);bad.entries[0].audio.priceKRW=-1;
  assert.equal((await request('alice',put(bad,1))).status,400);
  assert.deepEqual((await (await request('alice')).json()).data,data);
});

test('오디오 상세의 오프라인 변경이 재시작 후 서버와 다른 기기에 복원된다',async t=>{
  const {request}=await harness(t);
  class MemoryStorage{values=new Map();get length(){return this.values.size;}key(i){return [...this.values.keys()][i]??null;}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}removeItem(k){this.values.delete(k);}}
  let online=true;const storage=new MemoryStorage();
  const device=(store=storage)=>new SyncClient({storage:store,online:()=>online,auto:false,fetch:async(path,init={})=>{if(!online)throw new Error('offline');return request('alice',init);}});
  const first=device();await first.refresh();online=false;
  const data=document(gear('a',250000),setup(['a']));assert.equal(first.change(data),true);
  const restored=device();online=true;await restored.refresh();await restored.flush();
  const other=device(new MemoryStorage());await other.refresh();
  assert.deepEqual(other.getSnapshot().data,data);
});
