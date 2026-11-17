import {musicDate,validateAlbum} from '../src/lib/music.ts';
const USER_AGENT='WoongHub/0.7 (personal album collection; https://github.com/chw7244-maker/WOONG-HUB)';
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff',...extra}});
let nextSearchAt=0;
const claim=now=>{if(now<nextSearchAt)return false;nextSearchAt=now+1100;return true;};
const plain=(v,max)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';
export function albumQuery(album,artist=''){
  if(typeof album!=='string'||typeof artist!=='string')throw new Error('invalid_query');
  const title=album.trim().replace(/\s+/g,' '),name=artist.trim().replace(/\s+/g,' ');
  if(!title.length||(title.length<2&&name.length<2)||title.length>120||name.length>120||/[\u0000-\u001f\u007f]/.test(album+artist))throw new Error('invalid_query');
  const escape=value=>Array.from(value).map(c=>'+-!(){}[]^"~*?:\\/|&'.includes(c)?'\\'+c:c).join('');
  return {album:title,artist:name,query:`releasegroup:"${escape(title)}"${name?` AND artist:"${escape(name)}"`:''}`};
}
export function albumResults(body,now=new Date()){
  if(!body||!Array.isArray(body['release-groups']))throw new Error('invalid_response');
  const result=[],ids=new Set();
  for(const row of body['release-groups'].slice(0,50))try{
    const id=String(row.id??'').toLowerCase(),artist=(Array.isArray(row['artist-credit'])?row['artist-credit']:[]).map(c=>[plain(c.name??c.artist?.name,200),plain(c.joinphrase,30)].filter(Boolean).join(' ')).join(' ').replace(/\s+/g,' ').trim().slice(0,200),date=plain(row['first-release-date'],10);
    const album=validateAlbum({id,title:plain(row.title,200),artist,firstReleaseDate:date&&musicDate(date,true)?date:'',type:plain(row['primary-type'],50),sourceUrl:`https://musicbrainz.org/release-group/${id}`,coverUrl:`https://coverartarchive.org/release-group/${id}/front-250`,checkedAt:now.toISOString()});
    if(!ids.has(id)){result.push(album);ids.add(id);}if(result.length===8)break;
  }catch{}
  if(body['release-groups'].length&&!result.length)throw new Error('invalid_response');
  return result;
}
async function readJson(response){
  if(Number(response.headers.get('Content-Length'))>1500000){await response.body?.cancel();throw new Error('too_large');}
  if(!response.headers.get('Content-Type')?.includes('json'))throw new Error('invalid_response');const reader=response.body?.getReader();if(!reader)throw new Error('invalid_response');let size=0,text='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();throw new Error('too_large');}text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());
}
export async function handleAlbums(request,env,ctx,{fetcher=fetch,cache=globalThis.caches?.default,throttle=claim,clock=Date.now}={}){
  const user=request.headers.get('oai-authenticated-user-id');if(!user||user.length>200)return json({error:'authentication_required'},401);if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  let query;try{const p=new URL(request.url).searchParams;query=albumQuery(p.get('album')??'',p.get('artist')??'');}catch{return json({error:'invalid_query'},400);}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([query.album.toLowerCase(),query.artist.toLowerCase()]))))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const cacheKey=new Request(new URL('/__metadata/albums-v1/'+hash,request.url).href);
  try{const hit=await cache?.match(cacheKey);if(hit?.ok){const value=await hit.json();if(Array.isArray(value)&&value.length<=8)return json({albums:value.map(validateAlbum),cached:true});}}catch{}
  if(!throttle(clock()))return json({error:'search_too_fast'},429,{'Retry-After':'2'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetcher(`https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query.query)}&fmt=json&limit=8`,{headers:{Accept:'application/json','User-Agent':USER_AGENT},redirect:'manual',signal:controller.signal});
    if(!response.ok){await response.body?.cancel();return json({error:'catalog_unavailable'},[429,503].includes(response.status)?503:502);}
    const albums=albumResults(await readJson(response),new Date(clock()));
    if(cache)try{const put=Promise.resolve(cache.put(cacheKey,Response.json(albums,{headers:{'Cache-Control':'public, max-age=86400'}}))).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(put);else await put;}catch{}
    return json({albums,cached:false});
  }catch{return json({error:'catalog_unavailable'},502);}finally{clearTimeout(timer);}
}
