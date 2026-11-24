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

/** A club crest served by the worker (see worker/football.mjs); clubs without one keep the short badge. */
export function CrestMark({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{crest(name)}</>;
  return <img className="football-crest-image" src={`/api/football/crest?name=${encodeURIComponent(name)}`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/>;
}

function Crest({ name, size = 'small' }: { name: string; size?: 'small' | 'large' }) {
  return <span className={`football-crest football-crest-${size}`} data-city={clubName(name) === '맨시티' || undefined} aria-hidden="true"><CrestMark key={name} name={name}/></span>;
}

function Teams({ home, away }: { home: string; away: string }) {
  return <span className="football-teams">
    <Crest name={home}/><span>{clubName(home)}</span><span className="football-versus">vs</span><Crest name={away}/><span>{clubName(away)}</span>
  </span>;
}

const kstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Days until kick-off on the KST calendar: 오늘, D-1, D-2 … */
function dDay(kickOff: string, now: number) {
  const days = Math.round((Date.parse(kstDay.format(new Date(kickOff))) - Date.parse(kstDay.format(new Date(now)))) / 86_400_000);
  return days <= 0 ? '오늘' : `D-${days}`;
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
const nextMatch = (fixtures: FixtureSource | null | undefined, now: Date | null) =>
  fixtures?.items.find(item => item.postponed !== 'cancelled' && Date.parse(item.kickOff) >= (now?.getTime() ?? Date.now()));

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
    <span className="home-match-crest" aria-hidden="true"><CrestMark key={name} name={name}/></span><strong>{clubName(name)}</strong>
  </span>;
}

export function HomeMatch({ now, football, saved, onSave }: FixtureActions & { now: Date | null; football: ReturnType<typeof useFootball> }) {
  const { data, busy, error } = football;
  const match = nextMatch(data?.fixtures, now);
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

export function HobbyMatch({ now, football }: { now: Date | null; football: ReturnType<typeof useFootball> }) {
  const { data, busy, error } = football;
  const match = nextMatch(data?.fixtures, now);
  return <Link href="/football/#fixtures" className="hobby-library-note">
    <span>다음 경기</span>
    <strong>{match ? matchup(match) : '맨시티 경기 일정'}</strong>
    {match ? <small><time dateTime={match.kickOff}>{kst.format(new Date(match.kickOff))}</time> · {match.competition}</small>
      : <small>{busy && !data ? '일정 확인 중' : data?.fixtures ? '예정된 경기가 없어요.' : '경기 일정 열기'}</small>}
    {match && (data?.fixtures?.stale || error || kickOffLabel(match)) && <small>{[data?.fixtures?.stale || error ? '마지막 조회 정보' : '', kickOffLabel(match)].filter(Boolean).join(' · ')}</small>}
  </Link>;
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
  const table = data?.standings?.items ?? [];
  const city = table.find(team => team.city);
  // Latest league results first, as City's 승/무/패.
  const form = (data?.results?.items ?? []).slice(0, 5).map(match => {
    const home = clubName(match.home) === '맨시티', ours = home ? match.homeGoals : match.awayGoals, theirs = home ? match.awayGoals : match.homeGoals;
    return { id: match.id, result: ours > theirs ? '승' : ours < theirs ? '패' : '무', label: `${clubName(match.home)} ${match.homeGoals} : ${match.awayGoals} ${clubName(match.away)}` };
  });
  const leader = city && (city.rank === 1 ? table[1] : table[0]);
  const edge = city && (city.rank <= 4 ? table[4] : table[3]);
  const gap = (other?: Standing) => other && city ? city.points - other.points : 0;
  const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0';
  return <div className="football-hub">
    <div className="football-overview">
      <section className="hub-summary-card football-feature" aria-labelledby="football-feature-title">
        <div className="hub-summary-heading"><h2 id="football-feature-title"><Goal size={18} aria-hidden="true"/>맨시티 다음 경기</h2>{next && <small>{next.competition}</small>}</div>
        {next ? <div className="home-match-board football-board" aria-label={`${matchup(next)}, ${kst.format(new Date(next.kickOff))} KST`}>
          <MatchTeam name={next.home} city={clubName(next.home) === '맨시티'}/>
          <span className="home-match-kickoff"><time dateTime={next.kickOff}>{kickOffTime.format(new Date(next.kickOff))}</time><small>{kickOffDay.format(new Date(next.kickOff))} · {dDay(next.kickOff, Date.now())}{kickOffLabel(next) && ` · ${kickOffLabel(next)}`}</small></span>
          <MatchTeam name={next.away} city={clubName(next.away) === '맨시티'}/>
        </div> : <p className="hub-summary-empty" role="status">{busy ? '경기 확인 중' : data?.fixtures ? '예정 경기 없음' : '공식 일정 확인'}</p>}
        {next && <FixtureAction match={next} saved={saved} onSave={onSave}/>}
        <SourceNote source={data?.fixtures} url={clubFixturesUrl} name="맨시티 공식 일정"/>
      </section>
      {city && <section className="hub-summary-card football-season" aria-labelledby="football-season-title">
        <div className="hub-summary-heading"><h2 id="football-season-title"><Trophy size={18} aria-hidden="true"/>맨시티 시즌</h2><small>EPL {city.matches}경기{(data?.standings?.stale || error) && ' · 마지막 조회'}</small></div>
        <dl className="football-season-stats">
          <div><dt>순위</dt><dd>{city.rank}<small>위</small></dd></div>
          <div><dt>승점</dt><dd>{city.points}</dd></div>
          <div><dt>전적</dt><dd>{city.won}·{city.draw}·{city.lost}<small>승무패</small></dd></div>
          <div><dt>득실</dt><dd>{signed(city.goalDiff)}</dd></div>
        </dl>
        <dl className="football-race">
          {leader && <div><dt>{city.rank === 1 ? `2위 ${leader.name}와` : `1위 ${leader.name}까지`}</dt><dd>{signed(gap(leader))}<small>점</small></dd></div>}
          {edge && <div><dt>{city.rank <= 4 ? `5위 ${edge.name}와` : `4위 ${edge.name}까지`}</dt><dd>{signed(gap(edge))}<small>점</small></dd></div>}
        </dl>
        {!!form.length && <div className="football-form"><span>최근 리그 {form.length}경기</span><ol>{form.map(match => <li key={match.id} data-result={match.result} title={match.label}><span className="sr-only">{match.label} </span>{match.result}</li>)}</ol></div>}
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
          <div><strong><Teams home={match.home} away={match.away}/></strong><small>{[match.competition, match.venue, kickOffLabel(match)].filter(Boolean).join(' · ')}</small></div>
          <FixtureAction match={match} saved={saved} onSave={onSave}/>
        </li>)}
      </ul>}
      {tab === 'standings' && !!data?.standings?.items.length && <div className="football-table-wrap">
        <table className="football-table"><caption>{data.season}/{String(data.season + 1).slice(-2)} 프리미어리그</caption>
          <thead><tr><th scope="col">순위</th><th scope="col">팀</th><th scope="col">경기</th><th scope="col" className="football-table-detail">승</th><th scope="col" className="football-table-detail">무</th><th scope="col" className="football-table-detail">패</th><th scope="col">득실</th><th scope="col">승점</th></tr></thead>
          <tbody>{data.standings.items.map(team => <tr key={team.teamId} className={team.city ? 'football-city-row' : undefined}>
            <td>{team.rank}</td><th scope="row"><span className="football-team-cell"><Crest name={team.name}/>{team.city ? '맨체스터 시티' : team.name}</span></th><td>{team.matches}</td><td className="football-table-detail">{team.won}</td><td className="football-table-detail">{team.draw}</td><td className="football-table-detail">{team.lost}</td><td>{team.goalDiff > 0 ? `+${team.goalDiff}` : team.goalDiff}</td><td><strong>{team.points}</strong></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {tab === 'results' && !!data?.results?.items.length && <ul className="football-matches">
        {data.results.items.map(match => <li key={match.id}><time dateTime={match.kickOff}>{kst.format(new Date(match.kickOff))} KST</time><div><strong className="football-result"><Crest name={match.home}/><span>{clubName(match.home)}</span><span className="football-score">{match.homeGoals} : {match.awayGoals}</span><Crest name={match.away}/><span>{clubName(match.away)}</span></strong></div></li>)}
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
