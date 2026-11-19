'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { adjacentBriefingDate, briefingEditions, briefingSection, briefingSources, editionIds, isBriefingDate, isBriefingEdition, type BriefingEdition, type BriefingReadout } from '@/lib/briefings';
import { newsTime } from '@/lib/news';
import { todayKST } from '@/lib/store';

const dateLabel = (date: string) => date.replaceAll('-', '. ');
const csvUrl = (from: string, through: string) => `/api/briefings/export?${new URLSearchParams({ from, through })}`;

export function useDailyBriefings(date = '') {
  const [load, setLoad] = useState<{ date: string; response?: BriefingReadout; failed: boolean }>();
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function loadIssues() {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const path = date ? `/api/briefings?${new URLSearchParams({ date })}` : '/api/briefings';
        const response = await fetch(path, { signal: controller.signal });
        if (!response.ok) throw new Error('briefing_unavailable');
        const data = await response.json() as BriefingReadout;
        if (!controller.signal.aborted) setLoad({ date, response: data, failed: false });
      } catch {
        if (!controller.signal.aborted) setLoad(previous => ({ date, response: previous?.date === date ? previous.response : undefined, failed: true }));
      } finally { running = false; }
    }
    void loadIssues();
    const interval = setInterval(loadIssues, 60_000);
    document.addEventListener('visibilitychange', loadIssues);
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', loadIssues); };
  }, [date, attempt]);
  return { response: load?.date === date ? load.response : undefined, failed: load?.date === date && load.failed, retry: () => retry(n => n + 1) };
}

function CsvDownload({ date, today }: { date: string; today: string }) {
  const [invalid, setInvalid] = useState(false);
  return <details className="daily-csv">
    <summary>CSV 다운로드</summary>
    <div className="daily-csv-body">
      <a className="button secondary" href={csvUrl(date, date)} download>{dateLabel(date)} CSV</a>
      <form className="daily-csv-range" action="/api/briefings/export" onChange={() => setInvalid(false)} onSubmit={event => {
        const values = new FormData(event.currentTarget);
        const from = String(values.get('from') ?? ''), through = String(values.get('through') ?? '');
        if (!isBriefingDate(from) || !isBriefingDate(through) || from > through || through > today || Date.parse(through) - Date.parse(from) > 92 * 86400000) {
          event.preventDefault();
          setInvalid(true);
        }
      }}>
        <label>시작일<input type="date" name="from" defaultValue={date} max={today} required/></label>
        <label>종료일<input type="date" name="through" defaultValue={date} max={today} required/></label>
        <button type="submit" className="button secondary">기간 CSV</button>
        {invalid && <p role="status">시작일부터 종료일까지 최대 93일을 선택하세요.</p>}
      </form>
    </div>
  </details>;
}

function BriefingDateControls({ date, today, latest, onSelect }: {
  date: string; today: string; latest: boolean; onSelect: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const previous = adjacentBriefingDate(date, -1);
  const next = adjacentBriefingDate(date, 1);
  useEffect(() => {
    if (input.current) input.current.value = date;
  }, [date]);
  return <div className="daily-date-controls">
    <label htmlFor="daily-briefing-date">브리핑 날짜</label>
    <div className="daily-date-stepper" role="group" aria-label="브리핑 날짜 이동">
      <button type="button" className="button secondary daily-date-arrow" aria-label="이전 날" disabled={!previous} onClick={() => previous && onSelect(previous)}>
        <ChevronLeft size={18} aria-hidden="true"/>
      </button>
      <input ref={input} id="daily-briefing-date" type="date" defaultValue={date} min="0001-01-01" max={today} required
        onInput={event => {
          const { value } = event.currentTarget;
          if (isBriefingDate(value) && value <= today) onSelect(value);
        }}
        onBlur={event => { event.currentTarget.value = date; }}/>
      <button type="button" className="button secondary daily-date-arrow" aria-label="다음 날" disabled={!next || next > today} onClick={() => next && onSelect(next)}>
        <ChevronRight size={18} aria-hidden="true"/>
      </button>
      <button type="button" className="button secondary" onClick={() => onSelect('')} disabled={latest}>최근 호</button>
    </div>
  </div>;
}

export function DailyBriefingPanel() {
  const [edition, setEdition] = useState<BriefingEdition>('games');
  const [date, setDate] = useState('');
  const [clientToday, setClientToday] = useState('');
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const requestedEdition = search.get('briefing');
    const requestedDate = search.get('briefingDate');
    const today = todayKST();
    setClientToday(today);
    if (requestedEdition && isBriefingEdition(requestedEdition)) setEdition(requestedEdition);
    if (requestedDate && isBriefingDate(requestedDate) && requestedDate <= today) setDate(requestedDate);
  }, []);
  const { response, failed, retry } = useDailyBriefings(date);
  const issue = response?.issues.find(entry => entry.edition === edition);
  const today = response?.today ?? clientToday;
  const resolved = response?.date ?? (date || today);

  function selectBriefing(value: string, selectedEdition: BriefingEdition) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('briefingDate', value);
    else url.searchParams.delete('briefingDate');
    url.searchParams.set('briefing', selectedEdition);
    window.history.replaceState(null, '', url);
    setDate(value);
    setEdition(selectedEdition);
  }

  return <section className="panel daily-briefings" id="daily-briefing" aria-labelledby="daily-briefing-title">
    <header className="daily-heading">
      <div><h2 id="daily-briefing-title">{resolved !== today ? '날짜별 브리핑' : '오늘의 브리핑'}</h2>
        {resolved && <time dateTime={resolved} aria-live="polite">{dateLabel(resolved)} KST</time>}</div>
      {resolved && <BriefingDateControls date={resolved} today={today} latest={!date} onSelect={value => selectBriefing(value, edition)}/>}
    </header>
    <div className="daily-editions" role="group" aria-label="브리핑 종류">
      {editionIds.map(key => <button key={key} type="button" aria-pressed={edition === key} onClick={() => selectBriefing(date, key)}>{briefingEditions[key].label}</button>)}
    </div>
    {failed && <div className="daily-load" role="status"><p>브리핑을 불러오지 못했어요.</p><button className="text-button blue" type="button" onClick={retry}>다시 불러오기</button></div>}
    {!failed && !response && <p className="daily-load" role="status">브리핑을 불러오는 중이에요.</p>}
    {response && <>
      {issue?.markdown ? <article className="daily-report" aria-label={`${briefingEditions[edition].label} 브리핑 전문`}>
        <div className="daily-report-meta">
          <small>{newsTime(issue.publishedAt)} KST 게시</small>
          {issue.chatUrl && <a href={issue.chatUrl} target="_blank" rel="noreferrer">원본 채팅 열기</a>}
        </div>
        <Markdown skipHtml disallowedElements={['img']} remarkPlugins={[remarkGfm]} urlTransform={url => /^https:\/\//i.test(url) ? url : ''}
          components={{
            h1: ({ children }) => <h3>{children}</h3>,
            h2: ({ children }) => <h4>{children}</h4>,
            h3: ({ children }) => <h5>{children}</h5>,
            a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <>{children}</>,
            table: ({ children }) => <div className="daily-report-table" tabIndex={0}><table>{children}</table></div>,
          }}>{issue.markdown}</Markdown>
      </article> : issue ? <div className="daily-issue">
        <div className="daily-overview"><p>{issue.overview}</p><small>{newsTime(issue.publishedAt)} KST 게시</small></div>
        {!!issue.items.length && <ul className="daily-items">
          {issue.items.map(item => <li key={item.url}>
            <div className="daily-item-meta"><span>{briefingSection(edition, item.section)}</span><span className={`daily-source-${item.status}`}>{briefingSources[item.status]}</span>{item.sourceDate && <time dateTime={item.sourceDate}>{dateLabel(item.sourceDate)}</time>}</div>
            <h3>{item.title}</h3><p>{item.summary}</p><p className="daily-why"><strong>왜 중요한가요</strong> {item.why}</p>
            <a className="text-button blue" href={item.url} target="_blank" rel="noreferrer">{item.source} 원문</a>
          </li>)}
        </ul>}
      </div> : <p className="daily-load">{briefingEditions[edition].label} 브리핑이 이 날짜에 아직 게시되지 않았어요.</p>}
      {!!response.dates.length && <CsvDownload key={resolved} date={resolved} today={response.today}/>}
    </>}
  </section>;
}

export function HomeBriefingHighlights({ response }: { response: BriefingReadout }) {
  const issues = editionIds.flatMap(edition => response.issues.filter(issue => issue.edition === edition));
  return <ul className="daily-home-list">{issues.map(issue => <li key={issue.edition}>
    <Link href={`/news/?${new URLSearchParams({ briefing: issue.edition, briefingDate: issue.date })}#daily-briefing`}>
      <span>{briefingEditions[issue.edition].label} · {dateLabel(issue.date)}</span>
      <strong>{issue.items[0]?.title ?? issue.overview}</strong>
    </Link>
  </li>)}</ul>;
}
