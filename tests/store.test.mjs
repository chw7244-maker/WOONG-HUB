import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,validateData,initial,todayKST} from '../src/lib/store.ts';
const entry={id:'test',kind:'bookmark',title:'테스트',detail:'메모',category:'일상',status:'',url:'https://example.com/',date:'',done:false,createdAt:'2026-11-17T00:00:00Z'};
test('백업 파일 왕복 변환 시 한글 기록과 설정을 보존한다',()=>{const data={...initial,entries:[entry]};assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))),data);});
test('외부 링크는 HTTP(S)만 허용한다',()=>{for(const u of ['javascript:alert(1)','data:text/html,test','file:///C:/secret','/relative'])assert.equal(safeUrl(u),'');assert.equal(safeUrl('https://example.com'),'https://example.com/');});
test('손상된 백업과 중복 ID는 가져오지 않는다',()=>{for(const data of [{},null,{...initial,version:2},{...initial,entries:[entry,entry]},{...initial,entries:[{...entry,title:0}]},{...initial,preferences:{...initial.preferences,city:'unknown'}}])assert.throws(()=>validateData(data));});
test('백업에 실행 가능한 링크를 넣어도 거부한다',()=>assert.throws(()=>validateData({...initial,entries:[{...entry,url:'javascript:alert(1)'}]})));
test('호스트 시간대와 관계없이 한국 날짜를 반환한다',()=>{assert.equal(todayKST(new Date('2026-11-16T15:01:00Z')),'2026-11-17');assert.equal(todayKST(new Date('2026-11-17T14:59:00Z')),'2026-11-17');});
