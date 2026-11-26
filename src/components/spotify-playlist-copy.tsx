'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import type { LocalPlaylistTrack } from '@/lib/local-playlist';
import { spotifyTime, type SpotifyEntity, type SpotifyPage } from '@/lib/spotify-account';
import { spotifyTrackChoices, spotifyTrackQuery } from '@/lib/spotify-playlist-copy';
import Dialog from './dialog';
import { spotifyFetch, SpotifyApiError, useSpotify } from './spotify-provider';

type Match = { candidates: SpotifyEntity[]; chosen: string };
type Copy = { requestId: string; name: string; uris: string[]; playlist?: SpotifyEntity };

export default function SpotifyPlaylistCopy({ title, tracks, onClose }: {
  title: string; tracks: LocalPlaylistTrack[]; onClose: () => void;
}) {
  const spotify = useSpotify();
  const [name, setName] = useState(title.slice(0, 100));
  const [matches, setMatches] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [writing, setWriting] = useState(false);
  const [remote, setRemote] = useState<SpotifyEntity>();
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const pending = useRef<Copy | null>(null);
  const activeWrite = useRef(false);
  useEffect(() => () => request.current?.abort(), []);

  const selected = matches.flatMap(row => row.candidates.find(item => item.id === row.chosen)?.uri ?? []);
  const ready = spotify.status?.features.playlistCopy;
  const locked = !!pending.current;

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
    if (!name.trim() || !selected.length || activeWrite.current || complete) return;
    activeWrite.current = true;
    setWriting(true);
    setError('');
    const operation = pending.current ?? { requestId: crypto.randomUUID(), name: name.trim(), uris: selected };
    pending.current = operation;
    try {
      if (!operation.playlist) {
        const { playlist } = await spotifyFetch<{ playlist: SpotifyEntity }>('command', {
          body: { action: 'playlist-create', requestId: operation.requestId, name: operation.name },
        });
        operation.playlist = playlist;
        setRemote(playlist);
      }
      await spotifyFetch('command', {
        body: { action: 'playlist-fill', requestId: crypto.randomUUID(), playlistId: operation.playlist.id, uris: operation.uris },
      });
      setComplete(true);
    } catch (error) {
      const code = error instanceof SpotifyApiError ? error.code : '';
      if (!operation.playlist && error instanceof SpotifyApiError && error.status < 500 &&
        !['spotify_request_pending','spotify_request_reused'].includes(code)) pending.current = null;
      if (code === 'spotify_playlist_already_has_tracks') {
        setError('Spotify 목록에 다른 곡이 있어요. Spotify에서 목록을 확인해주세요.');
      } else if (operation.playlist) {
        setError('Spotify에 목록을 만들었지만 곡 추가를 확인하지 못했어요. 같은 목록으로 다시 시도할 수 있어요.');
      } else if (pending.current) {
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
          <label className="spotify-copy-name">플레이리스트 이름<input value={name} maxLength={100} readOnly={locked}
            onChange={event=>setName(event.target.value)}/></label>
          <div className="spotify-copy-intro">
            <p className="local-muted">곡 제목과 아티스트로 Spotify에서 검색합니다. 선택한 곡만 현재 순서대로 비공개 목록에 담아요.</p>
            {matches.length < tracks.length && <button type="button" className="button secondary" onClick={()=>void search()}
              disabled={searching || locked}><Search size={15} aria-hidden="true"/>{searching ? '검색 중…' : matches.length ? '남은 곡 검색' : 'Spotify에서 곡 찾기'}</button>}
          </div>
          {matches.length > 0 && <p className="local-muted" role="status">{matches.length}/{tracks.length}곡 검색 · {selected.length}곡 선택</p>}
          {matches.length > 0 && !complete && <ol className="spotify-copy-list">{matches.map(({ candidates, chosen }, index)=>{
            const track=tracks[index];
            return <li key={track.path}>
              <label>
                <strong>{track.title}</strong><small>{track.artist}{track.album && ` · ${track.album}`}</small>
                {candidates.length ? <select aria-label={`${track.title} Spotify 곡`} value={chosen} disabled={locked}
                  onChange={event=>setMatches(rows=>rows.map((row,i)=>i===index?{...row,chosen:event.target.value}:row))}>
                  <option value="">건너뛰기</option>
                  {candidates.map(item=><option key={item.id} value={item.id}>
                    {[item.name,item.artist,item.albumName,item.durationMs?spotifyTime(item.durationMs):''].filter(Boolean).join(' · ')}
                  </option>)}
                </select> : <small>Spotify에서 찾지 못했어요.</small>}
              </label>
            </li>;
          })}</ol>}
          {complete && <p role="status">Spotify에 비공개 플레이리스트를 만들고 {selected.length}곡을 담았어요.</p>}
          {remote && <a className="button secondary spotify-copy-link" href={remote.url} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true"/>Spotify에서 목록 열기
          </a>}
        </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="dialog-footer">
      <button type="button" className="button secondary" disabled={writing} onClick={onClose}>닫기</button>
      {ready && !complete && <button type="button" className="button primary" onClick={()=>void copy()}
        disabled={writing||searching||matches.length!==tracks.length||!selected.length||!name.trim()}>
        {writing ? 'Spotify에 저장 중…' : locked ? '추가 다시 확인' : `선택한 ${selected.length}곡으로 만들기`}
      </button>}
    </div>
  </Dialog>;
}
