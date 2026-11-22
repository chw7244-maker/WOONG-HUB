'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarCheck, CalendarPlus, Goal, RefreshCw, Trophy } from 'lucide-react';
import { clubFixturesUrl, clubName, fixtureCalendarHref, matchup, matchStatusLabel, type Fixture, type FixtureSource } from '@/lib/football';

const tableUrl = 'https://www.premierleague.com/en/tables/premier-league';
const leagueSource = 'https://www.openligadb.de/';
const kst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const kickOffTime = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const kickOffDay = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short' });

/** A short badge label: MCI for City, initials or the first three letters for other clubs. */
function crest(name: string) {
  const club = clubName(name);
  if (club === '맨시티') return 'MCI';
  const words = club.replace(/\b(?:FC|AFC|CF|SC|AC)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  if (!/^[a-z]/i.test(words[0] ?? '')) return club.slice(0, 2);
  return (words.length > 1 ? words.map(word => word[0]).join('') : words[0].slice(0, 3)).slice(0, 3).toUpperCase();
}

type Standing = { rank: number; teamId: number; name: string; matches: number; won: number; draw: number; lost: number; goalDiff: number; points: number; city: boolean };
type Result = { id: string; home: string; away: string; kickOff: string; homeGoals: number; awayGoals: number };
type Source<T> = { items: T[]; stale: boolean; checkedAt: string };
type FootballData = { season: number; fixtures: FixtureSource | null; standings: Source<Standing> | null; results: Source<Result> | null };
type FixtureActions = { saved: ReadonlySet<string>; onSave: (match: Fixture) => void };

export function useFootball(view: 'home' | 'calendar' | 'full', enabled = true) {
  const [data, setData] = useState<FootballData>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      setBusy(true);
      try {
        const response = await fetch(`/api/football?view=${view}`, { signal: controller.signal });
        if (!response.ok) throw new Error('football_unavailable');
        const value: FootballData = await response.json();
        if (!controller.signal.aborted) { setData(value); setError(false); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void load();
    const timer = setInterval(load, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [view, enabled, reload]);
  return { data, busy, error, refresh: () => setReload(value => value + 1) };
}

const kickOffLabel = (match: Fixture) => matchStatusLabel(match.postponed);

function FixtureAction({ match, saved, onSave }: FixtureActions & { match: Fixture }) {
  const title = matchup(match);
  if (saved.has(match.id)) return <Link href={fixtureCalendarHref(match.kickOff)} className="text-button match-calendar-action" aria-label={`${title} 캘린더에서 보기`}>
    <CalendarCheck size={16} aria-hidden="true"/>캘린더에서 보기
  </Link>;
  if (match.postponed === 'cancelled') return null;
  return <button type="button" className="text-button match-calendar-action" aria-label={`${title} 내 일정에 담기`} onClick={() => onSave(match)}>
    <CalendarPlus size={16} aria-hidden="true"/>내 일정에 담기
  </button>;
}

function SourceNote<T>({ source, url, name }: { source?: Source<T> | null; url: string; name: string }) {
  return <p className="football-source"><a href={url} target="_blank" rel="noreferrer">{name}<ArrowUpRight size={12}/></a>
    {source && <span>{source.stale ? ' · 마지막 조회 ' : ' · 조회 '}{kst.format(new Date(source.checkedAt))} KST</span>}
  </p>;
}

function MatchTeam({ name, city }: { name: string; city: boolean }) {
  return <span className="home-match-team" data-city={city || undefined}>
    <span className="home-match-crest" aria-hidden="true">{crest(name)}</span><strong>{clubName(name)}</strong>
  </span>;
}

export function HomeMatch({ now, football, saved, onSave }: FixtureActions & { now: Date | null; football: ReturnType<typeof useFootball> }) {
  const { data, busy, error } = football;
  const match = data?.fixtures?.items.find(item => item.postponed !== 'cancelled' && Date.parse(item.kickOff) >= (now?.getTime() ?? Date.now()));
  const city = (team: string) => clubName(team) === '맨시티';
  return <section className="hub-summary-card hub-summary-stack home-match" aria-labelledby="home-match-title">
    <div className="hub-summary-heading"><h2 id="home-match-title"><Goal size={18} aria-hidden="true"/>맨시티 다음 경기</h2>{match && <small>{match.competition}</small>}</div>
    {match ? <>
      <Link href="/football/#fixtures" className="home-match-board" aria-label={`${matchup(match)}, ${kst.format(new Date(match.kickOff))} KST, ${match.competition}`}>
        <MatchTeam name={match.home} city={city(match.home)}/>
        <span className="home-match-kickoff"><time dateTime={match.kickOff}>{kickOffTime.format(new Date(match.kickOff))}</time><small>{kickOffDay.format(new Date(match.kickOff))}</small></span>
        <MatchTeam name={match.away} city={city(match.away)}/>
      </Link>
      {(data?.fixtures?.stale || error || kickOffLabel(match)) && <small className="home-match-note">{[data?.fixtures?.stale || error ? '마지막 조회 정보' : '', kickOffLabel(match)].filter(Boolean).join(' · ')}</small>}
    </> : <p className="hub-summary-empty" role="status">{busy && !data ? '경기 일정을 불러오는 중' : data?.fixtures ? '예정된 경기가 없어요.' : '일정을 불러오지 못했어요.'}</p>}
    <div className="home-match-actions">
      {match && <FixtureAction match={match} saved={saved} onSave={onSave}/>}
      <Link href="/football/" className="hub-summary-action">경기 일정 · EPL 순위표</Link>
    </div>
  </section>;
}

export default function FootballHub({ saved, onSave }: FixtureActions) {
  const { data, busy, error, refresh } = useFootball('full');
  const [tab, setTab] = useState<'fixtures' | 'standings' | 'results'>('fixtures');
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'standings' || hash === 'results') setTab(hash);
  }, []);
  const source = data?.[tab];
  const next = data?.fixtures?.items.find(match => match.postponed !== 'cancelled');
  const city = data?.standings?.items.find(team => team.city);
  return <div className="football-hub">
    <div className="football-overview">
      <section className="hub-summary-card football-feature" aria-labelledby="football-feature-title">
        <div className="hub-summary-heading"><h2 id="football-feature-title"><Goal size={18} aria-hidden="true"/>맨시티 다음 경기</h2></div>
        {next ? <><strong className="football-matchup">{matchup(next)}</strong><p className="football-kickoff"><time dateTime={next.kickOff}>{kst.format(new Date(next.kickOff))} KST</time> · {next.competition}{kickOffLabel(next) && ` · ${kickOffLabel(next)}`}</p></>
          : <p className="hub-summary-empty" role="status">{busy ? '경기 확인 중' : data?.fixtures ? '예정 경기 없음' : '공식 일정 확인'}</p>}
        {next && <FixtureAction match={next} saved={saved} onSave={onSave}/>}
        <SourceNote source={data?.fixtures} url={clubFixturesUrl} name="맨시티 공식 일정"/>
      </section>
      {city && <section className="hub-summary-card football-position" aria-labelledby="football-position-title">
        <div className="hub-summary-heading"><h2 id="football-position-title"><Trophy size={18} aria-hidden="true"/>맨시티 리그 순위</h2></div>
        <strong>{city.rank}<small>위</small></strong><span>{city.matches}경기 · 승점 {city.points}{(data?.standings?.stale || error) && ' · 마지막 조회'}</span>
      </section>}
    </div>
    <div className="football-toolbar">
      <div className="tabs" role="group" aria-label="축구 보기">
        {(['fixtures', 'standings', 'results'] as const).map(value => <button type="button" key={value} aria-pressed={tab === value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>
          {{ fixtures: '맨시티 일정', standings: 'EPL 순위표', results: '최근 EPL 결과' }[value]}
        </button>)}
      </div>
      <button type="button" className="text-button muted" onClick={refresh} disabled={busy}><RefreshCw size={14}/>{busy ? '조회 중' : '새로고침'}</button>
    </div>
    <section className="panel football-body" id={tab} aria-label={{ fixtures: '맨시티 일정', standings: 'EPL 순위표', results: '최근 EPL 결과' }[tab]}>
      {error && <p role="status" className="football-empty">최신 데이터를 불러오지 못했어요.{data && ' 마지막 조회 내용을 표시합니다.'}</p>}
      {!source ? <p role="status" className="football-empty">{busy ? '데이터를 불러오는 중이에요.' : '이 항목을 불러오지 못했어요. 아래에서 공식 정보를 확인할 수 있어요.'}</p>
        : source.items.length === 0 ? <p className="football-empty">표시할 경기가 없어요.</p> : null}
      {tab === 'fixtures' && !!data?.fixtures?.items.length && <ul className="football-matches football-fixtures">
        {data.fixtures.items.map(match => <li key={match.id}>
          <time dateTime={match.kickOff}>{kst.format(new Date(match.kickOff))} KST</time>
          <div><strong>{matchup(match)}</strong><small>{[match.competition, match.venue, kickOffLabel(match)].filter(Boolean).join(' · ')}</small></div>
          <FixtureAction match={match} saved={saved} onSave={onSave}/>
        </li>)}
      </ul>}
      {tab === 'standings' && !!data?.standings?.items.length && <div className="football-table-wrap">
        <table className="football-table"><caption>{data.season}/{String(data.season + 1).slice(-2)} 프리미어리그</caption>
          <thead><tr><th scope="col">순위</th><th scope="col">팀</th><th scope="col">경기</th><th scope="col" className="football-table-detail">승</th><th scope="col" className="football-table-detail">무</th><th scope="col" className="football-table-detail">패</th><th scope="col">득실</th><th scope="col">승점</th></tr></thead>
          <tbody>{data.standings.items.map(team => <tr key={team.teamId} className={team.city ? 'football-city-row' : undefined}>
            <td>{team.rank}</td><th scope="row">{team.city ? '맨체스터 시티' : team.name}</th><td>{team.matches}</td><td className="football-table-detail">{team.won}</td><td className="football-table-detail">{team.draw}</td><td className="football-table-detail">{team.lost}</td><td>{team.goalDiff > 0 ? `+${team.goalDiff}` : team.goalDiff}</td><td><strong>{team.points}</strong></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {tab === 'results' && !!data?.results?.items.length && <ul className="football-matches">
        {data.results.items.map(match => <li key={match.id}><time dateTime={match.kickOff}>{kst.format(new Date(match.kickOff))} KST</time><div><strong>{clubName(match.home)} <span className="football-score">{match.homeGoals} : {match.awayGoals}</span> {clubName(match.away)}</strong></div></li>)}
      </ul>}
      <div className="football-sources">
        {tab === 'fixtures' ? <><SourceNote source={data?.fixtures} url={clubFixturesUrl} name="맨시티 공식 일정"/><p className="football-source">킥오프 시간은 변경될 수 있어요.</p></> : <>
          {tab === 'standings' ? <SourceNote source={data?.standings} url={leagueSource} name="OpenLigaDB · 커뮤니티 집계"/> : <SourceNote source={data?.results} url={leagueSource} name="OpenLigaDB · 커뮤니티 집계"/>}
          <SourceNote url={tab === 'standings' ? tableUrl : 'https://www.mancity.com/results/mens'} name={tab === 'standings' ? '공식 순위표' : '맨시티 전체 대회 공식 결과'}/>
        </>}
      </div>
    </section>
  </div>;
}
