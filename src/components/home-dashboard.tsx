'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { calendarPeriod, eventStartDay, isCalendarDay, type CalendarEvent } from '@/lib/calendar';
import { addCalendarDays, dashboardDay, dashboardTasks, dashboardWeekStart, nextDashboardEvent } from '@/lib/home-dashboard';
import { footballSourceId } from '@/lib/football';
import { koreanDate, type Entry } from '@/lib/store';
import type { useCalendarSnapshot } from './calendar-hub';
import { weatherCondition, weatherDegrees, type WeatherForecast } from './weather';

const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', weekday: 'long' });
const dayLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' });
const clock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const label = (day: string) => dayLabel.format(new Date(day + 'T00:00:00Z'));
const short = (day: string) => weekday.format(new Date(day + 'T00:00:00Z'));
const eventTime = (event: CalendarEvent) => event.allDay ? '종일' : clock.format(new Date(event.start));
const eventKey = (event: CalendarEvent) => event.sourceId + ':' + event.id;
const MAX_CHIPS = 3;

type Calendar = ReturnType<typeof useCalendarSnapshot>;

function AgendaLink({ event, entry, onEdit, className }: { event: CalendarEvent; entry?: Entry; onEdit: (entry: Entry) => void; className?: string }) {
  return entry ? <button type="button" className={className} onClick={() => onEdit(entry)}>{event.title}</button> :
    event.url ? <a className={className} href={event.url} target="_blank" rel="noreferrer">{event.title}</a> :
    <strong className={className}>{event.title}</strong>;
}

const localEntry = (event: CalendarEvent, entries: Entry[]) => event.sourceId === 'hub-local' ? entries.find(entry => entry.id === event.id) : undefined;

/** When the next event happens, phrased for the home summary ("오늘 14:00", "내일", "목요일"). */
function nextWhen(event: CalendarEvent, today: string, live: boolean) {
  if (live) return '지금';
  const day = eventStartDay(event);
  const time = event.allDay ? '' : ' ' + clock.format(new Date(event.start));
  if (day <= today) return '오늘' + time;
  if (day === addCalendarDays(today, 1)) return '내일' + time;
  if (day < addCalendarDays(today, 7)) return weekdayLong.format(new Date(day + 'T00:00:00Z')) + time;
  return koreanDate(day) + time;
}

export function HomeHero({ now, today, events, entries }: { now: number; today: string; events: CalendarEvent[]; entries: Entry[] }) {
  if (!today) return <div className="home-hero-date"><h1 className="home-hero-day">–</h1><p className="home-hero-summary">한국 시간을 확인하고 있어요.</p></div>;
  const [year, month, day] = today.split('-').map(Number);
  const { dueToday, overdue } = dashboardTasks(entries, today);
  const left = dueToday.length + overdue.length;
  const next = nextDashboardEvent(events, now, today);
  return <div className="home-hero-date">
    <h1 className="home-hero-day"><time dateTime={today} aria-label={label(today)}>{day}</time></h1>
    <div className="home-hero-copy">
      <p className="home-hero-month">{year}년 {month}월</p>
      <p className="home-hero-weekday">{weekdayLong.format(new Date(today + 'T00:00:00Z'))}</p>
      <p className="home-hero-summary">
        {left ? <>할 일 <strong>{left}개</strong>가 남았어요</> : '오늘 할 일을 모두 마쳤어요'}
        {next ? <> · 다음 일정 <strong>{nextWhen(next.event, today, next.live)} {next.event.title}</strong></> : ' · 예정된 일정이 없어요'}
      </p>
    </div>
  </div>;
}

type WeekProps = {
  now: number; today: string; events: CalendarEvent[]; entries: Entry[]; hidden: string[]; calendar: Calendar;
  forecast: WeatherForecast | null; userId: string | null;
  onEdit: (entry: Entry) => void; onAdd: (day: string) => void;
};

export default function WeekBoard({ now, today, events, entries, hidden, calendar, forecast, userId, onEdit, onAdd }: WeekProps) {
  const cacheKey = userId ? 'woong-hub:home-day:v1:' + userId : '';
  const [chosen, setChosen] = useState('');

  useEffect(() => {
    let saved = '';
    try { if (cacheKey) saved = sessionStorage.getItem(cacheKey) ?? ''; } catch { /* use today's week */ }
    setChosen(isCalendarDay(saved) ? saved : '');
  }, [cacheKey]);

  function choose(date: string) {
    setChosen(date);
    try {
      if (cacheKey) {
        if (date) sessionStorage.setItem(cacheKey, date);
        else sessionStorage.removeItem(cacheKey);
      }
    } catch { /* the current selection remains usable */ }
  }

  if (!today) return null;
  const selected = chosen || today;
  const first = dashboardWeekStart(selected);
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(first, index));
  const thisWeek = days.includes(today);
  const next = nextDashboardEvent(events, now, today);
  const nextKey = next ? eventKey(next.event) : '';
  const weather = new Map(forecast?.days.map(day => [day.time, day]) ?? []);
  // With today selected the list shows the rest of this week (as in the mockup); any other day shows that day.
  const weekView = selected === today;
  const seen = new Set<string>([nextKey]);
  const agenda = weekView
    ? days.filter(day => day >= today).flatMap(day => dashboardDay(events, day).filter(event => {
      const key = eventKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(event => ({ event, day })))
    : dashboardDay(events, selected).map(event => ({ event, day: selected }));
  const snapshot = calendar.data?.snapshot;
  const outside = snapshot && snapshot.sources.some(source => !hidden.includes(source.id)) &&
    (selected < snapshot.rangeStart || selected >= snapshot.rangeEnd);
  const range = `${days[0].slice(5).replace('-', '.')} – ${days[6].slice(5).replace('-', '.')}`;

  return <section className="home-card home-week" aria-labelledby="home-week-title">
    <div className="home-card-heading">
      <div className="home-week-title"><h2 id="home-week-title">{thisWeek ? '이번 주' : '주간 일정'}</h2><span>{range}</span></div>
      <div className="home-week-actions">
        <button type="button" className="home-round" aria-label="이전 주" onClick={() => choose(addCalendarDays(first, -7))}><ChevronLeft size={16}/></button>
        <button type="button" className="home-pill" onClick={() => choose('')}>오늘</button>
        <button type="button" className="home-round" aria-label="다음 주" onClick={() => choose(addCalendarDays(first, 7))}><ChevronRight size={16}/></button>
        <Link className="home-link" href={'/calendar/?date=' + encodeURIComponent(selected)}>캘린더 열기</Link>
      </div>
    </div>

    <ol className="home-week-grid" aria-label="이번 주 날짜별 일정">
      {days.map(day => {
        const dayEvents = dashboardDay(events, day);
        const sky = weather.get(day);
        const { Icon, label: skyLabel } = weatherCondition(sky?.code ?? null);
        return <li key={day} className="home-day" data-today={day === today || undefined} data-selected={day === selected || undefined}>
          <button type="button" className="home-day-head" aria-pressed={day === selected} aria-current={day === today ? 'date' : undefined}
            aria-label={`${label(day)}, 일정 ${dayEvents.length}개${sky ? `, ${skyLabel} 최고 ${weatherDegrees(sky.high)} 최저 ${weatherDegrees(sky.low)}` : ''}`} onClick={() => choose(day)}>
            <span className="home-day-name">{day === today ? '오늘' : short(day)}</span>
            {sky && <span className="home-day-temp">{weatherDegrees(sky.high)} {weatherDegrees(sky.low)}</span>}
            <strong className="home-day-num">{Number(day.slice(-2))}</strong>
            {sky ? <Icon className="home-day-sky" size={20} aria-hidden="true"/> : <span className="home-day-sky"/>}
            <span className={dayEvents.length ? 'home-day-dot has-events' : 'home-day-dot'} aria-hidden="true"/>
          </button>
          <ul className="home-day-events">
            {dayEvents.slice(0, MAX_CHIPS).map(event => <li key={eventKey(event)} className="home-chip"
              data-kind={event.sourceId === footballSourceId ? 'match' : undefined} data-next={eventKey(event) === nextKey || undefined}>
              <small>{eventTime(event)}</small>
              <AgendaLink event={event} entry={localEntry(event, entries)} onEdit={onEdit}/>
            </li>)}
            {dayEvents.length > MAX_CHIPS && <li><Link className="home-chip-more" href={'/calendar/?date=' + day}>+{dayEvents.length - MAX_CHIPS}개 더</Link></li>}
          </ul>
          <button type="button" className="home-day-add" aria-label={`${label(day)} 일정 추가`} onClick={() => onAdd(day)}><Plus size={15}/></button>
        </li>;
      })}
    </ol>

    <div className="home-agenda">
      {next && selected === today && <div className="home-next" aria-label="다음 일정">
        <span className="home-next-date"><small>{short(eventStartDay(next.event))}</small><strong>{Number(eventStartDay(next.event).slice(-2))}</strong></span>
        <span className="home-next-copy">
          <small>다음 일정 · {nextWhen(next.event, today, next.live)}{next.event.allDay ? ' · 종일' : ''}</small>
          <AgendaLink event={next.event} entry={localEntry(next.event, entries)} onEdit={onEdit}/>
        </span>
      </div>}
      <div className="home-agenda-heading">
        <h3>{weekView ? (next ? '이번 주 다른 일정' : '이번 주 일정') : label(selected)} <span>{agenda.length}건</span></h3>
        <button type="button" className="home-link" onClick={() => onAdd(selected)}><Plus size={14}/>일정 추가</button>
      </div>
      {agenda.length ? <ul className="home-agenda-list">
        {agenda.map(({ event, day }) => <li key={eventKey(event)} data-kind={event.sourceId === footballSourceId ? 'match' : undefined}>
          <span className="home-agenda-day"><small>{day === today ? '오늘' : short(day)}</small><strong>{Number(day.slice(-2))}</strong></span>
          <span className="home-agenda-copy">
            <AgendaLink event={event} entry={localEntry(event, entries)} onEdit={onEdit}/>
            <small>{calendarPeriod(event)}</small>
          </span>
        </li>)}
      </ul> : <p className="home-empty">{calendar.loading ? '일정을 불러오는 중이에요.' : weekView ? '이번 주에 다른 일정이 없어요.' : '이날은 일정이 없어요.'}</p>}
    </div>
    {outside && <p className="home-empty">외부 캘린더의 수동 반영 기간 밖이에요.</p>}
    {calendar.error && <p className="form-error" role="alert">{calendar.error}</p>}
  </section>;
}

type TaskActions = { onToggle: (entry: Entry) => void; onEdit: (entry: Entry) => void };
const PREVIEW_TASKS = 5;

export function HomeTasks({ entries, today, onToggle, onEdit, onAdd }: TaskActions & { entries: Entry[]; today: string; onAdd: (title: string) => boolean }) {
  const [draft, setDraft] = useState('');
  const { dueToday, overdue, undated } = dashboardTasks(entries, today);
  const tasks = [...overdue.map(entry => ({ entry, late: true })), ...dueToday.map(entry => ({ entry, late: false }))];
  const hiddenCount = Math.max(0, tasks.length - PREVIEW_TASKS);

  function submit(event: FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (title && onAdd(title)) setDraft('');
  }

  return <section className="home-card home-tasks" aria-labelledby="home-tasks-title">
    <div className="home-card-heading">
      <div><h2 id="home-tasks-title">할 일</h2><p className="home-card-sub" aria-live="polite">오늘 {dueToday.length} · 지난 기한 {overdue.length}</p></div>
      <strong className="home-big-count" aria-hidden="true">{tasks.length}</strong>
    </div>
    <form className="home-task-add" onSubmit={submit}>
      <Plus size={18} aria-hidden="true"/>
      <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="오늘 할 일 추가 · Enter" aria-label="오늘 할 일 추가" maxLength={200} disabled={!today}/>
    </form>
    {tasks.length ? <ul className="home-task-list">
      {tasks.slice(0, PREVIEW_TASKS).map(({ entry, late }) => <li key={entry.id} data-late={late || undefined}>
        <button type="button" className="home-check" role="checkbox" aria-checked={false} aria-label={`${entry.title} 완료`} onClick={() => onToggle(entry)}/>
        <button type="button" className="home-task-title" onClick={() => onEdit(entry)}>{entry.title}</button>
        <small>{late ? entry.date.slice(5, 10).replace('-', '.') + ' 지남' : '오늘'}</small>
      </li>)}
    </ul> : <p className="home-empty">{today ? '오늘 마감인 할 일이 없어요.' : '할 일을 확인하고 있어요.'}</p>}
    <Link href="/library/?tab=todo" className="home-link home-tasks-more">
      {hiddenCount ? `${hiddenCount}개 더 · ` : ''}{undated.length ? `기한 없는 할 일 ${undated.length}개 · ` : ''}전체 할 일
    </Link>
  </section>;
}
