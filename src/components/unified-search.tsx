'use client';
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,Clapperboard,FileText,Gamepad2,Music2,RefreshCw,Search,X} from 'lucide-react';
import type {Entry} from '@/lib/store';
import {searchEntries,type SearchFilter} from '@/lib/search';
import type {SteamSearchResult} from '@/lib/steam-account';
import {playTime} from '@/lib/games';
import {useHubSync} from './sync-provider';
import {steamFetch,steamMessage} from './steam-account';
import {steamLibraryHref,steamStamp} from './steam-home';
import Dialog from './dialog';

const filters:{id:SearchFilter;label:string}[]=[{id:'all',label:'전체'},{id:'records',label:'HUB 기록'},{id:'watch',label:'영화·드라마·웹툰'},{id:'music',label:'음악'},{id:'games',label:'내 게임 기록'},{id:'steam',label:'Steam 보유 게임'}];
export default function UnifiedSearch({entries,query,onQuery,onClose,onEdit}:{entries:Entry[];query:string;onQuery:(value:string)=>void;onClose:()=>void;onEdit:(entry:Entry)=>void}){
  const {userId}=useHubSync(),[filter,setFilter]=useState<SearchFilter>('all'),[shown,setShown]=useState(20),[steam,setSteam]=useState<SteamSearchResult|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [more,setMore]=useState(false),[moreError,setMoreError]=useState(''),generation=useRef(0),moreLock=useRef(false),abortMore=useRef<AbortController|null>(null);
  const records=useMemo(()=>searchEntries(entries,query,filter),[entries,query,filter]),withSteam=filter==='all'||filter==='steam',q=query.trim();
  useEffect(()=>{setShown(20);},[query,filter]);
  useEffect(()=>{
    generation.current++;const version=generation.current,controller=new AbortController();abortMore.current?.abort();moreLock.current=false;setSteam(null);setError('');setMoreError('');setMore(false);setLoading(!!q&&withSteam);
    if(!q||!withSteam)return()=>controller.abort();
    const timer=setTimeout(()=>{void steamFetch<SteamSearchResult>('search?'+new URLSearchParams({q}),undefined,controller.signal).then(data=>{if(!controller.signal.aborted&&version===generation.current)setSteam(data);}).catch(e=>{if(!controller.signal.aborted&&version===generation.current)setError((e as Error).message);}).finally(()=>{if(!controller.signal.aborted&&version===generation.current)setLoading(false);});},250);
    return()=>{clearTimeout(timer);controller.abort();abortMore.current?.abort();};
  },[q,withSteam,userId,revision]);
  async function nextSteam(){if(!steam?.hasMore||moreLock.current)return;moreLock.current=true;setMore(true);setMoreError('');const version=generation.current,controller=new AbortController();abortMore.current=controller;try{const data=await steamFetch<SteamSearchResult>('search?'+new URLSearchParams({q,offset:String(steam.nextOffset)}),undefined,controller.signal);if(!controller.signal.aborted&&version===generation.current)setSteam(previous=>previous?{...data,items:[...previous.items,...data.items.filter(item=>!previous.items.some(p=>p.steamId===item.steamId&&p.appId===item.appId))]}:data);}catch(e){if(!controller.signal.aborted&&version===generation.current)setMoreError((e as Error).message);}finally{if(version===generation.current){moreLock.current=false;setMore(false);}}}
  return <Dialog title="내 공간 통합 검색" onClose={onClose} className="search-dialog unified-search-dialog"><div className="search-field"><Search size={20}/><input aria-label="통합 검색어" maxLength={120} autoFocus placeholder="작품, 게임, 앨범, 메모 검색" value={query} onChange={e=>onQuery(e.target.value)}/>{query&&<button className="icon-button" aria-label="검색어 지우기" onClick={()=>onQuery('')}><X size={15}/></button>}<kbd>ESC</kbd></div>
    <div className="unified-search-filters" aria-label="검색 범위">{filters.map(f=><button key={f.id} aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{f.label}</button>)}</div>
    <div className="unified-search-results">
      {filter!=='steam'&&<section aria-label="HUB 기록 검색 결과"><div className="unified-search-group"><h3>{q?'HUB 기록':'최근 저장한 기록'}</h3><span>{records.length}개</span></div>{records.slice(0,shown).map(hit=><button className="search-result" key={hit.entry.id} onClick={()=>onEdit(hit.entry)}>{hit.entry.kind==='music'?<Music2 size={18}/>:hit.entry.kind==='games'?<Gamepad2 size={18}/>:hit.entry.kind==='watch'?<Clapperboard size={18}/>:<FileText size={18}/>}<span><strong>{hit.entry.title}</strong><small>{hit.label} · {hit.matchedIn}</small><p>{hit.excerpt}</p></span><ArrowUpRight size={14}/></button>)}{!records.length&&<p className="unified-search-empty">{q?'조건에 맞는 HUB 기록이 없어요.':'저장한 기록이 여기에 표시됩니다.'}</p>}{records.length>shown&&<button className="unified-search-more text-button blue" onClick={()=>setShown(n=>n+20)}>HUB 결과 더 보기 ({shown}/{records.length})</button>}</section>}
      {withSteam&&<section aria-label="Steam 보유 게임 검색 결과"><div className="unified-search-group"><h3>Steam 보유 게임</h3><span>{steam?`${steam.count}개`:loading?'검색 중':''}</span></div><p className="unified-search-hint">연결한 모든 계정의 마지막 조회 라이브러리에서 찾습니다.</p>
        {!q?<p className="unified-search-empty">게임 이름·App ID·계정 이름을 입력해주세요.</p>:loading?<p className="unified-search-empty" role="status">저장된 Steam 게임을 찾고 있어요.</p>:null}
        {steam?.items.map(item=><a className="search-result steam-search-result" key={item.steamId+':'+item.appId} href={steamLibraryHref(item.steamId,item.appId)} onClick={onClose}><Gamepad2 size={18}/><span><strong>{item.name}</strong><small>Steam · {item.accountName} · {playTime(item.totalMinutes)}</small><p>{steamStamp(item.checkedAt)} 조회{item.error?' · 이전 조회 정보':''} · 라이브러리에서 보기</p></span><ArrowUpRight size={14}/></a>)}
        {steam&&!steam.count&&<p className="unified-search-empty">{!steam.accounts.length?'Steam 계정을 연결하면 보유 게임도 검색할 수 있어요.':steam.accounts.every(a=>!a.checkedAt)?'Steam 라이브러리를 먼저 불러와주세요.':'조건에 맞는 보유 게임이 없어요.'}</p>}
        {steam?.accounts.filter(a=>a.error||!a.checkedAt).map(a=><p className="unified-search-warning" key={a.steamId}>{a.name}: {a.error?steamMessage(a.error):'아직 라이브러리를 조회하지 않았어요.'}</p>)}
        {steam?.hasMore&&<button className="unified-search-more text-button blue" disabled={more} onClick={()=>void nextSteam()}>{more?'불러오는 중':'Steam 결과 더 보기'} ({steam.items.length}/{steam.count})</button>}
        {(error||moreError)&&<div className="unified-search-error"><p className="form-error" role="alert">{error||moreError}</p><button className="text-button blue" disabled={loading||more} onClick={()=>{if(moreError)void nextSteam();else setRevision(v=>v+1);}}>다시 시도<RefreshCw size={12}/></button></div>}<Link className="unified-search-manage text-button muted" href="/games/steam/" onClick={onClose}>Steam 연결·라이브러리 관리<ArrowUpRight size={12}/></Link>
      </section>}
    </div><p className="unified-search-footnote">HUB 기록은 현재 변경 내용을 포함합니다. Steam 검색은 저장된 조회 결과를 사용합니다.</p>
  </Dialog>;
}
