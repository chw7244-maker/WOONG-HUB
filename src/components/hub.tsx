'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, AudioLines, Bell, Bookmark, CalendarDays, Check, ChevronLeft, Gamepad2, Headphones, Layers3, ListTodo, Moon, Music2, Newspaper, Plus, SlidersHorizontal, StickyNote, Sun, Trash2, X, BriefcaseBusiness, Pencil, Link2, Database, type LucideIcon, SquarePen } from 'lucide-react';
import WeatherCard from './weather';
import NewsHub, { NewsBriefing } from './news-hub';
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
import WeekAgenda from './home-dashboard';
import NoteEditor from './note-editor';
import { AudioHighlights, GameHighlights, MusicHighlights } from './hobby-highlights';
import { dashboardTasks, pinnedSetup, recentListeningGear } from '@/lib/home-dashboard';
import ConnectionSettings from './connection-settings';
import Dialog from './dialog';
import { isSetup } from '@/lib/audio';
import { useHubSync } from './sync-provider';
import { CloudStorageSettings, SyncIndicator, SyncNotice } from './sync-status';
import { type Entry, type HubData, type Kind, cities, validateData, todayKST, koreanDate, safeUrl, mediaWidgets, mediaWidgetVisible } from '@/lib/store';

const details: Record<string,{title:string;description:string;kind?:Kind}> = {
  news:{title:'뉴스 허브',description:'관심 있는 소식을 읽고, 오래 기억할 기사를 모으세요.'},
  audio:{title:'나만의 오디오',description:'좋아하는 소리와 그 소리를 만들어주는 장비의 기록.',kind:'audio'},
  steam:{title:'Steam 라이브러리',description:'계정별 보유 게임과 실제 플레이 시간을 한곳에서.'},
  games:{title:'게임 라이브러리',description:'다음 모험부터 엔딩의 순간까지, 나만의 플레이 기록.',kind:'games'},
  spotify:{title:'Spotify 음악',description:'지금 듣는 음악부터 나의 플레이리스트까지.'},
  music:{title:'음악 컬렉션',description:'오래 듣고 싶은 앨범과 오늘의 감상을 담아두세요.',kind:'music'},
  calendar:{title:'캘린더',description:'노션과 구글 일정, 나의 약속을 한곳에서.',kind:'event'},
  library:{title:'라이브러리',description:'스쳐 지나간 생각, 다시 찾고 싶은 링크, 작은 할 일.',kind:'note'},
  work:{title:'업무 공간',description:'업무에 집중할 수 있도록, 필요한 도구와 기록을 모으세요.',kind:'work'},
  settings:{title:'설정',description:'내 일상에 맞게, 나만의 HUB를 가꾸세요.'}
};
const kindLabels: Record<Kind,string> = {todo:'할 일',note:'메모',bookmark:'북마크',audio:'오디오 장비',games:'게임',music:'앨범',event:'일정',work:'업무 기록'};
const kindIcons: Record<Kind,LucideIcon> = {todo:ListTodo,note:StickyNote,bookmark:Bookmark,audio:Headphones,games:Gamepad2,music:Music2,event:CalendarDays,work:BriefcaseBusiness};
const categories: Partial<Record<Kind,string[]>> = {audio:['이어폰','헤드폰','DAP','DAC · 앰프','케이블 · 이어팁','기타'],games:['PC','PlayStation','Nintendo','Xbox','모바일','기타'],music:['디지털','FLAC','CD','LP','스트리밍'],bookmark:['일상','오디오','게임','음악','업무','기사'],note:['일상','아이디어','취미','업무'],work:['업무','매출','광고','기타']};
const statuses: Partial<Record<Kind,string[]>> = {audio:['보유 중','위시리스트','판매 완료'],games:['플레이 예정','플레이 중','완료','위시리스트'],music:['컬렉션','위시리스트']};
const shortcuts = [
  {title:'뉴스 허브',subtitle:'나의 새로운 읽을거리',url:'/news/',icon:Newspaper,color:'blue'},
  {title:'Steam',subtitle:'다음 플레이 찾기',url:'https://store.steampowered.com/',icon:Gamepad2,color:'teal'},
  {title:'IEM Atlas',subtitle:'이어폰 탐색',url:'https://iem-atlas.woong22222.chatgpt.site',icon:Headphones,color:'purple'},
  {title:'스토어 인사이트',subtitle:'매출 · 광고 분석',url:'https://naver-sales-insight.woong22222.chatgpt.site',icon:BriefcaseBusiness,color:'green'}
];
const widgetLabels: Record<string,string>={weather:'날씨',calendar:'캘린더',todos:'오늘의 할 일',bookmarks:'즐겨찾기',news:'오늘의 브리핑',interests:'나의 관심사',note:'빠른 메모',spotify:'Spotify 음악 플레이어',steam:'Steam 최근 플레이'};

function Empty({icon:Icon,title,description,action,label='추가하기'}:{icon:LucideIcon;title:string;description?:string;action?:()=>void;label?:string}) {return <div className="empty"><div className="empty-icon"><Icon size={24} strokeWidth={1.5}/></div><h3>{title}</h3>{description&&<p>{description}</p>}{action&&<button className="text-button blue" onClick={action}><Plus size={14}/>{label}</button>}</div>;}
function PanelHeading({title,sub,children}:{title:string;sub?:string;children?:React.ReactNode}){return <div className="panel-heading"><h2>{title}{sub&&<span className="heading-count">{sub}</span>}</h2>{children}</div>;}

export default function Hub({section}:{section:string}) {
  const sync=useHubSync();
  const {data,ready}=sync;
  const calendar=useCalendarSnapshot(ready&&['home','calendar','settings'].includes(section));
  const [now,setNow]=useState<Date|null>(null);
  const [modal,setModal]=useState<{kind:Kind;entry?:Entry}|null>(null),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState(''),[toast,setToast]=useState(''),[mobileMenu,setMobileMenu]=useState(false),[libraryTab,setLibraryTab]=useState<Kind>('note'),[filter,setFilter]=useState('전체'),[pendingImport,setPendingImport]=useState<HubData|null>(null),[deleteEntry,setDeleteEntry]=useState<Entry|null>(null),[notificationOpen,setNotificationOpen]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{setNow(new Date());const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!ready)return;document.documentElement.dataset.theme=data.preferences.theme;},[ready,data.preferences.theme]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{setFilter('전체');setMobileMenu(false);},[section]);
  useEffect(()=>{const handle=(event:KeyboardEvent)=>{if(document.querySelector('[role="dialog"]'))return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setSearchOpen(true);}if(event.key==='Escape')setNotificationOpen(false);};document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle);},[]);
  function persist(next:HubData) {return sync.client.change(next);}
  function notify(message:string){setToast(message);}
  function addCalendarEvent(date:string){setModal({kind:'event',entry:{id:crypto.randomUUID(),kind:'event',title:'',detail:'',category:'',status:'',url:'',date:date+'T09:00',done:false,createdAt:new Date().toISOString()}});}
  function save(entry:Entry){const exists=data.entries.some(e=>e.id===entry.id);if(persist({...data,entries:exists?data.entries.map(e=>e.id===entry.id?entry:e):[entry,...data.entries]})){setModal(null);notify(`${entry.music?.type==='playlist'?'플레이리스트':kindLabels[entry.kind]} ${exists?'수정했어요':'기록했어요'}`);return true;}return false;}
  function toggle(e:Entry){persist({...data,entries:data.entries.map(x=>x.id===e.id?{...x,done:!x.done}:x)});}
  function remove(){if(deleteEntry&&persist({...data,entries:data.entries.filter(e=>e.id!==deleteEntry.id)})){setDeleteEntry(null);notify('기록을 삭제했어요.');}}
  function preference(update:Partial<HubData['preferences']>){persist({...data,preferences:{...data.preferences,...update}});}
  const entries=(kind:Kind)=>data.entries.filter(e=>e.kind===kind);
  const today=now?todayKST(now):'',events=entries('event').filter(e=>e.date.slice(0,10)>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const tasks=today?dashboardTasks(data.entries,today):[];
  const selectedSetup=pinnedSetup(entries('audio'),data.preferences.pinnedAudioSetup);
  const homeAudio=section==='home'&&(selectedSetup??recentListeningGear(entries('audio'),entries('music'))[0]?.entry);
  const recentRecords=section==='home'?data.entries.filter(e=>['note','audio','games','music'].includes(e.kind)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,4):[];
  const visible=(w:string)=>mediaWidgets.includes(w)?mediaWidgetVisible(data.preferences,w):data.preferences.widgets.includes(w);
  function toggleWidget(id:string,enabled:boolean){if(mediaWidgets.includes(id)){const current=data.preferences.mediaWidgets??mediaWidgets;preference({mediaWidgets:enabled?[...current,id]:current.filter(w=>w!==id)});}else preference({widgets:enabled?[...data.preferences.widgets,id]:data.preferences.widgets.filter(w=>w!==id)});}
  const dateLabel=now?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(now):'오늘의 공간을 준비하고 있어요';
  function exportData(){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`woong-hub-${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('HUB 백업 파일을 내보냈어요.');}
  function exportLegacy(){if(!sync.migration)return;const url=URL.createObjectURL(new Blob([JSON.stringify(sync.migration,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`woong-hub-before-migration-${today}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function importFile(file?:File){if(!file)return;try{if(file.size>10*1024*1024)throw new Error('10MB 이하의 백업 파일을 선택해주세요.');setPendingImport(validateData(JSON.parse(await file.text())));}catch(e){notify(e instanceof Error?e.message:'백업을 읽지 못했어요.');}if(fileRef.current)fileRef.current.value='';}
  const currentInfo=details[section];
  const activeKind:Kind=section==='library'?libraryTab:currentInfo?.kind??'note';
  const sectionEntries=entries(activeKind).filter(e=>filter==='전체'||e.status===filter||e.category===filter);

  return <div className="app-shell">
    <HubNavigation section={section} dark={data.preferences.theme==='dark'} menuOpen={mobileMenu}
      hasNotifications={events.some(event=>event.date.startsWith(today))} notificationOpen={notificationOpen}
      onMenu={setMobileMenu} onSearch={()=>setSearchOpen(true)} onTheme={()=>preference({theme:data.preferences.theme==='dark'?'light':'dark'})}
      onNotifications={()=>setNotificationOpen(value=>!value)}/>
    <div className="workspace hub-workspace">
      {notificationOpen&&<section className="notification-popover panel"><PanelHeading title="오늘의 알림"><button className="icon-button" aria-label="알림 닫기" onClick={()=>setNotificationOpen(false)}><X size={16}/></button></PanelHeading>{events.filter(e=>e.date.startsWith(today)).length?events.filter(e=>e.date.startsWith(today)).map(e=><button key={e.id} className="notification-row" onClick={()=>{setNotificationOpen(false);setModal({kind:'event',entry:e});}}><CalendarDays size={16}/><span>{e.title}<small>{koreanDate(e.date)}</small></span></button>):<Empty icon={Bell} title="지금은 새 알림이 없어요" description="오늘 등록한 일정이 여기에 표시돼요."/>}</section>}
      <main className="main-content">
        <div className="sync-status-row"><SyncIndicator/></div>
        <SyncNotice onLegacyBackup={exportLegacy}/>
        {!ready?<div className="loading-state"><AudioLines size={36}/><p>{sync.phase==='connecting'?'나의 서버 저장소를 확인하고 있어요.':'서버에 다시 연결하면 기록을 불러옵니다.'}</p>{sync.phase!=='connecting'&&<button className="button secondary" onClick={()=>void sync.client.retry()}>다시 연결</button>}</div>:section==='home'?<>
          <header className="hub-today-heading">
            <div><p className="hub-date">{dateLabel} <small>KST</small></p><h1>오늘</h1></div>
            <div className="hub-today-actions">
              <Link href="/settings/#widgets" className="icon-button" aria-label="홈 위젯 설정"><SlidersHorizontal size={18}/></Link>
              {visible('note')&&<button type="button" className="button primary" onClick={()=>setModal({kind:'note'})}><SquarePen size={16}/>메모 쓰기</button>}
            </div>
          </header>
          <div className="hub-home-layout">
            {visible('calendar')&&<WeekAgenda today={today} entries={entries('event')} hidden={data.preferences.calendarHiddenSources??[]} calendar={calendar}
              onEdit={entry=>setModal({kind:'event',entry})} onAdd={addCalendarEvent}/>}
            {visible('todos')&&<section className="hub-tasks" aria-labelledby="home-tasks-title">
              <div className="hub-section-heading"><div><h2 id="home-tasks-title">오늘 할 일</h2><p>{tasks.length}개 남음</p></div>
                <button type="button" onClick={()=>setModal({kind:'todo'})} className="text-button blue"><Plus size={15}/>할 일 추가</button>
              </div>
              {tasks.length?<div className="task-list">{tasks.slice(0,5).map(entry=><TaskRow key={entry.id} entry={entry} toggle={()=>toggle(entry)} edit={()=>setModal({kind:'todo',entry})}/>)}</div>:<p className="hub-agenda-empty">오늘 남은 할 일이 없어요.</p>}
              <Link href="/library/" className="text-button muted hub-all-tasks">기록에서 전체 보기<ArrowRight size={13}/></Link>
            </section>}
          </div>
          {(visible('interests')||visible('spotify')||visible('steam'))&&<section className="hub-home-section" aria-labelledby="home-resume-title">
            <div className="hub-section-heading"><h2 id="home-resume-title">이어서 하기</h2></div>
            <div className="hub-resume-grid">
              {visible('interests')&&<section className="hub-resume-audio">
                <div className="hub-section-heading"><h3><Headphones size={16}/>오디오</h3><Link href="/audio/" className="text-button blue">컬렉션<ArrowUpRight size={13}/></Link></div>
                {homeAudio?<button type="button" className="hub-resume-entry" onClick={()=>setModal({kind:'audio',entry:homeAudio})}>
                  <small>{selectedSetup?'고정한 청음 조합':'최근 감상에서 사용한 장비'}</small><strong>{homeAudio.title}</strong>
                </button>:<p className="muted">오디오 메뉴에서 청음 조합을 고정할 수 있어요.</p>}
              </section>}
              {visible('spotify')&&<MusicHighlights home entries={entries('music')} onOpen={entry=>setModal({kind:'music',entry})}/>}
              {visible('steam')&&<SteamHome key={sync.userId}/>}
            </div>
          </section>}
          {visible('note')&&recentRecords.length>0&&<section className="hub-home-section" aria-labelledby="home-recent-title">
            <div className="hub-section-heading"><h2 id="home-recent-title">최근 기록</h2><Link href="/library/" className="text-button blue">모든 메모<ArrowUpRight size={13}/></Link></div>
            <div className="hub-records-strip">{recentRecords.map(entry=><button key={entry.id} type="button" onClick={()=>setModal({kind:entry.kind,entry})}><small>{kindLabels[entry.kind]}</small><strong>{entry.title}</strong><ArrowUpRight size={13}/></button>)}</div>
          </section>}
          <div className="hub-secondary-grid">
            {visible('bookmarks')&&<section className="quick-links-section"><PanelHeading title="즐겨찾는 곳"><button className="text-button muted" onClick={()=>setModal({kind:'bookmark'})}><Plus size={14}/>추가</button></PanelHeading><div className="quick-links">{shortcuts.map(({title,subtitle,url,icon:Icon,color})=><a className="quick-link" key={title} href={url} target={url.startsWith('/')?undefined:'_blank'} rel="noreferrer"><span className={`shortcut-icon ${color}`}><Icon size={21} strokeWidth={1.7}/></span><strong>{title}</strong><small>{subtitle}</small><ArrowUpRight className="shortcut-arrow" size={13}/></a>)}</div>{entries('bookmark').length>0&&<div className="personal-links">{entries('bookmark').slice(0,6).map(e=><a href={safeUrl(e.url)} target="_blank" rel="noreferrer" key={e.id}><Link2 size={12}/>{e.title}<ArrowUpRight size={12}/></a>)}</div>}</section>}
            {visible('weather')&&<WeatherCard city={data.preferences.city} onSettings={()=>window.location.assign('/settings/#weather')}/>}
            {visible('news')&&<NewsBriefing/>}
          </div>
        </>:<>
          {section!=='news'&&<div className="page-heading section-heading"><div><h1>{currentInfo?.title}</h1><p>{currentInfo?.description}</p></div>{currentInfo?.kind&&<button className="button primary" onClick={()=>setModal({kind:activeKind})}><Plus size={15}/>{kindLabels[activeKind]} 추가</button>}</div>}
          {section==='settings'?<div className="settings-grid">
            <ConnectionSettings userId={sync.userId} ready={ready} calendar={calendar} hidden={data.preferences.calendarHiddenSources??[]} today={today}/>
            <section className="panel settings-panel"><PanelHeading title="화면과 테마"/><p className="muted">지금의 분위기에 맞는 테마를 선택하세요.</p><div className="theme-choices">{(['dark','light'] as const).map(t=><button key={t} className={`theme-choice ${data.preferences.theme===t?'selected':''}`} onClick={()=>preference({theme:t})}><span className={`theme-preview ${t}`}><i/><i/><i/></span>{t==='dark'?<Moon size={15}/>:<Sun size={15}/>} {t==='dark'?'다크':'라이트'}{data.preferences.theme===t&&<Check size={15}/>}</button>)}</div></section>
            <section className="panel settings-panel" id="weather"><PanelHeading title="날씨 지역"/><p className="muted">선택한 도시의 현재 날씨를 홈에 표시합니다.</p><label className="field-label" htmlFor="city">도시</label><select id="city" value={data.preferences.city} onChange={e=>preference({city:e.target.value})}>{Object.entries(cities).map(([id,c])=><option value={id} key={id}>{c.label}</option>)}</select><small className="setting-caption">시간과 일정의 기준은 대한민국 표준시(KST)입니다.</small></section>
            <section className="panel settings-panel" id="widgets"><PanelHeading title="홈 위젯"/><p className="muted">매일 보고 싶은 정보만 남겨두세요.</p><div className="widget-toggles">{Object.entries(widgetLabels).map(([id,label])=><label key={id} className="toggle-row"><span>{label}</span><input type="checkbox" checked={visible(id)} onChange={e=>toggleWidget(id,e.target.checked)}/><span className="toggle-switch"/></label>)}</div></section>
            <CloudStorageSettings count={data.entries.length} onExport={exportData} onImport={()=>fileRef.current?.click()}/>
            <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={e=>importFile(e.target.files?.[0])}/>
            <section className="panel settings-panel integration-settings"><PanelHeading title="기타 서비스"/>{[{name:'날씨 · Open-Meteo',desc:'선택한 지역의 날씨를 화면을 열 때 조회',state:'API 조회'},{name:'WOONG 뉴스 허브',desc:'공개 매체 RSS 직접 수집 · 읽음 · 스크랩 동기화',state:'연결됨'},{name:'음악 DB · MusicBrainz',desc:'앨범 정보 검색 · 별점과 감상은 직접 기록',state:'API 조회'},{name:'Steam 상점',desc:'상점 링크로 게임 정보 조회 · 플레이 기록은 직접 입력',state:'API 조회'},{name:'개인 서버 저장소',desc:'ChatGPT 로그인 · 사용자별 DB · 기기 간 동기화',state:sync.phase==='synced'?'연결됨':'동기화 확인'},{name:'AI 브리핑 · 가격 알림',desc:'별도 API와 수집 작업 연결 후 제공',state:'연결 전'}].map(x=><div className="integration-row" key={x.name}><div><strong>{x.name}</strong><small>{x.desc}</small></div><span className={`badge ${['API 조회','연결됨'].includes(x.state)?'blue':''}`}>{x.state}</span></div>)}</section>
          </div>:section==='news'?<NewsHub/>:section==='audio'?<><AudioHighlights audio={entries('audio')} music={entries('music')} pinned={data.preferences.pinnedAudioSetup} onPin={id=>preference({pinnedAudioSetup:id||undefined})} onOpen={entry=>setModal({kind:'audio',entry})}/><AudioHub entries={entries('audio')} onAdd={()=>setModal({kind:'audio'})} onEdit={entry=>setModal({kind:'audio',entry})} onDelete={setDeleteEntry}/></>:section==='steam'?<><Link href="/games/" className="text-button muted steam-back"><ChevronLeft size={14}/>게임 기록으로 돌아가기</Link><SteamAccount detailed entries={entries('games')} onEdit={entry=>setModal({kind:'games',entry})} onSave={save}/></>:section==='games'?<><GameHighlights entries={entries('games')} onOpen={entry=>setModal({kind:'games',entry})}/><GamesHub onSave={save} entries={entries('games')} onAdd={()=>setModal({kind:'games'})} onEdit={entry=>setModal({kind:'games',entry})} onDelete={setDeleteEntry}/></>:section==='spotify'?<><Link href="/music/" className="text-button muted spotify-back"><ChevronLeft size={14}/>앨범 컬렉션으로 돌아가기</Link><SpotifyAccount detailed collections={entries('music')} onCollect={entity=>setModal({kind:'music',entry:spotifyMusicDraft(entity)})}/></>:section==='music'?<><MusicHighlights entries={entries('music')} onOpen={entry=>setModal({kind:'music',entry})}/><MusicHub onSave={save} entries={entries('music')} onAdd={()=>setModal({kind:'music'})} onEdit={entry=>setModal({kind:'music',entry})} onDelete={setDeleteEntry}/></>:section==='calendar'?<CalendarHub calendar={calendar} entries={entries('event')} today={today} hidden={data.preferences.calendarHiddenSources??[]} onHiddenChange={ids=>preference({calendarHiddenSources:ids})} onAdd={addCalendarEvent} onEdit={entry=>setModal({kind:'event',entry})}/>:<>
            {section==='work'&&<a href={shortcuts[3].url} target="_blank" rel="noreferrer" className="work-banner panel"><span className="shortcut-icon green"><BriefcaseBusiness size={24}/></span><div><h3>스토어 인사이트</h3><p>네이버 매출 · 광고 분석 사이트 열기</p></div><ArrowUpRight size={23}/></a>}
            <div className="section-toolbar"><div className="tabs">{section==='library'?(['note','todo','bookmark'] as Kind[]).map(t=><button key={t} className={libraryTab===t?'selected':''} onClick={()=>{setLibraryTab(t);setFilter('전체');}}>{kindLabels[t]}<span>{entries(t).length}</span></button>):['전체',...(statuses[activeKind]??[])].map(t=><button key={t} className={filter===t?'selected':''} onClick={()=>setFilter(t)}>{t}{t==='전체'&&<span>{entries(activeKind).length}</span>}</button>)}</div><span className="record-count">{sectionEntries.length}개의 기록</span></div>
            <RecordGrid entries={sectionEntries} onEdit={e=>setModal({kind:e.kind,entry:e})} onDelete={setDeleteEntry} onToggle={toggle} emptyTitle={filter==='전체'?`첫 ${kindLabels[activeKind]}${['note','audio','event','work'].includes(activeKind)?'를':'을'} 기록해보세요`:'이 분류에는 아직 기록이 없어요'} emptyDescription={activeKind==='audio'?'보유한 장비와 청음 메모로 나만의 오디오 이야기를 시작하세요.':activeKind==='games'?'플레이 중인 게임과 다음에 즐기고 싶은 게임을 등록하세요.':activeKind==='music'?'좋아하는 앨범, 나의 감상과 포맷을 함께 기록하세요.':'작은 기록 하나부터, 이 공간을 나답게 채워보세요.'} onAdd={()=>setModal({kind:activeKind})}/>
          </>}
        </>}
        <footer className="footer"><span><span className="footer-wordmark">W.</span>조금 더 나다운 일상을 위해.</span><span>WOONG HUB<span className="footer-separator">/</span>Made for your everyday</span></footer>
      </main>
    </div>
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}<button className="icon-button" aria-label="알림 닫기" onClick={()=>setToast('')}><X size={14}/></button></div>}
    {modal&&(modal.kind==='audio'?<AudioEntryModal entry={modal.entry} entries={entries('audio')} onClose={()=>setModal(null)} onSave={save}/>:modal.kind==='games'?<GameEntryModal entry={modal.entry} isNew={!data.entries.some(e=>e.id===modal.entry?.id)} onClose={()=>setModal(null)} onSave={save}/>:modal.kind==='music'?<MusicEntryModal entry={modal.entry} onClose={()=>setModal(null)} onSave={save}/>:modal.kind==='note'?<NoteEditor key={JSON.stringify([sync.userId,modal.entry?.id])} userId={sync.userId} entry={modal.entry} latest={data.entries.find(e=>e.id===modal.entry?.id)} onClose={()=>setModal(null)} onSave={save}/>:<EntryModal kind={modal.kind} entry={modal.entry} onClose={()=>setModal(null)} onSave={save}/>)}
    {searchOpen&&ready&&<UnifiedSearch key={sync.userId} entries={data.entries} query={query} onQuery={setQuery} onClose={()=>setSearchOpen(false)} onEdit={entry=>{setSearchOpen(false);setModal({kind:entry.kind,entry});}}/>}
    {pendingImport&&<Dialog title="백업을 가져올까요?" onClose={()=>setPendingImport(null)}><p className="dialog-description">현재 {data.entries.length}개의 기록을 백업 파일의 {pendingImport.entries.length}개 기록과 설정으로 교체합니다. 현재 데이터를 먼저 내보내두는 것을 권장합니다.</p><div className="button-row dialog-actions"><button className="button secondary" onClick={exportData}>현재 데이터 내보내기</button><button className="button primary" onClick={()=>{if(persist(pendingImport)){setPendingImport(null);notify('백업을 가져왔어요.');}}}>교체하여 가져오기</button></div></Dialog>}
    {deleteEntry&&<Dialog title="기록을 삭제할까요?" onClose={()=>setDeleteEntry(null)}><p className="dialog-description">“{deleteEntry.title}” 기록을 삭제합니다. 삭제한 기록은 백업 파일에서 복구할 수 있습니다.</p>{deleteEntry.kind==='audio'&&!isSetup(deleteEntry)&&entries('audio').some(e=>e.audio?.type==='setup'&&e.audio.deviceIds.includes(deleteEntry.id))&&<p className="dialog-description">이 장비를 사용하는 조합은 유지되며, 해당 연결에 ‘찾을 수 없는 장비’가 표시됩니다. 조합 수정에서 다른 장비로 바꿀 수 있어요.</p>}<div className="dialog-actions button-row"><button className="button secondary" onClick={()=>setDeleteEntry(null)}>취소</button><button className="button danger" onClick={remove}>삭제하기</button></div></Dialog>}
  </div>;
}

function TaskRow({entry,toggle,edit}:{entry:Entry;toggle:()=>void;edit:()=>void}) {return <div className={`task-row ${entry.done?'done':''}`}><button className="task-checkbox" role="checkbox" aria-checked={entry.done} aria-label={`${entry.title} ${entry.done?'완료 취소':'완료'}`} onClick={toggle}>{entry.done&&<Check size={12}/>}</button><button className="task-title" onClick={edit}>{entry.title}{entry.date&&<small>{koreanDate(entry.date)}</small>}</button><button className="icon-button edit-task" aria-label={`${entry.title} 수정`} onClick={edit}><Pencil size={12}/></button></div>;}

function RecordGrid({entries,onEdit,onDelete,onToggle,emptyTitle,emptyDescription,onAdd}:{entries:Entry[];onEdit:(e:Entry)=>void;onDelete:(e:Entry)=>void;onToggle:(e:Entry)=>void;emptyTitle:string;emptyDescription:string;onAdd:()=>void}) {return entries.length?<div className="records-grid">{entries.map(e=>{const Icon=kindIcons[e.kind];return <article className={`panel record-card ${e.done?'record-done':''}`} key={e.id}><div className="record-top"><span className="record-icon"><Icon size={23} strokeWidth={1.5}/></span><span className="badge">{e.status||e.category||kindLabels[e.kind]}</span><div className="record-actions"><button className="icon-button" aria-label={`${e.title} 수정`} onClick={()=>onEdit(e)}><Pencil size={14}/></button><button className="icon-button" aria-label={`${e.title} 삭제`} onClick={()=>onDelete(e)}><Trash2 size={14}/></button></div></div><button className="record-title" onClick={()=>onEdit(e)}>{e.title}</button>{e.detail&&<p className="record-detail">{e.detail}</p>}<div className="record-bottom"><span>{e.date?koreanDate(e.date):e.category||kindLabels[e.kind]}</span>{e.kind==='todo'?<button className={`text-button ${e.done?'blue':'muted'}`} onClick={()=>onToggle(e)}><Check size={14}/>{e.done?'완료됨':'완료하기'}</button>:e.url?<a className="text-button blue" href={safeUrl(e.url)} target="_blank" rel="noreferrer">링크 열기<ArrowUpRight size={13}/></a>:<button className="text-button muted" onClick={()=>onEdit(e)}>자세히<ArrowUpRight size={13}/></button>}</div></article>;})}</div>:<section className="panel records-empty"><Empty icon={Layers3} title={emptyTitle} description={emptyDescription} action={onAdd}/></section>;}

function EntryModal({kind,entry,onClose,onSave}:{kind:Kind;entry?:Entry;onClose:()=>void;onSave:(e:Entry)=>void}) {
  const [title,setTitle]=useState(entry?.title??''),[detail,setDetail]=useState(entry?.detail??''),[category,setCategory]=useState(entry?.category||categories[kind]?.[0]||''),[status,setStatus]=useState(entry?.status||statuses[kind]?.[0]||''),[url,setUrl]=useState(entry?.url??''),[date]=useState(entry?.date?(kind==='event'&&!entry.date.includes('T')?`${entry.date}T09:00`:entry.date):''),[error,setError]=useState('');
  const isEdit=!!entry?.title;
  function submit(e:FormEvent){e.preventDefault();const submittedDate=['todo','event'].includes(kind)?String(new FormData(e.currentTarget as HTMLFormElement).get('entryDate')??''):date;if(!title.trim()){setError('제목을 입력해주세요.');return;}if((kind==='bookmark'||url.trim())&&!safeUrl(url.trim())){setError('http:// 또는 https://로 시작하는 주소를 입력해주세요.');return;}if(kind==='event'&&!submittedDate){setError('일정 날짜를 선택해주세요.');return;}onSave({id:entry?.id??crypto.randomUUID(),kind,title:title.trim(),detail:detail.trim(),category,status,url:url.trim()?safeUrl(url.trim()):'',date:submittedDate,done:entry?.done??false,createdAt:entry?.createdAt??new Date().toISOString()});}
  return <Dialog title={`${kindLabels[kind]} ${isEdit?'수정':'추가'}`} onClose={onClose}><form onSubmit={submit}><div className="entry-form"><label>제목 <span className="blue">*</span><input autoFocus required maxLength={200} placeholder={kind==='audio'?'제조사와 모델명':kind==='music'?'아티스트 · 앨범명':kind==='games'?'게임 이름':'어떤 내용을 기록할까요?'} value={title} onChange={e=>setTitle(e.target.value)}/></label><div className="form-two-columns">{categories[kind]&&<label>분류<select value={category} onChange={e=>setCategory(e.target.value)}>{categories[kind]?.map(c=><option key={c}>{c}</option>)}</select></label>}{statuses[kind]&&<label>상태<select value={status} onChange={e=>setStatus(e.target.value)}>{statuses[kind]?.map(s=><option key={s}>{s}</option>)}</select></label>}</div>{['todo','event'].includes(kind)&&<label>{kind==='event'?'일정 날짜 *':'마감일 (선택)'}<input required={kind==='event'} type={kind==='event'?'datetime-local':'date'} name="entryDate" defaultValue={date.includes('T')&&kind==='todo'?date.slice(0,10):date}/><small>대한민국 표준시(KST) 기준</small></label>}{!['todo','event','note'].includes(kind)&&<label>{kind==='bookmark'?'URL *':'관련 링크 (선택)'}<input type="url" required={kind==='bookmark'} placeholder="https://" maxLength={2000} value={url} onChange={e=>setUrl(e.target.value)}/></label>}<label>{kind==='audio'?'사양 · 구매 정보 · 청음 메모':kind==='music'?'장르 · 별점 · 감상 메모':kind==='games'?'플레이 기록 · 점수 · 메모':'내용 · 메모'}<textarea rows={5} maxLength={10000} placeholder="나중의 나에게 남겨두고 싶은 이야기" value={detail} onChange={e=>setDetail(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}</div><div className="dialog-footer"><span><Database size={12}/>기기에 보관 후 서버와 동기화합니다</span><button type="button" className="button secondary" onClick={onClose}>취소</button><button type="submit" className="button primary"><Check size={15}/>저장하기</button></div></form></Dialog>;
}
