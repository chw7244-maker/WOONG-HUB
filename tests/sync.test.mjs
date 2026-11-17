import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../worker/api.mjs';
import {SyncClient} from '../src/lib/sync-client.ts';
import {initial,KEY} from '../src/lib/store.ts';
import {mergeData} from '../src/lib/merge.ts';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';

const record=(id,title=id)=>({id,kind:'note',title,detail:'한글 기록',category:'일상',status:'',url:'',date:'',done:false,createdAt:'2026-11-17T00:00:00Z'});
const document=(...entries)=>({...structuredClone(initial),entries});
class MemoryStorage {
  values=new Map();fail=false;
  get length(){return this.values.size;}
  key(index){return [...this.values.keys()][index]??null;}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){if(this.fail)throw new Error('quota');this.values.set(key,value);}
  removeItem(key){if(this.fail)throw new Error('quota');this.values.delete(key);}
}
async function harness(t) {
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());
  const request=(user='owner',init={},path='/api/hub')=>handleApi(new Request('https://hub.test'+path,{...init,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Origin:'https://hub.test','Content-Type':'application/json',...init.headers}}),{DB});
  const device=(storage=new MemoryStorage())=>{
    const state={online:true,user:'owner',loseResponse:false,hold:null};
    const fetch=async(path,init={})=>{
      if(!state.online)throw new Error('offline');
      const result=await request(state.user,init,path);
      if(init.method==='PUT'&&state.hold)await state.hold();
      if(init.method==='PUT'&&state.loseResponse){state.loseResponse=false;throw new Error('response lost');}
      return result;
    };
    const client=new SyncClient({fetch,storage,online:()=>state.online,auto:false});
    return {client,state,storage};
  };
  const put=(data,expectedRevision=0,mutationId=crypto.randomUUID())=>({method:'PUT',body:JSON.stringify({data,expectedRevision,mutationId})});
  return {DB,request,device,put};
}

test('인증 없는 API 접근과 다른 출처 쓰기를 차단한다',async t=>{
  const {request,put}=await harness(t);
  assert.equal((await request(null)).status,401);
  assert.equal((await request('owner',{...put(document(record('x'))),headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await request('owner',{method:'DELETE'})).status,405);
});
test('DB는 사용자별로 분리하고 중복 요청은 한 번만 저장한다',async t=>{
  const {request,put}=await harness(t);const write=put(document(record('a')),0,'mutation-one');
  assert.equal((await request('alice',write)).status,200);
  assert.equal((await (await request('alice',write)).json()).revision,1);
  assert.equal((await (await request('bob')).json()).data.entries.length,0);
  assert.equal((await request('alice',put(document(record('b')),0))).status,409);
  assert.equal((await (await request('alice')).json()).data.entries[0].id,'a');
});
test('잘못된 백업과 초과 크기는 기존 서버 데이터에 영향을 주지 않는다',async t=>{
  const {request,put}=await harness(t);await request('owner',put(document(record('a'))));
  const invalid=document({...record('bad'),url:'javascript:alert(1)'});
  assert.equal((await request('owner',put(invalid,1))).status,400);
  assert.equal((await request('owner',{method:'PUT',body:'x'.repeat(1024*1024+1025)})).status,413);
  assert.equal((await (await request()).json()).revision,1);
});
test('두 독립 기기에서 기록 추가와 삭제가 같은 서버에 반영된다',async t=>{
  const {device}=await harness(t);const a=device(),b=device();await a.client.refresh();await b.client.refresh();
  assert.equal(a.client.change(document(record('a'))),true);await a.client.flush();await b.client.refresh();
  assert.equal(b.client.getSnapshot().data.entries[0].id,'a');
  b.client.change(document());await b.client.flush();await a.client.refresh();
  assert.equal(a.client.getSnapshot().data.entries.length,0);
});
test('동시 추가는 버전 충돌 이후에도 두 기록을 보존한다',async t=>{
  const {device}=await harness(t);const a=device(),b=device();await Promise.all([a.client.refresh(),b.client.refresh()]);
  a.client.change(document(record('a')));b.client.change(document(record('b')));
  await Promise.all([a.client.flush(),b.client.flush()]);await Promise.all([a.client.refresh(),b.client.refresh()]);
  for(const d of [a,b])assert.deepEqual(d.client.getSnapshot().data.entries.map(e=>e.id).sort(),['a','b']);
});
test('동일 기록 동시 수정은 사본으로 남기고 삭제와 수정 충돌에서도 내용을 보존한다',async t=>{
  const {device}=await harness(t);const a=device(),b=device();await a.client.refresh();a.client.change(document(record('x')));await a.client.flush();await b.client.refresh();
  a.client.change(document(record('x','PC에서 수정')));b.client.change(document(record('x','폰에서 수정')));
  await Promise.all([a.client.flush(),b.client.flush()]);await a.client.refresh();
  const result=a.client.getSnapshot().data.entries;
  assert.equal(result.length,2);assert.ok(result.some(e=>e.title.includes('PC에서 수정')));assert.ok(result.some(e=>e.title.includes('폰에서 수정')));
  const merged=mergeData(document(record('x')),document(),document(record('x','수정된 내용')));
  assert.equal(merged.data.entries[0].title,'수정된 내용');
});
test('오프라인 변경은 재시작 후 복원하고 다른 기기의 변경과 합친다',async t=>{
  const {device}=await harness(t);const a=device(),b=device();await a.client.refresh();await b.client.refresh();
  a.state.online=false;a.client.change(document(record('offline')));await a.client.flush();
  assert.equal(a.client.getSnapshot().phase,'offline');
  b.client.change(document(record('phone')));await b.client.flush();
  const restarted=device(a.storage);await restarted.client.refresh();await restarted.client.flush();await b.client.refresh();
  assert.deepEqual(b.client.getSnapshot().data.entries.map(e=>e.id).sort(),['offline','phone']);
});
test('응답을 잃어도 다음 접속에서 중복 없이 복구한다',async t=>{
  const {device}=await harness(t);const a=device();await a.client.refresh();a.state.loseResponse=true;
  a.client.change(document(record('sent')));await a.client.flush();assert.equal(a.client.getSnapshot().phase,'error');
  const restarted=device(a.storage);await restarted.client.refresh();await restarted.client.flush();
  assert.equal(restarted.client.getSnapshot().phase,'synced');assert.equal(restarted.client.getSnapshot().data.entries.length,1);
});
test('저장 요청 중 추가한 변경도 잃지 않고 순서대로 저장한다',async t=>{
  const {device}=await harness(t);const a=device();await a.client.refresh();
  let release,started;const held=new Promise(r=>release=r),sent=new Promise(r=>started=r);
  a.state.hold=async()=>{started();await held;};a.client.change(document(record('first')));
  const flush=a.client.flush();await sent;a.client.change(document(record('first'),record('second')));a.state.hold=null;release();await flush;
  const b=device();await b.client.refresh();assert.equal(b.client.getSnapshot().data.entries.length,2);
});
test('여러 탭의 보류 기록이 서로의 캐시를 덮어쓰지 않는다',async t=>{
  const {device}=await harness(t);const storage=new MemoryStorage();const a=device(storage),b=device(storage);
  await a.client.refresh();await b.client.refresh();a.state.online=false;b.state.online=false;
  a.client.change(document(record('tab-a')));b.client.change(document(record('tab-b')));
  const restarted=device(storage);await restarted.client.refresh();await restarted.client.flush();
  assert.deepEqual(restarted.client.getSnapshot().data.entries.map(e=>e.id).sort(),['tab-a','tab-b']);
  const again=device(storage);await again.client.refresh();assert.equal(again.client.getSnapshot().data.entries.length,2);
});
test('기존 브라우저 데이터는 원본을 보존한 채 한 번만 이전한다',async t=>{
  const {device}=await harness(t);const storage=new MemoryStorage();const old=JSON.stringify(document(record('legacy')));storage.setItem(KEY,old);
  const a=device(storage);await a.client.refresh();assert.equal(a.client.getSnapshot().migration.entries.length,1);
  assert.equal(a.client.migrate(),true);await a.client.flush();assert.equal(storage.getItem(KEY),old);
  const b=device(storage);await b.client.refresh();assert.equal(b.client.getSnapshot().migration,null);assert.equal(b.client.getSnapshot().data.entries.length,1);
});
test('기기 저장 실패 시 입력을 저장했다고 표시하지 않는다',async t=>{
  const {device}=await harness(t);const a=device();await a.client.refresh();a.storage.fail=true;
  assert.equal(a.client.change(document(record('unsaved'))),false);assert.equal(a.client.getSnapshot().data.entries.length,0);assert.ok(a.client.getSnapshot().error);
});
test('계정이 바뀌면 이전 계정의 보류 기록을 섞지 않는다',async t=>{
  const {device}=await harness(t);const a=device();await a.client.refresh();a.client.change(document(record('owner-only')));
  a.state.user='another-user';await a.client.refresh();assert.equal(a.client.getSnapshot().data.entries.length,0);assert.equal(a.client.getSnapshot().userId,'another-user');
});
