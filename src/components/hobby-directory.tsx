import Link from 'next/link';
import { ArrowUpRight, Clapperboard, Gamepad2, Goal, Headphones, Music2 } from 'lucide-react';

export const hobbyPages = [
  { id: 'watch', title: '영화 · 드라마 · 웹툰', description: '볼 작품을 모으고, 마지막으로 본 회차를 기록해요.', icon: Clapperboard },
  { id: 'football', title: '축구', description: '맨시티 경기 일정과 프리미어리그 순위표', icon: Goal },
  { id: 'music', title: '음악', description: '앨범, 플레이리스트와 감상 기록', icon: Music2 },
  { id: 'games', title: '게임', description: '내 플레이 기록과 Steam 라이브러리', icon: Gamepad2 },
  { id: 'audio', title: '오디오', description: '장비 컬렉션과 청음 조합', icon: Headphones },
];

export default function HobbyDirectory() {
  return <div className="hobby-directory">
    {hobbyPages.map(({ id, title, description, icon: Icon }) => <Link key={id} href={`/${id}/`} className={`hobby-destination hobby-${id}`}>
      <span className="hobby-destination-icon"><Icon size={22} strokeWidth={1.65} aria-hidden="true"/></span>
      <span><strong>{title}</strong><small>{description}</small></span><ArrowUpRight size={17} aria-hidden="true"/>
    </Link>)}
  </div>;
}
