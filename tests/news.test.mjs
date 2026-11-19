import test from 'node:test';
import assert from 'node:assert/strict';
import {FEEDS,parseFeed,canonicalUrl,fetchFeed,parseGameMeca,parseLaunchCalendar,steamNewsFeed} from '../worker/news-feeds.mjs';
import {claimNewsSync,collectNews,handleNews} from '../worker/news.mjs';
import {rankNews} from '../worker/news-interests.mjs';
import {starterNewsTopics} from '../src/lib/news.ts';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';

const now=()=>new Date();
const feed=FEEDS[0];
const feeds=FEEDS.filter(source=>!source.format);
const item=(id,title=`테스트 기사 ${id}`,date=now().toUTCString(),link=`https://publisher.test/story/${id}`)=>`<item><title><![CDATA[${title}]]></title><link>${link.replaceAll('&','&amp;')}</link><pubDate>${date}</pubDate><description><![CDATA[<p>테스트 전용 소개 <b>본문</b></p><script>alert(1)</script>]]></description></item>`;
const rss=(items)=>`<?xml version="1.0"?><rss version="2.0"><channel><title>테스트 피드</title>${items}</channel></rss>`;
async function setup(t){
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());
  const fetcher=async url=>new Response(rss(item(FEEDS.find(f=>f.url===url)?.id??'test')),{headers:{'Content-Type':'application/rss+xml'}});
  const lease=await claimNewsSync(DB);await collectNews({DB},lease,{fetcher,feeds});
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
test('Worker가 지원하는 수동 리다이렉트로 같은 소스만 따라간다',async()=>{
  let calls=0;const response=await fetchFeed(feed,async(url,options)=>{assert.equal(options.redirect,'manual');calls++;return calls===1?new Response(null,{status:302,headers:{Location:'/updated-feed'}}):new Response(rss(item('redirect')));});
  assert.equal(calls,2);assert.equal(response.length,1);
  await assert.rejects(()=>fetchFeed(feed,async()=>new Response(null,{status:302,headers:{Location:'https://other.test/steal'}})),/invalid_redirect/);
});
test('수집 재실행은 중복을 만들지 않고 기존 개인 기록을 유지한다',async t=>{
  const {DB,fetcher,req}=await setup(t);
  const first=await (await req()).json();assert.equal(first.counts.all,feeds.length);
  await collectNews({DB},{leaseUntil:0},{fetcher,feeds});
  const second=await (await req()).json();assert.equal(second.counts.all,first.counts.all);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM hub_documents').first()).n,0);
});
test('한 소스가 실패해도 다른 소스의 기사는 남는다',async t=>{
  const {DB,fetcher}=await setup(t);
  const result=await collectNews({DB},{leaseUntil:0},{feeds,fetcher:async url=>url===FEEDS[0].url?new Response('rate limited',{status:429}):fetcher(url)});
  assert.equal(result.sources.filter(s=>s.ok).length,feeds.length-1);assert.equal(result.sources[0].error,'http_429');assert.ok(result.count>0);
});
test('같은 URL이 다른 분야에서 다시 발견되면 분야를 합치고 최초 수집 시각을 유지한다',async t=>{
  const {DB}=await setup(t);
  const common='https://publisher.test/shared';const fetcher=async url=>new Response(rss(item('shared','테스트 공통 기사',now().toUTCString(),common)));
  await collectNews({DB},{leaseUntil:0},{fetcher,feeds});
  const before=await DB.prepare('SELECT * FROM news_articles WHERE url=?').bind(common).first();
  assert.equal(JSON.parse(before.categories).length,new Set(feeds.map(feed=>feed.category)).size);
  await collectNews({DB},{leaseUntil:0},{fetcher,feeds});
  const after=await DB.prepare('SELECT * FROM news_articles WHERE url=?').bind(common).first();assert.equal(after.first_seen_at,before.first_seen_at);assert.deepEqual(JSON.parse(after.categories).sort(),JSON.parse(before.categories).sort());
});
test('전 소스 실패 시 기존 기사와 마지막 성공 시각을 보존한다',async t=>{
  const {DB,req}=await setup(t);const before=await DB.prepare('SELECT * FROM news_sync').first();
  await DB.prepare('UPDATE news_sync SET lease_until=123').run();
  await collectNews({DB},{leaseUntil:123},{feeds,fetcher:async()=>new Response('unavailable',{status:503})});
  const data=await (await req()).json();assert.equal(data.counts.all,feeds.length);assert.equal(data.sync.lastSuccessAt,before.last_success_at);assert.equal(data.sync.sources.every(s=>!s.ok),true);
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
  assert.equal((await (await req('/api/news?category=games')).json()).articles.length,feeds.filter(feed=>feed.category==='games').length);
  assert.equal((await (await req('/api/news?q=pcgamer')).json()).articles.length,1);
  assert.equal((await req('/api/news?date=2026-02-30')).status,400);assert.equal((await req('/api/news?category=bad')).status,400);assert.equal((await req('/api/news?cursor=bad')).status,400);
  assert.equal((await (await req('/api/news?q='+encodeURIComponent('%'))).json()).articles.length,0);
});

test('국내 런칭 캘린더는 확인된 상품명·가격·청음과 한국 날짜를 사용한다',async()=>{
  const retailer=FEEDS.find(source=>source.format==='launch-calendar');
  const html='<article class="lcc" data-pg-product-gid="6191"><div class="lcc__brand">NOBLE AUDIO</div>'+
    '<a href="/goods/g_detail.html?gid=6191" class="lcc__name">Van Gogh</a><div class="lcc__price">1,160,000원</div>'+
    '<div class="lcc__date">출시 <b>2026.11.18 17:43</b></div><span class="lcc__tag">청음가능</span></article>';
  const [result]=await parseLaunchCalendar(html,retailer,new Date('2026-11-19T00:00:00Z'));
  assert.equal(result.url,'https://www.schezade.co.kr/goods/g_detail.html?gid=6191');
  assert.equal(result.publishedAt,'2026-11-18T08:43:00.000Z');
  assert.match(result.description,/1,160,000원 · 청음 가능/);
  await assert.rejects(()=>parseLaunchCalendar('<html>차단된 응답</html>',retailer),/unsupported_feed/);
});

test('게임메카 공개 목록은 헤드라인과 일반 기사의 제목·한국 발행일·원문 링크를 읽는다',async()=>{
  const publisher=FEEDS.find(source=>source.id==='gamemeca');
  const row=(className,gid,time,title)=>'<li class="'+className+'"><strong class="tit_thumb'+(className?'_h':'')+
    '"><a href="/view.php?gid='+gid+'">'+title+'</a></strong><div class="desc_thumb">본문 미리보기</div><div class="day_news">'+time+'</div></li>';
  const headline=row('item_headline',321,'2026.11.19 11:00','&quot;오늘&quot; 출시');
  const regular=row('',322,'2026.11.19 10:00','지스타 새 소식');
  const html='<ul class="list_news">'+headline+regular+regular+row('',323,'2026.11.20 10:00','미래 기사')+
    row('',324,'2026.02.30 10:00','잘못된 발행일')+row('adsbygoogle-li',325,'2026.11.19 10:00','광고')+'</ul>';
  const items=await parseGameMeca(html,publisher,new Date('2026-11-19T03:00:00Z'));
  assert.deepEqual(items.map(({title,url,publishedAt,description})=>[title,url,publishedAt,description]),[
    ['"오늘" 출시','https://www.gamemeca.com/view.php?gid=321','2026-11-19T02:00:00.000Z',''],
    ['지스타 새 소식','https://www.gamemeca.com/view.php?gid=322','2026-11-19T01:00:00.000Z',''],
  ]);
  await assert.rejects(()=>parseGameMeca('<html>접근 제한 화면</html>',publisher),/unsupported_feed/);
});

test('보드나라의 구형 한국어 인코딩을 바이트 경계에서도 올바르게 읽는다',async()=>{
  const publisher=FEEDS.find(source=>source.id==='bodnara');
  const encoder=new TextEncoder();
  const prefix=encoder.encode('<rss><channel><item><title>');
  const suffix=encoder.encode('</title><link>https://www.bodnara.co.kr/story</link><pubDate>'+now().toUTCString()+'</pubDate></item></channel></rss>');
  const stream=new ReadableStream({start(controller){controller.enqueue(prefix);controller.enqueue(Uint8Array.of(0xb0));controller.enqueue(Uint8Array.of(0xa1));controller.enqueue(suffix);controller.close();}});
  const [result]=await fetchFeed(publisher,async()=>new Response(stream));
  assert.equal(result.title,'가');
});

test('팔로우한 Steam 앱의 공지 경로만 수집한다',async()=>{
  const steam=steamNewsFeed('1091500');
  const articles=await parseFeed(rss(item('official','패치',now().toUTCString(),'https://store.steampowered.com/news/app/1091500/view/112')+
    item('other','관련 없음',now().toUTCString(),'https://store.steampowered.com/news/app/292030/view/111')),steam);
  assert.deepEqual(articles.map(article=>article.title),['패치']);
});

const article=(id,title,sourceUrl='https://publisher.test/',category='games',offset=0)=>({
  id,title,description:'',url:'https://publisher.test/'+id,sourceUrl,sourceName:sourceUrl,
  categories:[category],publishedAt:new Date(Date.now()-offset).toISOString(),
});
test('주제와 유형을 함께 맞추고 가까운 중복은 공식 원문 아래에 묶는다',()=>{
  const title='Cyberpunk 2077 patch 2.5 releases new enhancements';
  const candidates=[
    article('1',title),
    article('2',title,'https://store.steampowered.com/app/1091500/','games',10_000),
    article('3','Cyberpunk 2077 patch 2.6 releases new enhancements'),
    article('4','Cyberpunk 2077: a personal retrospective'),
    article('5','풋볼 매니저 새로운 패치 공개'),
    article('6','City fitness and team news','https://www.bbc.com/sport/football/teams/manchester-city','football'),
    article('7','Football Managers without the alias'),
    article('8','Different game launches on the same day as GTA 6'),
    article('9','GTA 6 has two graphics modes but no 60FPS option'),
  ];
  const ranked=rankNews(candidates,starterNewsTopics);
  assert.equal(ranked[0].id,'2');
  assert.equal(ranked[0].recommendation.official,true);
  assert.equal(ranked[0].recommendation.kind,'update');
  assert.equal(ranked[0].related[0].id,'1');
  assert.equal(ranked.find(a=>a.id==='9').recommendation.kind,'performance');
  assert.deepEqual(ranked.map(a=>a.id).sort(),['2','3','5','6','9']);
  assert.deepEqual(rankNews(candidates,starterNewsTopics.map(topic=>topic.id==='cyberpunk'?{...topic,muted:true}:topic)).map(a=>a.id).sort(),['5','6','9']);
});

test('넓은 분야를 덜 봐도 구체적으로 팔로우한 모델 소식은 표시한다',()=>{
  const broad={...starterNewsTopics.find(topic=>topic.id==='iem'),muted:true};
  const product={id:'van-gogh',label:'Van Gogh',terms:['Van Gogh'],category:'korean-audio',kinds:['availability'],muted:false};
  const candidates=[
    article('van','Noble Audio Van Gogh 국내 입고','https://www.schezade.co.kr/','korean-audio'),
    article('other','다른 오디오 장비 국내 입고','https://www.schezade.co.kr/','korean-audio'),
  ];
  const results=rankNews(candidates,[broad,product]);
  assert.deepEqual(results.map(a=>a.id),['van']);
  assert.equal(results[0].recommendation.topicId,product.id);
});

test('표현이 다른 성능 보도는 같은 기기·프레임·지원 여부일 때만 묶는다',()=>{
  const results=rankNews([
    article('a','Rockstar says the PS5 Pro is not powerful enough for 60 fps GTA 6','https://press-one.test/'),
    article('b','Even PlayStation 5 Pro cannot run GTA VI at 40FPS or 60FPS','https://press-two.test/'),
    article('c','GTA 6 runs at 60FPS on Xbox Series X','https://press-three.test/'),
    article('d','GTA 6 reaches 60FPS on PS5 Pro in a test','https://press-four.test/'),
  ],starterNewsTopics);
  assert.equal(results.length,3);
  const grouped=results.find(result=>result.related);
  assert.deepEqual([grouped.id,grouped.related[0].id].sort(),['a','b']);
});

test('관심 설정은 계정별 저장과 충돌 검증을 하고 전체 기사와 스크랩을 보존한다',async t=>{
  const {DB,req}=await setup(t);
  const release=new Date(Date.now()-1000).toUTCString();
  const more=async()=>new Response(rss(item('one','Football Manager 신규 패치',release)+item('two','FM27 업데이트',release)));
  await collectNews({DB},{leaseUntil:0},{feeds:[FEEDS.find(feed=>feed.id==='pcgamer')],fetcher:more});
  const interest=await (await req('/api/news?view=interest&limit=1')).json();
  assert.equal(interest.articles.length,1);
  assert.equal(interest.articles[0].recommendation.topicId,'fm');
  const next=await (await req('/api/news?view=interest&limit=1&cursor='+encodeURIComponent(interest.nextCursor))).json();
  assert.equal(next.articles.length,1);
  assert.notEqual(next.articles[0].id,interest.articles[0].id);
  const id=interest.articles[0].id;
  await req('/api/news/state',{method:'PATCH',body:JSON.stringify({id,field:'saved',value:true})});
  const write=topics=>({method:'PUT',body:JSON.stringify({revision:0,topics})});
  const preferences=interest.preferences.topics.map(topic=>topic.id==='fm'?{...topic,muted:true}:topic);
  assert.equal((await req('/api/news/preferences',write(preferences))).status,200);
  assert.equal((await req('/api/news/preferences',write(preferences))).status,200);
  assert.equal((await req('/api/news/preferences',write([]))).status,409);
  assert.equal((await req('/api/news/preferences',{...write([]),headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await req('/api/news/preferences',write([{...starterNewsTopics[0],steamAppId:'https://elsewhere.test/'}]))).status,400);
  assert.equal((await (await req('/api/news?view=interest')).json()).articles.length,0);
  assert.equal((await (await req('/api/news?view=interest',{},'other')).json()).articles.length,2);
  assert.equal((await (await req('/api/news?view=all&category=games')).json()).articles.some(a=>a.id===id),true);
  assert.equal((await (await req('/api/news?view=saved')).json()).articles[0].id,id);
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
