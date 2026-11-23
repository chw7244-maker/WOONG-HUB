import {steamAppId,steamImageUrl,validateSteam} from '../src/lib/games.ts';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
const text=(value,max)=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,x)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[x])).replace(/\s+/g,' ').trim().slice(0,max);
const list=values=>Array.isArray(values)?values.map(v=>text(v,120)).filter(Boolean).slice(0,12):[];
export function steamMetadata(body,appId,now=new Date()){
  const payload=body?.[appId];if(payload?.success!==true)throw new Error('not_found');const d=payload.data;
  if(!d||d.steam_appid!==appId||!['game','dlc'].includes(d.type)||typeof d.name!=='string'||!d.name.trim())throw new Error('invalid_metadata');
  return validateSteam({appId,name:text(d.name,200),developers:list(d.developers),publishers:list(d.publishers),genres:list(d.genres?.map(g=>g.description)),releaseDate:text(d.release_date?.date,100),comingSoon:d.release_date?.coming_soon===true,description:text(d.short_description,450),storeUrl:`https://store.steampowered.com/app/${appId}/`,imageUrl:steamImageUrl(d.header_image,appId),checkedAt:now.toISOString()});
}
async function readJson(response){if(Number(response.headers.get('Content-Length'))>1500000)throw new Error('too_large');if(!response.headers.get('Content-Type')?.includes('json'))throw new Error('invalid_response');const reader=response.body?.getReader();if(!reader)throw new Error('invalid_response');let size=0,body='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();throw new Error('too_large');}body+=decoder.decode(value,{stream:true});}return JSON.parse(body+decoder.decode());}
export async function handleSteam(request,env,ctx,{fetcher=fetch,cache=globalThis.caches?.default}={}){
  const user=request.headers.get('oai-authenticated-user-id');if(!user||user.length>200)return json({error:'authentication_required'},401);
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  const input=new URL(request.url).searchParams.get('appId')??'',id=steamAppId(input);if(id===null||!/^\d+$/.test(input))return json({error:'invalid_app_id'},400);
  const cacheKey=new Request(new URL(`/__metadata/steam-v1/${id}`,request.url).href);
  try{const hit=await cache?.match(cacheKey);if(hit?.ok){const game=validateSteam(await hit.json());if(game.appId===id)return json({game,cached:true});}}catch{}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetcher(`https://store.steampowered.com/api/appdetails?appids=${id}&l=koreana&cc=kr`,{headers:{Accept:'application/json'},redirect:'manual',signal:controller.signal});
    if(!response.ok){await response.body?.cancel();return json({error:'steam_unavailable'},response.status===429?503:502);}
    const game=steamMetadata(await readJson(response),id);
    if(cache)try{const put=Promise.resolve(cache.put(cacheKey,Response.json(game,{headers:{'Cache-Control':'public, max-age=86400'}}))).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(put);else await put;}catch{}
    return json({game,cached:false});
  }catch(e){return json({error:e?.message==='not_found'?'game_not_found':'steam_unavailable'},e?.message==='not_found'?404:502);}finally{clearTimeout(timer);}
}

/** Store search results: games and DLC only by App ID, name and small capsule. Prices in the response are dropped. */
export function steamSearchResults(body){
  if(!body||!Array.isArray(body.items))throw new Error('invalid_response');
  const seen=new Set(),items=[];
  for(const item of body.items.slice(0,30)){
    const appId=Number(item?.id);if(item?.type!=='app'||steamAppId(String(appId))!==appId||seen.has(appId))continue;
    const name=text(item.name,200);if(!name)continue;
    seen.add(appId);items.push({appId,name,imageUrl:steamImageUrl(item.tiny_image,appId)});
    if(items.length===8)break;
  }
  return items;
}
export function steamSearchQuery(value){const query=String(value??'').replace(/\s+/g,' ').trim();if(query.length<1||query.length>100||/[\u0000-\u001f\u007f]/.test(query))throw new Error('invalid_query');return query;}
/** Finds games by name in the public Steam store (Korean names where Steam has them); cached for a day per query. */
export async function handleSteamSearch(request,env,ctx,{fetcher=fetch,cache=globalThis.caches?.default}={}){
  const user=request.headers.get('oai-authenticated-user-id');if(!user||user.length>200)return json({error:'authentication_required'},401);
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  let query;try{query=steamSearchQuery(new URL(request.url).searchParams.get('q'));}catch{return json({error:'invalid_query'},400);}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(query.toLocaleLowerCase())))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const cacheKey=new Request(new URL(`/__metadata/steam-search-v1/${hash}`,request.url).href);
  try{const hit=await cache?.match(cacheKey);if(hit?.ok)return json({items:steamSearchResults({items:(await hit.json()).map(i=>({type:'app',id:i.appId,name:i.name,tiny_image:i.imageUrl}))}),cached:true});}catch{}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetcher(`https://store.steampowered.com/api/storesearch/?${new URLSearchParams({term:query,l:'koreana',cc:'KR'})}`,{headers:{Accept:'application/json'},redirect:'manual',signal:controller.signal});
    if(!response.ok){await response.body?.cancel();return json({error:'steam_unavailable'},response.status===429?503:502);}
    const items=steamSearchResults(await readJson(response));
    if(cache)try{const put=Promise.resolve(cache.put(cacheKey,Response.json(items,{headers:{'Cache-Control':'public, max-age=86400'}}))).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(put);else await put;}catch{}
    return json({items,cached:false});
  }catch{return json({error:'steam_unavailable'},502);}finally{clearTimeout(timer);}
}
