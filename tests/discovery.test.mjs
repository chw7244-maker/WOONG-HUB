import test from 'node:test';
import assert from 'node:assert/strict';
import {searchEntries,searchTerms,matchesSearch} from '../src/lib/search.ts';
import {initial,validateData,mediaWidgetVisible} from '../src/lib/store.ts';
import {emptyMusic} from '../src/lib/music.ts';
import {emptyGame} from '../src/lib/games.ts';
import {mergeData} from '../src/lib/merge.ts';
const record=(id,kind='note',extra={})=>({id,kind,title:id,detail:'',category:'',status:'',url:'',date:'',done:false,createdAt:'2026-11-17T00:00:00Z',...extra});
test('Search finds music artists, tags, favorites and listening notes without changing stored entries',()=>{
  const entries=[record('album','music',{title:'Blue Album',music:{...emptyMusic(),artist:'테스트 아티스트',tags:['재즈'],favoriteTrack:'테스트 곡',listens:[{id:'listen',date:'2026-11-17',track:'Autumn',equipment:'HD 600',rating:4.5,note:'보컬이 가까운 청음',createdAt:'2026-11-17T00:00:00Z'}]}}),record('playlist','music',{music:{...emptyMusic(),type:'playlist',favorite:true}})],before=JSON.stringify(entries);
  for(const query of ['아티스트','재즈','Autumn','HD 600','가까운 청음','테스트 곡'])assert.equal(searchEntries(entries,query)[0].entry.id,'album');assert.equal(searchEntries(entries,'가까운')[0].matchedIn,'감상 기록');assert.equal(searchEntries(entries,'즐겨찾기')[0].entry.id,'playlist');assert.equal(searchEntries(entries,'즐겨찾기')[0].label,'플레이리스트');assert.equal(JSON.stringify(entries),before);
});
test('Search combines terms across fields, normalizes Unicode, treats punctuation as text and ranks exact titles first',()=>{
  const entries=[record('first','music',{title:'A different album',music:{...emptyMusic(),artist:'Blue'}}),record('exact','music',{title:'Blue',music:{...emptyMusic(),tags:['재즈']}}),record('literal','note',{title:'a.*b',detail:'<script>literal text</script>'})];
  assert.equal(searchEntries(entries,'ＢＬＵＥ')[0].entry.id,'exact');assert.equal(searchEntries(entries,'blue 재즈')[0].entry.id,'exact');assert.equal(searchEntries(entries,'a.*b')[0].entry.id,'literal');assert.equal(searchEntries(entries,'a.+b').length,0);assert.deepEqual(searchTerms('  Blue  재즈  '),['blue','재즈']);assert.equal(matchesSearch(['ＡＢＣ','재즈'],searchTerms('abc 재즈')),true);
});
test('Search filters preserve games and music and include previously supported record types and new detail fields',()=>{
  const entries=[record('game','games',{game:{...emptyGame(),tags:['협동'],steamAccount:{steamId:'76561198000000001',appId:620}}}),record('music','music',{music:emptyMusic()}),record('gear','audio',{audio:{type:'gear',manufacturer:'TestBrand',model:'Model 1',purchasedAt:'',priceKRW:null,sound:'따뜻함',connection:'USB'}}),record('memo','note',{detail:'새 메모'})];
  assert.equal(searchEntries(entries,'협동','games')[0].entry.id,'game');assert.equal(searchEntries(entries,'620')[0].entry.id,'game');assert.equal(searchEntries(entries,'TestBrand')[0].entry.id,'gear');assert.equal(searchEntries(entries,'새 메모','records')[0].entry.id,'memo');assert.equal(searchEntries(entries,'','music').length,1);assert.equal(searchEntries(entries,'','games').length,1);assert.equal(searchEntries(entries,'','steam').length,0);assert.deepEqual(searchEntries(entries,'').map(h=>h.entry.id),entries.map(e=>e.id));
});
test('Long listening notes show the matching passage without returning an oversized preview',()=>{
  const entry=record('long','music',{music:{...emptyMusic(),listens:[{id:'listen',date:'2026-11-17',track:'',equipment:'',rating:null,note:'앞부분 '.repeat(100)+'검색할 보컬 메모'+' 뒷부분'.repeat(100),createdAt:'2026-11-17T00:00:00Z'}]}}),hit=searchEntries([entry],'보컬')[0];assert.ok(hit.excerpt.includes('보컬'));assert.ok(hit.excerpt.length<=162);assert.equal(hit.matchedIn,'감상 기록');
});
test('Old backups keep their exact preferences while media widgets default to visible; explicit hiding survives backup',()=>{
  const old=structuredClone(initial);assert.deepEqual(validateData(old),old);assert.equal(mediaWidgetVisible(old.preferences,'spotify'),true);assert.equal(mediaWidgetVisible(old.preferences,'steam'),true);const hidden={...old,preferences:{...old.preferences,mediaWidgets:[]}};assert.deepEqual(validateData(JSON.parse(JSON.stringify(hidden))),hidden);assert.equal(mediaWidgetVisible(hidden.preferences,'spotify'),false);assert.equal(mediaWidgetVisible(hidden.preferences,'steam'),false);assert.deepEqual(hidden.preferences.widgets,old.preferences.widgets);
  for(const mediaWidgets of ['steam',['unknown'],['spotify','steam','steam'],[1]])assert.throws(()=>validateData({...old,preferences:{...old.preferences,mediaWidgets}}));
});
test('Media widget preferences merge with other device changes without removing records or existing widget settings',()=>{
  const base={...structuredClone(initial),entries:[record('keep')]},local={...structuredClone(base),preferences:{...base.preferences,mediaWidgets:['steam']}},remote={...structuredClone(base),preferences:{...base.preferences,city:'busan'}};const result=mergeData(base,local,remote).data;assert.equal(result.preferences.city,'busan');assert.deepEqual(result.preferences.mediaWidgets,['steam']);assert.deepEqual(result.preferences.widgets,base.preferences.widgets);assert.deepEqual(result.entries,base.entries);
});
