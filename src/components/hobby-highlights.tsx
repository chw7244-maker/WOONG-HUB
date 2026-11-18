'use client';

import Link from 'next/link';
import { ArrowUpRight, Gamepad2, Headphones, Music2 } from 'lucide-react';
import { isSetup } from '@/lib/audio';
import { pinnedSetup, recentListening, recentListeningGear } from '@/lib/home-dashboard';
import { lastListenedAt } from '@/lib/music';
import type { Entry } from '@/lib/store';
import { SpotifyLivePlayer, useSpotifyPlayback } from './spotify-playback';
import SteamHome from './steam-home';

export function AudioHighlights({ audio, music, pinned, onPin, onOpen }: {
  audio: Entry[]; music: Entry[]; pinned?: string; onPin: (id: string) => void; onOpen: (entry: Entry) => void;
}) {
  const setups = audio.filter(isSetup);
  const current = pinnedSetup(audio, pinned);
  const recent = recentListeningGear(audio, music).filter(({ entry }) => entry.id !== current?.id).slice(0, 3);
  if (!setups.length && !recent.length) return null;
  return <section className="hub-highlight" aria-labelledby="audio-highlight-title">
    <div className="hub-section-heading">
      <h2 id="audio-highlight-title"><Headphones size={18}/>청음 조합과 최근 사용</h2>
      {setups.length > 0 && <select aria-label="홈에 고정할 청음 조합" value={current?.id ?? ''} onChange={event => onPin(event.target.value)}>
        <option value="">{current ? '고정 안 함' : '홈에 조합 고정'}</option>
        {setups.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
      </select>}
    </div>
    {current && <button type="button" className="hub-highlight-row" onClick={() => onOpen(current)}><small>고정한 조합</small><strong>{current.title}</strong><ArrowUpRight size={15}/></button>}
    {recent.map(({ entry, date }) => <button type="button" key={entry.id} className="hub-highlight-row" onClick={() => onOpen(entry)}><small>감상 기록 · {date}</small><strong>{entry.title}</strong><ArrowUpRight size={15}/></button>)}
  </section>;
}

export function GameHighlights({ entries, onOpen }: { entries: Entry[]; onOpen: (entry: Entry) => void }) {
  const playing = entries.filter(entry => entry.status === '플레이 중').slice(0, 3);
  return <div className={`hub-game-highlights ${playing.length ? 'has-playing' : ''}`}>
    {playing.length > 0 && <section className="hub-highlight" aria-labelledby="game-highlight-title">
      <div className="hub-section-heading"><h2 id="game-highlight-title"><Gamepad2 size={18}/>플레이 중</h2></div>
      {playing.map(entry => <button type="button" key={entry.id} className="hub-highlight-row" onClick={() => onOpen(entry)}><small>{entry.category || '게임'}</small><strong>{entry.title}</strong><ArrowUpRight size={15}/></button>)}
    </section>}
    <SteamHome/>
  </div>;
}

export function MusicHighlights({ entries, onOpen, home = false }: { entries: Entry[]; onOpen: (entry: Entry) => void; home?: boolean }) {
  const spotify = useSpotifyPlayback();
  if (spotify.playback?.item && spotify.playback.playing && !spotify.stale) return home ? <SpotifyLivePlayer compact/> : <div className="hub-music-highlight"><SpotifyLivePlayer compact/></div>;
  const recent = recentListening(entries).slice(0, 2);
  const favorite = entries.filter(entry => entry.music?.type === 'playlist' && entry.music.favorite && !recent.includes(entry)).slice(0, 1);
  if (!recent.length && !favorite.length) return home ? <SpotifyLivePlayer compact/> : null;
  return <section className="hub-highlight" aria-labelledby="music-highlight-title">
    <div className="hub-section-heading">
      {home ? <h3 id="music-highlight-title"><Music2 size={16}/>다시 듣기</h3> : <h2 id="music-highlight-title"><Music2 size={18}/>다시 듣기</h2>}
      <Link href="/music/spotify/" className="text-button blue">Spotify<ArrowUpRight size={13}/></Link>
    </div>
    {[...recent, ...favorite].map(entry => <button type="button" key={entry.id} className="hub-highlight-row" onClick={() => onOpen(entry)}>
      <small>{favorite.includes(entry) ? '즐겨찾는 플레이리스트' : `최근 감상 · ${lastListenedAt(entry.music)}`}</small><strong>{entry.title}</strong><ArrowUpRight size={15}/>
    </button>)}
  </section>;
}
