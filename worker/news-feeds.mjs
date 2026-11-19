import {XMLParser,XMLValidator} from 'fast-xml-parser';

function googleNewsPublisher(id,label,website,site,category,{section,sourceLabel=label,days=7}={}){
  const params=new URLSearchParams({q:'site:'+site+' when:'+days+'d',hl:'ko',gl:'KR',ceid:'KR:ko'});
  const host=new URL(website).hostname.replace(/^www\./,'');
  return {id,name:label+' · Google 뉴스',website,url:'https://news.google.com/rss/search?'+params,category,language:'ko',publisher:{label:sourceLabel,host,section}};
}

// Fixed public sources. Browser input cannot supply a fetch URL.
export const FEEDS=[
  {id:'audioplanet',name:'오디오플래닛',website:'https://audioplanet.kr/',url:'https://audioplanet.kr/feed/',category:'korean-audio',language:'ko'},
  {id:'yonhap',name:'연합뉴스',website:'https://www.yna.co.kr/',url:'https://www.yna.co.kr/rss/news.xml',category:'korea',language:'ko'},
  {id:'yonhap-world',name:'연합뉴스 · 국제',website:'https://www.yna.co.kr/international/all',url:'https://www.yna.co.kr/rss/international.xml',category:'world',language:'ko'},
  {id:'schezade',name:'셰에라자드',website:'https://www.schezade.co.kr/pagegen/v2/custom/launch-calendar/index.php',url:'https://www.schezade.co.kr/pagegen/v2/custom/launch-calendar/index.php',category:'korean-audio',language:'ko',format:'launch-calendar'},
  googleNewsPublisher('gamemeca','게임메카','https://www.gamemeca.com/news.php','www.gamemeca.com','games'),
  googleNewsPublisher('thisisgame-news','디스이즈게임','https://www.thisisgame.com/','thisisgame.com','games'),
  googleNewsPublisher('quasarzone-news','퀘이사존','https://quasarzone.com/bbs/qn_hardware','quasarzone.com/bbs/qn_hardware/views','pc-it',{section:'하드웨어 뉴스'}),
  {id:'inven',name:'인벤',website:'https://www.inven.co.kr/webzine/news/',url:'https://feeds.feedburner.com/inven',category:'games',language:'ko'},
  {id:'gamedonga',name:'게임동아',website:'https://game.donga.com/',url:'https://game.donga.com/feeds/rss/news/',category:'games',language:'ko'},
  {id:'bodnara',name:'보드나라',website:'https://www.bodnara.co.kr/',url:'https://www.bodnara.co.kr/rss/rss_pc.xml',category:'pc-it',language:'ko',encoding:'euc-kr'},
  {id:'itdonga',name:'IT동아',website:'https://it.donga.com/',url:'https://it.donga.com/feeds/rss/news/',category:'pc-it',language:'ko'},
  {id:'0db',name:'영디비 · 오디오 뉴스',website:'https://www.0db.co.kr/NEWS',url:'https://www.0db.co.kr/NEWS/rss',category:'audio-music',language:'ko',
    scope:/이어폰|헤드폰|헤드셋|스피커|오디오|이어팁|앰프|음향|\b(?:iem|dac|dap|headphones?|earbuds?|earphones?|speakers?)\b/iu},
  {id:'tonplein',name:'온음',website:'https://www.tonplein.com/',url:'https://www.tonplein.com/feed/',category:'music',language:'ko'},
  {id:'weiv',name:'웨이브 [weiv]',website:'https://www.weiv.co.kr/',url:'https://www.weiv.co.kr/feed',category:'music',language:'ko'},
  {id:'visla',name:'VISLA · 음악',website:'https://visla.kr/',url:'https://visla.kr/category/article/music/feed/',category:'music',language:'ko'},
  {id:'cineplay',name:'씨네플레이',website:'https://www.cineplay.co.kr/',url:'https://www.cineplay.co.kr/rss/category/code/S1N8',category:'screen',language:'ko'},
  {id:'moviepress',name:'무비프레스',website:'https://moviepress.kr/',url:'https://moviepress.kr/rss/ko-kr.xml',category:'screen',language:'ko'},
  {id:'extmovie',name:'익스트림무비 · 영화수다',website:'https://extmovie.com/movietalk',url:'https://extmovie.com/movietalk/rss',category:'screen',language:'ko',
    scope:/개봉|공개|예고편|상영|박스오피스|영화제|감독|인터뷰|속편|제작|넷플릭스|OTT/iu},
  {id:'webtoonguide',name:'웹툰가이드',website:'https://www.webtoonguide.com/ko/board/news-column',url:'https://www.webtoonguide.com/ko/board/news-column',category:'webtoon',language:'ko',format:'webtoon-news'},
  {id:'footballist',name:'풋볼리스트',website:'https://www.footballist.co.kr/',url:'https://www.footballist.co.kr/rss/allArticle.xml',category:'football',language:'ko'},
  {id:'fourfourtwo',name:'포포투 코리아',website:'https://www.fourfourtwo.co.kr/',url:'https://www.fourfourtwo.co.kr/rss/allArticle.xml',category:'football',language:'ko'},
  googleNewsPublisher('city-ko','맨체스터 시티 한국어','https://kr.mancity.com/news','kr.mancity.com/news','football',{sourceLabel:'Manchester City FC',days:14}),
];
export function steamNewsFeed(appId) {
  return { id:'steam-' + appId, name:'Steam 공식', website:'https://store.steampowered.com/app/' + appId + '/',
    url:'https://store.steampowered.com/feeds/news/app/' + appId + '/?l=koreana', category:'games', language:'ko', appId, limit:15 };
}
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:true,processEntities:true,htmlEntities:true,isArray:name=>name==='item'||name==='entry'});
export function plainText(value,max=240){
  if(value&&typeof value==='object')value=value['#text']??'';
  return String(value??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):' ').replace(/&(amp|lt|gt|quot|apos);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x])).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
export function canonicalUrl(value,base){
  try{
    if(typeof value!=='string'||!value.trim())return null;
    const url=new URL(value,base);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>3000)return null;
    if(url.hostname==='localhost'||/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname)||url.hostname==='[::1]')return null;
    url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||['fbclid','gclid','mc_cid','mc_eid'].includes(key))url.searchParams.delete(key);
    url.searchParams.sort();return url.href;
  }catch{return null;}
}
function atomLink(value){const links=Array.isArray(value)?value:[value];const item=links.find(x=>x&&typeof x==='object'&&(!x['@_rel']||x['@_rel']==='alternate'));return item?.['@_href']??(typeof value==='string'?value:'');}
async function asArticle(feed,title,url,description,published){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));
  const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  return {id,title,url,sourceName:feed.name,sourceUrl:feed.website,description,publishedAt:published.toISOString(),categories:[feed.category],language:feed.language};
}

export function hasKoreanText(title, description=''){
  const korean=/[가-힣]/g;
  const titleCount=title.match(korean)?.length??0;
  const introCount=description.match(korean)?.length??0;
  const titleLetters=title.match(/\p{L}/gu)?.length??0;
  return (titleCount>=3&&titleCount*5>=titleLetters)||(introCount>=8&&introCount*4>=description.length);
}

function isVideoLink(url){
  return ['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(new URL(url).hostname);
}

function syndicatedTitle(item,url,publisher){
  if(!url||!item.source||plainText(item.source,100)!==publisher.label)return '';
  const source=canonicalUrl(item.source['@_url']);
  if(!source)return '';
  const sourceHost=new URL(source).hostname;
  const link=new URL(url);
  if((sourceHost!==publisher.host&&sourceHost!=='www.'+publisher.host)||
    link.origin!=='https://news.google.com'||!link.pathname.startsWith('/rss/articles/'))return '';
  const title=plainText(item.title,420);
  const suffix=(publisher.section?' > '+publisher.section:'')+' - '+publisher.label;
  if(title.endsWith(suffix))return title.slice(0,-suffix.length).trim().slice(0,300);
  return publisher.section?'':title.slice(0,300);
}
export async function parseFeed(xml,feed,now=new Date()){
  if(typeof xml!=='string'||xml.length>1500000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('invalid_feed');
  if(XMLValidator.validate(xml)!==true)throw new Error('invalid_xml');
  const parsed=parser.parse(xml);const items=parsed.rss?.channel?.item??parsed.feed?.entry;
  if(!Array.isArray(items))throw new Error('unsupported_feed');
  const articles=[];const seen=new Set();
  for(const item of items.slice(0,150)){
    const url=canonicalUrl(typeof item.link==='string'?item.link:atomLink(item.link),feed.website);
    const title=feed.publisher?syndicatedTitle(item,url,feed.publisher):plainText(item.title,300);
    const published=new Date(item.pubDate??item.published??item.updated??item['dc:date']??'');
    if(!title||!url||isVideoLink(url)||!Number.isFinite(published.getTime())||published>new Date(now.getTime()+24*3600000)||published<new Date(now.getTime()-90*86400000)||seen.has(url))continue;
    if(feed.appId){
      const articleUrl=new URL(url);
      if(articleUrl.origin!=='https://store.steampowered.com'||!articleUrl.pathname.startsWith('/news/app/'+feed.appId+'/view/'))continue;
    }
    const rawDescription=feed.publisher?'':item.description??item.summary??'';
    let description=plainText(rawDescription,240).replace(/\s*The post\s[\s\S]*$/i,'').trim();
    if(description===title||description.startsWith('The post '))description='';
    if(feed.language!=='ko'||!hasKoreanText(title,description)||(feed.scope&&!feed.scope.test(title+' '+description)))continue;
    seen.add(url);
    articles.push(await asArticle(feed,title,url,description,published));
  }
  return articles.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,feed.limit??12);
}

export async function parseWebtoonNews(html,feed,now=new Date()){
  const entries=html.matchAll(/<a href="(\/ko\/board\/news-column\/\d+)">\s*<div class="article-item">([\s\S]*?)<\/a>/g);
  const seen=new Set(),articles=[];
  for(const [,href,entry] of entries){
    const title=plainText(entry.match(/<div class="title">([\s\S]*?)<\/div>/)?.[1],300);
    const day=entry.match(/<div class="writer">[^<]*\|\s*(\d{4}-\d{2}-\d{2})\s*<\/div>/)?.[1];
    if(!day||!hasKoreanText(title)||seen.has(href))continue;
    const published=new Date(day+'T00:00:00+09:00');
    if(!Number.isFinite(published.getTime())||published>now||published.getTime()<now.getTime()-90*86_400_000||
      new Date(published.getTime()+32_400_000).toISOString().slice(0,10)!==day)continue;
    seen.add(href);
    articles.push(await asArticle(feed,title,new URL(href,feed.website).href,'',published));
  }
  if(!articles.length)throw new Error('unsupported_feed');
  return articles.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,12);
}

export async function parseLaunchCalendar(html,feed,now=new Date()){
  const articles=[];
  const cards=[...html.matchAll(/<article class="lcc" data-pg-product-gid="(\d+)">([\s\S]*?)<\/article>/g)];
  for(const [,id,card] of cards.slice(0,80)){
    const brand=plainText(card.match(/<div class="lcc__brand">([^<]+)<\/div>/)?.[1],80);
    const name=plainText(card.match(/<a [^>]+ class="lcc__name">([^<]+)<\/a>/)?.[1],140);
    const date=card.match(/<div class="lcc__date">출시 <b>(\d{4})\.(\d{2})\.(\d{2}) (\d{2}:\d{2})<\/b>/);
    if(!name||!date)continue;
    const [,year,month,day,time]=date;
    const published=new Date(year+'-'+month+'-'+day+'T'+time+':00+09:00');
    if(!Number.isFinite(published.getTime())||published>now||published.getTime()<now.getTime()-90*86_400_000)continue;
    const price=plainText(card.match(/<div class="lcc__price">([^<]+)<\/div>/)?.[1],60);
    const audition=card.includes('>청음가능</span>');
    const description=['셰에라자드 런칭 캘린더 등록',price,audition&&'청음 가능'].filter(Boolean).join(' · ');
    const url=new URL('/goods/g_detail.html?gid='+id,feed.website).href;
    articles.push(await asArticle(feed,[brand,name,'국내 출시'].filter(Boolean).join(' '),url,description,published));
  }
  if(!cards.length||(!articles.length&&!html.includes('lcc__date')))throw new Error('unsupported_feed');
  return articles.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,20);
}

export async function fetchFeed(feed,fetcher=fetch,now=new Date()){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),feed.publisher?6500:12000);
  try{
    const allowedHosts=new Set([new URL(feed.url).hostname]);
    if(!feed.publisher)allowedHosts.add(new URL(feed.website).hostname);
    let target=feed.url,response;
    for(let hop=0;hop<3;hop++){
      response=await fetcher(target,{headers:{Accept:feed.format?'text/html':'application/rss+xml, application/atom+xml, application/xml, text/xml'},signal:controller.signal,redirect:'manual'});
      if(response.status<300||response.status>=400)break;
      const location=response.headers.get('Location');if(!location)throw new Error('invalid_redirect');
      const next=new URL(location,target);
      if(next.protocol!=='https:'||next.username||next.password||!allowedHosts.has(next.hostname))throw new Error('invalid_redirect');
      await response.body?.cancel();target=next.href;
      if(hop===2)throw new Error('redirect_limit');
    }
    if(!response?.ok)throw new Error(`http_${response?.status??0}`);
    if(Number(response.headers.get('content-length'))>1500000)throw new Error('feed_too_large');
    const reader=response.body?.getReader();if(!reader)throw new Error('empty_feed');
    const decoder=new TextDecoder(feed.encoding);let body='';let bytes=0;
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1500000){await reader.cancel();throw new Error('feed_too_large');}body+=decoder.decode(value,{stream:true});}
    body+=decoder.decode();
    const parse=feed.format==='launch-calendar'?parseLaunchCalendar:feed.format==='webtoon-news'?parseWebtoonNews:parseFeed;
    return await parse(body,feed,now);
  }finally{clearTimeout(timer);}
}
