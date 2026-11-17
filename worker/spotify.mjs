import {spotifyResource,spotifyCover,validateSpotify} from '../src/lib/spotify.ts';
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff',...headers}});

export async function handleSpotify(request,env,ctx,{fetcher=fetch,clock=Date.now}={}){
  const user=request.headers.get('oai-authenticated-user-id');if(!user||user.length>200)return json({error:'authentication_required'},401);
  if(request.method!=='GET')return json({error:'method_not_allowed'},405);
  let resource;try{resource=spotifyResource(new URL(request.url).searchParams.get('url'));}catch{return json({error:'invalid_spotify_url'},400);}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetcher('https://open.spotify.com/oembed?'+new URLSearchParams({url:resource.url}),{headers:{Accept:'application/json'},redirect:'manual',signal:controller.signal});
    if(!response.ok){await response.body?.cancel();return json({error:response.status===404?'spotify_not_found':'spotify_unavailable'},response.status===429?429:502,response.status===429?{'Retry-After':'30'}:{});}
    if(!response.headers.get('Content-Type')?.includes('json')||Number(response.headers.get('Content-Length'))>100000)throw new Error('invalid_response');
    const reader=response.body?.getReader();if(!reader)throw new Error('invalid_response');let size=0,text='';const decoder=new TextDecoder();
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000){await reader.cancel();throw new Error('too_large');}text+=decoder.decode(value,{stream:true});}
    const body=JSON.parse(text+decoder.decode());if(body.provider_name!=='Spotify'||typeof body.title!=='string'||!body.title.trim())throw new Error('invalid_response');
    let coverUrl='';try{coverUrl=spotifyCover(body.thumbnail_url??'');}catch{}
    return json({spotify:validateSpotify({...resource,title:body.title.trim().slice(0,200),coverUrl,checkedAt:new Date(clock()).toISOString()})});
  }catch{return json({error:'spotify_unavailable'},502);}finally{clearTimeout(timer);}
}
