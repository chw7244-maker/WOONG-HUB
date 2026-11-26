'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Download, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { formatLength, type LocalAlbum } from '@/lib/local-music';
import { playlistCandidateLimit, playlistCandidates, playlistExport, playlistPromptLimit, playlistRequest, type LocalPlaylistTrack, type SavedLocalPlaylist } from '@/lib/local-playlist';
import { emptyMusic, validateMusic } from '@/lib/music';
import type { Entry } from '@/lib/store';
import Dialog from './dialog';

const errors: Record<string, string> = {
  gemini_not_connected: 'Sites 시크릿에 GEMINI_API_KEY를 연결하면 Gemini로 곡을 고를 수 있어요.',
  gemini_quota: 'Gemini 요청 한도에 도달했어요. 잠시 뒤 다시 시도해주세요.',
  gemini_rejected: 'Gemini가 요청을 받아들이지 않았어요. AI Studio의 인증키와 모델 사용 권한을 확인해주세요.',
};

export function downloadLocalPlaylist(title: string, tracks: LocalPlaylistTrack[], windowsFolder?: string) {
  const file = playlistExport(title, tracks, windowsFolder);
  const url = URL.createObjectURL(new Blob([file.content], { type: 'audio/x-mpegurl;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LocalPlaylistTracks({ tracks, folder, onRemove }: {
  tracks: LocalPlaylistTrack[]; folder?: string; onRemove?: (path: string) => void;
}) {
  const knownSeconds = tracks.reduce((sum, track) => sum + (track.seconds ?? 0), 0);
  return <div className="local-playlist-tracks">
    <p className="local-muted">{tracks.length}곡{knownSeconds > 0 && ` · ${formatLength(knownSeconds)}`}{knownSeconds > 0 && tracks.some(track => track.seconds == null) && ' · 길이 정보가 있는 곡 기준'}</p>
    <ol aria-label="플레이리스트 곡 순서">{tracks.map(track => <li key={track.path}>
      <div><strong>{track.title}</strong><small>{track.artist} · {track.album}</small></div>
      {onRemove && <button type="button" className="icon-button" aria-label={`${track.title} 빼기`}
        onClick={() => onRemove(track.path)}><X size={16} aria-hidden="true"/></button>}
    </li>)}</ol>
    {folder!==undefined&&<p className="local-muted">M3U8 파일을 PC의 ‘{folder || '음원'}’ 폴더에 넣고 M3U8을 지원하는 플레이어로 여세요.</p>}
  </div>;
}

export function LocalPlaylistExports({ title, playlist, onSpotify }: {
  title: string; playlist: SavedLocalPlaylist; onSpotify: () => void;
}) {
  const [windowsFolder, setWindowsFolder] = useState('');
  const [error, setError] = useState('');
  function foobar() {
    try { downloadLocalPlaylist(title, playlist.tracks, windowsFolder); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'M3U8을 만들지 못했어요.'); }
  }
  return <div className="local-playlist-exports">
    <div>
      <button type="button" className="button secondary" onClick={foobar}><Download size={15} aria-hidden="true"/>foobar2000용 M3U8</button>
      <button type="button" className="button secondary" onClick={onSpotify}>Spotify로 추가</button>
    </div>
    <p className="local-muted">기본 M3U8은 PC의 ‘{playlist.folder || '음원'}’ 폴더에 넣고 foobar2000에서 여세요.</p>
    <details>
      <summary>다운로드 위치에서 바로 열기</summary>
      <label>처음 읽은 음원 폴더의 Windows 경로
        <input value={windowsFolder} maxLength={1000} placeholder="D:\Music" onChange={event=>setWindowsFolder(event.target.value)}/>
      </label>
    </details>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}

export default function LocalPlaylist({ albums, folder, onSave, isSaved, onClose }: {
  albums: LocalAlbum[]; folder: string; onSave: (entry: Entry, message: string) => boolean;
  isSaved: (id: string) => boolean; onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(15);
  const [title, setTitle] = useState('');
  const [tracks, setTracks] = useState<LocalPlaylistTrack[]>([]);
  const [draftId, setDraftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const total = albums.reduce((sum, album) => sum + album.tracks.length, 0);
  const saved = !!draftId && isSaved(draftId);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || !total || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setBusy(true);
    try {
      const candidates = playlistCandidates(albums, prompt);
      const response = await fetch('/api/music/local/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playlistRequest(prompt, count, candidates)),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(errors[result.error] ?? 'Gemini에서 선곡 결과를 받지 못했어요. 다시 시도해주세요.');
        return;
      }
      setDraftId(crypto.randomUUID());
      setTitle(result.title);
      setTracks(result.trackIds.map((id: number) => candidates[id]));
    } catch {
      if (!controller.signal.aborted) setError('선곡 요청을 끝내지 못했어요. 잠시 뒤 다시 시도해주세요.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function save() {
    if (!draftId || saved || !tracks.length || busy) return;
    setError('');
    try {
      const music = validateMusic({ ...emptyMusic(), type: 'playlist', favorite: true, localPlaylist: { folder, tracks } });
      const entry: Entry = {
        id: draftId, kind: 'music', title: title.trim() || 'AI 플레이리스트', detail: '', category: '디지털',
        status: '컬렉션', url: '', date: '', done: false, createdAt: new Date().toISOString(), music,
      };
      if (onSave(entry, '음악 탭의 플레이리스트에 저장했어요.')) setTitle(entry.title);
      else setError('플레이리스트를 저장하지 못했어요. 다시 시도해주세요.');
    } catch (error) {
      setError(error instanceof Error ? error.message : '플레이리스트를 저장하지 못했어요.');
    }
  }

  return <Dialog title="AI 플레이리스트" onClose={onClose} className="local-playlist-dialog">
    <form onSubmit={generate} className="local-playlist-form">
      <label>어떤 곡을 듣고 싶나요?
        <textarea required maxLength={playlistPromptLimit} rows={2} value={prompt}
          placeholder="예를 들어, 늦은 밤에 듣기 좋은 차분한 재즈" onChange={event => setPrompt(event.target.value)}/>
      </label>
      <div className="local-playlist-inputs">
        <label>곡 수 <select value={count} onChange={event => setCount(Number(event.target.value))}>
          {[5, 10, 15, 20, 25].map(number => <option key={number} value={number}>{number}곡</option>)}
        </select></label>
        <button type="submit" className="button primary" disabled={busy || !prompt.trim() || !total}>
          <Sparkles size={16} aria-hidden="true"/>{busy ? '곡 고르는 중…' : 'Gemini로 곡 고르기'}
        </button>
      </div>
      <p className="local-muted">현재 화면의 앨범에서 최대 {Math.min(total, playlistCandidateLimit)}곡의 제목·아티스트·장르와 요청 문장을 Google Gemini에 보냅니다. 무료 계층의 입력은 제품 개선에 사용될 수 있어요. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">이용 조건</a></p>
      <p className="local-muted" role="status">{busy ? 'Gemini가 곡 순서를 정하고 있어요.' : saved ? '플레이리스트에 저장했어요.' : ''}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
    {tracks.length > 0 && <>
      <div className="local-playlist-results">
        <label>플레이리스트 이름<input value={title} maxLength={80} readOnly={saved} onChange={event => setTitle(event.target.value)}/></label>
        <LocalPlaylistTracks tracks={tracks} folder={folder}
          onRemove={saved ? undefined : path => setTracks(current => current.filter(item => item.path !== path))}/>
      </div>
    </>}
    <div className="dialog-footer">
      {tracks.length > 0 && <button type="button" className="button secondary" onClick={()=>downloadLocalPlaylist(title, tracks)}>
        <Download size={16} aria-hidden="true"/>M3U8 내려받기
      </button>}
      {saved ? <Link href={`/music/?playlist=${encodeURIComponent(draftId)}`} className="button primary">저장한 플레이리스트 보기</Link>
        : <button type="button" className="button primary" onClick={save} disabled={busy || !tracks.length}>
          <Check size={16} aria-hidden="true"/>플레이리스트에 저장
        </button>}
    </div>
  </Dialog>;
}
