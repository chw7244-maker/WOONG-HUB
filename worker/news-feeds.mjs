import {XMLParser,XMLValidator} from 'fast-xml-parser';

// Public publisher feeds only. Browser input cannot supply a fetch URL.
export const FEEDS=[
  {id:'headfonia',name:'Headfonia',website:'https://www.headfonia.com/',url:'https://www.headfonia.com/feed/',category:'audio-music',language:'en'},
  {id:'pitchfork',name:'Pitchfork',website:'https://pitchfork.com/',url:'https://pitchfork.com/feed/feed-news/rss',category:'audio-music',language:'en'},
  {id:'pcgamer',name:'PC Gamer',website:'https://www.pcgamer.com/',url:'https://www.pcgamer.com/rss/',category:'games',language:'en'},
  {id:'ars',name:'Ars Technica',website:'https://arstechnica.com/',url:'https://feeds.arstechnica.com/arstechnica/index',category:'pc-it',language:'en'},
  {id:'audioplanet',name:'오디오플래닛',website:'https://audioplanet.kr/',url:'https://audioplanet.kr/feed/',category:'korean-audio',language:'ko'},
  {id:'yonhap',name:'연합뉴스',website:'https://www.yna.co.kr/',url:'https://www.yna.co.kr/rss/news.xml',category:'korea',language:'ko'},
  {id:'bbc',name:'BBC News',website:'https://www.bbc.com/news',url:'https://feeds.bbci.co.uk/news/world/rss.xml',category:'world',language:'en'},
];
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
    seen.add(url);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url));
    const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const rawDescription=item.description??item.summary??'';
    let description=plainText(rawDescription,240).replace(/\s*The post\s[\s\S]*$/i,'').trim();
    if(description===title||description.startsWith('The post '))description='';
    articles.push({id,title,url,sourceName:feed.name,sourceUrl:feed.website,description,publishedAt:published.toISOString(),categories:[feed.category],language:feed.language});
  }
  return articles.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,4);
}
export async function fetchFeed(feed,fetcher=fetch,now=new Date()){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const allowedHosts=new Set([new URL(feed.url).hostname,new URL(feed.website).hostname]);
    let target=feed.url,response;
    for(let hop=0;hop<3;hop++){
      response=await fetcher(target,{headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml'},signal:controller.signal,redirect:'manual'});
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
    xml+=decoder.decode();return await parseFeed(xml,feed,now);
  }finally{clearTimeout(timer);}
}
