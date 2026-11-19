import {XMLParser,XMLValidator} from 'fast-xml-parser';

// Public publisher feeds only. Browser input cannot supply a fetch URL.
export const FEEDS=[
  {id:'headfonia',name:'Headfonia',website:'https://www.headfonia.com/',url:'https://www.headfonia.com/feed/',category:'audio-music',language:'en'},
  {id:'pitchfork',name:'Pitchfork',website:'https://pitchfork.com/',url:'https://pitchfork.com/feed/feed-news/rss',category:'music',language:'en'},
  {id:'pcgamer',name:'PC Gamer',website:'https://www.pcgamer.com/',url:'https://www.pcgamer.com/rss/',category:'games',language:'en'},
  {id:'ars',name:'Ars Technica',website:'https://arstechnica.com/',url:'https://feeds.arstechnica.com/arstechnica/index',category:'pc-it',language:'en'},
  {id:'audioplanet',name:'오디오플래닛',website:'https://audioplanet.kr/',url:'https://audioplanet.kr/feed/',category:'korean-audio',language:'ko'},
  {id:'yonhap',name:'연합뉴스',website:'https://www.yna.co.kr/',url:'https://www.yna.co.kr/rss/news.xml',category:'korea',language:'ko'},
  {id:'bbc',name:'BBC News',website:'https://www.bbc.com/news',url:'https://feeds.bbci.co.uk/news/world/rss.xml',category:'world',language:'en'},
  {id:'eurogamer',name:'Eurogamer',website:'https://www.eurogamer.net/',url:'https://www.eurogamer.net/feed',category:'games',language:'en'},
  {id:'vgc',name:'VGC',website:'https://www.videogameschronicle.com/',url:'https://www.videogameschronicle.com/feed/',category:'games',language:'en'},
  {id:'majorhifi',name:'MajorHiFi',website:'https://majorhifi.com/',url:'https://majorhifi.com/feed/',category:'audio-music',language:'en'},
  {id:'bandcamp',name:'Bandcamp Daily',website:'https://daily.bandcamp.com/',url:'https://daily.bandcamp.com/feed',category:'music',language:'en'},
  {id:'verge',name:'The Verge',website:'https://www.theverge.com/',url:'https://www.theverge.com/rss/index.xml',category:'pc-it',language:'en'},
  {id:'bbc-city',name:'BBC Sport · 맨시티',website:'https://www.bbc.com/sport/football/teams/manchester-city',url:'https://feeds.bbci.co.uk/sport/football/teams/manchester-city/rss.xml',category:'football',language:'en',limit:20},
  {id:'schezade',name:'셰에라자드',website:'https://www.schezade.co.kr/pagegen/v2/custom/launch-calendar/index.php',url:'https://www.schezade.co.kr/pagegen/v2/custom/launch-calendar/index.php',category:'korean-audio',language:'ko',format:'launch-calendar'},
];
export function steamNewsFeed(appId) {
  return { id:'steam-' + appId, name:'Steam 공식', website:'https://store.steampowered.com/app/' + appId + '/',
    url:'https://store.steampowered.com/feeds/news/app/' + appId + '/', category:'games', language:'en', appId, limit:15 };
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
export async function parseFeed(xml,feed,now=new Date()){
  if(typeof xml!=='string'||xml.length>1500000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('invalid_feed');
  if(XMLValidator.validate(xml)!==true)throw new Error('invalid_xml');
  const parsed=parser.parse(xml);const items=parsed.rss?.channel?.item??parsed.feed?.entry;
  if(!Array.isArray(items))throw new Error('unsupported_feed');
  const articles=[];const seen=new Set();
  for(const item of items.slice(0,150)){
    const title=plainText(item.title,300),url=canonicalUrl(typeof item.link==='string'?item.link:atomLink(item.link),feed.website);
    const published=new Date(item.pubDate??item.published??item.updated??item['dc:date']??'');
    if(!title||!url||!Number.isFinite(published.getTime())||published>new Date(now.getTime()+24*3600000)||published<new Date(now.getTime()-90*86400000)||seen.has(url))continue;
    if(feed.appId){
      const articleUrl=new URL(url);
      if(articleUrl.origin!=='https://store.steampowered.com'||!articleUrl.pathname.startsWith('/news/app/'+feed.appId+'/view/'))continue;
    }
    seen.add(url);
    const rawDescription=item.description??item.summary??'';
    let description=plainText(rawDescription,240).replace(/\s*The post\s[\s\S]*$/i,'').trim();
    if(description===title||description.startsWith('The post '))description='';
    articles.push(await asArticle(feed,title,url,description,published));
  }
  return articles.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,feed.limit??12);
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
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const allowedHosts=new Set([new URL(feed.url).hostname,new URL(feed.website).hostname]);
    let target=feed.url,response;
    for(let hop=0;hop<3;hop++){
      response=await fetcher(target,{headers:{Accept:feed.format==='launch-calendar'?'text/html':'application/rss+xml, application/atom+xml, application/xml, text/xml'},signal:controller.signal,redirect:'manual'});
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
    const decoder=new TextDecoder();let xml='';let bytes=0;
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1500000){await reader.cancel();throw new Error('feed_too_large');}xml+=decoder.decode(value,{stream:true});}
    xml+=decoder.decode();
    return feed.format==='launch-calendar'?await parseLaunchCalendar(xml,feed,now):await parseFeed(xml,feed,now);
  }finally{clearTimeout(timer);}
}
