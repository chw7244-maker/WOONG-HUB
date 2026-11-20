'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,CalendarDays,ChevronDown,ChevronLeft,ChevronRight,Clock3,Plus,RefreshCw} from 'lucide-react';
import {type Entry} from '@/lib/store';
import {calendarPeriod,eventOnDay,eventStartDay,isCalendarDay,lastCalendarDay,type CalendarEvent,type CalendarResponse} from '@/lib/calendar';
import {addCalendarDays,dashboardDay,dashboardEvents} from '@/lib/home-dashboard';
import {footballSourceId,footballSourceName} from '@/lib/football';

export function useCalendarSnapshot(enabled:boolean){
  const [data,setData]=useState<CalendarResponse|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const reload=useCallback(async(signal?:AbortSignal)=>{setLoading(true);try{const response=await fetch('/api/calendar',{credentials:'same-origin',cache:'no-store',signal});if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))throw new Error();const next=await response.json();if(typeof next.revision!=='number'||!Object.hasOwn(next,'snapshot'))throw new Error();if(!signal?.aborted){setData(next);setError('');}}catch{if(!signal?.aborted)setError('반영한 일정을 불러오지 못했어요. 이전 표시가 있으면 마지막 반영본입니다.');}finally{if(!signal?.aborted)setLoading(false);}},[]);
  useEffect(()=>{if(!enabled)return;const controller=new AbortController();void reload(controller.signal);return()=>controller.abort();},[enabled,reload]);
  return {data,loading,error,reload:()=>{void reload();}};
}
type Props = {
  calendar: ReturnType<typeof useCalendarSnapshot>;
  entries: Entry[];
  matches: CalendarEvent[];
  onRemoveMatch: (id: string) => void;
  today: string;
  hidden: string[];
  onHiddenChange: (ids: string[]) => void;
  onAdd: (day: string) => void;
  onEdit: (entry: Entry) => void;
};

const sourceColors = ['#a0a9f4', '#e3b477', '#81cbb5', '#c99dd7', '#e098a5', '#89bce0', '#a3b36e'];
const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' });
const stamp = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export default function CalendarHub({calendar,entries,matches,onRemoveMatch,today,hidden,onHiddenChange,onAdd,onEdit}: Props) {
  const [selectedDay, setSelectedDay] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const sourcePanel = useRef<HTMLElement>(null);
  const sourceToggle = useRef<HTMLButtonElement>(null);
  const monthPanel = useRef<HTMLElement>(null);
  const agendaHeading = useRef<HTMLHeadingElement>(null);
  const hasToday = Boolean(today);
  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get('date');
    if (isCalendarDay(date)) setSelectedDay(date);
  }, []);
  useEffect(() => {
    if (!hasToday) return;
    const openSources = () => {
      if (window.location.hash !== '#calendar-sources') return;
      setSourcesOpen(true);
      sourceToggle.current?.focus({ preventScroll: true });
      sourcePanel.current?.scrollIntoView({ block: 'start' });
    };
    openSources();
    window.addEventListener('hashchange', openSources);
    return () => window.removeEventListener('hashchange', openSources);
  }, [hasToday]);

  if (!today) return <p className="connected-calendar-loading">캘린더를 준비하고 있어요.</p>;
  const selected = selectedDay || today;
  const snapshot = calendar.data?.snapshot;
  const sources = [
    { id: 'hub-local', name: 'HUB에 직접 등록', provider: 'hub' },
    ...(matches.length ? [{ id: footballSourceId, name: footballSourceName, provider: 'football' }] : []),
    ...(snapshot?.sources ?? []),
  ];
  const visibleSources = sources.filter(source => !hidden.includes(source.id));
  const events = dashboardEvents(entries, snapshot, hidden, matches);
  const selectedEvents = dashboardDay(events, selected);
  const outside = snapshot && visibleSources.some(source => source.provider === 'notion' || source.provider === 'google') &&
    (selected < snapshot.rangeStart || selected >= snapshot.rangeEnd);
  const [year, month] = selected.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = first.getUTCDay();
  const cells = Math.ceil((start + days) / 7) * 7;

  function moveMonth(offset: number) {
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    setSelectedDay(next.toISOString().slice(0, 10));
  }
  function chooseDay(day: string) {
    setSelectedDay(day);
    if (monthOpen && window.matchMedia('(max-width: 760px)').matches) {
      setMonthOpen(false);
      requestAnimationFrame(() => agendaHeading.current?.focus({preventScroll:true}));
    }
  }
  function toggleSource(id: string) {
    onHiddenChange(hidden.includes(id) ? hidden.filter(value => value !== id) : [...hidden, id]);
  }

  return <div className="calendar-screen">
    <section id="calendar-sources" className="calendar-source-drawer" ref={sourcePanel} aria-label="표시할 캘린더">
      <button type="button" ref={sourceToggle} className="calendar-source-trigger" onClick={()=>setSourcesOpen(value=>!value)}
        aria-expanded={sourcesOpen} aria-controls="calendar-source-options">
        <CalendarDays size={17} aria-hidden="true"/><strong>표시할 캘린더</strong>
        <small>{visibleSources.length}/{sources.length}</small><ChevronDown size={16} aria-hidden="true"/>
      </button>
      <div id="calendar-source-options" hidden={!sourcesOpen}>
        <div className="calendar-source-controls">
          <button type="button" className="text-button blue" onClick={()=>onHiddenChange(hidden.filter(id=>!sources.some(source=>source.id===id)))}>모두 켜기</button>
          <button type="button" className="text-button muted" onClick={()=>onHiddenChange([...new Set([...hidden,...sources.map(source=>source.id)])])}>모두 끄기</button>
        </div>
        <div className="calendar-source-options">
          {sources.map((source,index)=><label className="calendar-source-toggle" key={source.id}>
            <input type="checkbox" aria-label={source.name+' 표시'} checked={!hidden.includes(source.id)} onChange={()=>toggleSource(source.id)}/>
            <span className="calendar-source-dot" style={{background:sourceColors[index%sourceColors.length]}} aria-hidden="true"/>
            <span><strong>{source.name}</strong><small>{source.provider==='notion'?'Notion':source.provider==='google'?'Google':source.provider==='football'?'맨시티 공식 일정':'HUB'}</small></span>
          </label>)}
        </div>
      </div>
    </section>

    {matches.length > 0 && <details className="calendar-saved-matches">
      <summary><strong>{footballSourceName}</strong><small>{matches.length}개</small><ChevronDown size={16} aria-hidden="true"/></summary>
      {hidden.includes(footballSourceId) && <p>‘표시할 캘린더’에서 경기 표시가 꺼져 있어요.</p>}
      <ul>
        {matches.slice().sort((a,b)=>b.start.localeCompare(a.start)).map(match => <li key={match.id}>
          <div>
            <button type="button" className="calendar-match-date" aria-label={`${match.title} 날짜 보기`} onClick={()=>{
              if (hidden.includes(footballSourceId)) toggleSource(footballSourceId);
              chooseDay(eventStartDay(match));
              requestAnimationFrame(()=>{
                agendaHeading.current?.scrollIntoView({block:'nearest'});
                agendaHeading.current?.focus({preventScroll:true});
              });
            }}>{match.title}</button>
            <small>{[calendarPeriod(match), match.note].filter(Boolean).join(' · ')}</small>
          </div>
          <button type="button" className="text-button muted" aria-label={`${match.title} 담기 취소`} onClick={()=>onRemoveMatch(match.id)}>담기 취소</button>
        </li>)}
      </ul>
    </details>}

    <div className="calendar-view-grid">
      <section id="calendar-month" className={`panel connected-month ${monthOpen?'open-mobile':''}`} ref={monthPanel} aria-label="월간 달력">
        <div className="month-navigation">
          <h2>{year}년 {month}월</h2>
          <div>
            <button type="button" className="icon-button" aria-label="이전 달" onClick={()=>moveMonth(-1)}><ChevronLeft size={17}/></button>
            <button type="button" className="calendar-today" onClick={()=>setSelectedDay(today)}>오늘</button>
            <button type="button" className="icon-button" aria-label="다음 달" onClick={()=>moveMonth(1)}><ChevronRight size={17}/></button>
          </div>
        </div>
        <div className="connected-month-grid" role="group" aria-label={`${year}년 ${month}월 일정`}>
          {['일','월','화','수','목','금','토'].map((weekday,index)=><span className={index===0?'sunday':''} key={weekday}>{weekday}</span>)}
          {Array.from({length:cells},(_,index)=>{
            const number=index-start+1;
            if(number<1||number>days)return <span className="calendar-blank" key={index}/>;
            const day=selected.slice(0,7)+'-'+String(number).padStart(2,'0');
            const matches=events.filter(event=>eventOnDay(event,day));
            const eventSources=[...new Set(matches.map(event=>event.sourceId))].slice(0,3);
            return <button type="button" key={day} aria-label={`${month}월 ${number}일, ${matches.length}개 일정`} aria-pressed={selected===day}
              className={`${day===today?'is-today':''} ${selected===day?'is-selected':''} ${index%7===0?'sunday':''}`} onClick={()=>chooseDay(day)}>
              <b>{number}</b><span className="calendar-event-dots" aria-hidden="true">{eventSources.map(id=><i key={id} style={{background:sourceColors[sources.findIndex(source=>source.id===id)%sourceColors.length]}}/>)}</span>
            </button>;
          })}
        </div>
      </section>

      <section className="panel connected-agenda" aria-labelledby="calendar-agenda-heading">
        <div className="calendar-agenda-title">
          <div><h2 id="calendar-agenda-heading" ref={agendaHeading} tabIndex={-1}>{dateLabel.format(new Date(selected+'T00:00:00Z'))}</h2><small>{selectedEvents.length}개 일정 · KST</small></div>
          <button type="button" className="text-button blue" onClick={()=>onAdd(selected)}><Plus size={16}/>일정 추가</button>
        </div>
        <div className="calendar-agenda-nav">
          <button type="button" className="icon-button" aria-label="이전 날짜" onClick={()=>setSelectedDay(addCalendarDays(selected,-1))}><ChevronLeft size={18}/></button>
          <button type="button" className="text-button muted" onClick={()=>setSelectedDay(today)}>오늘</button>
          <button type="button" className="icon-button" aria-label="다음 날짜" onClick={()=>setSelectedDay(addCalendarDays(selected,1))}><ChevronRight size={18}/></button>
          <button type="button" className="calendar-month-toggle" aria-controls="calendar-month" aria-expanded={monthOpen} onClick={()=>{
            if(monthOpen){setMonthOpen(false);return;}
            setMonthOpen(true);
            requestAnimationFrame(()=>monthPanel.current?.scrollIntoView({block:'nearest'}));
          }}><CalendarDays size={16}/>{monthOpen?'달력 접기':'월간 달력'}</button>
        </div>
        {selectedEvents.length ? <ul className="calendar-agenda-list">{selectedEvents.map(event=>{
          const index=sources.findIndex(source=>source.id===event.sourceId);
          const local=event.sourceId==='hub-local'?entries.find(entry=>entry.id===event.id):undefined;
          return <li className="connected-event" key={event.sourceId+':'+event.id}>
            <span style={{background:sourceColors[Math.max(0,index)%sourceColors.length]}} aria-hidden="true"/>
            <div><small>{sources[index]?.name??'캘린더'} · {calendarPeriod(event)}</small>
              {local?<button type="button" onClick={()=>onEdit(local)}>{event.title}</button>:event.url?<a href={event.url} target="_blank" rel="noreferrer">{event.title}<ArrowUpRight size={13}/></a>:<strong>{event.title}</strong>}
              {event.note && <small className="calendar-match-notice">{event.note}</small>}
            </div>
          </li>;
        })}</ul>:<p className="calendar-agenda-empty">{calendar.loading?'일정을 불러오는 중이에요.':'이 날짜에 표시할 일정이 없어요.'}</p>}
        {outside&&<p className="calendar-range-warning">선택한 날짜는 외부 일정의 반영 기간 밖이에요.</p>}
      </section>
    </div>

    <section className="calendar-sync-info calendar-sync-row" aria-label="캘린더 반영 상태">
      <div><Clock3 size={15}/><span>{snapshot?`마지막 수동 반영 · ${stamp.format(new Date(snapshot.syncedAt))} KST`:'외부 일정 반영 전'}</span></div>
      {snapshot&&<p>{snapshot.rangeStart} ~ {lastCalendarDay(snapshot.rangeEnd)}</p>}
      <p>새 외부 일정은 이 채팅에서 ‘캘린더 일정 다시 반영해줘’라고 요청하면 반영됩니다.</p>
      <button type="button" className="text-button muted" onClick={calendar.reload} disabled={calendar.loading}><RefreshCw size={14}/>저장된 반영본 다시 읽기</button>
      {calendar.error&&<p className="form-error" role="alert">{calendar.error}</p>}
    </section>
  </div>;
}
