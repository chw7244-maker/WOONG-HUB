'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, AudioLines, Bell, BriefcaseBusiness, CalendarDays, Ellipsis, House, Layers3, Moon, Newspaper, Search, Settings2, StickyNote, Sun } from 'lucide-react';
import Dialog from './dialog';
import { hobbyPages } from './hobby-directory';

const pages = [
  { id: 'home', label: '홈', icon: House },
  { id: 'calendar', label: '일정', icon: CalendarDays },
  { id: 'hobbies', label: '취미', icon: Layers3 },
  { id: 'library', label: '기록', icon: StickyNote },
];
const utilityPages = [
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
  const [more, setMore] = useState(false);
  const active = hobbyPages.some(page => page.id === section) || ['spotify', 'steam'].includes(section) ? 'hobbies' : section;
  const utilityActive = utilityPages.some(page => page.id === section);
  const moreButton = (mobile: boolean) => <button type="button" className="hub-more-trigger" aria-haspopup="dialog" aria-expanded={more} data-active={utilityActive || undefined} onClick={() => setMore(true)}>
    {mobile && <Ellipsis size={20} aria-hidden="true"/>}<span>더보기</span>
  </button>;
  return <>
    <header className="hub-header">
      <div className="hub-header-inner">
        <Link href="/" className="hub-wordmark"><span><AudioLines size={19} aria-hidden="true" /></span>WOONG HUB</Link>
        <nav className="hub-desktop-nav" aria-label="주 메뉴">
          {pages.map(({ id, label }) => (
            <Link key={id} href={href(id)} aria-current={active === id ? section === id ? 'page' : 'location' : undefined}>{label}</Link>
          ))}
          {moreButton(false)}
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
        <Link key={id} href={href(id)} aria-current={active === id ? section === id ? 'page' : 'location' : undefined}><Icon size={20} aria-hidden="true"/><span>{label}</span></Link>
      ))}
      {moreButton(true)}
    </nav>
    {more && <Dialog title="더보기" onClose={() => setMore(false)} className="hub-more-dialog" focusField={false}>
      <nav aria-label="더보기 메뉴">{utilityPages.map(({ id, label, icon: Icon }) => <Link key={id} href={href(id)} aria-current={section === id ? 'page' : undefined} onClick={() => setMore(false)}>
        <Icon size={19} aria-hidden="true"/><span>{label}</span><ArrowUpRight size={15} aria-hidden="true"/>
      </Link>)}</nav>
    </Dialog>}
  </>;
}
