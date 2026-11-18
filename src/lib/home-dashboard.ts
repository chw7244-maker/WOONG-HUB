import { eventOnDay, localCalendarEvent, type CalendarEvent, type CalendarSnapshot } from './calendar.ts';
import { isSetup } from './audio.ts';
import { lastListenedAt } from './music.ts';
import type { Entry } from './store.ts';

export function addCalendarDays(day: string, days: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dashboardEvents(entries: Entry[], snapshot: CalendarSnapshot | null | undefined, hidden: string[]) {
  const local = entries.map(localCalendarEvent).filter((event): event is CalendarEvent => event !== null);
  return [...local, ...(snapshot?.events ?? [])].filter(event => !hidden.includes(event.sourceId));
}

export function dashboardDay(events: CalendarEvent[], day: string) {
  return events.filter(event => eventOnDay(event, day)).sort((a, b) =>
    Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title, 'ko')
  );
}

export function dashboardWeekStart(today: string, selected: string) {
  const days = (Date.parse(selected) - Date.parse(today)) / 86_400_000;
  return addCalendarDays(today, Math.floor(days / 7) * 7);
}

export function nextDashboardEvent(events: CalendarEvent[], now: number, today: string) {
  const tomorrow = Date.parse(addCalendarDays(today, 1) + 'T00:00:00+09:00');
  const startsAt = (event: CalendarEvent) => Date.parse(event.allDay ? event.start + 'T00:00:00+09:00' : event.start);
  const timed = events.filter(event => !event.allDay && (Date.parse(event.end) > now || startsAt(event) >= now))
    .sort((a, b) => startsAt(a) - startsAt(b) || a.title.localeCompare(b.title, 'ko'));
  const timedToday = timed.find(event => startsAt(event) < tomorrow);
  if (timedToday) return { event: timedToday, live: startsAt(timedToday) <= now && Date.parse(timedToday.end) > now };

  const allDay = events.filter(event => event.allDay && event.end > today)
    .sort((a,b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'ko'));
  if (allDay[0] && allDay[0].start <= today) return { event: allDay[0], live: false };
  const next = !timed[0] || (allDay[0] && startsAt(allDay[0]) <= startsAt(timed[0])) ? allDay[0] : timed[0];
  return next ? { event: next, live: false } : null;
}

export function dashboardTasks(entries: Entry[], day: string) {
  return entries.filter(entry => entry.kind === 'todo' && !entry.done && (!entry.date || entry.date.slice(0, 10) <= day))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || b.createdAt.localeCompare(a.createdAt));
}

export function recentListening(entries: Entry[]) {
  return entries.map(entry => ({ entry, date: lastListenedAt(entry.music) })).filter(({ date }) => date)
    .sort((a, b) => b.date.localeCompare(a.date) || b.entry.createdAt.localeCompare(a.entry.createdAt))
    .map(({ entry }) => entry);
}

export function recentListeningGear(audio: Entry[], music: Entry[]) {
  const normalize = (name: string) => name.normalize('NFKC').trim().toLowerCase();
  const matches = new Map<string, Entry | null>();
  for (const entry of audio) {
    const key = normalize(entry.title);
    matches.set(key, matches.has(key) ? null : entry);
  }
  const latest = new Map<string, { entry: Entry; date: string }>();
  for (const collection of music) {
    for (const listen of collection.music?.listens ?? []) {
      const entry = matches.get(normalize(listen.equipment));
      if (!entry) continue;
      if ((latest.get(entry.id)?.date ?? '') < listen.date) latest.set(entry.id, { entry, date: listen.date });
    }
  }
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function pinnedSetup(audio: Entry[], id: string | undefined) {
  return audio.find(entry => entry.id === id && isSetup(entry));
}
