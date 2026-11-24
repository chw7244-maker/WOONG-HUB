import Link from 'next/link';
import { ArrowUpRight, Clapperboard, Gamepad2, Goal, Headphones, Music2 } from 'lucide-react';

export const hobbyPages = [
  { id: 'watch', title: '영화 · 드라마 · 웹툰', short: '작품', description: '볼 작품을 모으고, 마지막으로 본 회차를 기록해요.', icon: Clapperboard },
  { id: 'football', title: '축구', short: '축구', description: '맨시티 경기 일정과 프리미어리그 순위표', icon: Goal },
  { id: 'music', title: '음악', short: '음악', description: '앨범, 플레이리스트와 감상 기록', icon: Music2 },
  { id: 'games', title: '게임', short: '게임', description: '내 플레이 기록과 플랫폼별 라이브러리', icon: Gamepad2 },
  { id: 'audio', title: '오디오', short: '오디오', description: '장비 컬렉션과 청음 조합', icon: Headphones },
];

/* Service pages keep the corresponding hobby selected. */
export function hobbyOf(section: string) {
  if (section === 'spotify') return 'music';
  if (section === 'steam' || section === 'xbox') return 'games';
  return hobbyPages.some(page => page.id === section) ? section : null;
}

/* Last hobby page opened in this browser, so the main menu's 취미 can go straight back to it. */
export const lastHobbyKey = 'woong-hub:last-hobby';

export default function HobbyDirectory() {
  return <div className="hobby-directory">
    {hobbyPages.map(({ id, title, description, icon: Icon }) => <Link key={id} href={`/${id}/`} className={`hobby-destination hobby-${id}`}>
      <span className="hobby-destination-icon"><Icon size={22} strokeWidth={1.65} aria-hidden="true"/></span>
      <span><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={17} aria-hidden="true"/>
    </Link>)}
  </div>;
}

/* Tabs at the top of every hobby page for switching hobbies without going back to the list. */
export function HobbyTabs({ section }: { section: string }) {
  const active = hobbyOf(section);
  return <nav className="hobby-tabs" aria-label="취미">
    {hobbyPages.map(({ id, short, icon: Icon }) => <Link key={id} href={`/${id}/`} aria-current={active === id ? section === id ? 'page' : 'location' : undefined}>
      <Icon size={16} aria-hidden="true"/>{short}
    </Link>)}
  </nav>;
}
