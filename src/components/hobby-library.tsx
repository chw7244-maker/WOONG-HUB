'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { Clapperboard, Gamepad2, Goal, Headphones, LayoutGrid, Music2, Star } from 'lucide-react';
import { hobbyCards, type HobbyView } from '@/lib/hobby-library';
import type { Entry } from '@/lib/store';
import { TmdbCredit } from './watch-hub';

const hobbyPages = [
  { id: 'hobbies', label: '전체', icon: LayoutGrid },
  { id: 'watch', label: '작품', icon: Clapperboard },
  { id: 'football', label: '축구', icon: Goal },
  { id: 'music', label: '음악', icon: Music2 },
  { id: 'games', label: '게임', icon: Gamepad2 },
  { id: 'audio', label: '오디오', icon: Headphones },
];

/* Service pages keep the corresponding hobby selected. */
export function hobbyOf(section: string) {
  if (section === 'spotify' || section === 'fiio' || section === 'local') return 'music';
  if (section === 'steam' || section === 'xbox') return 'games';
  return hobbyPages.some(page => page.id === section) ? section : null;
}

export function HobbyTabs({ section }: { section: string }) {
  const active = hobbyOf(section);
  return <nav className="hobby-tabs" aria-label="취미">
    {hobbyPages.map(({ id, label, icon: Icon }) => <Link key={id} href={`/${id}/`} aria-current={active === id ? section === id ? 'page' : 'location' : undefined}>
      <Icon size={16} aria-hidden="true"/>{label}
    </Link>)}
  </nav>;
}

const views: { id: HobbyView; label: string; empty: string }[] = [
  { id: 'all', label: '전체', empty: '게임, 작품 또는 음악을 추가하면 여기에 모아 볼 수 있어요.' },
  { id: 'active', label: '진행 중', empty: '플레이 중인 게임이나 보는 중인 작품이 없어요.' },
  { id: 'favorites', label: '즐겨찾기', empty: '표지 오른쪽 위 별을 눌러 즐겨찾기에 담을 수 있어요.' },
];
const firstShelf = 4;
const moreShelf = 8;
type Card = ReturnType<typeof hobbyCards>[number];

export default function HobbyLibrary({ entries, favoriteIds, onFavorite, onOpen, match, setup }: {
  entries: Entry[]; favoriteIds?: string[]; onFavorite: (id: string) => void; onOpen: (entry: Entry) => void; match: ReactNode; setup?: Entry;
}) {
  const [view, setView] = useState(views[0]);
  const [limit, setLimit] = useState(firstShelf);
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const cards = useMemo(() => hobbyCards(entries, view.id, favorites), [entries, view.id, favorites]);
  const shown = cards.slice(0, limit);
  const renderCard = (card: Card) => <HobbyCoverCard key={card.entry.id} card={card} favorite={favorites.has(card.entry.id)} onFavorite={onFavorite} onOpen={onOpen}/>;

  return <>
    <div className="page-heading section-heading hobby-library-heading"><h1>취미 라이브러리</h1></div>
    <section className="hobby-library" aria-labelledby="hobby-collection-title">
      <div className="hobby-library-toolbar">
        <div className="hobby-library-views" role="group" aria-label="컬렉션 보기">
          {views.map(option => <button type="button" key={option.id} aria-pressed={view.id === option.id} onClick={() => {
            if (view.id === option.id) return;
            setView(option);
            setLimit(firstShelf);
          }}>{option.label}</button>)}
        </div>
        <span>최근 활동순</span>
      </div>
      <div className="hobby-library-label"><h2 id="hobby-collection-title">내 컬렉션</h2><span role="status">{cards.length}개</span></div>
      {cards.length ? <ul className="hobby-cover-grid">{shown.slice(0, firstShelf).map(renderCard)}</ul>
        : <p className="hobby-library-empty">{view.empty}</p>}
      <div className="hobby-library-notes">
        {match}
        {setup ? <button type="button" className="hobby-library-note" onClick={() => onOpen(setup)}>
          <span>고정한 청음 조합</span><strong>{setup.title}</strong>
          {setup.audio?.type === 'setup' && <small>장비 {setup.audio.deviceIds.length}개</small>}
        </button> : <Link href="/audio/" className="hobby-library-note"><span>청음 조합</span><strong>오디오 컬렉션 열기</strong></Link>}
      </div>
      {shown.length > firstShelf && <ul className="hobby-cover-grid" aria-label="컬렉션의 다른 기록">{shown.slice(firstShelf).map(renderCard)}</ul>}
      {cards.length > limit && <button className="button secondary hobby-library-more" type="button" onClick={() => setLimit(limit + moreShelf)}>기록 더 보기</button>}
      {shown.some(card => card.poster) && <TmdbCredit/>}
    </section>
  </>;
}

function HobbyCoverCard({ card, favorite, onFavorite, onOpen }: {
  card: Card; favorite: boolean; onFavorite: (id: string) => void; onOpen: (entry: Entry) => void;
}) {
  const { entry } = card;
  const image = card.poster || card.artwork;
  const [failedImage, setFailedImage] = useState('');
  const Icon = entry.kind === 'games' ? Gamepad2 : entry.kind === 'music' ? Music2 : Clapperboard;
  const contents = <>
    <span className="hobby-cover-art" data-kind={entry.kind} aria-hidden="true">
      <Icon size={38} strokeWidth={1.4}/>
      {image && image !== failedImage && <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedImage(image)}/>}
    </span>
    <span className="hobby-cover-copy"><small>{card.source}</small><strong>{entry.title}</strong>{card.status && <span>{card.status}</span>}</span>
  </>;
  return <li className="hobby-cover-card">
    {card.href ? <Link className="hobby-cover-action" href={card.href}>{contents}</Link>
      : <button type="button" className="hobby-cover-action" onClick={() => onOpen(entry)}>{contents}</button>}
    <button type="button" className="hobby-cover-favorite icon-button" aria-label={`${entry.title} 즐겨찾기`} aria-pressed={favorite} onClick={() => onFavorite(entry.id)}>
      <Star size={17} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true"/>
    </button>
  </li>;
}
