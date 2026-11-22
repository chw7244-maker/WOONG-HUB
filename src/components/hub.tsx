'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, AudioLines, Bell, CalendarDays, Check, ChevronDown, ChevronLeft, Gamepad2, Headphones, ListTodo, Moon, Newspaper, Plus, SlidersHorizontal, Sun, X, BriefcaseBusiness, Link2, Database, type LucideIcon, SquarePen } from 'lucide-react';
import WeatherCard, { WeatherCitySelect } from './weather';
import NewsHub, { HomeNews } from './news-hub';
import AudioHub, { AudioEntryModal } from './audio-hub';
import GamesHub, { GameEntryModal } from './games-hub';
import MusicHub, { MusicEntryModal } from './music-hub';
import SpotifyAccount from './spotify-account';
import SteamAccount from './steam-account';
import SteamHome from './steam-home';
import UnifiedSearch from './unified-search';
import {spotifyMusicDraft} from '@/lib/music';
import CalendarHub, { useCalendarSnapshot } from './calendar-hub';
import HubNavigation from './hub-navigation';
import WeekAgenda, { HomeTasks, NextSchedule } from './home-dashboard';
import NoteEditor from './note-editor';
import { HomeMusic } from './hobby-highlights';
import RecordList from './record-list';
import { dashboardEvents, pinnedSetup, recentListeningGear } from '@/lib/home-dashboard';
import ConnectionSettings from './connection-settings';
import Dialog from './dialog';
import { isSetup } from '@/lib/audio';
import { useHubSync } from './sync-provider';
import { CloudStorageSettings, SyncIndicator, SyncNotice } from './sync-status';
import { type Entry, type HubData, type Kind, validateData, todayKST, koreanDate, safeUrl, mediaWidgets, mediaWidgetVisible, homeSections, newWidgets } from '@/lib/store';
import { advanceWatch, isWatchEntry, restoreWatchProgress, watchTypes, type WatchDetails, type WatchEntry, type WatchType } from '@/lib/watch';
import HobbyDirectory from './hobby-directory';
import FootballHub, { HomeMatch, useFootball } from './football-hub';
import { saveFixture, savedFixtureEvents, type Fixture } from '@/lib/football';
import WatchHub, { HomeWatch, WatchEntryModal } from './watch-hub';
import HomeWidgetControls from './home-widget-controls';

const details: Record<string,{title:string;description:string;kind?:Kind}> = {
  news:{title:'뉴스 허브',description:'관심 있는 소식을 읽고, 오래 기억할 기사를 모으세요.'},
  audio:{title:'오디오',description:'장비 컬렉션과 청음 조합',kind:'audio'},
  steam:{title:'Steam 라이브러리',description:'계정별 보유 게임과 실제 플레이 시간을 한곳에서.'},
  games:{title:'게임',description:'내 플레이 기록과 Steam 라이브러리',kind:'games'},
  spotify:{title:'Spotify 음악',description:'지금 듣는 음악부터 나의 플레이리스트까지.'},
  music:{title:'음악',description:'앨범, 플레이리스트와 감상 기록',kind:'music'},
  hobbies:{title:'취미',description:'영화부터 축구, 음악, 게임까지.'},
  watch:{title:'작품 보관함',description:'영화 · 드라마 · 웹툰'},
  football:{title:'축구',description:'맨시티 경기 일정과 프리미어리그 순위표'},
  calendar:{title:'캘린더',description:'노션과 구글 일정, 나의 약속을 한곳에서.',kind:'event'},
  library:{title:'기록',description:'메모, 할 일과 북마크',kind:'note'},
  work:{title:'업무',description:'업무 기록과 자주 쓰는 도구',kind:'work'},
  settings:{title:'설정',description:'내 일상에 맞게, 나만의 HUB를 가꾸세요.'}
};
const kindLabels: Record<Kind,string> = {todo:'할 일',note:'메모',bookmark:'북마크',audio:'오디오 장비',games:'게임',music:'앨범',event:'일정',work:'업무 기록',watch:'작품'};
const categories: Partial<Record<Kind,string[]>> = {audio:['이어폰','헤드폰','DAP','DAC · 앰프','케이블 · 이어팁','기타'],games:['PC','PlayStation','Nintendo','Xbox','모바일','기타'],music:['디지털','FLAC','CD','LP','스트리밍'],bookmark:['일상','오디오','게임','음악','업무','기사'],note:['일상','아이디어','취미','업무'],work:['업무','매출','광고','기타']};
const statuses: Partial<Record<Kind,string[]>> = {audio:['보유 중','위시리스트','판매 완료'],games:['플레이 예정','플레이 중','완료','위시리스트'],music:['컬렉션','위시리스트']};
const shortcuts = [
  {title:'뉴스 허브',subtitle:'나의 새로운 읽을거리',url:'/news/',icon:Newspaper,color:'blue'},
  {title:'Steam',subtitle:'다음 플레이 찾기',url:'https://store.steampowered.com/',icon:Gamepad2,color:'teal'},
  {title:'IEM Atlas',subtitle:'이어폰 탐색',url:'https://iem-atlas.woong22222.chatgpt.site',icon:Headphones,color:'purple'},
  {title:'스토어 인사이트',subtitle:'매출 · 광고 분석',url:'https://naver-sales-insight.woong22222.chatgpt.site',icon:BriefcaseBusiness,color:'green'}
];
type HubToast = { message: string; undo?: { id: string; before: WatchDetails; advanced: WatchDetails } };

function Empty({icon:Icon,title,description,action,label='추가하기'}:{icon:LucideIcon;title:string;description?:string;action?:()=>void;label?:string}) {return <div className="empty"><div className="empty-icon"><Icon size={24} strokeWidth={1.5}/></div><h3>{title}</h3>{description&&<p>{description}</p>}{action&&<button className="text-button blue" onClick={action}><Plus size={14}/>{label}</button>}</div>;}
function PanelHeading({title,sub,children}:{title:string;sub?:string;children?:React.ReactNode}){return <div className="panel-heading"><h2>{title}{sub&&<span className="heading-count">{sub}</span>}</h2>{children}</div>;}

export default function Hub({section}:{section:string}) {
  const sync=useHubSync();
  const {data,ready}=sync;
  const calendar=useCalendarSnapshot(ready&&['home','calendar','settings'].includes(section));
  const [now,setNow]=useState<Date|null>(null);
  const [quickAddOpen,setQuickAddOpen]=useState(false);
  const [toast,setToast]=useState<HubToast|null>(null);
  const [modal,setModal]=useState<{kind:Kind;entry?:Entry;watchType?:WatchType}|null>(null),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState(''),[libraryTab,setLibraryTab]=useState<Kind>('note'),[filter,setFilter]=useState('전체'),[pendingImport,setPendingImport]=useState<HubData|null>(null),[deleteEntry,setDeleteEntry]=useState<Entry|null>(null),[notificationOpen,setNotificationOpen]=useState(false),[editWidgets,setEditWidgets]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const refresh=()=>setNow(new Date());
    refresh();
    const timer=setInterval(refresh,60000);
    const resume=()=>{if(document.visibilityState==='visible')refresh();};
    document.addEventListener('visibilitychange',resume);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[]);
  useEffect(()=>{if(!ready)return;document.documentElement.dataset.theme=data.preferences.theme;const color=getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();if(color)document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);},[ready,data.preferences.theme]);
  useEffect(()=>{setToast(null);},[sync.userId]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),toast.undo?12000:4500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{setFilter('전체');},[section]);
  useEffect(()=>{
    if(section!=='library')return;
    const tab=new URLSearchParams(window.location.search).get('tab');
    if(tab==='note'||tab==='todo'||tab==='bookmark')setLibraryTab(tab);
  },[section]);
  useEffect(()=>{const handle=(event:KeyboardEvent)=>{if(document.querySelector('[role="dialog"]'))return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setSearchOpen(true);}if(event.key==='Escape')setNotificationOpen(false);};document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle);},[]);
  function persist(next:HubData) {return sync.client.change(next);}
  function notify(message:string){setToast({message});}
  function addCalendarEvent(date:string){setModal({kind:'event',entry:{id:crypto.randomUUID(),kind:'event',title:'',detail:'',category:'',status:'',url:'',date:date+'T09:00',done:false,createdAt:new Date().toISOString()}});}
  function save(entry:Entry, feedback?:HubToast){
    const exists=data.entries.some(e=>e.id===entry.id);
    if(!persist({...data,entries:exists?data.entries.map(e=>e.id===entry.id?entry:e):[entry,...data.entries]}))return false;
    setModal(null);
    setToast(feedback??{message:`${entry.music?.type==='playlist'?'플레이리스트':kindLabels[entry.kind]} ${exists?'수정했어요':'기록했어요'}`});
    return true;
  }
  function recordWatchProgress(entry:WatchEntry){
    const current=data.entries.find(item=>item.id===entry.id);
    if(!current||!isWatchEntry(current)||current.watch.status==='completed')return;
    if(current.watch.type==='movie'){
      save({...current,watch:{...current.watch,status:'completed',updatedAt:new Date().toISOString()}});
      return;
    }
    const advanced=advanceWatch(current);
    if(advanced!==current)save(advanced,{message:`${advanced.watch.progress}화까지 기록했어요.`,undo:{id:current.id,before:current.watch,advanced:advanced.watch}});
  }
  function undoWatchProgress(){
    if(!toast?.undo)return;
    const {id,before,advanced}=toast.undo;
    const current=data.entries.find(entry=>entry.id===id);
    const restored=current&&isWatchEntry(current)?restoreWatchProgress(current,before,advanced):null;
    if(restored)save(restored,{message:'이전 회차로 되돌렸어요.'});
    else notify('작품 기록이 바뀌어 회차를 되돌릴 수 없어요.');
  }
  function toggle(e:Entry){persist({...data,entries:data.entries.map(x=>x.id===e.id?{...x,done:!x.done}:x)});}
  function remove(){if(deleteEntry&&persist({...data,entries:data.entries.filter(e=>e.id!==deleteEntry.id)})){setDeleteEntry(null);notify('기록을 삭제했어요.');}}
  function preference(update:Partial<HubData['preferences']>){persist({...data,preferences:{...data.preferences,...update}});}
  const entries=(kind:Kind)=>data.entries.filter(e=>e.kind===kind);
  const today=now?todayKST(now):'',events=entries('event').filter(e=>e.date.slice(0,10)>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const selectedSetup=pinnedSetup(entries('audio'),data.preferences.pinnedAudioSetup);
  const homeAudio=section==='home'&&(selectedSetup??recentListeningGear(entries('audio'),entries('music'))[0]?.entry);
  const recentRecords=section==='home'?data.entries.filter(e=>['note','audio','games','music','watch'].includes(e.kind)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,4):[];
  const hiddenNewWidgets=data.preferences.hiddenNewWidgets??[];
  const visible=(w:string)=>newWidgets.includes(w)?!hiddenNewWidgets.includes(w):mediaWidgets.includes(w)?mediaWidgetVisible(data.preferences,w):data.preferences.widgets.includes(w);
  const homeOrder=[...new Set([...(data.preferences.homeOrder??[]),...homeSections])].filter(id=>id!=='week');
  const calendarEntries=entries('event');
  const hiddenCalendars=data.preferences.calendarHiddenSources??[];
  const savedFixtures=data.preferences.savedFixtures??[];
  const savedFixtureIds=new Set(savedFixtures.map(fixture=>fixture.id));
  const hasSavedFixtures=savedFixtures.length>0;
  const football=useFootball(hasSavedFixtures?'calendar':'home',ready&&(
    (section==='home'&&(visible('football')||(visible('calendar')&&hasSavedFixtures))) ||
    (section==='calendar'&&hasSavedFixtures)
  ));
  const matchEvents=savedFixtureEvents(savedFixtures,football.data?.fixtures,now?.getTime()??Date.now(),football.error);
  const homeEvents=section==='home'&&visible('calendar')?dashboardEvents(calendarEntries,calendar.data?.snapshot,hiddenCalendars,matchEvents):[];
  function addFixture(match:Fixture){
    if(match.postponed==='cancelled'||savedFixtureIds.has(match.id))return;
    if(persist({...data,preferences:{...data.preferences,savedFixtures:[...savedFixtures,saveFixture(match)]}}))notify('맨시티 경기를 내 일정에 담았어요.');
  }
  function removeFixture(id:string){
    if(!savedFixtureIds.has(id))return;
    if(persist({...data,preferences:{...data.preferences,savedFixtures:savedFixtures.filter(fixture=>fixture.id!==id)}}))notify('경기를 내 일정에서 뺐어요.');
  }
  const editEvent=(entry:Entry)=>setModal({kind:'event',entry});
  function toggleWidget(id:string,enabled:boolean){if(newWidgets.includes(id)){preference({hiddenNewWidgets:enabled?hiddenNewWidgets.filter(w=>w!==id):[...hiddenNewWidgets,id]});}else if(mediaWidgets.includes(id)){const current=data.preferences.mediaWidgets??mediaWidgets;preference({mediaWidgets:enabled?[...current,id]:current.filter(w=>w!==id)});}else preference({widgets:enabled?[...data.preferences.widgets,id]:data.preferences.widgets.filter(w=>w!==id)});}
  const dateLabel=now?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(now):'오늘의 공간을 준비하고 있어요';
  function exportData(){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`woong-hub-${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('HUB 백업 파일을 내보냈어요.');}
  function exportLegacy(){if(!sync.migration)return;const url=URL.createObjectURL(new Blob([JSON.stringify(sync.migration,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`woong-hub-before-migration-${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function importFile(file?:File){if(!file)return;try{if(file.size>10*1024*1024)throw new Error('10MB 이하의 백업 파일을 선택해주세요.');setPendingImport(validateData(JSON.parse(await file.text())));}catch(e){notify(e instanceof Error?e.message:'백업을 읽지 못했어요.');}if(fileRef.current)fileRef.current.value='';}
  const currentInfo=details[section];
  const activeKind:Kind=section==='library'?libraryTab:currentInfo?.kind??'note';
  const workFilters=['전체',...new Set([...(categories.work??[]),...entries('work').map(e=>e.category).filter(Boolean)])];
  const sectionEntries=entries(activeKind).filter(e=>filter==='전체'||e.status===filter||e.category===filter).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const widgetsEditor=<HomeWidgetControls order={homeOrder} visible={visible} onToggle={toggleWidget} onOrder={order=>preference({homeOrder:order})}/>;
  const openEntry=(entry:Entry)=>setModal({kind:entry.kind,entry});
  const homePanels:Record<string,React.ReactNode>=section==='home'?{
    resume:['interests','spotify','steam','watch'].some(visible)&&<section className="hub-summary-card hub-resume-card" aria-labelledby="home-resume-title">
      <div className="hub-summary-heading"><h2 id="home-resume-title">이어서 하기</h2><Link href="/hobbies/" className="hub-summary-action">취미 보기</Link></div>
      <div className="hub-resume-grid hub-continuation">
        {visible('watch')&&<HomeWatch entries={entries('watch')} onEdit={openEntry}/>}
        {visible('steam')&&<SteamHome compact key={sync.userId}/>}
        {visible('spotify')&&<HomeMusic entries={entries('music')} onOpen={openEntry}/>}
        {visible('interests')&&<div className="hub-continuation-item"><span className="hub-continuation-icon" aria-hidden="true"><Headphones size={17}/></span>
          <div className="hub-continuation-copy"><small>오디오 · {selectedSetup?'고정 조합':homeAudio?'최근 감상 장비':'컬렉션'}</small>
            {homeAudio?<button type="button" onClick={()=>openEntry(homeAudio)}>{homeAudio.title}</button>:<Link href="/audio/">청음 조합 열기</Link>}
          </div></div>}
      </div>
    </section>,
    recent:visible('note')&&recentRecords.length>0&&<section className="hub-home-section" aria-labelledby="home-recent-title">
      <div className="hub-section-heading"><h2 id="home-recent-title">최근 기록</h2><button type="button" className="text-button blue" onClick={()=>setSearchOpen(true)}>기록 검색<ArrowUpRight size={13}/></button></div>
      <div className="hub-records-strip">{recentRecords.map(entry=><button key={entry.id} type="button" onClick={()=>openEntry(entry)}><small>{entry.watch?watchTypes[entry.watch.type]:kindLabels[entry.kind]}</small><strong>{entry.title}</strong><ArrowUpRight size={13}/></button>)}</div>
    </section>,
    links:visible('bookmarks')&&<section className="quick-links-section">
      <PanelHeading title="즐겨찾는 곳"><button type="button" className="text-button muted" onClick={()=>setModal({kind:'bookmark'})}><Plus size={14}/>추가</button></PanelHeading>
      <div className="quick-links">{shortcuts.map(({title,subtitle,url,icon:Icon,color})=><a className="quick-link" key={title} href={url} target={url.startsWith('/')?undefined:'_blank'} rel="noreferrer">
        <span className={`shortcut-icon ${color}`}><Icon size={20} strokeWidth={1.7} aria-hidden="true"/></span><span className="quick-link-copy"><strong>{title}</strong><small>{subtitle}</small></span>
      </a>)}</div>
      {entries('bookmark').length>0&&<div className="personal-links">{entries('bookmark').slice(0,6).map(e=><a href={safeUrl(e.url)} target="_blank" rel="noreferrer" key={e.id}><Link2 size={12}/>{e.title}<ArrowUpRight size={12}/></a>)}</div>}
    </section>,
    news:(visible('news')||visible('football'))&&<div className="journal-news-column">
      {visible('news')&&<HomeNews documentRevision={sync.revision}/>}
      {visible('football')&&<HomeMatch now={now} football={football} saved={savedFixtureIds} onSave={addFixture}/>}
    </div>,
  }:{};

  return <div className={section==='home'?'app-shell journal-home':'app-shell'}>
    <HubNavigation section={section} dark={data.preferences.theme==='dark'}
      hasNotifications={events.some(event=>event.date.startsWith(today))} notificationOpen={notificationOpen}
      onSearch={()=>setSearchOpen(true)} onTheme={()=>preference({theme:data.preferences.theme==='dark'?'light':'dark'})}
      onNotifications={()=>setNotificationOpen(value=>!value)}
      onQuickAdd={section==='home'&&ready?()=>setQuickAddOpen(true):undefined}/>
    <div className="workspace hub-workspace">
      {notificationOpen&&<section className="notification-popover panel"><PanelHeading title="오늘의 알림"><button className="icon-button" aria-label="알림 닫기" onClick={()=>setNotificationOpen(false)}><X size={16}/></button></PanelHeading>{events.filter(e=>e.date.startsWith(today)).length?events.filter(e=>e.date.startsWith(today)).map(e=><button key={e.id} className="notification-row" onClick={()=>{setNotificationOpen(false);setModal({kind:'event',entry:e});}}><CalendarDays size={16}/><span>{e.title}<small>{koreanDate(e.date)}</small></span></button>):<Empty icon={Bell} title="지금은 새 알림이 없어요" description="오늘 등록한 일정이 여기에 표시돼요."/>}</section>}
      <main className="main-content">
        <div className="sync-status-row"><SyncIndicator/></div>
        <SyncNotice onLegacyBackup={exportLegacy}/>
        {!ready?<div className="loading-state"><AudioLines size={36}/><p>{sync.phase==='connecting'?'나의 서버 저장소를 확인하고 있어요.':'서버에 다시 연결하면 기록을 불러옵니다.'}</p>{sync.phase!=='connecting'&&<button className="button secondary" onClick={()=>void sync.client.retry()}>다시 연결</button>}</div>:section==='home'?<>
          <header className="hub-today-heading">
            <h1>오늘</h1>
            <p className="hub-date">{today ? <time dateTime={today}>{dateLabel}</time> : '한국 시간 확인 중'}</p>
            {visible('weather')&&<WeatherCard city={data.preferences.city} onCityChange={city=>preference({city})} compact/>}
            <button type="button" className="icon-button journal-widget-settings" aria-label="홈 위젯 설정" aria-haspopup="dialog" onClick={()=>setEditWidgets(true)}><SlidersHorizontal size={18}/></button>
          </header>
          {visible('calendar')&&<WeekAgenda userId={sync.userId} today={today} events={homeEvents} entries={calendarEntries} hidden={hiddenCalendars} calendar={calendar} onEdit={editEvent} onAdd={addCalendarEvent}/>}
          <div className="journal-overview">
            {visible('calendar')&&<NextSchedule now={now?.getTime()??0} today={today} events={homeEvents} entries={calendarEntries} calendar={calendar} onEdit={editEvent}/>}
            {visible('todos')&&<HomeTasks today={today} entries={data.entries} onEdit={openEntry} onToggle={toggle}/>}
          </div>
          <div className="hub-home-panels">{homeOrder.map(id=><Fragment key={id}>{homePanels[id]}</Fragment>)}</div>
        </>:<>
          {section!=='news'&&<div className="page-heading section-heading"><div><h1>{currentInfo?.title}</h1><p>{currentInfo?.description}</p></div>{currentInfo?.kind&&!['audio','music','calendar'].includes(section)&&<button className="button primary" onClick={()=>setModal({kind:activeKind})}><Plus size={15}/>{kindLabels[activeKind]} 추가</button>}</div>}
          {section==='hobbies'?<HobbyDirectory/>:section==='football'?<FootballHub saved={savedFixtureIds} onSave={addFixture}/>:section==='watch'?<WatchHub entries={entries('watch')} today={today} onProgress={recordWatchProgress} onAdd={watchType=>setModal({kind:'watch',watchType})} onEdit={openEntry} onDelete={setDeleteEntry} onSave={save}/>:section==='settings'?<div className="settings-grid settings-sections">
            <nav className="settings-jump" aria-label="설정 항목">
              <a href="#connections">서비스 연결</a><a href="#appearance">표시와 테마</a><a href="#widgets">홈 위젯</a><a href="#sync">데이터와 백업</a>
            </nav>
            <ConnectionSettings userId={sync.userId} ready={ready} calendar={calendar} hidden={data.preferences.calendarHiddenSources??[]} today={today}/>
            <section className="panel settings-panel" id="appearance"><PanelHeading title="화면과 테마"/><p className="muted">지금의 분위기에 맞는 테마를 선택하세요.</p><div className="theme-choices">{(['dark','light'] as const).map(t=><button key={t} className={`theme-choice ${data.preferences.theme===t?'selected':''}`} aria-pressed={data.preferences.theme===t} onClick={()=>preference({theme:t})}><span className={`theme-preview ${t}`}><i/><i/><i/></span>{t==='dark'?<Moon size={15}/>:<Sun size={15}/>} {t==='dark'?'다크':'라이트'}{data.preferences.theme===t&&<Check size={15}/>}</button>)}</div></section>
            <section className="panel settings-panel" id="weather"><PanelHeading title="날씨 지역"/><p className="muted">선택한 도시의 현재 날씨와 예보를 홈에 표시합니다.</p><label className="field-label" htmlFor="city">도시</label><WeatherCitySelect id="city" city={data.preferences.city} onChange={city=>preference({city})}/><small className="setting-caption">시간과 일정의 기준은 대한민국 표준시(KST)입니다.</small></section>
            <section className="panel settings-panel" id="widgets"><PanelHeading title="홈 위젯"/>{widgetsEditor}</section>
            <CloudStorageSettings count={data.entries.length} onExport={exportData} onImport={()=>fileRef.current?.click()}/>
            <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e=>importFile(e.target.files?.[0])}/>
            <details className="panel settings-panel integration-settings settings-services"><summary>공개 정보와 기타 서비스<ChevronDown size={16}/></summary>{[{name:'날씨 · Open-Meteo',desc:'선택한 지역의 날씨를 화면을 열 때 조회',state:'API 조회'},{name:'WOONG 뉴스 허브',desc:'공개 매체 RSS 직접 수집 · 읽음 · 스크랩 동기화',state:'연결됨'},{name:'음악 DB · MusicBrainz',desc:'앨범 정보 검색 · 별점과 감상은 직접 기록',state:'API 조회'},{name:'Steam 상점',desc:'상점 링크로 게임 정보 조회 · 플레이 기록은 직접 입력',state:'API 조회'},{name:'개인 서버 저장소',desc:'ChatGPT 로그인 · 사용자별 DB · 기기 간 동기화',state:sync.phase==='synced'?'연결됨':'동기화 확인'},{name:'AI 브리핑 · 가격 알림',desc:'별도 API와 수집 작업 연결 후 제공',state:'연결 전'}].map(x=><div className="integration-row" key={x.name}><div><strong>{x.name}</strong><small>{x.desc}</small></div><span className={`badge ${['API 조회','연결됨'].includes(x.state)?'blue':''}`}>{x.state}</span></div>)}</details>
          </div>:section==='news'?<NewsHub games={entries('games')} documentRevision={sync.revision}/>:section==='audio'?<AudioHub entries={entries('audio')} music={entries('music')} pinned={data.preferences.pinnedAudioSetup} onPin={id=>preference({pinnedAudioSetup:id||undefined})} onAdd={()=>setModal({kind:'audio'})} onEdit={entry=>setModal({kind:'audio',entry})} onDelete={setDeleteEntry}/>:section==='steam'?<><Link href="/games/" className="text-button muted steam-back"><ChevronLeft size={14}/>게임 기록으로 돌아가기</Link><SteamAccount detailed entries={entries('games')} onEdit={entry=>setModal({kind:'games',entry})} onSave={save}/></>:section==='games'?<GamesHub entries={entries('games')} onAdd={()=>setModal({kind:'games'})} onEdit={entry=>setModal({kind:'games',entry})} onDelete={setDeleteEntry}/>:section==='spotify'?<><Link href="/music/" className="text-button muted spotify-back"><ChevronLeft size={14}/>앨범 컬렉션으로 돌아가기</Link><SpotifyAccount detailed collections={entries('music')} onCollect={entity=>setModal({kind:'music',entry:spotifyMusicDraft(entity)})}/></>:section==='music'?<MusicHub onSave={save} entries={entries('music')} onAdd={()=>setModal({kind:'music'})} onEdit={entry=>setModal({kind:'music',entry})} onDelete={setDeleteEntry}/>:section==='calendar'?<CalendarHub calendar={calendar} entries={calendarEntries} matches={matchEvents} onRemoveMatch={removeFixture} today={today} hidden={data.preferences.calendarHiddenSources??[]} onHiddenChange={ids=>preference({calendarHiddenSources:ids})} onAdd={addCalendarEvent} onEdit={entry=>setModal({kind:'event',entry})}/>:<>
            {section==='work'&&<a href={shortcuts[3].url} target="_blank" rel="noreferrer" className="work-tool-link"><BriefcaseBusiness size={20}/><span><strong>스토어 인사이트</strong><small>네이버 매출과 광고 실적</small></span><ArrowUpRight size={16}/></a>}
            <div className="section-toolbar records-toolbar">
              <div className="tabs" role="group" aria-label={section==='library'?'기록 종류':'업무 분류'}>
                {section==='library'?(['note','todo','bookmark'] as const).map(kind=><button key={kind} type="button" aria-pressed={libraryTab===kind} className={libraryTab===kind?'selected':''} onClick={()=>{setLibraryTab(kind);setFilter('전체');}}>{kindLabels[kind]}<span>{entries(kind).length}</span></button>):
                  workFilters.map(category=><button key={category} type="button" aria-pressed={filter===category} className={filter===category?'selected':''} onClick={()=>setFilter(category)}>{category}</button>)}
              </div>
              <span className="record-count">{sectionEntries.length}개의 기록</span>
            </div>
            <RecordList entries={sectionEntries} filtered={filter!=='전체'} label={kindLabels[activeKind]}
              onAdd={()=>setModal({kind:activeKind})} onOpen={entry=>setModal({kind:entry.kind,entry})} onDelete={setDeleteEntry} onToggle={toggle}/>
          </>}
        </>}
        <footer className="footer"><span><span className="footer-wordmark">W.</span>조금 더 나다운 일상을 위해.</span><span>WOONG HUB<span className="footer-separator">/</span>Made for your everyday</span></footer>
      </main>
    </div>
    {toast&&<div className={`toast${toast.undo?' watch-progress-toast':''}`}><Check size={16} aria-hidden="true"/><span role="status">{toast.message}</span>
      {toast.undo&&<button type="button" className="text-button blue" onClick={undoWatchProgress}>되돌리기</button>}
      <button type="button" className="icon-button" aria-label="알림 닫기" onClick={()=>setToast(null)}><X size={14}/></button>
    </div>}
    {quickAddOpen&&<Dialog title="빠른 추가" onClose={()=>setQuickAddOpen(false)} className="home-add-dialog" focusField={false}>
      <div className="home-add-options">
        <button type="button" disabled={!today} onClick={()=>{setQuickAddOpen(false);addCalendarEvent(today);}}><CalendarDays size={19} aria-hidden="true"/>일정 추가</button>
        <button type="button" onClick={()=>{setQuickAddOpen(false);setModal({kind:'todo'});}}><ListTodo size={19} aria-hidden="true"/>할 일 추가</button>
        <button type="button" onClick={()=>{setQuickAddOpen(false);setModal({kind:'note'});}}><SquarePen size={19} aria-hidden="true"/>메모 쓰기</button>
      </div>
    </Dialog>}
    {modal&&(modal.kind==='watch'?<WatchEntryModal entry={modal.entry} defaultType={modal.watchType} onClose={()=>setModal(null)} onSave={save}/>:modal.kind==='audio'?<AudioEntryModal entry={modal.entry} entries={entries('audio')} onClose={()=>setModal(null)} onSave={save}/>:modal.kind==='games'?<GameEntryModal entry={modal.entry} isNew={!data.entries.some(e=>e.id===modal.entry?.id)} onClose={()=>setModal(null)} onSave={save}/>:modal.kind==='music'?<MusicEntryModal entry={modal.entry} onClose={()=>setModal(null)} onSave={save}/>:modal.kind==='note'?<NoteEditor key={JSON.stringify([sync.userId,modal.entry?.id])} userId={sync.userId} entry={modal.entry} latest={data.entries.find(e=>e.id===modal.entry?.id)} onClose={()=>setModal(null)} onSave={save}/>:<EntryModal kind={modal.kind} entry={modal.entry} onClose={()=>setModal(null)} onSave={save}/>)}
    {editWidgets&&<Dialog title="홈 위젯 설정" onClose={()=>setEditWidgets(false)} className="home-widget-dialog" focusField={false}>{widgetsEditor}<div className="dialog-footer"><button className="button primary" type="button" onClick={()=>setEditWidgets(false)}>닫기</button></div></Dialog>}
    {searchOpen&&ready&&<UnifiedSearch key={sync.userId} entries={data.entries} query={query} onQuery={setQuery} onClose={()=>setSearchOpen(false)} onEdit={entry=>{setSearchOpen(false);setModal({kind:entry.kind,entry});}}/>}
    {pendingImport&&<Dialog title="백업을 가져올까요?" onClose={()=>setPendingImport(null)}><p className="dialog-description">현재 {data.entries.length}개의 기록을 백업 파일의 {pendingImport.entries.length}개 기록과 설정으로 교체합니다. 현재 데이터를 먼저 내보내두는 것을 권장합니다.</p><div className="button-row dialog-actions"><button className="button secondary" onClick={exportData}>현재 데이터 내보내기</button><button className="button primary" onClick={()=>{if(persist(pendingImport)){setPendingImport(null);notify('백업을 가져왔어요.');}}}>교체하여 가져오기</button></div></Dialog>}
    {deleteEntry&&<Dialog title="기록을 삭제할까요?" onClose={()=>setDeleteEntry(null)}><p className="dialog-description">“{deleteEntry.title}” 기록을 삭제합니다. 삭제한 기록은 백업 파일에서 복구할 수 있습니다.</p>{deleteEntry.kind==='audio'&&!isSetup(deleteEntry)&&entries('audio').some(e=>e.audio?.type==='setup'&&e.audio.deviceIds.includes(deleteEntry.id))&&<p className="dialog-description">이 장비를 사용하는 조합은 유지되며, 해당 연결에 ‘찾을 수 없는 장비’가 표시됩니다. 조합 수정에서 다른 장비로 바꿀 수 있어요.</p>}<div className="dialog-actions button-row"><button className="button secondary" onClick={()=>setDeleteEntry(null)}>취소</button><button className="button danger" onClick={remove}>삭제하기</button></div></Dialog>}
  </div>;
}

function EntryModal({kind,entry,onClose,onSave}:{kind:Kind;entry?:Entry;onClose:()=>void;onSave:(e:Entry)=>void}) {
  const [title,setTitle]=useState(entry?.title??''),[detail,setDetail]=useState(entry?.detail??''),[category,setCategory]=useState(entry?.category||categories[kind]?.[0]||''),[status,setStatus]=useState(entry?.status||statuses[kind]?.[0]||''),[url,setUrl]=useState(entry?.url??''),[date]=useState(entry?.date?(kind==='event'&&!entry.date.includes('T')?`${entry.date}T09:00`:entry.date):''),[error,setError]=useState('');
  const isEdit=!!entry?.title;
  function submit(e:FormEvent){e.preventDefault();const submittedDate=['todo','event'].includes(kind)?String(new FormData(e.currentTarget as HTMLFormElement).get('entryDate')??''):date;if(!title.trim()){setError('제목을 입력해주세요.');return;}if((kind==='bookmark'||url.trim())&&!safeUrl(url.trim())){setError('http:// 또는 https://로 시작하는 주소를 입력해주세요.');return;}if(kind==='event'&&!submittedDate){setError('일정 날짜를 선택해주세요.');return;}onSave({id:entry?.id??crypto.randomUUID(),kind,title:title.trim(),detail:detail.trim(),category,status,url:url.trim()?safeUrl(url.trim()):'',date:submittedDate,done:entry?.done??false,createdAt:entry?.createdAt??new Date().toISOString()});}
  return <Dialog title={`${kindLabels[kind]} ${isEdit?'수정':'추가'}`} onClose={onClose}><form onSubmit={submit}><div className="entry-form"><label>제목 <span className="blue">*</span><input autoFocus required maxLength={200} placeholder={kind==='audio'?'제조사와 모델명':kind==='music'?'아티스트 · 앨범명':kind==='games'?'게임 이름':'어떤 내용을 기록할까요?'} value={title} onChange={e=>setTitle(e.target.value)}/></label><div className="form-two-columns">{categories[kind]&&<label>분류<select value={category} onChange={e=>setCategory(e.target.value)}>{categories[kind]?.map(c=><option key={c}>{c}</option>)}</select></label>}{statuses[kind]&&<label>상태<select value={status} onChange={e=>setStatus(e.target.value)}>{statuses[kind]?.map(s=><option key={s}>{s}</option>)}</select></label>}</div>{['todo','event'].includes(kind)&&<label>{kind==='event'?'일정 날짜 *':'마감일 (선택)'}<input required={kind==='event'} type={kind==='event'?'datetime-local':'date'} name="entryDate" defaultValue={date.includes('T')&&kind==='todo'?date.slice(0,10):date}/><small>대한민국 표준시(KST) 기준</small></label>}{!['todo','event','note'].includes(kind)&&<label>{kind==='bookmark'?'URL *':'관련 링크 (선택)'}<input type="url" required={kind==='bookmark'} placeholder="https://" maxLength={2000} value={url} onChange={e=>setUrl(e.target.value)}/></label>}<label>{kind==='audio'?'사양 · 구매 정보 · 청음 메모':kind==='music'?'장르 · 별점 · 감상 메모':kind==='games'?'플레이 기록 · 점수 · 메모':'내용 · 메모'}<textarea rows={5} maxLength={10000} placeholder="나중의 나에게 남겨두고 싶은 이야기" value={detail} onChange={e=>setDetail(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}</div><div className="dialog-footer"><span><Database size={12}/>기기에 보관 후 서버와 동기화합니다</span><button type="button" className="button secondary" onClick={onClose}>취소</button><button type="submit" className="button primary"><Check size={15}/>저장하기</button></div></form></Dialog>;
}
