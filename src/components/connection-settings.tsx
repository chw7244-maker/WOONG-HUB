'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Gamepad2, Music2, RefreshCw } from 'lucide-react';
import { lastCalendarDay } from '@/lib/calendar';
import type { SteamAccountStatus } from '@/lib/steam-account';
import type { useCalendarSnapshot } from './calendar-hub';
import { spotifyMessage, useSpotify, type SpotifyFeature } from './spotify-provider';
import { steamFetch, steamMessage } from './steam-account';

const spotifyFeatures: { id: SpotifyFeature; label: string }[] = [
  { id: 'playback', label: '재생 제어' },
  { id: 'browser', label: '브라우저 재생' },
  { id: 'library', label: '라이브러리 읽기' },
  { id: 'manage', label: '플레이리스트 편집' },
];

const kst = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function SpotifyConnection() {
  const { status, loading, error, busy, connect } = useSpotify();
  const connected = status?.connected === true;

  return (
    <article className="connection-card">
      <div className="connection-title">
        <h3><Music2 size={17} aria-hidden="true" />Spotify</h3>
        <span className={`badge ${connected && !error ? 'blue' : ''}`}>
          {loading ? '확인 중' : error ? '상태 확인 필요' : status?.configured ? connected ? '연결됨' : '연결 전' : '설정 필요'}
        </span>
      </div>
      {connected && <>
        {status?.account?.displayName && <p className="connection-account">{status.account.displayName}</p>}
        <details className="connection-detail">
          <summary>승인 권한과 다시 연결</summary>
          <ul className="connection-permissions" aria-label="Spotify 기능별 권한">
            {spotifyFeatures.map(({ id, label }) => (
              <li key={id}><span>{label}</span><span className={status?.features[id] ? 'blue' : 'muted'}>{status?.features[id] ? '승인됨' : '미승인'}</span></li>
            ))}
          </ul>
          {status?.configured&&<button type="button" className="text-button blue" disabled={busy||loading} onClick={()=>void connect()}>{busy?'승인 준비 중':'Spotify 다시 연결'}</button>}
        </details>
      </>}
      {!loading && !error && !connected && <p className="muted">
        {status?.configured ? 'Spotify 계정을 연결하면 재생과 라이브러리 권한을 설정할 수 있어요.' : spotifyMessage(status?.configurationError || 'spotify_not_configured')}
      </p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="connection-actions">
        {status?.configured&&!connected?<button type="button" className="text-button blue" disabled={busy||loading} onClick={()=>void connect()}>
          {busy?'승인 준비 중':'Spotify 연결'}<ArrowRight size={14}/>
        </button>:<Link className="text-button blue" href="/music/spotify/">Spotify 관리<ArrowRight size={14}/></Link>}
      </div>
    </article>
  );
}

function SteamConnection({ ready }: { ready: boolean }) {
  const [status, setStatus] = useState<SteamAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void steamFetch<SteamAccountStatus>('status', undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : steamMessage('steam_unavailable'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ready, attempt]);

  const account = status?.accounts.find(({ steamId }) => steamId === status.activeSteamId);
  const lookupError = account?.error || account?.recentError;

  return (
    <article className="connection-card">
      <div className="connection-title">
        <h3><Gamepad2 size={17} aria-hidden="true" />Steam</h3>
        <span className={`badge ${status?.configured && status.hasKey && account && !error ? 'blue' : ''}`}>
          {loading ? '확인 중' : error ? '상태 확인 필요' : !status?.configured ? '설정 필요' : !account ? '연결 전' : status.hasKey ? '연결됨' : '키 등록 필요'}
        </span>
      </div>
      {status && account && <>
        <p className="connection-account">{account.name} <small>· 선택 계정</small></p>
        <p className="connection-last-read muted">{account.ownedAt ? `보유 게임 · ${kst.format(new Date(account.ownedAt))} KST` : '보유 게임 조회 전'}</p>
        <details className="connection-detail">
          <summary>계정 및 조회 정보</summary>
          <dl className="connection-details">
            <div><dt>연결 계정</dt><dd>{status.accounts.length}개</dd></div>
            <div><dt>최근 플레이 조회</dt><dd>{account.recentAt ? `${kst.format(new Date(account.recentAt))} KST` : '조회 전'}</dd></div>
          </dl>
        </details>
      </>}
      {!loading && !error && !account && <p className="muted">
        {status?.configured ? 'Steam 계정을 연결하면 보유 게임과 플레이 시간을 확인할 수 있어요.' : steamMessage('steam_not_configured')}
      </p>}
      {lookupError && <p className="form-error">{steamMessage(lookupError)} 위 시각은 마지막 성공 기준입니다.</p>}
      {error && <p className="form-error" role="alert">{error}{status ? ' 마지막으로 확인한 상태를 표시합니다.' : ''}</p>}
      <div className="connection-actions">
        <Link className="text-button blue" href="/games/steam/">Steam 계정 관리<ArrowRight size={14} /></Link>
        {error && <button className="text-button muted" type="button" onClick={() => {
          setLoading(true);
          setError('');
          setAttempt((value) => value + 1);
        }}>다시 확인<RefreshCw size={14} /></button>}
      </div>
    </article>
  );
}

function CalendarConnection({ calendar, hidden, today }: {
  calendar: ReturnType<typeof useCalendarSnapshot>;
  hidden: string[];
  today: string;
}) {
  const snapshot = calendar.data?.snapshot;
  const outside = snapshot && today && (today < snapshot.rangeStart || today >= snapshot.rangeEnd);

  return (
    <article className="connection-card">
      <div className="connection-title">
        <h3><CalendarDays size={17} aria-hidden="true" />Notion · Google 캘린더</h3>
        <span className={`badge ${snapshot && !calendar.error ? 'blue' : ''}`}>
          {calendar.loading ? '확인 중' : calendar.error ? '조회 오류' : snapshot ? '수동 반영됨' : '반영 전'}
        </span>
      </div>
      {snapshot && <>
        <dl className="connection-details">
          <div><dt>마지막 반영</dt><dd>{kst.format(new Date(snapshot.syncedAt))} KST</dd></div>
          <div><dt>반영 기간</dt><dd>{snapshot.rangeStart} ~ {lastCalendarDay(snapshot.rangeEnd)}</dd></div>
          {(['notion', 'google'] as const).map((provider) => {
            const sources = snapshot.sources.filter((source) => source.provider === provider);
            return <div key={provider}>
              <dt>{provider === 'notion' ? 'Notion' : 'Google'} 표시</dt>
              <dd>{sources.filter(({ id }) => !hidden.includes(id)).length}/{sources.length}개</dd>
            </div>;
          })}
        </dl>
        {outside && <p className="calendar-range-warning">오늘은 반영 기간 밖입니다.</p>}
      </>}
      <p className="muted">새 일정은 이 채팅에서 ‘캘린더 일정 다시 반영해줘’라고 요청하면 반영됩니다.</p>
      {calendar.error && <p className="form-error" role="alert">{calendar.error}</p>}
      <div className="connection-actions">
        <Link className="text-button blue" href="/calendar/#calendar-sources" scroll={false}>캘린더 표시 설정<ArrowRight size={14} /></Link>
        {calendar.error && <button type="button" className="text-button muted" disabled={calendar.loading} onClick={calendar.reload}>다시 확인<RefreshCw size={14} /></button>}
      </div>
    </article>
  );
}

export default function ConnectionSettings({ userId, ready, calendar, hidden, today }: {
  userId: string | null;
  ready: boolean;
  calendar: ReturnType<typeof useCalendarSnapshot>;
  hidden: string[];
  today: string;
}) {
  return (
    <section id="connections" className="panel settings-panel integration-settings" aria-labelledby="connection-settings-title">
      <div className="panel-heading"><h2 id="connection-settings-title">연결 관리</h2></div>
      <div className="connection-grid">
        <SpotifyConnection />
        <SteamConnection key={userId ?? ''} ready={ready} />
        <CalendarConnection calendar={calendar} hidden={hidden} today={today} />
      </div>
    </section>
  );
}
