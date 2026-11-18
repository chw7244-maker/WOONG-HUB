'use client';

import Link from 'next/link';
import { ArrowUpRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { calendarPeriod, eventOnDay, eventStartDay, isCalendarDay, type CalendarEvent } from '@/lib/calendar';
import { addCalendarDays, dashboardDay, dashboardWeekStart, nextDashboardEvent } from '@/lib/home-dashboard';
import type { Entry } from '@/lib/store';
import type { useCalendarSnapshot } from './calendar-hub';

const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', weekday: 'short' });
const dayLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' });
const clock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const label = (day: string) => dayLabel.format(new Date(day + 'T00:00:00Z'));

type AgendaProps = {
  today: string;
  events: CalendarEvent[];
  entries: Entry[];
  calendar: ReturnType<typeof useCalendarSnapshot>;
  onEdit: (entry: Entry) => void;
};

function AgendaLink({ event, entry, onEdit }: { event: CalendarEvent; entry?: Entry; onEdit: (entry: Entry) => void }) {
  return entry ? <button type="button" onClick={() => onEdit(entry)}>{event.title}</button> :
    event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.title}<ArrowUpRight size={14} aria-hidden="true"/></a> :
    <strong>{event.title}</strong>;
}

export function NextSchedule({ now, today, events, entries, calendar, onEdit }: AgendaProps & { now: number }) {
  const next = today ? nextDashboardEvent(events, now, today) : null;
  const event = next?.event;
  const day = event ? eventStartDay(event) : '';
  const source = event?.sourceId === 'hub-local' ? 'HUB' :
    calendar.data?.snapshot?.sources.find(source => source.id === event?.sourceId)?.name ?? '외부 캘린더';
  const context = next?.live ? '지금 진행 중' : day <= today ? '오늘' : day === addCalendarDays(today, 1) ? '내일 · '+label(day) : label(day);
  return <section className="hub-next-card" aria-labelledby="home-next-title">
    <div className="hub-next-heading">
      <h2 id="home-next-title"><CalendarDays size={17} aria-hidden="true"/>다음 일정</h2>
      {event && <small>{source}{calendar.error&&event.sourceId!=='hub-local'?' · 마지막 반영본':''}</small>}
    </div>
    {event ? <div className="hub-next-event">
      <time dateTime={event.start}>{event.allDay ? '종일' : clock.format(new Date(event.start))}</time>
      <div>
        <small>{context}</small>
        <AgendaLink event={event} entry={event.sourceId === 'hub-local' ? entries.find(entry => entry.id === event.id) : undefined} onEdit={onEdit}/>
      </div>
    </div> : <p className="hub-next-empty" role="status">
      {calendar.loading || !today ? '일정을 확인하고 있어요.' : calendar.error ? '일정 목록을 확인해주세요.' : '예정된 일정이 없어요.'}
    </p>}
    <Link className="text-button" href={day ? '/calendar/?date='+encodeURIComponent(day < today ? today : day) : '/calendar/'}>일정 보기<ArrowUpRight size={13} aria-hidden="true"/></Link>
  </section>;
}

export default function WeekAgenda({ today, events, entries, hidden, calendar, onEdit, onAdd, userId }: AgendaProps & {
  hidden: string[]; onAdd: (day: string) => void; userId: string | null;
}) {
  const cacheKey = userId ? 'woong-hub:home-day:v1:'+userId : '';
  const [chosen, setChosen] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let saved = '';
    try { if (cacheKey) saved = sessionStorage.getItem(cacheKey) ?? ''; } catch { /* use today's agenda */ }
    setChosen(isCalendarDay(saved) ? saved : '');
    setOpen(isCalendarDay(saved));
  }, [cacheKey]);

  function choose(date: string) {
    setChosen(date);
    setOpen(true);
    try {
      if (cacheKey) {
        if (date) sessionStorage.setItem(cacheKey, date);
        else sessionStorage.removeItem(cacheKey);
      }
    } catch { /* the current selection remains usable */ }
  }

  if (!today) return null;
  const selected = chosen || today;
  const first = dashboardWeekStart(today, selected);
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(first, index));
  const agenda = dashboardDay(events, selected);
  const snapshot = calendar.data?.snapshot;
  const outside = snapshot && snapshot.sources.some(source => !hidden.includes(source.id)) &&
    (selected < snapshot.rangeStart || selected >= snapshot.rangeEnd);

  return <section className="hub-week hub-week-compact" aria-labelledby="home-week-title">
    <div className="hub-section-heading">
      <div><h2 id="home-week-title">주간 일정</h2><p>{days[0].slice(5).replace('-', '.')} – {days[6].slice(5).replace('-', '.')}</p></div>
      <div className="hub-week-actions">
        <button type="button" className="icon-button" aria-label="이전 주" onClick={() => choose(addCalendarDays(first, -7))}><ChevronLeft size={17}/></button>
        <button type="button" className="text-button" onClick={() => choose('')}>오늘</button>
        <button type="button" className="icon-button" aria-label="다음 주" onClick={() => choose(addCalendarDays(first, 7))}><ChevronRight size={17}/></button>
      </div>
    </div>
    <div className="hub-week-days" role="group" aria-label="일정 날짜 선택">
      {days.map(day => {
        const count = events.filter(event => eventOnDay(event, day)).length;
        return <button type="button" key={day} aria-label={`${label(day)}, 일정 ${count}개`} aria-pressed={selected === day} onClick={() => choose(day)}>
          <small>{day === today ? '오늘' : weekday.format(new Date(day + 'T00:00:00Z'))}</small>
          <strong>{Number(day.slice(-2))}</strong>
          <span className={count ? 'has-events' : ''} aria-hidden="true"/>
        </button>;
      })}
    </div>
    <div className="hub-week-summary">
      <button type="button" aria-expanded={open} aria-controls="home-week-agenda" onClick={() => setOpen(value => !value)}>
        <ChevronDown size={16} aria-hidden="true"/><strong>{selected === today ? '오늘의 전체 일정' : label(selected)}</strong><small>{agenda.length}건</small>
      </button>
      <Link className="text-button blue" href={'/calendar/?date='+encodeURIComponent(selected)}>캘린더<ArrowUpRight size={13}/></Link>
    </div>
    <div id="home-week-agenda" hidden={!open}>
      {agenda.length ? <ul className="hub-agenda-list">
        {agenda.map(event => <li key={event.sourceId+':'+event.id}>
          <small>{calendarPeriod(event)}</small>
          <AgendaLink event={event} entry={event.sourceId === 'hub-local' ? entries.find(entry => entry.id === event.id) : undefined} onEdit={onEdit}/>
        </li>)}
      </ul> : <p className="hub-agenda-empty">{calendar.loading ? '일정을 불러오는 중이에요.' : '표시할 일정이 없어요.'}</p>}
      {outside && <p className="hub-agenda-empty">외부 캘린더의 수동 반영 기간 밖이에요.</p>}
      <button type="button" className="text-button blue" onClick={() => onAdd(selected)}><Plus size={15}/>일정 추가</button>
    </div>
    {calendar.error && <p className="form-error" role="alert">{calendar.error}</p>}
  </section>;
}
