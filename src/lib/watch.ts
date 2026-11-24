import type { Entry } from './store.ts';
import { addCalendarDays, isCalendarDay } from './calendar.ts';

export const watchTypes = { movie: '영화', tv: '드라마', webtoon: '웹툰' } as const;
export const watchStatuses = { planned: '볼 예정', watching: '보는 중', completed: '완료' } as const;
export const watchDays = ['월', '화', '수', '목', '금', '토', '일'] as const;
export const webtoonNewsEvents = { start: '연재 시작', resume: '연재 재개', hiatus: '휴재', completion: '완결' } as const;
export type WebtoonNewsEvent = keyof typeof webtoonNewsEvents;
export const webtoonNewsEventKeys = Object.keys(webtoonNewsEvents) as WebtoonNewsEvent[];
export type WatchType = keyof typeof watchTypes;
export type WatchStatus = keyof typeof watchStatuses;
export type WatchDetails = {
  type: WatchType;
  status: WatchStatus;
  progress?: number;
  season?: number;
  rating?: number;
  weekday?: number;
  plannedDate?: string;
  updatedAt: string;
  catalog?: WatchCatalogItem;
  newsEvents?: WebtoonNewsEvent[];
};
export type WatchCatalogItem = { id: number; title: string; year?: string; posterPath?: string };
export const watchPosterUrl = (path?: string) => path ? `https://image.tmdb.org/t/p/w342${path}` : '';
export type WatchEntry = Entry & { kind: 'watch'; watch: WatchDetails };

export const isWatchEntry = (entry: Entry): entry is WatchEntry => entry.kind === 'watch' && !!entry.watch;

export function validateWatchCatalog(value: unknown): WatchCatalogItem {
  if (!value || typeof value !== 'object') throw new Error('작품 검색 정보를 확인해주세요.');
  const { id, title, year, posterPath } = value as WatchCatalogItem;
  if (!Number.isSafeInteger(id) || id < 1 || typeof title !== 'string' || !title.trim() || title.length > 200 ||
    (year !== undefined && (typeof year !== 'string' || !/^\d{4}$/.test(year))) ||
    (posterPath !== undefined && (typeof posterPath !== 'string' || !/^\/[a-zA-Z0-9_-]{1,100}\.(jpg|png|webp)$/.test(posterPath)))) {
    throw new Error('작품 검색 정보를 확인해주세요.');
  }
  return { id, title, ...(year && { year }), ...(posterPath && { posterPath }) };
}

export function validateWatch(value: unknown): WatchDetails {
  if (!value || typeof value !== 'object') throw new Error('작품 기록을 확인해주세요.');
  const { type, status, progress, season, rating, weekday, plannedDate, updatedAt, catalog, newsEvents } = value as WatchDetails;
  const integer = (number: number | undefined, min: number, max: number) => number === undefined || (Number.isInteger(number) && number >= min && number <= max);
  if (!Object.hasOwn(watchTypes, type) || !Object.hasOwn(watchStatuses, status) ||
    typeof updatedAt !== 'string' || updatedAt.length > 50 || !Number.isFinite(Date.parse(updatedAt)) ||
    !integer(progress, 0, 99999) || !integer(season, 1, 999) || !integer(rating, 0, 5) || !integer(weekday, 0, 6) ||
    (type !== 'tv' && season !== undefined) || (type === 'movie' && progress !== undefined) ||
    (type !== 'webtoon' && weekday !== undefined) || (type === 'webtoon' && catalog !== undefined)) {
    throw new Error('작품 분류, 별점 또는 회차를 확인해주세요.');
  }
  if (newsEvents !== undefined && (type !== 'webtoon' || !Array.isArray(newsEvents) || newsEvents.length > webtoonNewsEventKeys.length ||
    newsEvents.some(event => typeof event !== 'string' || !Object.hasOwn(webtoonNewsEvents, event)))) {
    throw new Error('웹툰 소식 설정을 확인해주세요.');
  }
  if (plannedDate !== undefined && (type === 'webtoon' || !isCalendarDay(plannedDate))) throw new Error('감상 예정일을 확인해주세요.');
  return { type, status, updatedAt, ...(progress !== undefined && { progress }), ...(season !== undefined && { season }),
    ...(rating !== undefined && { rating }), ...(weekday !== undefined && { weekday }), ...(catalog !== undefined && { catalog: validateWatchCatalog(catalog) }),
    ...(plannedDate !== undefined && { plannedDate }),
    ...(newsEvents?.length && { newsEvents: webtoonNewsEventKeys.filter(event => newsEvents.includes(event)) }) };
}

export function watchingNow(entries: Entry[]) {
  return entries.filter(isWatchEntry).filter(entry => entry.watch.status === 'watching')
    .sort((a, b) => Date.parse(b.watch.updatedAt) - Date.parse(a.watch.updatedAt));
}

export function progressLabel(watch: WatchDetails) {
  if (watch.progress === undefined || watch.progress === 0) return watchStatuses[watch.status];
  return `${watch.season === undefined ? '' : `시즌 ${watch.season} · `}${watch.progress}화까지`;
}

export function advanceWatch(entry: WatchEntry, now = new Date()): WatchEntry {
  const { watch } = entry;
  if (watch.type === 'movie' || watch.status === 'completed' || (watch.progress ?? 0) >= 99999) return entry;
  return { ...entry, watch: { ...watch, status: 'watching', progress: (watch.progress ?? 0) + 1, updatedAt: now.toISOString() } };
}

export function restoreWatchProgress(entry: WatchEntry, before: WatchDetails, advanced: WatchDetails): WatchEntry | null {
  const { watch } = entry;
  const progressKeys = ['type', 'season', 'status', 'progress', 'updatedAt'] as const;
  if (progressKeys.some(key => watch[key] !== advanced[key])) return null;
  return { ...entry, watch: { ...watch, progress: before.progress, status: before.status, updatedAt: before.updatedAt } };
}

export function weeklyWatchPlan(entries: WatchEntry[], today: string) {
  if (!isCalendarDay(today)) return [];
  const weekday = koreanWeekday(new Date(`${today}T00:00:00+09:00`));
  const monday = addCalendarDays(today, -weekday);
  const days = watchDays.map((label, index) => ({ label, date: addCalendarDays(monday, index), entries: [] as WatchEntry[] }));
  const byDate = new Map(days.map(day => [day.date, day]));
  for (const entry of entries) {
    const { watch } = entry;
    if (watch.status === 'completed') continue;
    const date = watch.type === 'webtoon' ? days[watch.weekday ?? -1]?.date : watch.plannedDate;
    if (date) byDate.get(date)?.entries.push(entry);
  }
  return days;
}

export function koreanWeekday(now: Date) {
  const day = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day);
}
