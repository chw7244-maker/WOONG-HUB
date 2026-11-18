'use client';

import Link from 'next/link';
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { calendarPeriod, type CalendarEvent } from '@/lib/calendar';
import { addCalendarDays, dashboardDay, dashboardEvents } from '@/lib/home-dashboard';
import type { Entry } from '@/lib/store';
import type { useCalendarSnapshot } from './calendar-hub';

const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', weekday: 'short' });
const dayLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' });
const label = (day: string) => dayLabel.format(new Date(day + 'T00:00:00Z'));

function AgendaItem({ event, entries, onEdit }: { event: CalendarEvent; entries: Entry[]; onEdit: (entry: Entry) => void }) {
  const entry = event.sourceId === 'hub-local' ? entries.find(item => item.id === event.id) : undefined;
  return <li>
    <small>{calendarPeriod(event)}</small>
    {entry ? <button type="button" onClick={() => onEdit(entry)}>{event.title}</button> :
      event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.title}<ArrowUpRight size={13}/></a> :
      <span>{event.title}</span>}
  </li>;
}

export default function WeekAgenda({ today, entries, hidden, calendar, onEdit, onAdd }: {
  today: string;
  entries: Entry[];
  hidden: string[];
  calendar: ReturnType<typeof useCalendarSnapshot>;
  onEdit: (entry: Entry) => void;
  onAdd: (day: string) => void;
}) {
  const [week, setWeek] = useState(0);
  const [offset, setOffset] = useState(0);
  const reset = () => { setWeek(0); setOffset(0); };
  const move = (direction: number) => { setWeek(value => value + direction); setOffset(0); };
  if (!today) return null;
  const snapshot = calendar.data?.snapshot;
  const events = dashboardEvents(entries, snapshot, hidden);
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(today, week * 7 + index));
  const selected = days[offset];
  const agenda = dashboardDay(events, selected);
  const outside = snapshot && snapshot.sources.some(source => !hidden.includes(source.id)) &&
    (selected < snapshot.rangeStart || selected >= snapshot.rangeEnd);
  return <section className="hub-week" aria-labelledby="home-week-title">
    <div className="hub-section-heading">
      <div><h2 id="home-week-title">주간 일정</h2><p>{days[0].slice(5).replace('-', '.')} – {days[6].slice(5).replace('-', '.')}</p></div>
      <div className="hub-week-actions">
        <button type="button" className="icon-button" aria-label="이전 주" onClick={() => move(-1)}><ChevronLeft size={17}/></button>
        <button type="button" className="text-button" onClick={reset}>오늘</button>
        <button type="button" className="icon-button" aria-label="다음 주" onClick={() => move(1)}><ChevronRight size={17}/></button>
        <Link className="text-button blue" href="/calendar/">캘린더<ArrowUpRight size={13}/></Link>
      </div>
    </div>
    <div className="hub-week-days" role="group" aria-label="일정 날짜 선택">
      {days.map((day, index) => {
        const count = dashboardDay(events, day).length;
        return <button type="button" key={day} aria-label={`${label(day)}, 일정 ${count}개`} aria-pressed={offset === index} onClick={() => setOffset(index)}>
          <small>{day === today ? '오늘' : weekday.format(new Date(day + 'T00:00:00Z'))}</small>
          <strong>{Number(day.slice(-2))}</strong>
          <span className={count ? 'has-events' : ''} aria-hidden="true"/>
        </button>;
      })}
    </div>
    <div className="hub-agenda-heading">
      <h3>{label(selected)}</h3>
      <button type="button" className="text-button blue" onClick={() => onAdd(selected)}><Plus size={15}/>일정 추가</button>
    </div>
    {agenda.length ? <ul className="hub-agenda-list">
      {agenda.map(event => <AgendaItem key={event.sourceId + ':' + event.id} event={event} entries={entries} onEdit={onEdit}/>)}
    </ul> : <p className="hub-agenda-empty" role="status"><CalendarDays size={15}/>{calendar.loading ? '일정을 불러오는 중이에요.' : '표시할 일정이 없어요.'}</p>}
    {outside && <p className="hub-agenda-empty">외부 캘린더의 수동 반영 기간 밖이에요.</p>}
    {calendar.error && <p className="form-error" role="alert">{calendar.error}</p>}
  </section>;
}
