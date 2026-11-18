'use client';
import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,CalendarDays,ChevronLeft,ChevronRight,Clock3,Plus,RefreshCw} from 'lucide-react';
import {type Entry} from '@/lib/store';
import {calendarPeriod,eventOnDay,eventStartDay,lastCalendarDay,localCalendarEvent,type CalendarEvent,type CalendarResponse} from '@/lib/calendar';

export function useCalendarSnapshot(enabled:boolean){
  const [data,setData]=useState<CalendarResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const reload=useCallback(async(signal?:AbortSignal)=>{setLoading(true);try{const response=await fetch('/api/calendar',{credentials:'same-origin',cache:'no-store',signal});if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))throw new Error();const next=await response.json();if(typeof next.revision!=='number'||!Object.hasOwn(next,'snapshot'))throw new Error();if(!signal?.aborted){setData(next);setError('');}}catch{if(!signal?.aborted)setError('반영한 일정을 불러오지 못했어요. 이전 표시가 있으면 마지막 반영본입니다.');}finally{if(!signal?.aborted)setLoading(false);}},[]);
  useEffect(()=>{if(!enabled)return;const controller=new AbortController();void reload(controller.signal);return()=>controller.abort();},[enabled,reload]);
  return {data,loading,error,reload:()=>{void reload();}};
}
type Props={calendar:ReturnType<typeof useCalendarSnapshot>;entries:Entry[];today:string;hidden:string[];onHiddenChange:(ids:string[])=>void;onAdd:(day:string)=>void;onEdit:(entry:Entry)=>void;compact?:boolean};
const sourceColors=['#a0a9f4','#e3b477','#81cbb5','#c99dd7','#e098a5','#89bce0','#a3b36e'];
export default function CalendarHub({calendar,entries,today,hidden,onHiddenChange,onAdd,onEdit,compact=false}:Props){
  const [month,setMonth]=useState(''),[day,setDay]=useState(''),[sourcesOpen,setSourcesOpen]=useState(false);
  const sourcePanel=useRef<HTMLElement>(null);
  const hasToday=Boolean(today);
  useEffect(()=>{
    if(compact||!hasToday)return;
    const openSources=()=>{
      if(window.location.hash!=='#calendar-sources')return;
      setSourcesOpen(true);
      sourcePanel.current?.focus({preventScroll:true});
      sourcePanel.current?.scrollIntoView({block:'start'});
    };
    openSources();
    window.addEventListener('hashchange',openSources);
    return()=>window.removeEventListener('hashchange',openSources);
  },[compact,hasToday]);
  const snapshot=calendar.data?.snapshot,visibleMonth=month||today.slice(0,7),selected=day||today;
  const sources=[{id:'hub-local',name:'HUB에 직접 등록',provider:'hub'},...(snapshot?.sources??[])];
  const sourceName=(id:string)=>sources.find(s=>s.id===id)?.name??'알 수 없는 캘린더';
  const sourceColor=(id:string)=>sourceColors[Math.max(0,sources.findIndex(s=>s.id===id))%sourceColors.length];
  const local=entries.map(localCalendarEvent).filter((e):e is CalendarEvent=>!!e);
  const visible=[...local,...(snapshot?.events??[])].filter(e=>!hidden.includes(e.sourceId));
  const selectedEvents=visible.filter(e=>eventOnDay(e,selected)).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start.localeCompare(b.start)||a.title.localeCompare(b.title,'ko'));
  const upcoming=visible.filter(e=>e.allDay?e.end>today:Date.parse(e.end)>=Date.parse(today+'T00:00:00+09:00')).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,3);
  if(!today)return <section className="panel connected-calendar-loading">캘린더를 준비하고 있어요.</section>;
  const [year,monthNumber]=visibleMonth.split('-').map(Number),first=new Date(Date.UTC(year,monthNumber-1,1)),days=new Date(Date.UTC(year,monthNumber,0)).getUTCDate(),start=first.getUTCDay();
  const cells=Math.ceil((start+days)/7)*7;
  const outside=snapshot&&(visibleMonth+'-01'>=snapshot.rangeEnd||new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10)<snapshot.rangeStart);
  const move=(offset:number)=>{const next=new Date(Date.UTC(year,monthNumber-1+offset,1)).toISOString().slice(0,10);setMonth(next.slice(0,7));setDay(next);};
  const toggle=(id:string)=>onHiddenChange(hidden.includes(id)?hidden.filter(x=>x!==id):[...hidden,id]);
  const rows=(events:CalendarEvent[])=>events.map(event=><div className="connected-event" key={event.sourceId+':'+event.id}><span style={{background:sourceColor(event.sourceId)}}/><div><small>{sourceName(event.sourceId)} · {calendarPeriod(event)}</small>{event.sourceId==='hub-local'?<button onClick={()=>{const entry=entries.find(e=>e.id===event.id);if(entry)onEdit(entry);}}>{event.title}</button>:event.url?<a href={event.url} target="_blank" rel="noreferrer">{event.title}<ArrowUpRight size={13}/></a>:<strong>{event.title}</strong>}{compact&&<em>{eventOnDay(event,today)?'오늘':eventStartDay(event)}</em>}</div></div>);
  return <div className={`connected-calendar ${compact?'compact':''}`}>
    {!compact&&<aside id="calendar-sources" ref={sourcePanel} tabIndex={-1} aria-label="표시할 캘린더" className="panel calendar-source-panel"><div className="panel-heading"><h2>표시할 캘린더</h2><span>{sources.filter(s=>!hidden.includes(s.id)).length}/{sources.length}</span></div><button className="calendar-source-mobile-toggle" aria-expanded={sourcesOpen} onClick={()=>setSourcesOpen(value=>!value)}><span>표시할 캘린더 <small>{sources.filter(s=>!hidden.includes(s.id)).length}/{sources.length}</small></span><span>{sourcesOpen?"접기":"선택하기"}<ChevronRight size={15}/></span></button><div className={`calendar-source-content ${sourcesOpen?"expanded":""}`}><p>보고 싶은 일정만 켜두세요.</p><div className="calendar-source-controls"><button className="text-button blue" onClick={()=>onHiddenChange(hidden.filter(id=>!sources.some(s=>s.id===id)))}>모두 켜기</button><button className="text-button muted" onClick={()=>onHiddenChange([...new Set([...hidden,...sources.map(s=>s.id)])])}>모두 끄기</button></div>{sources.map(source=><label className="calendar-source-toggle" key={source.id}><input type="checkbox" aria-label={`${source.name} 표시`} checked={!hidden.includes(source.id)} onChange={()=>toggle(source.id)}/><span className="calendar-source-dot" style={{background:sourceColor(source.id)}}/><span><strong>{source.name}</strong><small>{source.provider==='notion'?'Notion':source.provider==='google'?'Google':'HUB'} · {source.id==='hub-local'?local.length:(snapshot?.events.filter(e=>e.sourceId===source.id).length??0)}개</small></span></label>)}<p className="calendar-source-caption">표시 설정은 계정에 저장됩니다. 일정을 끄더라도 원본과 반영한 기록은 삭제하지 않습니다.</p></div></aside>}
    <section className="panel connected-month"><div className="connected-calendar-title"><h2>{compact?'나의 캘린더':'내 일정을 한눈에'}</h2>{compact?<Link href="/calendar/" aria-label="캘린더 전체 보기" className="icon-button"><ArrowUpRight size={16}/></Link>:<span className="badge">KST</span>}</div><div className="month-navigation"><strong>{year}년 {monthNumber}월</strong><div><button className="icon-button" aria-label="이전 달" onClick={()=>move(-1)}><ChevronLeft size={15}/></button><button className="calendar-today" onClick={()=>{setMonth(today.slice(0,7));setDay(today);}}>오늘</button><button className="icon-button" aria-label="다음 달" onClick={()=>move(1)}><ChevronRight size={15}/></button></div></div><div className="connected-month-grid" role="group" aria-label={`${year}년 ${monthNumber}월 일정`}>{['일','월','화','수','목','금','토'].map((w,i)=><span className={i===0?'sunday':''} key={w}>{w}</span>)}{Array.from({length:cells},(_,i)=>{const n=i-start+1;if(n<1||n>days)return <span className="calendar-blank" key={i}/>;const date=`${visibleMonth}-${String(n).padStart(2,'0')}`,events=visible.filter(e=>eventOnDay(e,date));return <button key={i} aria-label={`${monthNumber}월 ${n}일, ${events.length}개 일정`} aria-pressed={selected===date} className={`${date===today?'is-today':''} ${selected===date?'is-selected':''} ${i%7===0?'sunday':''}`} onClick={()=>setDay(date)}><b>{n}</b><span className="calendar-event-dots">{[...new Set(events.map(e=>e.sourceId))].slice(0,3).map(id=><i style={{background:sourceColor(id)}} key={id}/>)}{!compact&&events.length>0&&<small>{events.length}</small>}</span></button>;})}</div>{outside&&<p className="calendar-range-warning">외부 일정의 반영 기간 밖입니다. 직접 등록한 일정만 표시될 수 있어요.</p>}{compact&&<><div className="connected-upcoming-heading"><strong>다가오는 일정</strong><button className="text-button blue" onClick={()=>onAdd(today)}><Plus size={13}/>추가</button></div>{upcoming.length?rows(upcoming):<p className="calendar-day-empty">표시 중인 다가오는 일정이 없어요.</p>}</>}</section>
    {!compact&&<section className="panel connected-agenda"><div className="panel-heading"><h2>{selected} <span>{selectedEvents.length}개의 일정</span></h2><button className="text-button blue" onClick={()=>onAdd(selected)}><Plus size={14}/>HUB 일정 추가</button></div>{selectedEvents.length?rows(selectedEvents):<div className="calendar-day-empty"><CalendarDays size={25}/><p>이 날짜에 표시할 일정이 없어요.</p><small>캘린더가 꺼져 있다면 왼쪽에서 켜보세요.</small></div>}</section>}
    <section className="calendar-sync-info"><div><Clock3 size={14}/><span>{snapshot?`수동 반영 · ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(snapshot.syncedAt))} KST`:'외부 일정 반영 전'}</span>{calendar.loading&&<span>불러오는 중…</span>}</div>{!compact&&<><p>{snapshot?`${snapshot.rangeStart}부터 ${lastCalendarDay(snapshot.rangeEnd)}까지의 반영본입니다.`:'Notion·Google 일정을 요청 시 반영할 수 있습니다.'} 새 원본 일정은 이 채팅에 ‘캘린더 일정 다시 반영해줘’라고 요청해주세요. 자동 실행은 하지 않습니다.</p><button className="text-button muted" onClick={calendar.reload} disabled={calendar.loading}><RefreshCw size={13}/>반영 내역 새로고침</button></>}{calendar.error&&<p className="form-error" role="alert">{calendar.error}</p>}</section>
  </div>;
}
