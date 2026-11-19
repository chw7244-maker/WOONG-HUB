'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import { SectionFilters } from './section-controls';
import { ArrowDownToLine, ArrowUpRight, AudioLines, Bookmark, CheckCheck, ChevronDown, Cpu, Eye, EyeOff, Gamepad2, Globe2, Headphones, Newspaper, RefreshCw, Search, X, type LucideIcon } from 'lucide-react';
import {newsCategories,newsCategory,newsTime,type NewsArticle} from '@/lib/news';
import {useNews,type NewsView} from './use-news';
import { DailyBriefingPanel, HomeBriefingHighlights, useDailyBriefings } from './daily-briefing';

const categoryIcons:Record<string,LucideIcon>={'audio-music':Headphones,games:Gamepad2,'pc-it':Cpu,'korean-audio':AudioLines,korea:Newspaper,world:Globe2};
function SourceMeta({article}:{article:NewsArticle}){return <div className="news-source-meta"><span>{article.sourceName}</span><i/><time dateTime={article.publishedAt}>{newsTime(article.publishedAt)}</time><span className="news-language">{article.language==='ko'?'KR':'EN'}</span></div>;}
function CategoryTag({article}:{article:NewsArticle}){const category=newsCategory(article.categories[0]);return <span className={`news-category-tag ${category.accent}`}>{category.label}</span>;}

export default function NewsHub(){
  const [category,setCategory]=useState('all'),[view,setView]=useState<NewsView>('all'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[date,setDate]=useState(''),[sourcesOpen,setSourcesOpen]=useState(false);
  useEffect(()=>{const id=new URLSearchParams(window.location.search).get('category');if(id&&newsCategories.some(c=>c.id===id))setCategory(id);},[]);
  useEffect(()=>{const timer=setTimeout(()=>setQuery(search),300);return()=>clearTimeout(timer);},[search]);
  const news=useNews({category,view,query,date});const response=news.response;
  const visible=(response?.articles??[]).filter(a=>view==='hidden'?a.hidden:!a.hidden).filter(a=>view==='unread'?!a.read:view==='saved'?a.saved:true);
  const successful=response?.sync.sources.filter(s=>s.ok).length??0;
  function chooseCategory(id:string){setCategory(id);const url=new URL(window.location.href);if(id==='all')url.searchParams.delete('category');else url.searchParams.set('category',id);window.history.replaceState(null,'',url);}
  function openArticle(article:NewsArticle){if(!article.read)news.setArticleState(article,'read',true);}
  function actions(article:NewsArticle){return <div className="article-actions"><button className={article.read?'is-active':''} disabled={news.pending.has(`${article.id}:read`)} aria-label={`${article.title} ${article.read?'읽지 않음으로 표시':'읽음으로 표시'}`} title={article.read?'읽지 않음으로 표시':'읽음으로 표시'} onClick={()=>news.setArticleState(article,'read',!article.read)}>{article.read?<CheckCheck size={15}/>:<Eye size={15}/>}</button><button className={article.saved?'is-saved':''} aria-pressed={article.saved} disabled={news.pending.has(`${article.id}:saved`)} aria-label={`${article.title} ${article.saved?'스크랩 해제':'스크랩'}`} title={article.saved?'스크랩 해제':'스크랩'} onClick={()=>news.setArticleState(article,'saved',!article.saved)}><Bookmark size={15} fill={article.saved?'currentColor':'none'}/></button><button disabled={news.pending.has(`${article.id}:hidden`)} aria-label={`${article.title} ${article.hidden?'숨김 해제':'숨기기'}`} title={article.hidden?'숨김 해제':'숨기기'} onClick={()=>news.setArticleState(article,'hidden',!article.hidden)}>{article.hidden?<Eye size={15}/>:<EyeOff size={15}/>}</button></div>;}
  return <div className="news-hub">
    <header className="page-heading section-heading news-page-heading">
      <div><h1>뉴스</h1></div>
      <button type="button" className="button secondary news-refresh" disabled={response?.sync.running} onClick={()=>void news.refresh()}>
        <RefreshCw size={15} className={response?.sync.running?'spinning':''}/>{response?.sync.running?'수집 중':'새 기사 확인'}
      </button>
    </header>
    <DailyBriefingPanel/>
    <div className="journal-status"><span><span className={`status-dot ${response?.sync.running?'pending':''}`}/>{response?.sync.running?'매체의 새 소식을 확인하고 있어요':response?.sync.lastSuccessAt?`마지막 수집 ${newsTime(response.sync.lastSuccessAt)} KST`:'매체 RSS를 연결하는 중'}</span><a href="#news-sources" onClick={()=>setSourcesOpen(true)} className="text-button muted">{response?.sync.sources.length?`${successful}/${response.sync.sources.length}개 소스 연결`:'수집 소스'}<ChevronDown size={12}/></a></div>
    {(news.error||news.message)&&<div className="news-notice" role="status"><span>{news.error||news.message}</span>{news.error&&<button className="text-button blue" onClick={()=>void news.reload()}>다시 불러오기</button>}</div>}
      <div className="news-controls"><div className="news-view-tabs" role="group" aria-label="읽기 상태"><button className={view==='all'?'selected':''} aria-pressed={view==='all'} onClick={()=>setView('all')}>최신</button><button className={view==='unread'?'selected':''} aria-pressed={view==='unread'} onClick={()=>setView('unread')}>안 읽음 <span>{response?.counts.unread??'—'}</span></button><button className={view==='saved'?'selected':''} aria-pressed={view==='saved'} onClick={()=>setView('saved')}><Bookmark size={12}/>스크랩 <span>{response?.counts.saved??'—'}</span></button><button className={view==='hidden'?'selected':''} aria-pressed={view==='hidden'} onClick={()=>setView('hidden')}>숨김</button></div><div className="news-filters"><label className="news-search"><Search size={14}/><input aria-label="기사 검색" placeholder="제목·매체 검색" value={search} maxLength={120} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="검색어 지우기" onClick={()=>setSearch('')}><X size={12}/></button>}</label><SectionFilters active={Number(Boolean(date))}><label><span>발행 날짜</span><input aria-label="기사 발행 날짜" className="news-date-filter" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>{date&&<button className="icon-button" title="날짜 초기화" aria-label="날짜 초기화" onClick={()=>setDate('')}><X size={13}/></button>}</SectionFilters></div></div>
    <nav className="news-topics-nav" aria-label="뉴스 분야"><button aria-pressed={category==='all'} className={category==='all'?'selected':''} onClick={()=>chooseCategory('all')}><Newspaper size={15}/>전체<span>{response?.counts.all??'—'}</span></button>{newsCategories.map(c=>{const Icon=categoryIcons[c.id];return <button key={c.id} aria-pressed={category===c.id} className={category===c.id?'selected':''} onClick={()=>chooseCategory(c.id)}><Icon size={15}/>{c.label}<span>{response?(response.categoryCounts[c.id]??0):'—'}</span></button>;})}</nav>
    <section className="journal-reading-section">
      <div className="journal-section-heading"><h2>{view==='saved'?'스크랩':view==='unread'?'안 읽은 기사':view==='hidden'?'숨긴 기사':'최신 기사'}</h2>
        <a href="/api/news/export" className="text-button muted" download><ArrowDownToLine size={14}/>스크랩 백업</a>
      </div>
      {news.loading&&!response?<div className="news-loading"><RefreshCw className="spinning" size={22}/><p>기사를 불러오는 중이에요.</p></div>:visible.length?<div className="news-reading-list">
        {visible.map(article=><article key={article.id} className={`news-reading-row ${article.read?'article-read':''}`}>
          <div className="news-reading-copy">
            <div className="news-reading-meta"><CategoryTag article={article}/><SourceMeta article={article}/></div>
            <a href={article.url} target="_blank" rel="noreferrer" onClick={()=>openArticle(article)}><h3>{article.title}<ArrowUpRight size={15}/></h3></a>
            {article.description&&<p>{article.description}</p>}
          </div>
          {actions(article)}
        </article>)}
      </div>:<div className="collection-empty">
        <h3>{view==='saved'?'스크랩한 기사가 없어요':view==='hidden'?'숨긴 기사가 없어요':response?.sync.running?'기사를 수집하는 중이에요':'조건에 맞는 기사가 없어요'}</h3>
        {view==='all'&&!search&&!date&&<button className="button secondary" disabled={response?.sync.running} onClick={()=>void news.refresh()}><RefreshCw size={13}/>새 기사 확인</button>}
      </div>}
      {response?.nextCursor&&<button disabled={news.loading} className="news-more button secondary" onClick={()=>void news.more()}>{news.loading?'불러오는 중':'기사 더 보기'}<ChevronDown size={14}/></button>}
    </section>
    <section id="news-sources" className="news-source-section"><button className="news-source-toggle" onClick={()=>setSourcesOpen(v=>!v)} aria-expanded={sourcesOpen}><span><Globe2 size={15}/>수집 소스와 업데이트 안내</span><ChevronDown size={15}/></button>{sourcesOpen&&<div className="news-source-details"><p>매체가 공개한 RSS에서 제목·발행일·짧은 소개와 원문 링크만 가져옵니다. 영어 기사는 원문 언어로 표시하며, 소개는 AI 요약이 아닙니다.</p><div className="source-status-grid">{response?.sync.sources.map(s=><div key={s.id}><span className={`status-dot ${s.ok?'':'pending'}`}/><a href={s.website} target="_blank" rel="noreferrer">{s.name}<ArrowUpRight size={11}/></a><small>{s.ok?`${s.count}개 확인`:s.error?.startsWith('http_')?`연결 오류 (${s.error.slice(5)})`:'일시 연결 실패'}</small></div>)}</div><p>페이지를 열 때 마지막 확인 후 1시간이 지났으면 새 기사를 수집합니다. ‘새 기사 확인’으로 직접 갱신할 수 있습니다.</p></div>}</section>
  </div>;
}

export function NewsBriefing(){
  const news=useNews({limit:3});const articles=news.response?.articles??[];
  const { response: daily } = useDailyBriefings();
  const hasBriefings = !!daily?.issues.length;
  const rss = <>
    {articles.length ? <div className="home-news-list">{articles.map(article => <a key={article.id} href={article.url} target="_blank" rel="noreferrer" onClick={() => { if (!article.read) news.setArticleState(article, 'read', true); }}>
      <span className={`home-news-dot ${newsCategory(article.categories[0]).accent}`}/><div><h3>{article.title}</h3><SourceMeta article={article}/></div><ArrowUpRight size={14}/>
    </a>)}</div> : <div className="home-news-empty"><Newspaper size={25}/><p>{news.error || '새로운 이야기를 모으고 있어요.'}</p><Link href="/news/" className="text-button blue">뉴스 허브 열기</Link></div>}
    <div className="home-news-topics">{newsCategories.map(category => <Link key={category.id} href={`/news/?category=${category.id}`}>{category.label}</Link>)}</div>
    <div className="home-news-footnote"><span className="status-dot"/>{news.response?.sync.running ? '새 기사 확인 중' : news.response?.sync.lastSuccessAt ? `${newsTime(news.response.sync.lastSuccessAt)} 수집 · 매체 RSS` : '매체 RSS 직접 수집'}</div>
  </>;
  return <section className="panel hub-news-briefing">
    <div className="panel-heading"><h2>{hasBriefings ? daily.date === daily.today ? '오늘의 브리핑' : '최근 브리핑' : '오늘의 읽을거리'}
      {!hasBriefings && <span className="heading-count">{news.response?.counts.unread ?? '—'}</span>}</h2><Link className="text-button muted" href="/news/">뉴스 허브</Link></div>
    {hasBriefings ? <><HomeBriefingHighlights response={daily}/><details className="daily-home-rss"><summary>RSS 새 기사</summary>{rss}</details></> : rss}
  </section>;
}
