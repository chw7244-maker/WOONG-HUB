'use client';

import Link from 'next/link';
import { AudioLines, Bell, BriefcaseBusiness, CalendarDays, Gamepad2, Headphones, House, Moon, Music2, Newspaper, Search, Settings2, StickyNote, Sun } from 'lucide-react';

const pages = [
  { id: 'home', label: '홈', icon: House },
  { id: 'calendar', label: '일정', icon: CalendarDays },
  { id: 'audio', label: '오디오', icon: Headphones },
  { id: 'games', label: '게임', icon: Gamepad2 },
  { id: 'music', label: '음악', icon: Music2 },
  { id: 'library', label: '기록', icon: StickyNote },
  { id: 'news', label: '뉴스', icon: Newspaper },
  { id: 'work', label: '업무', icon: BriefcaseBusiness },
  { id: 'settings', label: '설정', icon: Settings2 },
];
const href = (id: string) => id === 'home' ? '/' : `/${id}/`;

export default function HubNavigation({
  section, dark, hasNotifications, notificationOpen, onSearch, onTheme, onNotifications,
}: {
  section: string; dark: boolean; hasNotifications: boolean; notificationOpen: boolean;
  onSearch: () => void; onTheme: () => void; onNotifications: () => void;
}) {
  const active = section === 'spotify' ? 'music' : section === 'steam' ? 'games' : section;
  return <>
    <header className="hub-header">
      <div className="hub-header-inner">
        <Link href="/" className="hub-wordmark"><span><AudioLines size={19} aria-hidden="true" /></span>WOONG HUB</Link>
        <nav className="hub-desktop-nav" aria-label="주 메뉴">
          {pages.map(({ id, label }) => (
            <Link key={id} href={href(id)} aria-current={active === id ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        <div className="hub-header-actions">
          <button type="button" className="icon-button" aria-label="내 공간 검색" onClick={onSearch}><Search size={18}/></button>
          <button type="button" className="icon-button" aria-label={dark ? '라이트 테마로 전환' : '다크 테마로 전환'} onClick={onTheme}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button>
          <button type="button" className="icon-button notification-button" aria-label="알림 보기" aria-expanded={notificationOpen} onClick={onNotifications}><Bell size={18}/>{hasNotifications && <i/>}</button>
        </div>
      </div>
    </header>
    <nav className="hub-bottom-nav" aria-label="모바일 주 메뉴">
      {pages.map(({ id, label, icon: Icon }) => (
        <Link key={id} href={href(id)} aria-current={active === id ? 'page' : undefined}><Icon size={20} aria-hidden="true"/><span>{id === 'library' ? '메모' : label}</span></Link>
      ))}
    </nav>
  </>;
}
