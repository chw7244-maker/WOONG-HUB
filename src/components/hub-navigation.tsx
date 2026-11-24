'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, Ellipsis, House, Layers3, Newspaper, Settings2, StickyNote, type LucideIcon } from 'lucide-react';
import Dialog from './dialog';
import { hobbyOf } from './hobby-library';

const sharedPages = [
  { id: 'home', label: '홈', icon: House },
  { id: 'calendar', label: '일정', icon: CalendarDays },
  { id: 'hobbies', label: '취미', icon: Layers3 },
];
const libraryPage = { id: 'library', label: '기록', icon: StickyNote };
const newsPage = { id: 'news', label: '뉴스', icon: Newspaper };
const desktopPages = [...sharedPages, newsPage, libraryPage];
const mobilePages = [...sharedPages, newsPage];
const utilityPages = [
  { id: 'work', label: '업무', icon: BriefcaseBusiness },
  { id: 'settings', label: '설정', icon: Settings2 },
];
const morePages: { id: string; label: string; icon: LucideIcon; layout?: 'desktop' | 'mobile' }[] = [
  { ...libraryPage, layout: 'mobile' },
  ...utilityPages,
];
const pageHref = (id: string) => id === 'home' ? '/' : `/${id}/`;

export default function HubNavigation({
  section, hasNotifications, notificationOpen, onSearch, onNotifications, onQuickAdd,
}: {
  section: string; hasNotifications: boolean; notificationOpen: boolean;
  onSearch: () => void; onNotifications: () => void;
  onQuickAdd?: () => void;
}) {
  const [more, setMore] = useState(false);
  const active = hobbyOf(section) ? 'hobbies' : section;
  const utilityActive = utilityPages.some(page => page.id === section);
  const moreButton = (mobile: boolean) => {
    const secondaryActive = mobile && section === libraryPage.id;
    return <button type="button" className="hub-more-trigger" aria-haspopup="dialog" aria-expanded={more} data-active={utilityActive || secondaryActive || undefined} onClick={() => setMore(true)}>
      {mobile && <Ellipsis size={20} aria-hidden="true"/>}<span>더보기</span>
    </button>;
  };
  return <>
    <header className="hub-header">
      <div className="hub-header-inner">
        <Link href="/" className="hub-wordmark" aria-label="WOONG HUB"><span className="hub-brand-mark"><span className="journal-icon journal-brand-icon" aria-hidden="true"/></span><span className="hub-brand-name">WOONG HUB</span></Link>
        <nav className="hub-desktop-nav" aria-label="주 메뉴">
          {desktopPages.map(({ id, label }) => (
            <Link key={id} href={pageHref(id)} aria-current={active === id ? section === id ? 'page' : 'location' : undefined}>{label}</Link>
          ))}
          {moreButton(false)}
        </nav>
        <div className="hub-header-actions">
          <button type="button" className="hub-search-trigger" aria-label="내 공간 검색" onClick={onSearch}><span className="journal-icon journal-search-icon" aria-hidden="true"/><span className="hub-search-label">검색</span><kbd>Ctrl K</kbd></button>
          <button type="button" className="hub-round-button notification-button" aria-label="알림 보기" aria-expanded={notificationOpen} onClick={onNotifications}><Bell size={18}/>{hasNotifications && <i/>}</button>
          {onQuickAdd && <button type="button" className="button primary journal-quick-add" aria-haspopup="dialog" aria-label="추가" onClick={onQuickAdd}><span className="journal-icon journal-plus-icon" aria-hidden="true"/><span className="journal-quick-add-label">추가</span></button>}
        </div>
      </div>
    </header>
    <nav className="hub-bottom-nav" aria-label="모바일 주 메뉴">
      {mobilePages.map(({ id, label, icon: Icon }) => (
        <Link key={id} href={pageHref(id)} aria-current={active === id ? section === id ? 'page' : 'location' : undefined}><Icon size={20} aria-hidden="true"/><span>{label}</span></Link>
      ))}
      {moreButton(true)}
    </nav>
    {more && <Dialog title="더보기" onClose={() => setMore(false)} className="hub-more-dialog" focusField={false}>
      <nav aria-label="더보기 메뉴">{morePages.map(({ id, label, icon: Icon, layout }) => <Link key={id} href={pageHref(id)} data-layout={layout} aria-current={section === id ? 'page' : undefined} onClick={() => setMore(false)}>
        <Icon size={19} aria-hidden="true"/><span>{label}</span><ArrowUpRight size={15} aria-hidden="true"/>
      </Link>)}</nav>
    </Dialog>}
  </>;
}
