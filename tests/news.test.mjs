import test from 'node:test';
import assert from 'node:assert/strict';
import {FEEDS,parseFeed,canonicalUrl,fetchFeed} from '../worker/news-feeds.mjs';
import {claimNewsSync,collectNews,handleNews} from '../worker/news.mjs';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';

const now=()=>new Date();
const feed=FEEDS[0];
const item=(id,title=`테스트 기사 ${id}`,date=now().toUTCString(),link=`https://publisher.test/story/${id}`)=>`<item><title><![CDATA[${title}]]></title><link>${link.replaceAll('&','&amp;')}</link><pubDate>${date}</pubDate><description><![CDATA[<p>테스트 전용 소개 <b>본문</b></p><script>alert(1)</script>]]></description></item>`;
const rss=(items)=>`<?xml version="1.0"?><rss version="2.0"><channel><title>테스트 피드</title>${items}</channel></rss>`;
async function setup(t){
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());
  const fetcher=async url=>new Response(rss(item(FEEDS.find(f=>f.url===url)?.id??'test')),{headers:{'Content-Type':'application/rss+xml'}});
  const lease=await claimNewsSync(DB);await collectNews({DB},lease,{fetcher});
  const req=async(path='/api/news',init={},user='owner')=>handleNews(new Request('https://hub.test'+path,{...init,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Origin:'https://hub.test','Content-Type':'application/json',...init.headers}}),{DB},{waitUntil:p=>p.catch(()=>{})});
  return {DB,req,fetcher};
}

test('RSS 제목·발행일·짧은 소개를 읽고 추적 링크를 정리한다',async()=>{
  const articles=await parseFeed(rss(item('a','제목 &amp; 테스트',now().toUTCString(),'https://publisher.test/a?utm_source=test&id=1#top')),feed);
  assert.equal(articles.length,1);assert.equal(articles[0].url,'https://publisher.test/a?id=1');assert.equal(articles[0].description,'테스트 전용 소개 본문');assert.equal(articles[0].id.length,64);assert.deepEqual(articles[0].categories,['audio-music']);
});
test('Atom, 상대 링크, 중복 URL을 처리한다',async()=>{
  const xml=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom 테스트</title><link rel="alternate" href="/atom"/><updated>${now().toISOString()}</updated><summary>짧은 소개</summary></entry></feed>`;
  assert.equal((await parseFeed(xml,feed))[0].url,'https://www.headfonia.com/atom');
  assert.equal((await parseFeed(rss(item('same')+item('same')),feed)).length,1);
});
test('DTD, 잘못된 XML, 위험한 링크, 없는 발행일은 수집하지 않는다',async()=>{
  await assert.rejects(()=>parseFeed('<!DOCTYPE rss [<!ENTITY a "x">]><rss/>',feed));
  await assert.rejects(()=>parseFeed('<rss><channel>',feed));
  assert.equal(canonicalUrl('javascript:alert(1)',feed.website),null);assert.equal(canonicalUrl('',feed.website),null);assert.equal(canonicalUrl('http://127.0.0.1/a',feed.website),null);
  assert.equal((await parseFeed(rss(item('bad','제목','not-a-date')+item('url','제목',now().toUTCString(),'javascript:alert(1)')),feed)).length,0);
});
test('과도한 피드 응답과 HTTP 오류를 소스별로 거부한다',async()=>{
  await assert.rejects(()=>fetchFeed(feed,async()=>new Response('blocked',{status:429})),/http_429/);
  await assert.rejects(()=>fetchFeed(feed,async()=>new Response('x'.repeat(1500001))),/feed_too_large/);
});
test('수집 재실행은 중복을 만들지 않고 기존 개인 기록을 유지한다',async t=>{
  const {DB,fetcher,req}=await setup(t);
  const first=await (await req()).json();assert.equal(first.counts.all,FEEDS.length);
  await collectNews({DB},{leaseUntil:0},{fetcher});
  const second=await (await req()).json();assert.equal(second.counts.all,first.counts.all);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM hub_documents').first()).n,0);
});
test('한 소스가 실패해도 다른 소스의 기사는 남는다',async t=>{
  const {DB,fetcher}=await setup(t);
  const result=await collectNews({DB},{leaseUntil:0},{fetcher:async url=>url===FEEDS[0].url?new Response('rate limited',{status:429}):fetcher(url)});
  assert.equal(result.sources.filter(s=>s.ok).length,FEEDS.length-1);assert.equal(result.sources[0].error,'http_429');assert.ok(result.count>0);
});
test('같은 URL이 다른 분야에서 다시 발견되면 분야를 합치고 최초 수집 시각을 유지한다',async t=>{
  const {DB}=await setup(t);
  const common='https://publisher.test/shared';const fetcher=async url=>new Response(rss(item('shared','테스트 공통 기사',now().toUTCString(),common)));
  await collectNews({DB},{leaseUntil:0},{fetcher});
  const before=await DB.prepare('SELECT * FROM news_articles WHERE url=?').bind(common).first();
  assert.equal(JSON.parse(before.categories).length,6);
  await collectNews({DB},{leaseUntil:0},{fetcher});
  const after=await DB.prepare('SELECT * FROM news_articles WHERE url=?').bind(common).first();assert.equal(after.first_seen_at,before.first_seen_at);assert.equal(JSON.parse(after.categories).length,6);
});
test('전 소스 실패 시 기존 기사와 마지막 성공 시각을 보존한다',async t=>{
  const {DB,req}=await setup(t);const before=await DB.prepare('SELECT * FROM news_sync').first();
  await DB.prepare('UPDATE news_sync SET lease_until=123').run();
  await collectNews({DB},{leaseUntil:123},{fetcher:async()=>new Response('unavailable',{status:503})});
  const data=await (await req()).json();assert.equal(data.counts.all,FEEDS.length);assert.equal(data.sync.lastSuccessAt,before.last_success_at);assert.equal(data.sync.sources.every(s=>!s.ok),true);
});
test('동시 수집 잠금과 수동 갱신 간격을 적용한다',async t=>{
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());
  const claims=await Promise.all([claimNewsSync(DB),claimNewsSync(DB)]);assert.equal(claims.filter(Boolean).length,1);
  await DB.prepare('UPDATE news_sync SET lease_until=0,finished_at=?').bind(now().toISOString()).run();
  assert.equal(await claimNewsSync(DB,{force:true}),null);
});
test('분야·검색·날짜 필터와 커서 페이지가 일관되게 동작한다',async t=>{
  const {req}=await setup(t);
  const page=await (await req('/api/news?limit=2')).json();assert.equal(page.articles.length,2);assert.ok(page.nextCursor);
  const next=await (await req('/api/news?limit=2&cursor='+encodeURIComponent(page.nextCursor))).json();assert.equal(next.articles.some(a=>page.articles.some(b=>a.id===b.id)),false);
  assert.equal((await (await req('/api/news?category=games')).json()).articles.length,1);
  assert.equal((await (await req('/api/news?q=pcgamer')).json()).articles.length,1);
  assert.equal((await req('/api/news?date=2026-02-30')).status,400);assert.equal((await req('/api/news?category=bad')).status,400);assert.equal((await req('/api/news?cursor=bad')).status,400);
  assert.equal((await (await req('/api/news?q='+encodeURIComponent('%'))).json()).articles.length,0);
});
test('읽음·스크랩·숨김은 계정별로 분리되고 다른 필드를 덮어쓰지 않는다',async t=>{
  const {req}=await setup(t);const id=(await (await req()).json()).articles[0].id;
  const state=(field,value)=>({method:'PATCH',body:JSON.stringify({id,field,value})});
  await req('/api/news/state',state('saved',true));await req('/api/news/state',state('read',true));
  let saved=await (await req('/api/news?view=saved')).json();assert.equal(saved.articles.length,1);assert.equal(saved.articles[0].read,true);
  assert.equal((await (await req('/api/news?view=saved',{},'other')).json()).articles.length,0);
  await req('/api/news/state',state('hidden',true));assert.equal((await (await req('/api/news?view=hidden')).json()).articles[0].id,id);
  await req('/api/news/state',state('hidden',false));saved=await (await req('/api/news?view=saved')).json();assert.equal(saved.articles.length,1);assert.equal(saved.articles[0].read,true);
});
test('인증·출처·상태 필드를 검증하고 스크랩 백업은 본인 기록만 내보낸다',async t=>{
  const {req}=await setup(t);const id=(await (await req()).json()).articles[0].id;
  assert.equal((await req('/api/news',{},null)).status,401);
  const patch={method:'PATCH',body:JSON.stringify({id,field:'saved',value:true})};
  assert.equal((await req('/api/news/state',{...patch,headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await req('/api/news/state',{method:'PATCH',body:JSON.stringify({id,field:'__proto__',value:true})})).status,400);
  assert.equal((await req('/api/news/state',{method:'PATCH',body:'x'.repeat(3000)})).status,413);
  await req('/api/news/state',patch);const backup=await req('/api/news/export');assert.match(backup.headers.get('Content-Disposition'),/attachment/);assert.equal((await backup.json()).articles.length,1);
  assert.equal((await (await req('/api/news/export',{},'other')).json()).articles.length,0);
});
