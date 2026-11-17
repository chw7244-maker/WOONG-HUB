import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCalendar,eventOnDay,calendarPeriod,localCalendarEvent} from '../src/lib/calendar.ts';
import {initial,validateData} from '../src/lib/store.ts';
import {mergeData} from '../src/lib/merge.ts';
import {handleApi} from '../worker/api.mjs';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';
const sources=[{id:'notion-fixture',name:'테스트 노션',provider:'notion'},{id:'google-fixture',name:'테스트 구글',provider:'google'}];
const oneDay={id:'a',sourceId:sources[0].id,title:'테스트 일정',url:'https://calendar.notion.so/event/test',allDay:true,start:'2026-11-17',end:'2026-11-18'};
const snapshot=(events=[oneDay])=>({version:1,timeZone:'Asia/Seoul',syncedAt:'2026-11-17T01:00:00Z',rangeStart:'2026-11-01',rangeEnd:'2027-01-01',sources,events});
test('노션·구글 출처를 유지하며 날짜·출처·URL·중복·크기를 검증한다',()=>{
  assert.deepEqual(validateCalendar(snapshot()),snapshot());
  for(const data of [snapshot([{...oneDay,start:'2026-02-30'}]),snapshot([{...oneDay,end:'2026-11-17'}]),snapshot([{...oneDay,sourceId:'other'}]),snapshot([{...oneDay,url:'javascript:alert(1)'}]),snapshot([{...oneDay,url:'https://evil.test/'}]),snapshot([oneDay,oneDay]),{...snapshot(),sources:[sources[0],sources[0]]},{...snapshot(),events:Array(4001).fill(oneDay)}])assert.throws(()=>validateCalendar(data));
});
test('종일 종료일은 미포함이며 KST 자정·기간·0분 일정이 정확히 표시된다',()=>{
  assert.equal(eventOnDay(oneDay,'2026-11-17'),true);assert.equal(eventOnDay(oneDay,'2026-11-18'),false);
  const span={...oneDay,end:'2026-11-20'};assert.equal(eventOnDay(span,'2026-11-19'),true);assert.match(calendarPeriod(span),/11-17 ~ 11-19/);
  const timed={...oneDay,allDay:false,start:'2026-11-16T15:00:00Z',end:'2026-11-17T15:00:00Z'};
  assert.equal(eventOnDay(timed,'2026-11-16'),false);assert.equal(eventOnDay(timed,'2026-11-17'),true);assert.equal(eventOnDay(timed,'2026-11-18'),false);
  assert.equal(eventOnDay({...timed,end:timed.start},'2026-11-17'),true);
});
test('HUB 직접 일정은 KST로 변환하고 잘못된 종류는 달력에 넣지 않는다',()=>{
  const entry={id:'local',kind:'event',title:'직접 등록',date:'2026-11-17T09:00'};
  const event=localCalendarEvent(entry);assert.equal(event.start,'2026-11-17T09:00:00+09:00');assert.equal(eventOnDay(event,'2026-11-17'),true);
  assert.equal(localCalendarEvent({...entry,kind:'note'}),null);
});
test('표시를 꺼도 일정은 보존하고 설정은 백업·다른 변경 병합에서 유지한다',()=>{
  const data={...structuredClone(initial),preferences:{...initial.preferences,calendarHiddenSources:['google-fixture','google-fixture','hub-local']}};
  const validated=validateData(data);assert.deepEqual(validated.preferences.calendarHiddenSources,['google-fixture','hub-local']);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(validated))),validated);
  const base=structuredClone(initial),local=structuredClone(validated),remote=structuredClone(initial);remote.preferences.theme='light';
  const merged=mergeData(base,local,remote).data;assert.equal(merged.preferences.theme,'light');assert.deepEqual(merged.preferences.calendarHiddenSources,['google-fixture','hub-local']);
  assert.throws(()=>validateData({...data,preferences:{...data.preferences,calendarHiddenSources:['x'.repeat(201)]}}));
});
async function harness(t){const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());const req=(path,init={},user)=>handleApi(new Request('https://hub.test'+path,{...init,headers:{...(user?{'oai-authenticated-user-id':user}:{}),...init.headers}}),{DB});const put=(data,revision=0,id=crypto.randomUUID())=>({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot:data,expectedRevision:revision,mutationId:id})});return {req,put};}
test('수동 반영은 원자적으로 교체되고 중복 재전송·버전 충돌·실패를 처리한다',async t=>{
  const {req,put}=await harness(t),write=put(snapshot(),0,'same-request');
  assert.equal((await req('/api/calendar')).status,401);
  assert.equal((await req('/api/calendar/sync',write)).status,200);
  assert.equal((await req('/api/calendar/sync',write)).status,200);
  assert.equal((await req('/api/calendar/sync',put(snapshot(),0))).status,409);
  assert.equal((await req('/api/calendar/sync',put({...snapshot(),events:[{...oneDay,end:'bad'}]},1))).status,400);
  const data=await (await req('/api/calendar',{},'owner')).json();assert.equal(data.revision,1);assert.deepEqual(data.snapshot,snapshot());
});
test('방문자 쓰기·교차 출처·큰 본문·오래된 반영은 거부하고 기존 반영본을 보존한다',async t=>{
  const {req,put}=await harness(t);await req('/api/calendar/sync',put(snapshot()));
  assert.equal((await req('/api/calendar',{method:'PUT'},'owner')).status,405);
  const request=put(snapshot(),1);assert.equal((await req('/api/calendar/sync',{...request,headers:{...request.headers,Origin:'https://hub.test'}},'owner')).status,403);
  assert.equal((await req('/api/calendar/sync',{...request,headers:{...request.headers,'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await req('/api/calendar/sync',{method:'PUT',headers:{'Content-Type':'application/json'},body:'x'.repeat(1024*1024+1)})).status,413);
  assert.equal((await req('/api/calendar/sync',put({...snapshot(),syncedAt:'2026-11-16T01:00:00Z'},1))).status,409);
  assert.equal((await (await req('/api/calendar',{},'owner')).json()).snapshot.events.length,1);
});

test('캘린더 표시 설정은 계정별 문서에 저장되고 원본 반영본을 삭제하지 않는다',async t=>{
  const {req,put}=await harness(t);await req('/api/calendar/sync',put(snapshot()));
  const data={...structuredClone(initial),preferences:{...initial.preferences,calendarHiddenSources:['google-fixture','hub-local']}};
  const write=await req('/api/hub',{method:'PUT',headers:{Origin:'https://hub.test','Content-Type':'application/json'},body:JSON.stringify({data,expectedRevision:0,mutationId:'hide-calendars'})},'alice');
  assert.equal(write.status,200);assert.deepEqual((await (await req('/api/hub',{},'alice')).json()).data.preferences.calendarHiddenSources,['google-fixture','hub-local']);
  assert.equal((await (await req('/api/hub',{},'bob')).json()).data.preferences.calendarHiddenSources,undefined);
  assert.deepEqual((await (await req('/api/calendar',{},'alice')).json()).snapshot,snapshot());
});
