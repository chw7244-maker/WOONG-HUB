'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Heart, Plus } from 'lucide-react';
import type { Entry } from '@/lib/store';
import GamesHub from './games-hub';
import { GameQuickAdd } from './quick-add';
import SteamAccount from './steam-account';
import SteamSync from './steam-sync';
import XboxHistory, {useXboxHistory} from './xbox-history';

const gamePages = [
  { id: 'games', label: '내 게임', href: '/games/' },
  { id: 'steam', label: 'Steam', href: '/games/steam/' },
  { id: 'xbox', label: 'Xbox', href: '/games/xbox/' },
] as const;

type GamePage = typeof gamePages[number]['id'];

export function gamePageForPath(pathname: string): GamePage {
  const path = pathname.endsWith('/') ? pathname : pathname + '/';
  return gamePages.find(page => page.href === path)?.id ?? 'games';
}

type Props = {
  active: GamePage;
  entries: Entry[];
  onAdd: () => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  onSave: (entry: Entry) => boolean;
  onQuickAdd: (entry: Entry, message: string) => void;
  onQuickSave: (entry: Entry, message: string) => void;
  onBulkSave: (entries: Entry[], message: string | null) => void;
};

export default function GamePlatforms({ active, entries, onAdd, onEdit, onDelete, onSave, onQuickAdd, onQuickSave, onBulkSave }: Props) {
  const [visited, setVisited] = useState<GamePage[]>([active]);
  const [goneIds, setGoneIds] = useState<string[]>([]);
  useEffect(() => {
    setVisited(pages => pages.includes(active) ? pages : [...pages, active]);
  }, [active]);
  const showGames = active === 'games';
  const showSteam = active === 'steam';
  const showXbox = active === 'xbox';
  const xbox = useXboxHistory(showXbox || visited.includes('xbox') || entries.some(entry=>entry.game?.xboxTitleId));
  const xboxGames = useMemo(()=>new Map(xbox.snapshot?.games.map(game=>[game.id,game])), [xbox.snapshot]);

  return <>
    <div className="page-heading section-heading">
      <div><h1>게임</h1><p>내 플레이 기록과 플랫폼별 라이브러리</p></div>
    </div>
    <nav className="game-platform-nav" aria-label="게임 기록 구분">
      {gamePages.map(page => <Link key={page.id} href={page.href} aria-current={page.id === active ? 'page' : undefined}>{page.label}</Link>)}
    </nav>
    {showGames && <div className="game-add-tools">
      <GameQuickAdd entries={entries} onAdd={onQuickAdd}/>
      <button type="button" className="button primary" onClick={onAdd}><Plus size={15} aria-hidden="true"/>게임 추가</button>
    </div>}
    {/* Keep the list and Xbox results in memory when moving between game pages. */}
    {(showGames || visited.includes('games')) && <div hidden={!showGames}>
      <GamesHub active={showGames} entries={entries} goneIds={goneIds} xboxGames={xboxGames} onQuickSave={onQuickSave} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete}/>
    </div>}
    <div hidden={!showSteam}>
      {showSteam && <SteamAccount entries={entries} onEdit={onEdit} onSave={onSave}/>}
      {/* Opening My Games still checks the Steam wishlist on its existing daily schedule. */}
      {(showGames || showSteam || visited.some(page => page !== 'xbox')) && <details className="panel steam-disclosure steam-wishlist">
        <summary><Heart size={16} aria-hidden="true"/>찜 목록·상점 정보<ChevronDown size={16} className="section-chevron" aria-hidden="true"/></summary>
        <div id="steam-wishlist" className="steam-disclosure-body"><SteamSync entries={entries} onBulkSave={onBulkSave} onGone={setGoneIds}/></div>
      </details>}
    </div>
    {(showXbox || visited.includes('xbox')) && <div hidden={!showXbox}><XboxHistory history={xbox} entries={entries} onEdit={onEdit} onSave={onSave}/></div>}
  </>;
}
