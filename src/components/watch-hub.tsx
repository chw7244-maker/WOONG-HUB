'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, BookOpen, CalendarDays, Check, Clapperboard, Pencil, Plus, Search, Star, Trash2, Tv } from 'lucide-react';
import { isCalendarDay } from '@/lib/calendar';
import { koreanDate, safeUrl, type Entry } from '@/lib/store';
import { matchesSearch, searchTerms } from '@/lib/search';
import { isWatchEntry, progressLabel, watchCoverUrl, watchDays, watchingNow, watchStatuses, watchTypes, webtoonNewsEventKeys, webtoonNewsEvents, weeklyWatchPlan, type WatchCatalogItem, type WatchEntry, type WatchStatus, type WatchType } from '@/lib/watch';
import Dialog from './dialog';
import WebtoonCovers from './webtoon-covers';

const icons = { movie: Clapperboard, tv: Tv, webtoon: BookOpen };
const types = Object.keys(watchTypes) as WatchType[];
const statuses = Object.keys(watchStatuses) as WatchStatus[];
const tmdbTitle = (type: WatchType, item: WatchCatalogItem) => `https://www.themoviedb.org/${type}/${item.id}?language=ko-KR`;

export function TmdbCredit() {
  return <section className="watch-source" aria-label="작품 데이터 출처">
    <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
      <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="TMDB" width={84} height={12}/>
    </a>
    <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
  </section>;
}

function Cover({ entry, featured = false }: { entry: WatchEntry; featured?: boolean }) {
  const { watch } = entry;
  const [failed, setFailed] = useState(false);
  const Icon = icons[watch.type];
  const image = watchCoverUrl(watch);
  return <div className={`watch-cover watch-cover-${watch.type}${featured ? ' watch-cover-feature' : ''}`} aria-hidden="true">
    {image && !failed
      ? <img src={image} alt="" loading={featured ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
      : watch.type === 'webtoon'
        ? <span className="webtoon-cover-fallback"><Icon strokeWidth={1.25}/><strong>{entry.title}</strong></span>
        : <Icon strokeWidth={1.25}/>}
  </div>;
}

function ProgressAction({ entry, onProgress }: { entry: WatchEntry; onProgress: (entry: WatchEntry) => void }) {
  if (entry.watch.status === 'completed') return null;
  if (entry.watch.type === 'movie') return <button type="button" className="button secondary" onClick={() => onProgress(entry)} aria-label={`${entry.title} 감상 완료`}><Check size={15} aria-hidden="true"/>감상 완료</button>;
  if ((entry.watch.progress ?? 0) >= 99999) return null;
  return <button type="button" className="button secondary" onClick={() => onProgress(entry)} aria-label={`${entry.title} 다음 회차 기록`}><Plus size={15} aria-hidden="true"/>다음 회차</button>;
}

function WatchItem({ entry, onEdit, onDelete, onSave, onProgress, onPlan, highlight }: {
  entry: WatchEntry; onEdit: (entry: Entry) => void; onDelete: (entry: Entry) => void; onSave: (entry: Entry) => boolean;
  onProgress: (entry: WatchEntry) => void; onPlan: (entry: WatchEntry) => void; highlight?: 'continue' | 'news';
}) {
  const { watch } = entry;
  const href = safeUrl(entry.url);
  const featured = Boolean(highlight);
  const followingNews = Boolean(watch.newsEvents?.length);
  return <article className={featured ? 'watch-feature' : 'watch-entry'}>
    <Cover key={watchCoverUrl(watch) || watch.type} entry={entry} featured={featured}/>
    <div className="watch-entry-copy">
      <p className="watch-kicker">{highlight === 'news' ? '뉴스에서 연 작품 · ' : featured ? '이어서 보기 · ' : ''}{watchTypes[watch.type]}{watch.catalog?.year && ` · ${watch.catalog.year}`}</p>
      <h2><button type="button" onClick={() => onEdit(entry)}>{entry.title}</button></h2>
      <p className="watch-entry-meta"><span>{progressLabel(watch)}</span>{watch.weekday !== undefined && <span>{watchDays[watch.weekday]}요일 연재</span>}{watch.rating !== undefined && <span><Star size={13}/> {watch.rating}/5</span>}</p>
      {entry.detail && <p className="watch-entry-note">{entry.detail}</p>}
      <div className="watch-entry-actions">
        <ProgressAction entry={entry} onProgress={onProgress}/>
        {watch.type !== 'webtoon' && watch.status !== 'completed' && <button type="button" className="button secondary watch-plan-action" onClick={() => onPlan(entry)}
          aria-label={`${entry.title} 감상 예정일 ${watch.plannedDate ? '변경' : '정하기'}`}>
          <CalendarDays size={15} aria-hidden="true"/>{watch.plannedDate ? `${koreanDate(watch.plannedDate)} 예정` : '날짜 정하기'}
        </button>}
        {watch.type === 'webtoon' && <button type="button" className="button secondary watch-news-follow" aria-pressed={followingNews} aria-label={`${entry.title} 작품 소식 팔로우`}
          onClick={() => onSave({ ...entry, watch: { ...watch, newsEvents: followingNews ? undefined : [...webtoonNewsEventKeys] } })}>
          {followingNews ? <Check size={15} aria-hidden="true"/> : <Plus size={15} aria-hidden="true"/>}{followingNews ? '소식 팔로우 중' : '이 작품 소식 팔로우'}
        </button>}
        {href && <a className="text-button" href={href} target="_blank" rel="noreferrer">작품 열기<ArrowUpRight size={14}/></a>}
        <button type="button" className="icon-button" onClick={() => onEdit(entry)} aria-label={`${entry.title} 수정`}><Pencil size={16}/></button>
        <button type="button" className="icon-button" onClick={() => onDelete(entry)} aria-label={`${entry.title} 삭제`}><Trash2 size={16}/></button>
      </div>
    </div>
  </article>;
}

function WatchWeek({ entries, today, type, onEdit, onProgress }: {
  entries: WatchEntry[]; today: string; type: WatchType | 'all'; onEdit: (entry: Entry) => void; onProgress: (entry: WatchEntry) => void;
}) {
  const [chosenDay, setChosenDay] = useState('');
  const days = weeklyWatchPlan(entries, today);
  const selected = days.find(day => day.date === chosenDay) ?? days.find(day => day.date === today);
  if (!selected) return null;

  return <section className="hub-summary-card watch-week" aria-labelledby="watch-week-title">
    <header className="hub-summary-heading"><h2 id="watch-week-title"><CalendarDays size={18} aria-hidden="true"/>이번 주 볼 것</h2><small>{koreanDate(days[0].date)} ~ {koreanDate(days[6].date)}</small></header>
    <div className="watch-week-days" role="group" aria-label="감상 날짜 선택">
      {days.map(day => <button key={day.date} type="button" aria-pressed={day.date === selected.date}
        aria-current={day.date === today ? 'date' : undefined} aria-label={`${koreanDate(day.date)} ${day.label}요일, ${day.entries.length}개`}
        onClick={() => setChosenDay(day.date)}>
        <span>{day.date === today ? '오늘' : day.label}</span><strong>{Number(day.date.slice(8))}</strong>
        <span className="watch-week-dot" data-has-plans={day.entries.length > 0} aria-hidden="true"/>
      </button>)}
    </div>
    <div className="watch-day-heading"><h3>{selected.date === today ? '오늘' : `${selected.label}요일`}</h3><span>{selected.entries.length}개 작품</span></div>
    {selected.entries.length > 0 ? <ul className="watch-week-items">
      {selected.entries.map(entry => <li key={entry.id}>
        <div className="watch-week-entry"><button type="button" onClick={() => onEdit(entry)}>{entry.title}</button>
          <small>{watchTypes[entry.watch.type]} · {entry.watch.type === 'webtoon' ? '연재 예정 · ' : ''}{progressLabel(entry.watch)}</small>
        </div>
        <ProgressAction entry={entry} onProgress={onProgress}/>
      </li>)}
    </ul> : <p className="hub-summary-empty">이날 예정된 작품이 없어요. {type === 'webtoon' ? '작품에 연재 요일을 등록해보세요.' : '영화·드라마 카드에서 볼 날짜를 정할 수 있어요.'}</p>}
    {type === 'webtoon' && <div className="watch-week-links"><a className="text-button muted" href="https://comic.naver.com/webtoon" target="_blank" rel="noreferrer">네이버웹툰</a><a className="text-button muted" href="https://webtoon.kakao.com/" target="_blank" rel="noreferrer">카카오웹툰</a></div>}
  </section>;
}

function WatchPlanDialog({ entry, today, onClose, onSave }: {
  entry: WatchEntry; today: string; onClose: () => void; onSave: (entry: Entry) => boolean;
}) {
  function save(plannedDate?: string) {
    if (onSave({ ...entry, watch: { ...entry.watch, plannedDate } })) onClose();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = new FormData(event.currentTarget).get('plannedDate');
    if (isCalendarDay(date)) save(date);
  }
  return <Dialog title="감상 예정일" onClose={onClose} className="watch-plan-dialog">
    <form onSubmit={submit}>
      <div className="entry-form"><p className="watch-plan-title">{entry.title}</p><label>볼 날짜<input type="date" name="plannedDate" max="9999-12-31" required defaultValue={entry.watch.plannedDate ?? today}/></label></div>
      <div className="dialog-footer">
        {entry.watch.plannedDate && <button type="button" className="button secondary" onClick={() => save()}>예정일 지우기</button>}
        <button type="submit" className="button primary">저장하기</button>
      </div>
    </form>
  </Dialog>;
}

export function HomeWatch({ entries, onEdit }: { entries: Entry[]; onEdit: (entry: Entry) => void }) {
  const recent = watchingNow(entries)[0];
  const href = recent && safeUrl(recent.url);
  const Icon = recent ? icons[recent.watch.type] : Clapperboard;
  return <div className="hub-continuation-item watch-home-item">
    <span className="hub-continuation-icon" aria-hidden="true"><Icon size={17}/></span>
    <div className="hub-continuation-copy">
      <small>{recent ? `${watchTypes[recent.watch.type]} · ${progressLabel(recent.watch)}` : '영화 · 드라마 · 웹툰'}</small>
      {recent ? <button type="button" onClick={() => onEdit(recent)}>{recent.title}</button> : <Link href="/watch/">작품 보관함 열기</Link>}
    </div>
    {href && <a className="icon-button" href={href} target="_blank" rel="noreferrer" aria-label={`${recent.title} 작품 링크 열기`}><ArrowUpRight size={16}/></a>}
  </div>;
}

export default function WatchHub({ entries, today, onAdd, onEdit, onDelete, onSave, onSaveCovers, onProgress }: {
  entries: Entry[]; today: string; onAdd: (type: WatchType) => void; onEdit: (entry: Entry) => void; onDelete: (entry: Entry) => void;
  onSave: (entry: Entry) => boolean; onSaveCovers: (entries: WatchEntry[], message: string) => boolean;
  onProgress: (entry: WatchEntry) => void;
}) {
  const [type, setType] = useState<WatchType | 'all'>('all');
  const [status, setStatus] = useState<WatchStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [coverDialog, setCoverDialog] = useState(false);
  useEffect(() => { setLinkedId(new URLSearchParams(window.location.search).get('work')); }, []);
  const collection = entries.filter(isWatchEntry).sort((a, b) => Date.parse(b.watch.updatedAt) - Date.parse(a.watch.updatedAt));
  const browsing = type === 'all' && status === 'all' && !query.trim();
  const linked = linkedId ? collection.find(entry => entry.id === linkedId) : undefined;
  const featured = browsing ? linked ?? watchingNow(collection)[0] : undefined;
  const planEntry = collection.find(item => item.id === planId && item.watch.type !== 'webtoon' && item.watch.status !== 'completed');
  const onPlan = (entry: WatchEntry) => setPlanId(entry.id);
  const matches = collection.filter(item => (type === 'all' || item.watch.type === type) && (status === 'all' || item.watch.status === status) &&
    matchesSearch([item.title, item.detail, watchTypes[item.watch.type]], searchTerms(query)));
  const lists = status === 'all' ? ['watching', 'planned', 'completed'] as const : [status];
  const needsCover = type === 'webtoon' && collection.some(entry => entry.watch.type === 'webtoon' && !entry.watch.webtoonCover);

  return <div className="watch-hub">
    {linkedId && !linked && <p className="watch-feedback" role="status">연결된 작품 기록을 찾을 수 없어요.</p>}
    {featured && linked && <WatchItem entry={featured} onEdit={onEdit} onSave={onSave} onDelete={onDelete} onProgress={onProgress} onPlan={onPlan} highlight="news"/>}
    <div className="watch-toolbar">
      <div className="tabs" role="group" aria-label="작품 종류">
        <button type="button" aria-pressed={type === 'all'} className={type === 'all' ? 'selected' : ''} onClick={() => setType('all')}>전체</button>
        {types.map(value => <button key={value} type="button" aria-pressed={type === value} className={type === value ? 'selected' : ''} onClick={() => setType(value)}>{watchTypes[value]}</button>)}
      </div>
      <label className="watch-search"><Search size={15} aria-hidden="true"/><input type="search" aria-label="내 작품 검색" placeholder="내 작품 검색" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <select aria-label="감상 상태" value={status} onChange={event => setStatus(event.target.value as typeof status)}>
        <option value="all">모든 상태</option>{statuses.map(value => <option key={value} value={value}>{watchStatuses[value]}</option>)}
      </select>
      <button type="button" className="button primary" onClick={() => onAdd(type === 'all' ? 'movie' : type)}><Plus size={16}/>작품 추가</button>
      {needsCover && <button type="button" className="button secondary" onClick={() => setCoverDialog(true)}>빈 표지 채우기</button>}
    </div>
    {status === 'all' && !query.trim() && <WatchWeek entries={matches} today={today} type={type} onEdit={onEdit} onProgress={onProgress}/>}
    {featured && !linked && <WatchItem entry={featured} onEdit={onEdit} onSave={onSave} onDelete={onDelete} onProgress={onProgress} onPlan={onPlan} highlight="continue"/>}
    {matches.length === 0 && <section className="watch-empty panel">
      <Clapperboard size={28} aria-hidden="true"/>
      <h2>{collection.length ? '조건에 맞는 작품이 없어요' : '보고 싶은 작품부터 모아보세요'}</h2>
      {!collection.length && <p>영화·드라마·웹툰을 저장하고, 본 회차와 감상을 남길 수 있어요.</p>}
    </section>}
    {lists.map(group => {
      const items = matches.filter(item => item.watch.status === group && item.id !== featured?.id);
      return items.length > 0 && <section className="watch-list" key={group} aria-label={watchStatuses[group]}>
        <h2>{watchStatuses[group]} <span>{items.length}</span></h2>
        <div>{items.map(entry => <WatchItem entry={entry} key={entry.id} onEdit={onEdit} onSave={onSave} onDelete={onDelete} onProgress={onProgress} onPlan={onPlan}/>)}</div>
      </section>;
    })}
    {collection.some(item => item.watch.catalog) && <TmdbCredit/>}
    {collection.some(item => item.watch.webtoonCover) && <p className="watch-feedback">웹툰 표지 데이터 <a href="https://www.kmas.or.kr/" target="_blank" rel="noreferrer">한국만화영상진흥원 만화규장각</a></p>}
    {planEntry && <WatchPlanDialog key={planEntry.id} entry={planEntry} today={today} onClose={() => setPlanId(null)} onSave={onSave}/>}
    {coverDialog && <WebtoonCovers entries={collection} onClose={() => setCoverDialog(false)} onSave={onSaveCovers}/>}
  </div>;
}

export function WatchEntryModal({ entry, defaultType = 'movie', onClose, onSave }: {
  entry?: Entry; defaultType?: WatchType; onClose: () => void; onSave: (entry: Entry) => boolean;
}) {
  const old = entry?.watch;
  const [type, setType] = useState<WatchType>(old?.type ?? defaultType);
  const [status, setStatus] = useState<WatchStatus>(old?.status ?? 'planned');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [url, setUrl] = useState(entry?.url ?? '');
  const [catalog, setCatalog] = useState(old?.catalog);
  const [items, setItems] = useState<WatchCatalogItem[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function clearSearch() {
    request.current?.abort();
    setItems([]);
    setBusy(false);
    setMessage('');
  }

  async function search() {
    if (!title.trim() || type === 'webtoon') return;
    clearSearch();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const response = await fetch(`/api/watch/search?${new URLSearchParams({ type, q: title.trim().slice(0, 100) })}`, { signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const missing = result.error === 'catalog_not_connected';
        setManual(missing);
        setMessage(missing ? 'TMDB 연결이 필요해요. 제목을 직접 저장하거나 TMDB에서 작품을 찾아볼 수 있어요.' : '검색 결과를 불러오지 못했어요. 제목을 직접 저장할 수 있어요.');
      } else {
        setItems(result.items);
        if (!result.items.length) setMessage('일치하는 작품이 없어요. 다른 제목으로 검색해보세요.');
      }
    } catch { if (!controller.signal.aborted) setMessage('검색 중 연결이 끊어졌어요.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  function select(item: WatchCatalogItem) {
    setTitle(item.title);
    setCatalog(item);
    if (!url.trim() || (old?.catalog && url === tmdbTitle(old.type, old.catalog))) setUrl(tmdbTitle(type, item));
    setItems([]);
    setMessage('TMDB 작품 정보를 적용했어요.');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = title.trim(), link = safeUrl(url.trim());
    if (!name) { setError('작품 제목을 입력해주세요.'); return; }
    if (url.trim() && !link) { setError('http:// 또는 https:// 주소를 입력해주세요.'); return; }
    const form = new FormData(event.currentTarget);
    const optionalNumber = (key: string) => form.get(key) ? Number(form.get(key)) : undefined;
    const plannedDate = String(form.get('plannedDate') ?? '');
    if (plannedDate && !isCalendarDay(plannedDate)) { setError('유효한 감상 예정일을 선택해주세요.'); return; }
    const selectedEvents = form.getAll('newsEvents');
    const newsEvents = webtoonNewsEventKeys.filter(event => selectedEvents.includes(event));
    const updatedAt = new Date().toISOString();
    onSave({ id: entry?.id ?? crypto.randomUUID(), kind: 'watch', title: name, detail: String(form.get('detail') ?? '').trim(),
      category: '', status: '', url: link, date: '', done: false, createdAt: entry?.createdAt ?? updatedAt,
      watch: { type, status, catalog, updatedAt, progress: optionalNumber('progress'), season: optionalNumber('season'), rating: optionalNumber('rating'), weekday: optionalNumber('weekday'),
        ...(type !== 'webtoon' && plannedDate && { plannedDate }),
        ...(type === 'webtoon' && newsEvents.length > 0 && { newsEvents }),
        ...(type === 'webtoon' && old?.webtoonCover && { webtoonCover: old.webtoonCover }) } });
  }

  return <Dialog title={entry ? '작품 수정' : '작품 추가'} onClose={onClose} className="watch-dialog">
    <form onSubmit={submit}><div className="entry-form">
      <div className="form-two-columns"><label>종류<select value={type} onChange={event => {
        const nextType = event.target.value as WatchType;
        if (catalog && url === tmdbTitle(type, catalog)) setUrl('');
        setCatalog(undefined); clearSearch(); setType(nextType);
      }}>{types.map(value => <option key={value} value={value}>{watchTypes[value]}</option>)}</select></label>
      <label>상태<select value={status} onChange={event => setStatus(event.target.value as WatchStatus)}>{statuses.map(value => <option key={value} value={value}>{watchStatuses[value]}</option>)}</select></label></div>
      <div className="watch-title-fields"><label>작품 제목 <input required maxLength={200} value={title} onChange={event => { clearSearch(); setTitle(event.target.value); }}/></label>
        {type !== 'webtoon' && <button type="button" className="button secondary" disabled={busy || !title.trim() || manual} onClick={() => void search()}><Search size={15}/>{busy ? '검색 중' : 'TMDB 검색'}</button>}
      </div>
      {message && <p className="watch-feedback" role="status">{message}</p>}
      {manual && type !== 'webtoon' && <a className="text-button blue" target="_blank" rel="noreferrer" href={`https://www.themoviedb.org/search?${new URLSearchParams({ query: title.trim(), language: 'ko-KR' })}`}>TMDB에서 검색<ArrowUpRight size={13}/></a>}
      {!!items.length && <ul className="watch-search-results" aria-label="TMDB 검색 결과">{items.map(item => <li key={item.id}><button type="button" onClick={() => select(item)}>{item.title}{item.year && ` · ${item.year}`}<Plus size={14}/></button></li>)}</ul>}
      <div className="form-two-columns" key={type}>
        {type === 'tv' && <label>시즌<input name="season" type="number" min={1} max={999} defaultValue={old?.type === type ? old.season : undefined}/></label>}
        {type !== 'movie' && <label>마지막으로 본 회차<input name="progress" type="number" min={0} max={99999} defaultValue={old?.type === type ? old.progress : undefined}/></label>}
        {type === 'webtoon' && <label>연재 요일<select name="weekday" defaultValue={old?.type === type ? old.weekday ?? '' : ''}><option value="">미지정</option>{watchDays.map((day, index) => <option key={day} value={index}>{day}요일</option>)}</select></label>}
        {type !== 'webtoon' && <label>감상 예정일 (선택)<input type="date" name="plannedDate" defaultValue={old?.plannedDate}/></label>}
        <label>별점<select name="rating" defaultValue={old?.rating ?? ''}><option value="">미평가</option>{[5, 4, 3, 2, 1, 0].map(value => <option key={value} value={value}>{value}점</option>)}</select></label>
      </div>
      {type === 'webtoon' && <fieldset className="watch-news-settings">
        <legend>관심 뉴스에 받을 소식</legend>
        <div>{webtoonNewsEventKeys.map(event => <label key={event}>
          <input type="checkbox" name="newsEvents" value={event} defaultChecked={old?.newsEvents?.includes(event)}/>{webtoonNewsEvents[event]}
        </label>)}</div>
      </fieldset>}
      <label>{type === 'webtoon' ? '공식 작품 링크' : '작품 링크'} <input type="url" maxLength={2000} placeholder="https://" value={url} onChange={event => setUrl(event.target.value)}/></label>
      <label>감상 메모<textarea name="detail" maxLength={10000} rows={3} defaultValue={entry?.detail}/></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      {(catalog || items.length > 0) && <TmdbCredit/>}
    </div><div className="dialog-footer"><button type="button" className="button secondary" onClick={onClose}>취소</button><button type="submit" className="button primary"><Check size={15}/>저장하기</button></div></form>
  </Dialog>;
}
