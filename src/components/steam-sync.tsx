'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Heart,Loader2,RefreshCw,Sparkles} from 'lucide-react';
import type {Entry} from '@/lib/store';
import {steamGameEntry,storeInfoMissing,wishlistChanges,withStoreInfo,type WishlistItem} from '@/lib/quick-add';
import {steamDetails} from './quick-add';

const STATE_KEY='woong-hub:steam-wishlist';
const DAY=24*60*60*1000,PACE=1100,PER_CHECK=30;
type WishlistState={checkedAt:string;appIds:number[];added:number;waiting:number;empty:boolean};
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const busySteam=(e:unknown)=>{const status=(e as {status?:number})?.status;return status===503||status===429||status===502;};
function readState():WishlistState|null{try{const raw=JSON.parse(localStorage.getItem(STATE_KEY)??'null');return raw&&typeof raw.checkedAt==='string'&&Array.isArray(raw.appIds)?raw:null;}catch{return null;}}
const clock=(iso:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));

/**
 * Steam card on the games page. The wishlist is checked once a day when the page opens and on "지금 확인": games newly
 * wishlisted on Steam are added to the HUB wishlist with their store details, games no longer wishlisted are only
 * reported. Games linked to a Steam account without store details can have them filled, one store request at a time.
 */
export default function SteamSync({entries,onBulkSave,onGone}:{entries:Entry[];onBulkSave:(entries:Entry[],message:string|null)=>void;onGone:(ids:string[])=>void}){
  const [state,setState]=useState<WishlistState|null>(null),[checking,setChecking]=useState(false),[message,setMessage]=useState(''),[linked,setLinked]=useState<boolean|null>(null);
  const [filling,setFilling]=useState<{done:number;total:number}|null>(null),[fillNote,setFillNote]=useState('');
  const latest=useRef(entries),save=useRef(onBulkSave),stop=useRef(false),alive=useRef(true);
  latest.current=entries;save.current=onBulkSave;
  useEffect(()=>()=>{alive.current=false;stop.current=true;},[]);
  const gone=state?wishlistChanges(entries,state.appIds.map(appId=>({appId,addedAt:''}))).gone:[];
  useEffect(()=>{onGone(state&&!state.empty?gone:[]);},[state,gone.join(',')]);// eslint-disable-line react-hooks/exhaustive-deps

  async function check(){
    if(checking)return;setChecking(true);setMessage('');
    try{
      const response=await fetch('/api/steam/wishlist',{credentials:'same-origin',cache:'no-store'});
      if(response.status===404){setLinked(false);return;}
      if(!response.ok)throw new Error(response.status===429?'Steam 요청이 많아요. 잠시 후 다시 확인해 주세요.':'Steam 찜 목록을 읽지 못했어요. 잠시 후 다시 확인해 주세요.');
      setLinked(true);
      const body=await response.json() as {items:WishlistItem[];checkedAt:string};
      const fresh=wishlistChanges(latest.current,body.items).fresh,added:Entry[]=[];let waiting=Math.max(0,fresh.length-PER_CHECK);
      for(const [index,item] of fresh.slice(0,PER_CHECK).entries()){
        if(!alive.current)return;
        if(index)await wait(PACE);
        try{const steam=await steamDetails(item.appId);added.push(steamGameEntry({name:steam.name,steam},'위시리스트',new Date(),item.addedAt||undefined));}
        catch(e){if(busySteam(e)){waiting+=Math.min(PER_CHECK,fresh.length)-index;break;}}
      }
      if(added.length)save.current(added,`Steam에서 새로 찜한 ${added.length}개를 위시리스트에 담았어요.`);
      const next={checkedAt:body.checkedAt,appIds:body.items.map(i=>i.appId),added:added.length,waiting,empty:body.items.length===0};
      setState(next);try{localStorage.setItem(STATE_KEY,JSON.stringify(next));}catch{/* keep in memory */}
    }catch(e){setMessage(e instanceof Error?e.message:'Steam 찜 목록을 읽지 못했어요.');}
    finally{if(alive.current)setChecking(false);}
  }
  useEffect(()=>{const saved=readState();setState(saved);if(!saved||Date.now()-Date.parse(saved.checkedAt)>DAY)void check();else setLinked(true);},[]);// eslint-disable-line react-hooks/exhaustive-deps

  async function fill(){
    const targets=storeInfoMissing(latest.current);if(!targets.length||filling)return;
    stop.current=false;setFillNote('');setFilling({done:0,total:targets.length});
    let pending=new Map<string,Entry>(),filled=0,skipped=0;
    const flush=(final:boolean)=>{const current=new Map(latest.current.map(e=>[e.id,e]));const ready=[...pending.values()].flatMap(next=>{const now=current.get(next.id);return now&&!now.game?.steam&&next.game?.steam?[withStoreInfo(now,next.game.steam)]:[];});pending=new Map();if(ready.length||final)save.current(ready,final&&filled?`상점 정보를 ${filled}개 채웠어요.`:null);};
    for(const [index,entry] of targets.entries()){
      if(stop.current||!alive.current)break;
      if(index)await wait(PACE);
      const appId=entry.game?.steamAccount?.appId;if(!appId)continue;
      try{const steam=await steamDetails(appId);pending.set(entry.id,withStoreInfo(entry,steam));filled++;}
      catch(e){if(busySteam(e)){setFillNote('Steam이 잠시 요청을 막았어요. 조금 뒤에 이어서 채워 주세요.');break;}skipped++;}
      if(alive.current)setFilling({done:index+1,total:targets.length});
      if(pending.size>=10)flush(false);
    }
    flush(true);
    if(alive.current){setFilling(null);if(skipped)setFillNote(current=>current||`${skipped}개는 공개 상점에서 찾지 못했어요.`);}
  }

  const missing=storeInfoMissing(entries).length;
  if(linked===false)return <section className="steam-sync" aria-label="Steam 찜 목록"><div className="steam-sync-row"><span className="steam-sync-icon"><Heart size={18}/></span><span className="steam-sync-copy"><strong>Steam 찜 목록</strong><small>Steam 계정을 연결하면 찜한 게임을 위시리스트로 가져와요.</small></span><Link className="steam-sync-button" href="/games/steam/">계정 연결</Link></div></section>;
  return <section className="steam-sync" aria-label="Steam 찜 목록과 상점 정보">
    <div className="steam-sync-row"><span className="steam-sync-icon"><Heart size={18}/></span>
      <span className="steam-sync-copy"><strong>Steam 찜 목록</strong><small role="status">{checking?'찜 목록을 확인하고 있어요…':message||(state?`${clock(state.checkedAt)} 확인 · ${state.empty?'찜 목록이 비어 있거나 공개되지 않았어요':state.added?`새로 찜한 ${state.added}개를 위시리스트에 담았어요`:'새로 찜한 게임이 없어요'}${state.waiting?` · ${state.waiting}개는 다음 확인 때 담아요`:''}${gone.length&&!state.empty?` · Steam 찜에서 빠진 ${gone.length}개는 그대로 뒀어요`:''}`:'아직 확인하지 않았어요')}</small></span>
      <button type="button" className="steam-sync-button" onClick={()=>void check()} disabled={checking}>{checking?<Loader2 size={15} className="quick-add-spin" aria-hidden="true"/>:<RefreshCw size={15} aria-hidden="true"/>}지금 확인</button></div>
    {(missing>0||filling||fillNote)&&<div className="steam-sync-row"><span className="steam-sync-icon"><Sparkles size={18}/></span>
      <span className="steam-sync-copy"><strong>상점 정보 채우기</strong><small role="status">{filling?`${filling.done}/${filling.total} 채우는 중 · 장르와 표지를 하나씩 받아요`:fillNote||`상점 정보(장르·표지·제작사)가 없는 Steam 게임 ${missing}개`}</small></span>
      {filling?<button type="button" className="steam-sync-button" onClick={()=>{stop.current=true;}}>멈추기</button>:missing>0&&<button type="button" className="steam-sync-button" onClick={()=>void fill()}>{missing}개 채우기</button>}</div>}
  </section>;
}
