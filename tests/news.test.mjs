import test from 'node:test';
import assert from 'node:assert/strict';
import {FEEDS,parseFeed,canonicalUrl,fetchFeed,parseLaunchCalendar,parseWebtoonNews,steamNewsFeed} from '../worker/news-feeds.mjs';
import {claimNewsSync,collectNews,handleNews} from '../worker/news.mjs';
import {rankNews} from '../worker/news-interests.mjs';
import {starterNewsTopics} from '../src/lib/news.ts';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';

const now=()=>new Date();
const feed=FEEDS[0];
const feeds=FEEDS.filter(source=>!source.format&&!source.publisher&&!source.scope&&!source.encoding);
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
  assert.equal(articles.length,1);assert.equal(articles[0].url,'https://publisher.test/a?id=1');assert.equal(articles[0].description,'테스트 전용 소개 본문');assert.equal(articles[0].id.length,64);assert.deepEqual(articles[0].categories,['korean-audio']);
});
test('Atom, 상대 링크, 중복 URL을 처리한다',async()=>{
  const xml=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom 테스트</title><link rel="alternate" href="/atom"/><updated>${now().toISOString()}</updated><summary>짧은 소개</summary></entry></feed>`;
  assert.equal((await parseFeed(xml,feed))[0].url,'https://audioplanet.kr/atom');
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
  assert.equal((await (await req('/api/news?q=inven')).json()).articles.length,1);
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

test('게임메카 공식 RSS는 한국어 기사와 발행일, 원문 링크를 가져온다',async()=>{
  const meca=FEEDS.find(source=>source.id==='gamemeca');
  const published=now();
  const directUrl='https://www.gamemeca.com/view.php?gid=123456';
  const feedXml=rss(item('meca','새로운 국산 게임 출시',published.toUTCString(),directUrl)+
    item('old','오래된 게임 출시','Mon, 01 Jan 2001 12:00:00 +0900',directUrl+'7')+
    item('english','English game update',published.toUTCString(),directUrl+'8').replace('테스트 전용 소개 <b>본문</b>','English-only description'));
  const results=await fetchFeed(meca,async url=>{
    assert.equal(url,'https://www.gamemeca.com/rss.php');
    return new Response(feedXml);
  },published);
  assert.deepEqual(results.map(({title,url,sourceName,publishedAt})=>[title,url,sourceName,publishedAt]),
    [['새로운 국산 게임 출시',directUrl,'게임메카',new Date(published.toUTCString()).toISOString()]]);
});

test('Google 뉴스는 지정한 매체·게시판에 속한 기사 제목과 배포 링크만 가져온다',async()=>{
  const tig=FEEDS.find(source=>source.id==='thisisgame-news');
  const quasar=FEEDS.find(source=>source.id==='quasarzone-news');
  const google='https://news.google.com/rss/articles/';
  const published=now().toUTCString();
  const row=(title,link,host,label)=>item('source',title,published,link).replace('</item>','<source url="https://'+host+'">'+label+'</source></item>');
  const tigRows=row('지스타 새 소식 - 디스이즈게임',google+'01','www.thisisgame.com','디스이즈게임')+
    row('다른 매체 기사 - 디스이즈게임',google+'02','outside.example','디스이즈게임')+
    row('이름이 다른 항목',google+'03','www.thisisgame.com','다른 매체')+
    row('다른 링크','https://outside.example/news','www.thisisgame.com','디스이즈게임');
  const results=await parseFeed(rss(tigRows),tig);
  assert.deepEqual(results.map(({title,url,description})=>[title,url,description]),[['지스타 새 소식',google+'01','']]);
  const quasarRows=row('GPU 성능 소식 > 하드웨어 뉴스 - 퀘이사존',google+'11','quasarzone.com','퀘이사존')+
    row('장착하기 > 질문 게시판 - 퀘이사존',google+'12','quasarzone.com','퀘이사존');
  assert.deepEqual((await parseFeed(rss(quasarRows),quasar)).map(article=>article.title),['GPU 성능 소식']);
});

test('Google 뉴스 동시 요청을 두 개로 제한하고 일부 실패 후에도 다음 매체를 확인한다',async t=>{
  const {DB}=await setup(t);
  const googleFeeds=FEEDS.filter(source=>source.publisher);
  let outstanding=0, maxOutstanding=0;
  const fetcher=async url=>{
    const feed=googleFeeds.find(source=>source.url===url);
    maxOutstanding=Math.max(maxOutstanding,++outstanding);
    await Promise.resolve();
    outstanding--;
    if(feed.id==='thisisgame-news')return new Response('unavailable',{status:503});
    const suffix=feed.publisher.section?' > '+feed.publisher.section:'';
    const rssItem=item(feed.id,'감독과 함께 신제품 헤드폰 공개'+suffix+' - '+feed.publisher.label,now().toUTCString(),'https://news.google.com/rss/articles/'+feed.id)
      .replace('</item>','<source url="https://'+feed.publisher.host+'">'+feed.publisher.label+'</source></item>');
    return new Response(rss(rssItem));
  };
  const result=await collectNews({DB},{leaseUntil:0},{feeds:googleFeeds,fetcher});
  assert.equal(maxOutstanding,2);
  assert.equal(result.count,googleFeeds.length-1);
  assert.equal(result.sources.find(source=>source.id==='thisisgame-news').error,'http_503');
});

test('일반 출처가 많아도 요청 수를 제한하고 전체 결과를 저장한다',async t=>{
  const {DB,fetcher}=await setup(t);
  let active=0,peak=0;
  const limited=async url=>{
    peak=Math.max(peak,++active);
    await Promise.resolve();
    try{return await fetcher(url);}
    finally{active--;}
  };
  const result=await collectNews({DB},{leaseUntil:0},{feeds,fetcher:limited});
  assert.equal(peak,3);
  assert.equal(result.count,feeds.length);
});

test('보드나라의 구형 한국어 인코딩을 바이트 경계에서도 올바르게 읽는다',async()=>{
  const publisher=FEEDS.find(source=>source.id==='bodnara');
  const encoder=new TextEncoder();
  const prefix=encoder.encode('<rss><channel><item><title>');
  const suffix=encoder.encode('</title><link>https://www.bodnara.co.kr/story</link><pubDate>'+now().toUTCString()+'</pubDate></item></channel></rss>');
  const stream=new ReadableStream({start(controller){controller.enqueue(prefix);controller.enqueue(Uint8Array.of(0xb0));controller.enqueue(Uint8Array.of(0xa1,0xb0,0xa1,0xb0,0xa1));controller.enqueue(suffix);controller.close();}});
  const [result]=await fetchFeed(publisher,async()=>new Response(stream));
  assert.equal(result.title,'가가가');
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
    article('6','선수단 부상과 훈련 복귀 소식','https://kr.mancity.com/news','football'),
    article('7','Football Managers without the alias'),
    article('8','Different game launches on the same day as GTA 6'),
    article('9','GTA 6 has two graphics modes but no 60FPS option'),
  ];
  const ranked=rankNews(candidates,starterNewsTopics);
  const official=ranked.find(article=>article.id==='2');
  assert.equal(official.recommendation.official,true);
  assert.equal(official.recommendation.kind,'update');
  assert.equal(official.related[0].id,'1');
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
  await collectNews({DB},{leaseUntil:0},{feeds:[FEEDS.find(feed=>feed.id==='inven')],fetcher:more});
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

test('선언된 언어가 한국어여도 영어 본문과 유튜브 링크를 수집하지 않는다',async()=>{
  const row=(id,title,description,link)=>'<item><title>'+title+'</title><link>'+link+'</link><pubDate>'+now().toUTCString()+
    '</pubDate><description>'+description+'</description></item>';
  const incoming=rss(
    row('en','English PlayStation announcement','The publisher shared an update that is available today.','https://publisher.test/en')+
    row('ko','The Witcher','위쳐 신규 확장팩이 오는 가을 정식 출시된다는 소식이다.','https://publisher.test/ko')+
    row('video','한국어 공식 공개 영상','국내 소식을 소개합니다.','https://www.youtube.com/watch?v=123')+
    row('label','English update notification KR','Korean games 소식','https://publisher.test/label'));
  assert.deepEqual((await parseFeed(incoming,feed)).map(article=>article.url),['https://publisher.test/ko']);
  assert.deepEqual(await parseFeed(incoming,{...feed,language:'en'}),[]);
});

test('웹툰 뉴스 목록은 제목·발행일·게시물 링크를 사용하고 표시된 날짜를 넘겨다보지 않는다',async()=>{
  const source=FEEDS.find(feed=>feed.id==='webtoonguide');
  const entry=(id,title,date)=>'<a href="/ko/board/news-column/'+id+'"><div class="article-item"><div class="title">'+
    title+'</div><div class="writer">기자 | '+date+'</div></div></a>';
  const html=entry('11','신작 웹툰 연재 공개','2026-11-19')+entry('11','같은 소식','2026-11-19')+
    entry('12','다음 날 기사','2026-11-20')+entry('13','잘못된 날짜가 있는 기사','2026-11-31');
  const result=await parseWebtoonNews(html,source,new Date('2026-11-19T03:00:00Z'));
  assert.deepEqual(result.map(({title,url,publishedAt,description})=>[title,url,publishedAt,description]),[
    ['신작 웹툰 연재 공개','https://www.webtoonguide.com/ko/board/news-column/11','2026-11-18T15:00:00.000Z',''],
  ]);
});

test('최신 뉴스와 관심 뉴스는 예전 영어 기사와 영상의 노출을 제외하고 스크랩은 보관한다',async t=>{
  const {DB,req}=await setup(t);
  const insert=DB.prepare('INSERT INTO news_articles (id,title,url,source_name,source_url,description,published_at,first_seen_at,last_seen_at,categories,language) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const stamp=now().toISOString();
  const english='a'.repeat(64),video='b'.repeat(64);
  await insert.bind(english,'Football Manager patch 2.0','https://publisher.test/old','Press','https://publisher.test/','',stamp,stamp,stamp,'["games"]','en').run();
  await insert.bind(video,'풋볼 매니저 공식 영상 공개','https://www.youtube.com/watch?v=456','게임 매체 · 공식 영상','https://www.youtube.com/@games','',stamp,stamp,stamp,'["games"]','ko').run();
  for(const id of [english,video])await req('/api/news/state',{method:'PATCH',body:JSON.stringify({id,field:'saved',value:true})});
  for(const view of ['all','interest','unread']){
    const page=await (await req('/api/news?view='+view)).json();
    assert.equal(page.articles.some(article=>[english,video].includes(article.id)),false);
    assert.equal(page.counts.all,feeds.length);
    assert.equal(page.counts.saved,2);
  }
  assert.equal((await (await req('/api/news?view=saved')).json()).articles.length,2);
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
