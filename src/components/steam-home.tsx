'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Gamepad2,RefreshCw} from 'lucide-react';
import {steamLibraryHref,type SteamSummary} from '@/lib/steam-account';
import {playTime} from '@/lib/games';
import {useHubSync} from './sync-provider';
import {steamFetch,steamMessage} from './steam-account';

export const steamStamp=(value:string)=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'';
export default function SteamHome({compact=false}:{compact?:boolean}){
  const {userId}=useHubSync(),[data,setData]=useState<SteamSummary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selecting,setSelecting]=useState(false);
  const selected=useRef(''),abort=useRef<AbortController|null>(null),generation=useRef(0),action=useRef(false);
  const load=useCallback(async(id=selected.current)=>{abort.current?.abort();const controller=new AbortController();abort.current=controller;const version=generation.current;setLoading(true);setError('');try{const value=await steamFetch<SteamSummary>('summary'+(id?'?'+new URLSearchParams({steamId:id}):''),undefined,controller.signal);if(!controller.signal.aborted&&version===generation.current){setData(value);selected.current=value.activeSteamId;}}catch(e){if(!controller.signal.aborted&&version===generation.current)setError((e as Error).message);}finally{if(!controller.signal.aborted&&version===generation.current)setLoading(false);}},[]);
  useEffect(()=>{generation.current++;selected.current='';action.current=false;setSelecting(false);setData(null);void load('');const resume=()=>{if(document.visibilityState==='visible'&&!action.current)void load();};window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);return()=>{generation.current++;abort.current?.abort();window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};},[userId,load]);
  async function choose(id:string){if(action.current)return;action.current=true;setSelecting(true);const version=generation.current;try{await steamFetch('select',{steamId:id});if(version!==generation.current)return;selected.current=id;setData(null);await load(id);}catch(e){if(version===generation.current)setError((e as Error).message);}finally{if(version===generation.current){action.current=false;setSelecting(false);}}}
  const account=data?.account,stats=data?.stats;
  if(compact){
    const game=data?.recentGames[0];
    const stale=Boolean(error||account?.error||account?.recentError);
    const detailUrl=account?steamLibraryHref(account.steamId,game?.appId):'/games/steam/';
    return <div className="hub-continuation-item">
      <span className="hub-continuation-icon" aria-hidden="true"><Gamepad2 size={17}/></span>
      <div className="hub-continuation-copy">
        <small>게임 · Steam 최근 플레이</small>
        <Link href={detailUrl}>{game?.name??(error?'Steam 상태 확인':loading?'최근 플레이 확인 중':account?'Steam 라이브러리 열기':'Steam 계정 연결')}</Link>
        {account?.recentAt&&<small>{steamStamp(account.recentAt)} 조회{stale?' · 이전 정보':''}</small>}
        {Boolean(data?.accounts.length && data.accounts.length>1)&&<details className="hub-continuation-account">
          <summary>계정 선택</summary>
          <label>Steam 계정<select aria-label="홈 Steam 계정 선택" value={data?.activeSteamId??''} disabled={loading||selecting} onChange={e=>void choose(e.target.value)}>
            {data?.accounts.map(a=><option key={a.steamId} value={a.steamId}>{a.name}</option>)}
          </select></label>
        </details>}
      </div>
    </div>;
  }
  return <section className="panel steam-home" aria-label="Steam 최근 플레이"><div className="panel-heading"><h2><Gamepad2 size={16}/>최근 플레이</h2><Link href="/games/steam/" className="text-button blue">Steam<ArrowUpRight size={12}/></Link></div>
    {data?.accounts.length?<label className="steam-home-account">Steam 계정<select aria-label="홈 Steam 계정 선택" value={data.activeSteamId} disabled={loading||selecting} onChange={e=>void choose(e.target.value)}>{data.accounts.map(a=><option value={a.steamId} key={a.steamId}>{a.name}</option>)}</select></label>:null}
    {account&&stats?<><div className="steam-home-stats"><div><span>보유 게임</span><strong>{stats.owned===null?'조회 전':`${stats.owned}개`}</strong></div><div><span>최근 2주</span><strong>{stats.recentCount===null?'조회 전':stats.recentCount>0&&!stats.recentRecorded?'시간 정보 없음':playTime(stats.recentMinutes)}</strong></div></div>
      {!!stats.recentCount&&stats.recentRecorded<stats.recentCount&&<p className="steam-home-note">시간을 제공한 {stats.recentRecorded}개 게임의 합계입니다.</p>}
      {data.recentGames.length?<div className="steam-home-games">{data.recentGames.map(game=><Link key={game.appId} href={steamLibraryHref(account.steamId,game.appId)}><SteamHomeCover src={game.imageUrl}/><span><strong>{game.name}</strong><small>최근 2주 {game.recentMinutes===null?'시간 정보 없음':playTime(game.recentMinutes)}</small></span><ArrowUpRight size={12}/></Link>)}</div>:<p className="steam-home-empty">{stats.recentCount===null?'Steam 라이브러리에서 정보를 먼저 불러와주세요.':'최근 조회에서 2주 내 플레이한 게임이 없어요.'}</p>}
      {(account.error||account.recentError)&&<p className="form-error" role="alert">{steamMessage(account.error||account.recentError)} 이전 조회 정보일 수 있습니다.</p>}
      <p className="steam-home-note">{account.recentAt?`${steamStamp(account.recentAt)} 최근 플레이 조회`:account.ownedAt?`${steamStamp(account.ownedAt)} 보유 게임 조회`:'아직 조회 전'} · Steam 시간 기준</p><div className="steam-home-footer"><Link className="text-button muted" href={steamLibraryHref(account.steamId)}>라이브러리에서 새로고침<ArrowUpRight size={12}/></Link><button className="icon-button" aria-label="홈의 저장된 Steam 정보 다시 읽기" disabled={loading||selecting} onClick={()=>void load()}><RefreshCw size={13}/></button></div>
    </>:!loading&&!error?<div className="steam-home-empty"><Gamepad2 size={24}/><p>Steam 계정을 연결하고 최근 게임과 플레이 시간을 확인하세요.</p><Link className="text-button blue" href="/games/steam/">Steam 계정 연결<ArrowUpRight size={12}/></Link></div>:null}
    {loading&&<p className="steam-home-note" role="status">저장된 Steam 정보를 읽고 있어요.</p>}{error&&<div className="steam-home-error"><p className="form-error" role="alert">{error}{data?' 마지막 조회 화면입니다.':''}</p><button className="text-button blue" onClick={()=>void load('')}>연결 상태 다시 확인<RefreshCw size={12}/></button></div>}
  </section>;
}
function SteamHomeCover({src}:{src:string}){const [failed,setFailed]=useState(false);return failed?<span className="steam-home-cover"><Gamepad2 size={18}/></span>:<img className="steam-home-cover" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;}
