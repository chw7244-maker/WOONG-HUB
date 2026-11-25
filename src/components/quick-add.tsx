'use client';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Disc3,Film,Gamepad2,Loader2,Plus} from 'lucide-react';
import type {Entry} from '@/lib/store';
import {validateSteam,type SteamMetadata} from '@/lib/games';
import {validateAlbum,type AlbumMetadata} from '@/lib/music';
import {validateWatchCatalog,type WatchCatalogItem} from '@/lib/watch';
import {albumEntry,gameAppIds,steamGameEntry,steamReference,watchEntry,type SteamSearchItem} from '@/lib/quick-add';

function Art({url,icon}:{url?:string;icon:ReactNode}){const [failed,setFailed]=useState(false);return url&&!failed?<img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<>{icon}</>;}
type Action<T>={label:string;primary?:boolean;run:(item:T)=>Promise<void>|void};
type Candidate<T>={key:string;item:T;title:string;meta:string;image?:string;note?:string};

/**
 * One input that searches as you type and adds a pick straight away. Enter takes the first result with the primary
 * action; with no result it adds by name. Results stay above the page; Esc or a click outside closes them.
 */
function QuickAdd<T>({label,placeholder,source,icon,search,actions,manual,collapsible=false}:{label:string;placeholder:string;source:string;icon:ReactNode;
  search:(query:string,signal:AbortSignal)=>Promise<Candidate<T>[]>;actions:Action<T>[];manual?:{label:(query:string)=>string;run:(query:string)=>void};collapsible?:boolean}){
  const [query,setQuery]=useState(''),[results,setResults]=useState<Candidate<T>[]|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState<string|null>(null),[open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null),field=useRef<HTMLInputElement>(null),listId=useId(),[expanded,setExpanded]=useState(false);
  // On phones a collapsible box starts as a small "바로 추가" button next to the title and opens into the full field.
  useEffect(()=>{if(expanded)field.current?.focus();},[expanded]);
  const trimmed=query.trim();
  useEffect(()=>{
    setError('');if(trimmed.length<2){setResults(null);setLoading(false);return;}
    const controller=new AbortController();setLoading(true);
    const timer=setTimeout(()=>{search(trimmed,controller.signal).then(found=>{if(!controller.signal.aborted){setResults(found);setLoading(false);}}).catch(e=>{if(!controller.signal.aborted){setResults([]);setError(e instanceof Error?e.message:'찾지 못했어요. 잠시 후 다시 해보세요.');setLoading(false);}});},450);
    return()=>{clearTimeout(timer);controller.abort();};
  },[trimmed]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!open)return;const away=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',away);return()=>document.removeEventListener('pointerdown',away);},[open]);
  async function run(candidate:Candidate<T>,action:Action<T>){if(busy)return;setBusy(candidate.key);try{await action.run(candidate.item);setQuery('');setResults(null);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'추가하지 못했어요.');}finally{setBusy(null);}}
  function addByName(){if(!manual||!trimmed)return;manual.run(trimmed);setQuery('');setResults(null);setOpen(false);}
  const primary=actions.find(a=>a.primary)??actions[0];
  const showList=open&&trimmed.length>=2;
  return <div className={`quick-add${collapsible?' collapsible':''}${expanded?' expanded':''}`} ref={ref}>
    {collapsible&&<button type="button" className="quick-add-toggle" aria-expanded={expanded} onClick={()=>setExpanded(true)}><Plus size={16} aria-hidden="true"/>바로 추가</button>}
    <label className="quick-add-field"><Plus size={18} aria-hidden="true"/><input ref={field} value={query} aria-label={label} placeholder={placeholder} role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
      onChange={event=>{setQuery(event.target.value);setOpen(true);}} onFocus={()=>setOpen(true)}
      onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);return;}if(event.key!=='Enter'||event.nativeEvent.isComposing)return;event.preventDefault();const first=results?.find(r=>!r.note);if(first&&!loading)void run(first,primary);else if(results&&!loading)addByName();}}/>
      <span className="quick-add-source">{loading?<Loader2 size={14} className="quick-add-spin" aria-label="찾는 중"/>:source}</span></label>
    {showList&&<div className="quick-add-results" id={listId} role="listbox" aria-label={`${label} 결과`}>
      {loading&&!results?<p className="quick-add-hint">찾는 중…</p>:null}
      {results?.length?<p className="quick-add-hint">{source}에서 찾은 결과 · 고르면 표지와 정보까지 채워서 저장해요</p>:null}
      {results?.map(candidate=><div className="quick-add-item" role="option" aria-selected="false" key={candidate.key}>
        <span className="quick-add-art"><Art key={candidate.image??''} url={candidate.image} icon={icon}/></span>
        <span className="quick-add-copy"><strong>{candidate.title}</strong><small>{candidate.meta}</small></span>
        {candidate.note?<span className="quick-add-note">{candidate.note}</span>:<span className="quick-add-actions">{actions.map(action=><button key={action.label} type="button" className={action.primary?'primary':''} disabled={busy!==null} onClick={()=>void run(candidate,action)}>{busy===candidate.key&&action===primary?<Loader2 size={14} className="quick-add-spin" aria-hidden="true"/>:null}{action.label}</button>)}</span>}
      </div>)}
      {error&&<p className="quick-add-error" role="alert">{error}</p>}
      {results&&!loading&&manual&&<button type="button" className="quick-add-manual" onClick={addByName}>{results.length?'':`${source}에서 찾지 못했어요 · `}‘{trimmed}’ {manual.label(trimmed)}</button>}
      {results?.length?<p className="quick-add-hint quick-add-keys">Enter: 첫 결과를 {primary.label}{primary.label.endsWith('예정')?'으로':'에'} 추가 · 나머지 정보는 나중에 수정 창에서 채워요</p>:null}
    </div>}
  </div>;
}

async function getJson(url:string,signal:AbortSignal,messages:Record<number,string>={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal});
  if(!response.ok)throw new Error(messages[response.status]??(response.status===503?'요청이 많아요. 잠시 후 다시 찾아보세요.':'지금은 찾지 못했어요. 잠시 후 다시 해보세요.'));
  return response.json();
}
export async function steamDetails(appId:number,signal?:AbortSignal):Promise<SteamMetadata>{
  const response=await fetch(`/api/games/steam?appId=${appId}`,{credentials:'same-origin',cache:'no-store',signal});
  if(!response.ok){const error=new Error(response.status===404?'공개 상점에서 찾지 못했어요.':'Steam 상점 정보를 불러오지 못했어요.') as Error&{status?:number};error.status=response.status;throw error;}
  const game=validateSteam((await response.json()).game);if(game.appId!==appId)throw new Error('게임 정보를 확인하지 못했어요.');return game;
}

/** Games: names from the Steam store, or a store link / App ID; picks get their store details before saving. */
export function GameQuickAdd({entries,onAdd}:{entries:Entry[];onAdd:(entry:Entry,message:string)=>void}){
  const known=gameAppIds(entries);
  const add=async(item:SteamSearchItem,status:string)=>{
    let steam:SteamMetadata|undefined;try{steam=await steamDetails(item.appId);}catch{steam=undefined;}
    onAdd(steamGameEntry({name:item.name,steam},status),`${steam?.name??item.name}을(를) ${status}에 추가했어요.${steam?'':' 상점 정보는 나중에 채울 수 있어요.'}`);
  };
  return <QuickAdd<SteamSearchItem> label="게임 바로 추가" placeholder="게임 이름이나 Steam 주소로 바로 추가" source="Steam" icon={<Gamepad2 size={18}/>}
    search={async(query,signal)=>{
      const ref=steamReference(query);
      const items:SteamSearchItem[]=ref?[await steamDetails(ref,signal).then(game=>({appId:game.appId,name:game.name,imageUrl:game.imageUrl}))]:(await getJson(`/api/games/steam/search?q=${encodeURIComponent(query)}`,signal)).items;
      return items.map(item=>({key:String(item.appId),item,title:item.name,meta:`App ID ${item.appId}`,image:item.imageUrl||undefined,note:known.has(item.appId)?'이미 있어요':undefined}));
    }}
    actions={[{label:'위시리스트',run:item=>add(item,'위시리스트')},{label:'플레이 예정',primary:true,run:item=>add(item,'플레이 예정')}]}
    manual={{label:()=>'이름으로 직접 추가',run:name=>onAdd(steamGameEntry({name},'플레이 예정'),`${name}을(를) 플레이 예정에 추가했어요.`)}}/>;
}

/** Movies and series from TMDB (both searched at once); planned or watching. */
export function WatchQuickAdd({entries,onAdd}:{entries:Entry[];onAdd:(entry:Entry,message:string)=>void}){
  const known=new Set(entries.flatMap(e=>e.watch?.catalog&&e.watch.type!=='webtoon'?[`${e.watch.type}:${e.watch.catalog.id}`]:[]));
  type Item={type:'movie'|'tv';item:WatchCatalogItem};
  const add=({type,item}:Item,status:'planned'|'watching')=>onAdd(watchEntry(item,type,status),`${item.title}을(를) ${status==='planned'?'볼 예정':'보는 중'}에 추가했어요.`);
  return <QuickAdd<Item> label="작품 바로 추가" placeholder="영화나 드라마 제목으로 바로 추가" source="TMDB" icon={<Film size={18}/>}
    search={async(query,signal)=>{
      const messages={503:'TMDB가 연결되어 있지 않아요. ‘작품 추가’에서 직접 등록해 주세요.'};
      const [movies,shows]=await Promise.all((['movie','tv'] as const).map(type=>getJson(`/api/watch/search?type=${type}&q=${encodeURIComponent(query)}`,signal,messages).then(body=>(body.items as unknown[]).map(raw=>({type,item:validateWatchCatalog(raw)})))));
      const merged:Item[]=[];for(let i=0;i<Math.max(movies.length,shows.length)&&merged.length<8;i++){if(movies[i])merged.push(movies[i]);if(shows[i]&&merged.length<8)merged.push(shows[i]);}
      return merged.map(({type,item})=>({key:`${type}:${item.id}`,item:{type,item},title:item.title,meta:`${type==='movie'?'영화':'드라마'}${item.year?` · ${item.year}`:''}`,image:item.posterPath?`https://image.tmdb.org/t/p/w92${item.posterPath}`:undefined,note:known.has(`${type}:${item.id}`)?'이미 있어요':undefined}));
    }}
    actions={[{label:'보는 중',run:item=>add(item,'watching')},{label:'볼 예정',primary:true,run:item=>add(item,'planned')}]}/>;
}

/** Albums from MusicBrainz; into the collection or the wishlist. */
export function AlbumQuickAdd({entries,onAdd}:{entries:Entry[];onAdd:(entry:Entry,message:string)=>void}){
  const known=new Set(entries.flatMap(e=>e.music?.catalog?[e.music.catalog.id]:[]));
  const add=(album:AlbumMetadata,status:string)=>onAdd(albumEntry(album,status),`${album.title}을(를) ${status}에 추가했어요.`);
  return <QuickAdd<AlbumMetadata> collapsible label="앨범 바로 추가" placeholder="앨범 이름으로 바로 추가 (앨범 - 아티스트로 좁히기)" source="MusicBrainz" icon={<Disc3 size={18}/>}
    search={async(query,signal)=>{
      const [album,artist='']=query.split(/\s+[-–]\s+/,2);
      const body=await getJson(`/api/music/albums?${new URLSearchParams({album,artist})}`,signal,{429:'조금 천천히 입력해 주세요. 잠시 후 다시 찾아요.'});
      return (body.albums as unknown[]).map(raw=>validateAlbum(raw)).map(album=>({key:album.id,item:album,title:album.title,meta:[album.artist,album.firstReleaseDate.slice(0,4),album.type].filter(Boolean).join(' · '),image:album.coverUrl,note:known.has(album.id)?'이미 있어요':undefined}));
    }}
    actions={[{label:'위시리스트',run:album=>add(album,'위시리스트')},{label:'컬렉션',primary:true,run:album=>add(album,'컬렉션')}]}/>;
}
