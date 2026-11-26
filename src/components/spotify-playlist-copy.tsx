'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import type { LocalPlaylistTrack } from '@/lib/local-playlist';
import { spotifyResource } from '@/lib/spotify';
import { spotifyTime, type SpotifyEntity, type SpotifyPage } from '@/lib/spotify-account';
import { spotifyTrackChoices, spotifyTrackQuery } from '@/lib/spotify-playlist-copy';
import Dialog from './dialog';
import { spotifyFetch, SpotifyApiError, useSpotify } from './spotify-provider';

type Match = { candidates: SpotifyEntity[]; chosen: string };
type PlaylistLink = Pick<SpotifyEntity, 'id' | 'url'>;
type Creation = { requestId: string; name: string; playlist?: PlaylistLink };

export default function SpotifyPlaylistCopy({ title, tracks, onClose }: {
  title: string; tracks: LocalPlaylistTrack[]; onClose: () => void;
}) {
  const spotify = useSpotify();
  const [name, setName] = useState(title.slice(0, 100));
  const [existingLink, setExistingLink] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [writing, setWriting] = useState(false);
  const [remote, setRemote] = useState<PlaylistLink>();
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const creation = useRef<Creation | null>(null);
  const activeWrite = useRef(false);
  useEffect(() => () => request.current?.abort(), []);

  const selected = matches.flatMap(row => row.candidates.find(item => item.id === row.chosen)?.uri ?? []);
  const ready = spotify.status?.features.playlistCopy;
  const resuming = !!existingLink.trim();
  const retrying = !resuming && !!creation.current;

  async function search() {
    if (!ready || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setSearching(true);
    const lookup = async (q: string) => spotifyFetch<SpotifyPage>('search?' + new URLSearchParams({ q, type: 'track' }), { signal: controller.signal });
    try {
      for (const track of tracks.slice(matches.length)) {
        const query = spotifyTrackQuery(track);
        let items = query ? (await lookup(query)).items : [];
        if (!items.length && query.startsWith('track:')) items = (await lookup(track.title.slice(0, 120))).items;
        if (controller.signal.aborted) return;
        const { candidates, recommended } = spotifyTrackChoices(track, items);
        setMatches(rows => [...rows, { candidates, chosen: recommended }]);
      }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Spotify 검색에 실패했어요.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  async function copy() {
    if ((!resuming && !name.trim()) || !selected.length || activeWrite.current || complete) return;
    let target = creation.current?.playlist;
    if (resuming) {
      try {
        target = spotifyResource(existingLink, 'playlist');
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Spotify 플레이리스트 링크를 확인해주세요.');
        return;
      }
    }
    activeWrite.current = true;
    setWriting(true);
    setError('');
    try {
      if (!target) {
        const operation = creation.current ?? { requestId: crypto.randomUUID(), name: name.trim() };
        creation.current = operation;
        const { playlist } = await spotifyFetch<{ playlist: SpotifyEntity }>('command', {
          body: { action: 'playlist-create', requestId: operation.requestId, name: operation.name },
        });
        operation.playlist = playlist;
        target = playlist;
      }
      setRemote(target);
      await spotifyFetch('command', {
        body: { action: 'playlist-fill', requestId: crypto.randomUUID(), playlistId: target.id, uris: selected },
      });
      setComplete(true);
    } catch (error) {
      const code = error instanceof SpotifyApiError ? error.code : '';
      if (!resuming && !target && error instanceof SpotifyApiError && error.status < 500 &&
        !['spotify_request_pending','spotify_request_reused'].includes(code)) creation.current = null;
      if (code === 'spotify_not_found' && target) {
        setRemote(undefined);
        setError('Spotify에서 이 목록을 찾지 못했어요. Spotify의 내 라이브러리에서 사용할 목록의 공유 링크를 다시 복사해주세요.');
      } else if (code === 'spotify_playlist_already_has_tracks') {
        setError('Spotify 목록에 다른 곡이 있어요. 빈 목록을 선택하거나 Spotify에서 곡을 확인해주세요.');
      } else if (code === 'spotify_playlist_read_only' || code === 'spotify_playlist_visibility_required') {
        setError('Spotify에서 본인 소유 목록인지와 비공개 설정을 확인한 뒤 다시 시도해주세요.');
      } else if (code === 'spotify_scope_required' || code === 'spotify_forbidden' || code === 'spotify_reconnect_required') {
        setError(error instanceof Error ? error.message : 'Spotify 연결 권한을 확인해주세요.');
      } else if (code === 'spotify_rate_limited' || code === 'spotify_quota_exceeded') {
        const seconds = (error as SpotifyApiError).retryAfter;
        setError(seconds > 0 ? `Spotify 요청 한도에 도달했어요. ${seconds}초 뒤 같은 목록에 다시 시도해주세요.` : 'Spotify 요청 한도에 도달했어요. 잠시 뒤 다시 시도해주세요.');
      } else if (target) {
        setError('곡 추가를 확인하지 못했어요. 다시 확인하거나 기존 Spotify 목록의 링크를 입력해주세요.');
      } else if (creation.current) {
        setError('Spotify가 목록을 만들었는지 확인하지 못했어요. 다시 누르면 같은 요청 상태를 확인합니다.');
      } else {
        setError(error instanceof Error ? error.message : 'Spotify에 추가하지 못했어요.');
      }
    } finally {
      activeWrite.current = false;
      setWriting(false);
    }
  }

  return <Dialog title="Spotify로 추가" onClose={() => { if (!activeWrite.current) onClose(); }} className="music-dialog">
    <div className="spotify-copy-content">
      {spotify.loading ? <p role="status">Spotify 연결을 확인하는 중이에요.</p>
        : !ready ? <div className="spotify-copy-intro">
          <p>{spotify.error || (spotify.status?.configured
            ? '곡 검색과 비공개 플레이리스트 저장을 위해 Spotify 계정 권한을 연결해주세요.'
            : 'Spotify 연결 설정을 확인해주세요.')}</p>
          {spotify.status?.configured && <button type="button" className="button secondary" disabled={spotify.busy}
            onClick={()=>void spotify.connect('playlistCopy')}>{spotify.status.connected ? 'Spotify 권한 연결' : 'Spotify 계정 연결'}</button>}
        </div> : <>
          {!resuming && <label className="spotify-copy-name">플레이리스트 이름<input value={name} maxLength={100} readOnly={writing||retrying||complete}
            onChange={event=>setName(event.target.value)}/></label>}
          {!complete && <details className="spotify-copy-recovery">
            <summary>이미 만든 Spotify 목록에 이어서 추가</summary>
            <label className="spotify-copy-name">Spotify 플레이리스트 공유 링크
              <input value={existingLink} type="text" inputMode="url" maxLength={2000} readOnly={writing}
                onChange={event=>{setExistingLink(event.target.value);setError('');setRemote(undefined);}}/>
            </label>
            <p className="local-muted">내가 만든 빈 목록의 링크를 붙여넣으세요. 최근 HUB에서 만들었거나 비공개인 목록을 사용할 수 있어요.</p>
          </details>}
          <div className="spotify-copy-intro">
            <p className="local-muted">곡 제목과 아티스트로 Spotify에서 검색합니다. 선택한 곡만 현재 순서대로 비공개 목록에 담아요.</p>
            {matches.length < tracks.length && <button type="button" className="button secondary" onClick={()=>void search()}
              disabled={searching || writing}><Search size={15} aria-hidden="true"/>{searching ? '검색 중…' : matches.length ? '남은 곡 검색' : 'Spotify에서 곡 찾기'}</button>}
          </div>
          {matches.length > 0 && <p className="local-muted" role="status">{matches.length}/{tracks.length}곡 검색 · {selected.length}곡 선택</p>}
          {matches.length > 0 && !complete && <ol className="spotify-copy-list">{matches.map(({ candidates, chosen }, index)=>{
            const track=tracks[index];
            return <li key={track.path}>
              <label>
                <strong>{track.title}</strong><small>{track.artist}{track.album && ` · ${track.album}`}</small>
                {candidates.length ? <select aria-label={`${track.title} Spotify 곡`} value={chosen} disabled={writing}
                  onChange={event=>setMatches(rows=>rows.map((row,i)=>i===index?{...row,chosen:event.target.value}:row))}>
                  <option value="">건너뛰기</option>
                  {candidates.map(item=><option key={item.id} value={item.id}>
                    {[item.name,item.artist,item.albumName,item.durationMs?spotifyTime(item.durationMs):''].filter(Boolean).join(' · ')}
                  </option>)}
                </select> : <small>Spotify에서 찾지 못했어요.</small>}
              </label>
            </li>;
          })}</ol>}
          {complete && <p role="status">{resuming ? `Spotify 목록에 ${selected.length}곡을 담았어요.` : `Spotify에 비공개 플레이리스트를 만들고 ${selected.length}곡을 담았어요.`}</p>}
          {remote && <a className="button secondary spotify-copy-link" href={remote.url} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true"/>Spotify에서 목록 열기
          </a>}
        </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="dialog-footer">
      <button type="button" className="button secondary" disabled={writing} onClick={onClose}>닫기</button>
      {ready && !complete && <button type="button" className="button primary" onClick={()=>void copy()}
        disabled={writing||searching||matches.length!==tracks.length||!selected.length||(!resuming&&!name.trim())}>
        {writing ? 'Spotify에 저장 중…' : resuming ? `선택한 ${selected.length}곡 추가` : retrying ? '추가 다시 확인' : `선택한 ${selected.length}곡으로 만들기`}
      </button>}
    </div>
  </Dialog>;
}
