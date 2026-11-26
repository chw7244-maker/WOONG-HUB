'use client';
import {useEffect,useRef,useState,type FormEvent,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowUpRight,Check,ChevronDown,Database,Gamepad2,MoreHorizontal,Plus,Pencil,RefreshCw,Search,Star,Timer,Trash2,Trophy} from 'lucide-react';
import {type Entry,safeUrl} from '@/lib/store';
import {averageRating,effectivePlayTime,emptyGame,gameGenre,gameGroupModes,gamePlatforms,gameStatuses,gameStats,groupGames,inlineRating,memoLine,ownPlayTimeShown,plannedGames,playTime,playTimeLabel,ratingFromPosition,ratingLabel,steamAppId,validateGame,validateSteam,withMemoLine,type GameGroupBy,type SteamMetadata} from '@/lib/games';
import Dialog from './dialog';
import { SteamAccountField, SteamLinkedTime, useSteamEntryStats } from './steam-account';
import { SectionFilters, SectionStats } from './section-controls';
import { GameHighlights } from './hobby-highlights';
import { GameCover, GameViewToggle, useDeviceChoice, useGameView } from './game-view';
import type {XboxGame} from './xbox-history';

const starPath='M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z';
/** One star filled, half filled or empty for a score; the half fill uses the gradient GamesHub defines once. */
function StarShape({rating,index,size}:{rating:number|null;index:number;size:number}){
  const kind=rating!==null&&rating>=index?'full':rating!==null&&rating>=index-.5?'half':'empty';
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`game-star game-star-${kind}`}><path d={starPath}/></svg>;
}

/** PC stars: each star saves at once; the star the score already sits on takes half a point off. */
function InlineStars({entry,rating,onRate}:{entry:Entry;rating:number|null;onRate:(rating:number)=>void}){
  return <div className="game-row-stars" role="group" aria-label={`${entry.title} 별점 ${rating===null?'없음':`${rating}점`}`}>
    {[1,2,3,4,5].map(i=><button key={i} type="button" className="game-star-button" aria-label={`${entry.title} 별점 ${inlineRating(rating,i)}점으로`} onClick={()=>onRate(inlineRating(rating,i))}><StarShape rating={rating} index={i} size={22}/></button>)}
    <span className="game-row-score">{ratingLabel(rating)}</span>
  </div>;
}

/** Phone rating sheet: slide a finger along the stars (half steps, 0.5 at least), tap a star's half, or use the arrow keys. */
function RatingSheet({entry,cover,onSave,onClose}:{entry:Entry;cover?:string;onSave:(rating:number|null)=>void;onClose:()=>void}){
  const before=entry.game?.rating??null;
  const [draft,setDraft]=useState<number>(before??3);
  const dragging=useRef(false);
  const fromPointer=(event:ReactPointerEvent<HTMLDivElement>)=>{const box=event.currentTarget.getBoundingClientRect();return ratingFromPosition((event.clientX-box.left-6)/Math.max(1,box.width-12));};
  const onKey=(event:ReactKeyboardEvent<HTMLDivElement>)=>{const step=({ArrowRight:.5,ArrowUp:.5,ArrowLeft:-.5,ArrowDown:-.5} as Record<string,number>)[event.key];if(step===undefined)return;event.preventDefault();setDraft(value=>Math.min(5,Math.max(.5,value+step)));};
  return <Dialog title="별점 바꾸기" onClose={onClose} className="section-detail game-rating-sheet" focusField={false}>
    <div className="game-rating-body">
      <div className="game-rating-game"><GameCover key={cover||'empty'} imageUrl={cover} title={entry.title} thumb/><div><strong>{entry.title}</strong><small>이전 {before===null?'별점 없음':`${before.toFixed(1)}점`}</small></div></div>
      <strong className="game-rating-value" aria-hidden="true">{draft.toFixed(1)}</strong>
      <div className="game-rating-strip" role="slider" tabIndex={0} aria-label={`${entry.title} 별점`} aria-valuemin={.5} aria-valuemax={5} aria-valuenow={draft} aria-valuetext={`${draft.toFixed(1)}점`}
        onPointerDown={event=>{dragging.current=true;event.currentTarget.setPointerCapture?.(event.pointerId);setDraft(fromPointer(event));}}
        onPointerMove={event=>{if(dragging.current)setDraft(fromPointer(event));}}
        onPointerUp={()=>{dragging.current=false;}} onPointerCancel={()=>{dragging.current=false;}} onKeyDown={onKey}>
        {[1,2,3,4,5].map(i=><span key={i}><StarShape rating={draft} index={i} size={48}/></span>)}
      </div>
      <p className="game-rating-hint">별 위를 손가락으로 쓸면 0.5점씩 채워져요. 별의 왼쪽 절반을 누르면 반 점, 오른쪽 절반을 누르면 한 점이에요.</p>
    </div>
    <div className="dialog-footer game-rating-actions"><button type="button" className="button secondary" onClick={()=>onSave(null)}>별점 지우기</button><button type="button" className="button primary" onClick={()=>onSave(draft)}>{draft.toFixed(1)}점으로 저장</button></div>
  </Dialog>;
}

/** The row's one-line memo: the first line of the play memo, edited in place (Enter or leaving the field saves, Esc cancels). */
function MemoCell({entry,onSave}:{entry:Entry;onSave:(line:string)=>void}){
  const line=memoLine(entry.detail);
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(line);
  const done=useRef(false);
  const start=()=>{setDraft(line);done.current=false;setEditing(true);};
  const finish=(save:boolean)=>{if(done.current)return;done.current=true;setEditing(false);if(save&&draft.trim()!==line)onSave(draft);};
  if(editing)return <input className="game-memo-input" autoFocus maxLength={200} value={draft} aria-label={`${entry.title} 한 줄 메모`} placeholder="한 줄로 남길 메모" onChange={event=>setDraft(event.target.value)} onBlur={()=>finish(true)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();finish(true);}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}}}/>;
  return line
    ?<button type="button" className="game-memo-button" aria-label={`${entry.title} 한 줄 메모 고치기: ${line}`} onClick={start}><span>{line}</span></button>
    :<button type="button" className="game-memo-button game-memo-empty" aria-label={`${entry.title} 한 줄 메모 쓰기`} onClick={start}>+ 한 줄 메모</button>;
}

/** "더보기" for a row: edit or delete. Closes on a click outside or Esc. */
function RowMenu({entry,onEdit,onDelete}:{entry:Entry;onEdit:()=>void;onDelete:()=>void}){
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const away=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))setOpen(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);ref.current?.querySelector('button')?.focus();}};
    document.addEventListener('pointerdown',away);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',key);};
  },[open]);
  return <div className="game-row-menu" ref={ref}>
    <button type="button" className="icon-button" aria-label={`${entry.title} 더보기`} aria-expanded={open} onClick={()=>setOpen(!open)}><MoreHorizontal size={18}/></button>
    {open&&<div className="game-row-menu-list" role="menu"><button type="button" role="menuitem" onClick={()=>{setOpen(false);onEdit();}}><Pencil size={15}/>기록 수정</button><button type="button" role="menuitem" className="danger" onClick={()=>{setOpen(false);onDelete();}}><Trash2 size={15}/>삭제</button></div>}
  </div>;
}

const statusTone=(status:string)=>({'플레이 중':'playing','플레이 예정':'planned','위시리스트':'wish','보류':'hold'} as Record<string,string>)[status]??'done';
const groupModes=gameGroupModes.map(mode=>mode.id);

export default function GamesHub({active,entries,goneIds,xboxGames,onAdd,onEdit,onDelete,onQuickSave}:{active:boolean;entries:Entry[];goneIds:string[];xboxGames:ReadonlyMap<string,XboxGame>;onAdd:()=>void;onEdit:(entry:Entry)=>void;onDelete:(entry:Entry)=>void;onQuickSave:(entry:Entry,message:string)=>void}){
  const [query,setQuery]=useState(''),[status,setStatus]=useState('전체'),[platform,setPlatform]=useState('전체'),[sort,setSort]=useState('recent'),[selectedId,setSelectedId]=useState<string|null>(null),[ratingId,setRatingId]=useState<string|null>(null);
  useEffect(()=>{if(!active){setSelectedId(null);setRatingId(null);}},[active]);
  const stats=gameStats(entries),selected=active?entries.find(e=>e.id===selectedId):undefined,rating=active?entries.find(e=>e.id===ratingId):undefined;
  const steamStats=useSteamEntryStats(entries);
  const [view,setView]=useGameView('games');
  const [summary,setSummary]=useDeviceChoice('woong-hub:games-summary','closed',['open','closed'] as const);
  const [groupBy,setGroupBy]=useDeviceChoice<GameGroupBy>('woong-hub:games-group','rating',groupModes);
  const playingCount=entries.filter(e=>e.status==='플레이 중').length;
  const xboxFor=(entry:Entry)=>entry.game?.xboxTitleId?xboxGames.get(entry.game.xboxTitleId):undefined;
  const steamMinutes=(entry:Entry)=>{if(!entry.game?.steamAccount)return null;const stat=steamStats.find(entry.game.steamAccount);if(!stat)return steamStats.error?null:undefined;return stat.connected&&stat.game?stat.game.totalMinutes:null;};
  const playOf=(entry:Entry)=>effectivePlayTime(entry.game?.playMinutes??null,steamMinutes(entry),!!entry.game?.steamAccount,xboxFor(entry)?.minutes??null);
  const timeOf=(entry:Entry)=>playTimeLabel(playOf(entry));
  const played=entries.map(playOf).filter(play=>play.minutes!==null);
  const coverOf=(entry:Entry)=>entry.game?.steam?.imageUrl||steamStats.find(entry.game?.steamAccount)?.game?.imageUrl||xboxFor(entry)?.imageUrl;
  const ratingOf=(entry:Entry)=>entry.game?.rating??null;
  const records=entries.filter(e=>(status==='전체'||e.status===status)&&(platform==='전체'||e.category===platform)&&[e.title,e.detail,...(e.game?.tags??[]),e.game?.steam?.name,...(e.game?.steam?.developers??[]),...(e.game?.steam?.genres??[])].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>sort==='name'?a.title.localeCompare(b.title,'ko'):sort==='time'?(playOf(b).minutes??-1)-(playOf(a).minutes??-1):sort==='rating'?(ratingOf(b)??-1)-(ratingOf(a)??-1):b.createdAt.localeCompare(a.createdAt));
  const groups=groupGames(records,groupBy);
  const filtered=query||status!=='전체'||platform!=='전체';
  function rate(entry:Entry,value:number|null){
    if(value===ratingOf(entry))return;
    try{const game=validateGame({...(entry.game??emptyGame()),rating:value});onQuickSave({...entry,game},value===null?`${entry.title} 별점을 지웠어요.`:`${entry.title} 별점을 ${value}점으로 저장했어요.`);}
    catch(e){window.alert(e instanceof Error?e.message:'별점을 저장하지 못했어요.');}
  }
  function saveMemo(entry:Entry,line:string){const detail=withMemoLine(entry.detail,line);if(detail!==entry.detail)onQuickSave({...entry,detail},memoLine(detail)?`${entry.title} 한 줄 메모를 저장했어요.`:`${entry.title} 한 줄 메모를 지웠어요.`);}
  function startPlaying(entry:Entry){onQuickSave({...entry,status:'플레이 중'},`${entry.title}을(를) 플레이 중으로 옮겼어요.`);}
  const next=status==='전체'||status==='플레이 예정'?plannedGames(records):[];
  return <div className="games-hub">
    <svg width="0" height="0" className="game-star-defs" aria-hidden="true"><defs><linearGradient id="game-star-half" x1="0" x2="1" y1="0" y2="0"><stop offset="50%" className="game-star-stop"/><stop offset="50%" stopColor="transparent"/></linearGradient></defs></svg>
    <details className="games-summary" open={summary==='open'} onToggle={e=>{const open=e.currentTarget.open;if(open!==(summary==='open'))setSummary(open?'open':'closed');}}>
      <summary><span className="games-summary-icon"><Gamepad2 size={18}/></span><span className="games-summary-copy"><strong>이어서 플레이 · Steam 최근 플레이</strong><small>{playingCount?`플레이 중 ${playingCount}개`:'플레이 중인 게임 없음'}</small></span><ChevronDown size={18} className="section-chevron"/></summary>
      <GameHighlights entries={entries} onOpen={entry=>setSelectedId(entry.id)}/>
    </details>
    {steamStats.error&&<p className="form-error" role="alert">{steamStats.error}</p>}
    <div className="game-toolbar"><div className="tabs" role="group" aria-label="게임 상태 필터">{['전체',...new Set([...gameStatuses,...entries.map(e=>e.status).filter(Boolean)])].map(s=><button key={s} className={status===s?'selected':''} aria-pressed={status===s} onClick={()=>setStatus(s)}>{s}{s==='전체'&&<span>{entries.length}</span>}</button>)}</div></div>
    <div className="game-filters"><label className="game-search"><Search size={16}/><input aria-label="게임 검색" placeholder="게임, 제작사, 장르, 태그 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <SectionFilters active={Number(platform!=='전체')+Number(groupBy==='none'&&sort!=='recent')}><label><span>플랫폼</span><select aria-label="게임 플랫폼" value={platform} onChange={e=>setPlatform(e.target.value)}>{['전체',...new Set([...gamePlatforms,...entries.map(e=>e.category).filter(Boolean)])].map(p=><option key={p}>{p}</option>)}</select></label>{groupBy==='none'&&<label><span>정렬</span><select aria-label="게임 정렬" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">최근 등록순</option><option value="name">이름순</option><option value="time">플레이 시간순</option><option value="rating">별점순</option></select></label>}</SectionFilters></div>
    <div className="game-result-bar"><div className="game-result-count">{records.length}개의 게임</div>
      <div className="game-group-controls"><span className="game-group-label" id="game-group-label">묶어 보기</span>
        <div className="game-view-toggle" role="group" aria-labelledby="game-group-label">{gameGroupModes.map(mode=><button key={mode.id} type="button" aria-pressed={groupBy===mode.id} onClick={()=>setGroupBy(mode.id)}>{mode.label}</button>)}</div></div>
      <GameViewToggle view={view} onChange={setView} label="게임 보기 방식"/></div>
    {!records.length?<section className="panel games-empty"><Gamepad2 size={42} strokeWidth={1.1}/><h2>{filtered?'조건에 맞는 게임이 없어요':'다음 모험을 기록해보세요.'}</h2><p>{filtered?'검색어나 상태, 플랫폼을 바꿔보세요.':'Steam 상점 정보와 나만의 플레이 기록으로 게임 라이브러리를 채워보세요.'}</p><button className="button primary" onClick={onAdd}><Plus size={15}/>게임 추가하기</button></section>
    :view==='list'?<section className="game-list" aria-label="게임 목록">{groups.map(group=><div className="game-group" key={group.label||'all'}>
      {group.label&&<div className="game-group-heading"><h2>{group.label}</h2><span>{group.entries.length}개</span></div>}
      <ul>{group.entries.map(entry=><li className="game-row" key={entry.id}>
        <button type="button" className="game-row-main" onClick={()=>setSelectedId(entry.id)}>
          <GameCover key={coverOf(entry)||'empty'} imageUrl={coverOf(entry)} title={entry.title} thumb/>
          <span className="game-row-copy"><strong>{entry.title}</strong><small>{[goneIds.includes(entry.id)?'Steam 찜에 없음':null,groupBy==='genre'?null:gameGenre(entry)==='장르 미기록'?null:gameGenre(entry),entry.category||'플랫폼 미기록'].filter(Boolean).join(' · ')}</small><small className="game-row-phone-meta">{entry.status||'상태 미기록'} · {timeOf(entry)}</small></span>
        </button>
        <span className="game-row-time">{timeOf(entry)}</span>
        <InlineStars entry={entry} rating={ratingOf(entry)} onRate={value=>rate(entry,value)}/>
        <button type="button" className="game-row-rate" aria-label={`${entry.title} 별점 바꾸기, 지금 ${ratingOf(entry)===null?'없음':`${ratingOf(entry)}점`}`} onClick={()=>setRatingId(entry.id)}><StarShape rating={ratingOf(entry)===null?null:1} index={1} size={15}/>{ratingLabel(ratingOf(entry))}</button>
        <span className={`game-status-pill game-status-${statusTone(entry.status)}`}>{entry.status||'상태 미기록'}</span>
        <div className="game-row-memo"><MemoCell key={entry.detail} entry={entry} onSave={line=>saveMemo(entry,line)}/></div>
        <RowMenu entry={entry} onEdit={()=>onEdit(entry)} onDelete={()=>onDelete(entry)}/>
      </li>)}</ul>
    </div>)}</section>
    :<div className="game-covers">
      {next.length>0&&<section className="game-next" aria-labelledby="game-next-title">
        <div className="game-next-main"><div className="game-next-heading"><h2 id="game-next-title">다음에 할 게임</h2><span>플레이 예정 중 최근에 담은 것</span></div>
          <button type="button" className="game-next-cover" onClick={()=>setSelectedId(next[0].id)} aria-label={`${next[0].title} 기록 보기`}><GameCover key={coverOf(next[0])||'empty'} imageUrl={coverOf(next[0])} title={next[0].title}/></button>
          <div className="game-next-foot"><div><strong>{next[0].title}</strong><small>{[gameGenre(next[0])==='장르 미기록'?null:gameGenre(next[0]),timeOf(next[0])].filter(Boolean).join(' · ')}</small></div><button type="button" className="button primary" onClick={()=>startPlaying(next[0])}>플레이 중으로</button></div>
        </div>
        {next.length>1&&<div className="game-next-more"><h3>그다음</h3>{next.slice(1,4).map(entry=><button type="button" key={entry.id} className="game-next-item" onClick={()=>setSelectedId(entry.id)}><GameCover key={coverOf(entry)||'empty'} imageUrl={coverOf(entry)} title={entry.title} thumb/><span><strong>{entry.title}</strong><small>{[gameGenre(entry)==='장르 미기록'?null:gameGenre(entry),timeOf(entry)].filter(Boolean).join(' · ')}</small></span></button>)}</div>}
      </section>}
      {groups.map(group=>{const average=averageRating(group.entries);return <section className="game-shelf" key={group.label||'all'} aria-label={group.label||'게임 표지'}>
        {group.label&&<div className="game-shelf-heading"><h2>{group.label}</h2><span>{group.entries.length}개{average===null?'':` · 평균 ★ ${average.toFixed(1)}`}</span></div>}
        <div className="game-shelf-grid">{group.entries.map(entry=><button type="button" className="game-tile" key={entry.id} onClick={()=>setSelectedId(entry.id)}>
          <span className="game-tile-cover"><GameCover key={coverOf(entry)||'empty'} imageUrl={coverOf(entry)} title={entry.title}/>{ratingOf(entry)!==null&&<span className="game-tile-rating"><Star size={13} aria-hidden="true"/>{ratingLabel(ratingOf(entry))}</span>}</span>
          <span className="game-tile-copy"><strong>{entry.title}</strong><small>{[entry.status||'상태 미기록',timeOf(entry)].join(' · ')}</small></span>
        </button>)}</div>
      </section>;})}
    </div>}
    <SectionStats label="게임 기록 요약"><section className="game-overview" aria-label="게임 라이브러리 현황"><div><Gamepad2 size={18}/><span>플레이 중</span><strong>{stats.playing}<small>개</small></strong></div><div><Trophy size={18}/><span>완료한 게임</span><strong>{stats.completed}<small>개</small></strong></div><div><Star size={18}/><span>위시리스트</span><strong>{stats.wishlist}<small>개</small></strong></div><div><Timer size={18}/><span>플레이 시간</span><strong className="game-total-time">{played.length?playTime(played.reduce((sum,play)=>sum+(play.minutes??0),0)):'아직 기록 전'}</strong><small>Steam {played.filter(play=>play.source==='steam').length}개 · Xbox {played.filter(play=>play.source==='xbox').length}개 · 직접 기록 {played.filter(play=>play.source==='own').length}개 기준</small></div></section></SectionStats>
    <p className="games-caption">플레이 시간은 Steam, Xbox, 직접 기록 순으로 표시합니다. 별점은 목록에서 바로 저장할 수 있어요. 한 줄 메모는 플레이 · 감상 메모의 첫 줄입니다.</p>
    {rating&&<RatingSheet entry={rating} cover={coverOf(rating)} onClose={()=>setRatingId(null)} onSave={value=>{setRatingId(null);rate(rating,value);}}/>}
    {selected&&<Dialog title={selected.title} onClose={()=>setSelectedId(null)} className="game-dialog section-detail"><GameCover key={coverOf(selected)||'empty'} imageUrl={coverOf(selected)} title={selected.title}/><div className="game-detail"><div className="game-detail-badges"><span className="badge">{selected.category||'플랫폼 미기록'}</span><span className="badge">{selected.status||'상태 미기록'}</span></div><dl className="game-specs"><div><dt>플레이 시간</dt><dd>{timeOf(selected)}</dd></div><div><dt>나의 별점</dt><dd>{selected.game?.rating==null?'미기록':`${selected.game.rating} / 5`}</dd></div><div><dt>시작일</dt><dd>{selected.game?.startedAt||'미기록'}</dd></div><div><dt>완료일</dt><dd>{selected.game?.completedAt||'미기록'}</dd></div></dl>{selected.game?.tags.length?<div className="game-tags">{selected.game.tags.map(t=><span key={t}>#{t}</span>)}</div>:null}<h3>플레이 · 감상 메모</h3><p className="game-memo">{selected.detail||'아직 남긴 감상이 없어요.'}</p>{selected.game?.steamAccount&&<SteamLinkedTime reference={selected.game.steamAccount} stat={steamStats.find(selected.game.steamAccount)}/>} {selected.game?.steam&&<section className="game-steam-detail"><h3>Steam 상점 정보</h3><strong>{selected.game.steam.name}</strong><p>{selected.game.steam.description||'제공된 소개가 없습니다.'}</p><dl><div><dt>제작사</dt><dd>{selected.game.steam.developers.join(' · ')||'정보 없음'}</dd></div><div><dt>배급사</dt><dd>{selected.game.steam.publishers.join(' · ')||'정보 없음'}</dd></div><div><dt>{selected.game.steam.comingSoon?'출시 예정':'출시일'}</dt><dd>{selected.game.steam.releaseDate||'정보 없음'}</dd></div></dl><div className="game-tags">{selected.game.steam.genres.map(g=><span key={g}>{g}</span>)}</div><a className="text-button blue" href={selected.game.steam.storeUrl} target="_blank" rel="noreferrer">Steam에서 보기<ArrowUpRight size={13}/></a><small className="game-source-time">{new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'}).format(new Date(selected.game.steam.checkedAt))} 확인한 상점 정보</small></section>}{selected.url&&<a className="text-button muted game-related-link" href={safeUrl(selected.url)} target="_blank" rel="noreferrer">관련 링크 열기<ArrowUpRight size={13}/></a>}</div><div className="dialog-footer"><button className="button secondary" onClick={()=>setSelectedId(null)}>닫기</button><button className="button primary" onClick={()=>{setSelectedId(null);onEdit(selected);}}><Pencil size={14}/>기록 수정</button></div></Dialog>}
  </div>;
}

export function GameEntryModal({entry,isNew=false,onSave,onClose}:{entry?:Entry;isNew?:boolean;onSave:(entry:Entry)=>boolean;onClose:()=>void}){
  const base=entry?.game??emptyGame();
  const [steamAccount,setSteamAccount]=useState(base.steamAccount);
  const [xboxTitleId,setXboxTitleId]=useState(base.xboxTitleId);
  const [title,setTitle]=useState(entry?.title??''),[platform,setPlatform]=useState(entry?.category||'PC'),[status,setStatus]=useState(entry?.status||'플레이 예정'),[detail,setDetail]=useState(entry?.detail??''),[url,setUrl]=useState(entry?.url??''),[rating,setRating]=useState(base.rating===null?'':String(base.rating)),[tags,setTags]=useState(base.tags.join(', ')),[steam,setSteam]=useState(base.steam),[lookupInput,setLookupInput]=useState(base.steam?.storeUrl??(base.steamAccount?`https://store.steampowered.com/app/${base.steamAccount.appId}/`:'')),[candidate,setCandidate]=useState<SteamMetadata|null>(null),[loading,setLoading]=useState(false),[lookupError,setLookupError]=useState(''),[lookupMessage,setLookupMessage]=useState(''),[error,setError]=useState('');
  const alive=useRef(true),abort=useRef<AbortController|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  // The hand-recorded time is only asked for when the linked Steam account has no minutes for this game.
  const linkedStats=useSteamEntryStats(steamAccount?[{game:{steamAccount}} as unknown as Entry]:[]);
  const linkedStat=steamAccount?linkedStats.find(steamAccount):undefined;
  const steamTotal=linkedStat?.connected&&linkedStat.game?linkedStat.game.totalMinutes:null;
  const askOwnTime=ownPlayTimeShown(steamTotal);
  async function lookup(){
    const id=steamAppId(lookupInput);setLookupError('');setLookupMessage('');setCandidate(null);
    if(id===null){setLookupError('Steam 상점 주소 또는 숫자 App ID를 입력해주세요.');return;}
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setLoading(true);
    try{const response=await fetch(`/api/games/steam?appId=${id}`,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(response.status===404?'공개 상점에서 게임을 찾지 못했어요. 직접 입력할 수 있습니다.':response.status===503?'Steam 요청이 많아 잠시 후 다시 확인해주세요.':'Steam 정보를 불러오지 못했어요. 직접 입력하거나 다시 시도해주세요.');const body=await response.json();const result=validateSteam(body.game);if(result.appId!==id)throw new Error('게임 정보를 확인하지 못했어요.');if(alive.current)setCandidate(result);}catch(e){if(alive.current&&!controller.signal.aborted)setLookupError(e instanceof Error?e.message:'Steam 연결을 확인해주세요.');}finally{if(alive.current)setLoading(false);}
  }
  function apply(){if(!candidate)return;setSteam(candidate);if(!title.trim())setTitle(candidate.name);if(!url.trim())setUrl(candidate.storeUrl);setCandidate(null);setLookupMessage('Steam 정보를 채웠어요. 아래에서 기록을 저장해주세요.');}
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    try{if(!title.trim())throw new Error('게임 이름을 입력해주세요.');if(url.trim()&&!safeUrl(url.trim()))throw new Error('http:// 또는 https://로 시작하는 관련 링크를 입력해주세요.');const form=new FormData(event.currentTarget),hours=String(form.get('hours')??''),minutes=String(form.get('minutes')??'');if((hours&&!/^\d+$/.test(hours))||(minutes&&!/^\d+$/.test(minutes))||Number(minutes)>59)throw new Error('시간은 정수, 분은 0~59로 입력해주세요.');const game=validateGame({...base,steamAccount,xboxTitleId,playMinutes:hours===''&&minutes===''?null:Number(hours)*60+Number(minutes),rating:rating===''?null:Number(rating),startedAt:String(form.get('startedAt')??''),completedAt:String(form.get('completedAt')??''),tags:tags.split(/[,，\n]/).map(t=>t.trim().replace(/^#+/, '')).filter(Boolean),steam});onSave({id:entry?.id??crypto.randomUUID(),kind:'games',title:title.trim(),detail:detail.trim(),category:platform,status,url:url.trim()?safeUrl(url.trim()):'',date:entry?.date??'',done:entry?.done??false,createdAt:entry?.createdAt??new Date().toISOString(),game});}catch(e){setError(e instanceof Error?e.message:'입력 내용을 확인해주세요.');}
  }
  return <Dialog title={`게임 ${entry?.title&&!isNew?'수정':'추가'}`} onClose={onClose} className="game-dialog"><form onSubmit={submit}><div className="entry-form"><SteamAccountField appId={steam?.appId??steamAccount?.appId} value={steamAccount} onChange={setSteamAccount}/>
    <details className="game-import" open={!entry?.title}><summary>Steam 상점 정보 불러오기</summary><p>상점 URL 또는 App ID로 제목·제작사·장르·이미지를 확인하세요. 직접 입력한 메모는 유지됩니다.</p><div className="game-import-input"><input aria-label="Steam 상점 URL 또는 App ID" placeholder="https://store.steampowered.com/app/… 또는 App ID" maxLength={2000} value={lookupInput} disabled={loading} onChange={e=>{setLookupInput(e.target.value);setCandidate(null);setLookupError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!loading)void lookup();}}}/><button type="button" className="button secondary" disabled={loading} onClick={()=>{void lookup();}}><RefreshCw size={14} className={loading?'game-loading-icon':''}/>{loading?'확인 중':'정보 확인'}</button></div>{lookupError&&<p className="form-error" role="alert">{lookupError}</p>}{candidate&&<div className="game-import-preview"><GameCover key={candidate.imageUrl} imageUrl={candidate.imageUrl} title={candidate.name}/><div><strong>{candidate.name}</strong><small>{candidate.developers.join(' · ')} · {candidate.genres.join(' / ')}</small><button type="button" className="text-button blue" onClick={apply}><Check size={14}/>{title.trim()?'Steam 정보 적용 · 현재 제목 유지':'이 게임 정보 사용'}</button></div></div>}{lookupMessage&&<p className="game-import-message" role="status">{lookupMessage}</p>}</details>
    <label>게임 이름 *<input autoFocus required maxLength={200} placeholder="다음에 플레이할 게임" value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <div className="form-two-columns"><label>플랫폼<select value={platform} onChange={e=>setPlatform(e.target.value)}>{[...new Set([...gamePlatforms,platform])].map(p=><option key={p}>{p}</option>)}</select></label><label>상태<select value={status} onChange={e=>setStatus(e.target.value)}>{[...new Set([...gameStatuses,status])].map(s=><option key={s}>{s}</option>)}</select></label></div>
    {askOwnTime?<fieldset className="game-playtime-fields"><legend>플레이 시간 · 직접 기록</legend><div className="form-two-columns"><label>시간<input name="hours" type="number" inputMode="numeric" min="0" max="100000" step="1" defaultValue={base.playMinutes===null?'':Math.floor(base.playMinutes/60)} placeholder="미기록"/></label><label>분<input name="minutes" type="number" inputMode="numeric" min="0" max="59" step="1" defaultValue={base.playMinutes===null?'':base.playMinutes%60} placeholder="0~59"/></label></div><small className="game-playtime-note">연결한 플랫폼의 플레이 시간이 없으면 이 시간을 보여줘요.</small></fieldset>
      :<p className="game-playtime-steam"><Timer size={14} aria-hidden="true"/>플레이 시간은 Steam 기록({playTime(steamTotal)})을 써요.<input type="hidden" name="hours" defaultValue={base.playMinutes===null?'':Math.floor(base.playMinutes/60)}/><input type="hidden" name="minutes" defaultValue={base.playMinutes===null?'':base.playMinutes%60}/></p>}
    <div className="form-two-columns"><label>시작일<input name="startedAt" type="date" defaultValue={base.startedAt}/></label><label>완료일<input name="completedAt" type="date" defaultValue={base.completedAt}/></label></div>
    <div className="form-two-columns"><label>나의 별점<select value={rating} onChange={e=>setRating(e.target.value)}><option value="">미기록</option>{Array.from({length:11},(_,i)=>(10-i)/2).map(value=><option key={value} value={value}>{value} / 5</option>)}</select></label><label>태그<input maxLength={254} value={tags} onChange={e=>setTags(e.target.value)} placeholder="쉼표로 구분 · 최대 8개"/></label></div>
    {steam&&<div className="game-linked-steam"><div><span className="badge">Steam 연결</span><strong>{steam.name}</strong></div><button type="button" className="text-button muted" onClick={()=>{setSteam(undefined);setLookupMessage('Steam 정보 연결을 해제했어요. 플레이 기록은 유지됩니다.');}}>연결 해제</button></div>}
    {xboxTitleId&&<div className="game-linked-steam"><span className="badge">Xbox 플레이 기록 연결</span><button type="button" className="text-button muted" onClick={()=>setXboxTitleId(undefined)}>Xbox 연결 해제</button></div>}
    <label>관련 링크<input type="url" maxLength={2000} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/></label><label>플레이 · 감상 메모<textarea rows={5} maxLength={10000} value={detail} onChange={e=>setDetail(e.target.value)} placeholder="좋았던 순간, 다음 목표, 엔딩을 보고 남기는 감상"/></label>{error&&<p className="form-error" role="alert">{error}</p>}
    </div><div className="dialog-footer"><span><Database size={12}/>기기에 보관 후 서버와 동기화합니다</span><button type="button" className="button secondary" onClick={onClose}>취소</button><button type="submit" className="button primary"><Check size={15}/>저장하기</button></div></form></Dialog>;
}
