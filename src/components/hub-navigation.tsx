'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, AudioLines, Bell, BriefcaseBusiness, CalendarDays, Ellipsis, House, Layers3, Moon, Newspaper, Search, Settings2, StickyNote, Sun, type LucideIcon } from 'lucide-react';
import Dialog from './dialog';
import { hobbyPages } from './hobby-directory';

const sharedPages = [
  { id: 'home', label: '홈', icon: House },
  { id: 'calendar', label: '일정', icon: CalendarDays },
  { id: 'hobbies', label: '취미', icon: Layers3 },
];
const libraryPage = { id: 'library', label: '기록', icon: StickyNote };
const newsPage = { id: 'news', label: '뉴스', icon: Newspaper };
const desktopPages = [...sharedPages, libraryPage];
const homeDesktopPages = [...sharedPages, newsPage, libraryPage];
const mobilePages = [...sharedPages, newsPage];
const utilityPages = [
  { id: 'work', label: '업무', icon: BriefcaseBusiness },
  { id: 'settings', label: '설정', icon: Settings2 },
];
const morePages: { id: string; label: string; icon: LucideIcon; layout?: 'desktop' | 'mobile' }[] = [
  { ...newsPage, layout: 'desktop' },
  { ...libraryPage, layout: 'mobile' },
  ...utilityPages,
];
const href = (id: string) => id === 'home' ? '/' : `/${id}/`;

export default function HubNavigation({
  section, dark, hasNotifications, notificationOpen, onSearch, onTheme, onNotifications, onQuickAdd,
}: {
  section: string; dark: boolean; hasNotifications: boolean; notificationOpen: boolean;
  onSearch: () => void; onTheme: () => void; onNotifications: () => void;
  onQuickAdd?: () => void;
}) {
  const [more, setMore] = useState(false);
  const isHome = section === 'home';
  const active = hobbyPages.some(page => page.id === section) || ['spotify', 'steam'].includes(section) ? 'hobbies' : section;
  const utilityActive = utilityPages.some(page => page.id === section);
  const moreButton = (mobile: boolean) => {
    const secondaryPage = mobile ? libraryPage : newsPage;
    return <button type="button" className="hub-more-trigger" aria-haspopup="dialog" aria-expanded={more} data-active={utilityActive || section === secondaryPage.id || undefined} onClick={() => setMore(true)}>
      {mobile && <Ellipsis size={20} aria-hidden="true"/>}<span>더보기</span>
    </button>;
  };
  return <>
    <header className="hub-header">
      <div className="hub-header-inner">
        <Link href="/" className="hub-wordmark" aria-label="WOONG HUB"><span className="hub-brand-mark">{isHome ? <span className="journal-icon journal-brand-icon" aria-hidden="true"/> : <AudioLines size={19} aria-hidden="true"/>}</span><span className="hub-brand-name">WOONG HUB</span></Link>
        <nav className="hub-desktop-nav" aria-label="주 메뉴">
          {(isHome ? homeDesktopPages : desktopPages).map(({ id, label }) => (
            <Link key={id} href={href(id)} aria-current={active === id ? section === id ? 'page' : 'location' : undefined}>{label}</Link>
          ))}
          {moreButton(false)}
        </nav>
        <div className="hub-header-actions">
          <button type="button" className="icon-button" aria-label="내 공간 검색" onClick={onSearch}>{isHome ? <span className="journal-icon journal-search-icon" aria-hidden="true"/> : <Search size={18}/>}</button>
          <button type="button" className="icon-button" aria-label={dark ? '라이트 테마로 전환' : '다크 테마로 전환'} onClick={onTheme}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button>
          <button type="button" className="icon-button notification-button" aria-label="알림 보기" aria-expanded={notificationOpen} onClick={onNotifications}><Bell size={18}/>{hasNotifications && <i/>}</button>
          {onQuickAdd && <button type="button" className="button primary journal-quick-add" aria-haspopup="dialog" onClick={onQuickAdd}><span className="journal-icon journal-plus-icon" aria-hidden="true"/>추가</button>}
        </div>
      </div>
    </header>
    <nav className="hub-bottom-nav" aria-label="모바일 주 메뉴">
      {mobilePages.map(({ id, label, icon: Icon }) => (
        <Link key={id} href={href(id)} aria-current={active === id ? section === id ? 'page' : 'location' : undefined}><Icon size={20} aria-hidden="true"/><span>{label}</span></Link>
      ))}
      {moreButton(true)}
    </nav>
    {more && <Dialog title="더보기" onClose={() => setMore(false)} className="hub-more-dialog" focusField={false}>
      <nav aria-label="더보기 메뉴">{morePages.filter(page => !isHome || page.id !== 'news').map(({ id, label, icon: Icon, layout }) => <Link key={id} href={href(id)} data-layout={layout} aria-current={section === id ? 'page' : undefined} onClick={() => setMore(false)}>
        <Icon size={19} aria-hidden="true"/><span>{label}</span><ArrowUpRight size={15} aria-hidden="true"/>
      </Link>)}</nav>
    </Dialog>}
  </>;
}
