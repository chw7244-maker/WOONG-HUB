'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Bookmark, ChevronDown, Globe2, Newspaper, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { newsCategories, newsCategory, newsKinds, newsSourceHost, newsSourceLabel, newsSourcePreferenceLimit, newsTime, type FeedStatus, type NewsArticle, type NewsPreferences, type NewsSourceMode } from '@/lib/news';
import type { Entry } from '@/lib/store';
import { webtoonNewsEvents } from '@/lib/watch';
import { NewsPreferencesDialog } from './news-preferences';
import { SectionFilters } from './section-controls';
import { useNews, type NewsView } from './use-news';

const views: { id: NewsView; label: string }[] = [
  { id:'interest', label:'관심 뉴스' }, { id:'all', label:'전체 최신' }, { id:'saved', label:'스크랩' },
];
const emptyTitles: Record<NewsView, string> = {
  interest: '아직 관심 뉴스가 없어요',
  all: '아직 수집된 기사가 없어요',
  saved: '스크랩한 기사가 없어요',
  hidden: '숨긴 기사가 없어요',
};
const directNewsSites = [
  { category:'games', name:'게임메카', url:'https://www.gamemeca.com/news.php' },
  { category:'games', name:'디스이즈게임', url:'https://www.thisisgame.com/' },
  { category:'pc-it', name:'퀘이사존 하드웨어 뉴스', url:'https://quasarzone.com/bbs/qn_hardware' },
];
const sourceErrorLabels: Record<string, string> = {
  timeout:'응답 시간 초과', collection_deadline:'이번 수집 시간 초과', feed_format:'기사 형식 확인 실패',
};
const dateOnlySources = new Set(['웹툰가이드', '네이버웹툰 보도자료', '스포티비뉴스 · 해외축구']);

function sourceResult(source: FeedStatus) {
  if (source.ok) return source.count ? `${source.count}개 확인` : '연결됨 · 표시할 기사 없음';
  if (source.error?.startsWith('http_')) return `연결 오류 (${source.error.slice(5)})`;
  return sourceErrorLabels[source.error ?? ''] ?? '일시 연결 실패';
}

function SourceMeta({ article }: { article: NewsArticle }) {
  return <div className="news-source-meta">
    <span>{article.sourceName}</span><i/>
    <time dateTime={article.publishedAt}>{newsTime(article.publishedAt,dateOnlySources.has(article.sourceName))}</time>
    {article.language !== 'ko' && <span className="news-language">{article.language.toUpperCase()}</span>}
  </div>;
}

export default function NewsHub({ games, documentRevision }: { games: Entry[]; documentRevision: number }) {
  const [category, setCategory] = useState('all');
  const [view, setView] = useState<NewsView>('interest');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [unread, setUnread] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [editor, setEditor] = useState<NewsPreferences | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category'), view = params.get('view');
    if (category && newsCategories.some(item => item.id === category)) setCategory(category);
    if (view === 'all' || view === 'saved' || view === 'hidden') setView(view);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const applyUnread = unread && (view === 'interest' || view === 'all');
  const news = useNews({ category, view, query, date, unread:applyUnread, documentRevision });
  const { response } = news;
  const visible = (response?.articles ?? []).filter(article =>
    article.hidden === (view === 'hidden') && (view !== 'saved' || article.saved) && (!applyUnread || !article.read));
  const activeTopics = response?.preferences.topics.filter(topic => !topic.muted) ?? [];
  const sources = (response?.sync.sources ?? []).filter(source => category === 'all' || source.category === category);
  const successful = sources.filter(source => source.ok).length;
  const quickLinks = directNewsSites.filter(source => category === 'all' || source.category === category);
  const sourceHeading = category === 'all' ? '수집 출처' : `${newsCategory(category).label} 수집 출처`;

  function selectView(nextView: NewsView, nextCategory: string) {
    const url = new URL(window.location.href);
    if (nextView === 'interest') url.searchParams.delete('view');
    else url.searchParams.set('view', nextView);
    if (nextCategory === 'all') url.searchParams.delete('category');
    else url.searchParams.set('category', nextCategory);
    window.history.replaceState(null, '', url);
    setCategory(nextCategory);
    setView(nextView);
  }

  function clearSearch() {
    setSearch('');
    setQuery('');
  }

  function clearConditions() {
    clearSearch();
    setDate('');
    setUnread(false);
    selectView(view, 'all');
  }

  const conditions = [
    { id:'category', label:category === 'all' ? '' : newsCategory(category).label, clear:() => selectView(view, 'all') },
    { id:'search', label:query ? `검색 · ${query}` : '', clear:clearSearch },
    { id:'date', label:date ? `발행일 · ${date.replaceAll('-', '.')}` : '', clear:() => setDate('') },
    { id:'unread', label:applyUnread ? '안 읽은 기사만' : '', clear:() => setUnread(false) },
  ].filter(condition => condition.label);
  const wideningLabel = query || date || applyUnread ? '같은 조건으로 전체 최신 보기'
    : category === 'all' ? '전체 최신 보기' : '이 분야의 전체 최신 보기';
  const feedView = view === 'interest' || view === 'all';
  const collecting = feedView && response?.sync.running;
  const failedSources = feedView && !collecting ? sources.length - successful : 0;
  const emptyTitle = collecting ? '새 기사를 확인하고 있어요'
    : failedSources > 0 && successful === 0 ? '뉴스 출처를 확인하지 못했어요'
    : conditions.length ? '조건에 맞는 기사가 없어요' : emptyTitles[view];

  async function savePreferenceChange(preferences: NewsPreferences, message: string) {
    if (savingPreferences) return;
    setSavingPreferences(true);
    setFeedback('');
    try {
      await news.savePreferences(preferences);
      setFeedback(message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '관심 설정을 저장하지 못했어요.');
    } finally { setSavingPreferences(false); }
  }

  async function muteTopic(id: string, label: string) {
    if (!response) return;
    const preferences = response.preferences;
    await savePreferenceChange({ ...preferences, topics:preferences.topics.map(topic => topic.id === id ? { ...topic, muted:true } : topic) },
      `${label} 주제는 관심 뉴스에서 덜 표시됩니다. 관심 설정에서 다시 팔로우할 수 있어요.`);
  }

  async function changeSource(article: NewsArticle, mode: NewsSourceMode) {
    if (!response || savingPreferences) return;
    const host = newsSourceHost(article.sourceUrl);
    const label = newsSourceLabel(article.sourceName);
    if (!host || !label) return;
    const preferences = response.preferences;
    const current = preferences.sourcePreferences ?? [];
    const existing = current.find(source => source.host === host);
    if (!existing && current.length >= newsSourcePreferenceLimit) {
      setFeedback(`출처 선호는 ${newsSourcePreferenceLimit}곳까지 저장할 수 있어요. 관심 설정에서 기존 출처를 해제해 주세요.`);
      return;
    }
    const sourcePreferences = current.filter(source => source.host !== host);
    const reset = existing?.mode === mode;
    if (!reset) sourcePreferences.push({ host, label, mode });
    await savePreferenceChange({ ...preferences, sourcePreferences }, reset ? `${label} 출처 선호를 해제했어요.`
      : `${label} 소식을 관심 뉴스에서 ${mode === 'more' ? '더 위에' : '더 아래에'} 표시해요.`);
  }

  return <div className="news-hub">
    <header className="page-heading section-heading news-page-heading">
      <div><h1>뉴스</h1></div>
      <div className="news-heading-actions">
        <button type="button" className="button secondary news-preferences-trigger" disabled={!response || savingPreferences} onClick={() => response && setEditor(response.preferences)}>
          <SlidersHorizontal size={16}/>관심 설정
        </button>
        <button type="button" className="button secondary news-refresh" disabled={response?.sync.running} onClick={() => void news.refresh()}>
          <RefreshCw size={15} className={response?.sync.running ? 'spinning' : ''}/>{response?.sync.running ? '수집 중' : '새 기사 확인'}
        </button>
      </div>
    </header>

    <div className="news-controls">
      <div className="news-view-tabs" role="group" aria-label="뉴스 보기">
        {views.map(item => <button key={item.id} type="button" className={view === item.id ? 'selected' : ''} aria-pressed={view === item.id} onClick={() => selectView(item.id, category)}>
          {item.id === 'saved' && <Bookmark size={14}/>}
          {item.label}
          {item.id === 'saved' && response && <span>{response.counts.saved}</span>}
        </button>)}
      </div>
      <div className="news-filters">
        <div className="news-search"><Search size={16} aria-hidden="true"/><input aria-label="기사 검색" placeholder="제목·매체 검색" value={search} maxLength={120} onChange={event => setSearch(event.target.value)}/>
          {search && <button type="button" aria-label="검색어 지우기" onClick={clearSearch}><X size={14} aria-hidden="true"/></button>}
        </div>
        <SectionFilters active={Number(Boolean(date)) + Number(applyUnread) + Number(view === 'hidden')}>
          <label><span>발행 날짜</span><input aria-label="기사 발행 날짜" className="news-date-filter" type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
          {date && <button type="button" className="icon-button" aria-label="날짜 초기화" onClick={() => setDate('')}><X size={14}/></button>}
          {(view === 'interest' || view === 'all') && <label className="news-unread-filter"><input type="checkbox" checked={unread} onChange={event => setUnread(event.target.checked)}/>안 읽은 기사만</label>}
          <button type="button" className="text-button muted" onClick={() => selectView(view === 'hidden' ? 'interest' : 'hidden', 'all')}>{view === 'hidden' ? '관심 뉴스로 돌아가기' : '숨긴 기사 보기'}</button>
        </SectionFilters>
      </div>
    </div>

    <nav className="news-topics-nav" aria-label="뉴스 분야">
      <button type="button" aria-pressed={category === 'all'} className={category === 'all' ? 'selected' : ''} onClick={() => selectView(view, 'all')}>전체 분야</button>
      {newsCategories.map(item => <button key={item.id} type="button" aria-pressed={category === item.id} className={category === item.id ? 'selected' : ''} onClick={() => selectView(view, item.id)}>{item.label}</button>)}
    </nav>

    {conditions.length > 0 && <div className="news-active-conditions" role="group" aria-label="적용한 뉴스 조건">
      {conditions.map(condition => <button key={condition.id} type="button" className="news-condition" onClick={condition.clear} aria-label={`${condition.label} 해제`}>
        <span>{condition.label}</span><X size={14} aria-hidden="true"/>
      </button>)}
      {conditions.length > 1 && <button type="button" className="text-button muted" onClick={clearConditions}>조건 초기화</button>}
    </div>}

    {(feedback || news.error || news.message) && <div className="news-notice" role="status">
      <span>{news.error || feedback || news.message}</span>
      {news.error && <button type="button" className="text-button blue" onClick={() => void news.reload()}>다시 불러오기</button>}
    </div>}
    <section className="journal-reading-section" aria-busy={news.loading}>
      <div className="journal-section-heading">
        <h2>{view === 'hidden' ? '숨긴 기사' : views.find(item => item.id === view)?.label}</h2>
        {view === 'saved' && <a href="/api/news/export" className="text-button muted" download><ArrowDownToLine size={15}/>스크랩 백업</a>}
        {view === 'interest' && response && <span className="news-follow-count">주제 {activeTopics.length}개{response.followedWebtoons ? ` · 웹툰 ${response.followedWebtoons}편` : ''}</span>}
      </div>
      {news.loading && !response ? <div className="news-loading"><RefreshCw className="spinning" size={22}/><p>기사를 불러오는 중이에요.</p></div>
        : visible.length ? <div className="news-reading-list">
          {visible.map(article => <NewsRow key={article.id} article={article} news={news} onMute={muteTopic} onSource={changeSource} savingPreferences={savingPreferences}/>)}
        </div> : response && <div className="collection-empty news-results-empty">
          <h3>{emptyTitle}</h3>
          {failedSources > 0 && <p className="news-source-warning">최근 수집에서 출처 {sources.length}곳 중 {failedSources}곳을 확인하지 못했어요. <a href="#news-sources" onClick={() => setSourcesOpen(true)}>수집 상태 보기</a></p>}
          {view === 'saved' && !conditions.length && <p>기사 오른쪽의 북마크를 누르면 여기에 모여요.</p>}
          {view === 'interest' && <div className="news-empty-actions">
            <button type="button" className="button secondary" onClick={() => selectView('all', category)}>{wideningLabel}</button>
            {!conditions.length && <button type="button" className="text-button blue" disabled={savingPreferences} onClick={() => setEditor(response.preferences)}>관심 설정</button>}
          </div>}
        </div>}
      {response?.nextCursor && <button type="button" disabled={news.loading} className="news-more button secondary" onClick={() => void news.more()}>{news.loading ? '불러오는 중' : '기사 더 보기'}<ChevronDown size={14}/></button>}
    </section>

    <section id="news-sources" className="news-source-section">
      <button type="button" className="news-source-toggle" onClick={() => setSourcesOpen(value => !value)} aria-expanded={sourcesOpen}>
        <span><Globe2 size={16}/>{sourceHeading}{sources.length ? ` · ${successful}/${sources.length} 연결` : ''}</span><ChevronDown size={16}/>
      </button>
      {sourcesOpen && <div className="news-source-details">
        <p>{sources.length && response?.sync.finishedAt ? `최근 수집 확인 ${newsTime(response.sync.finishedAt)} KST` : '표시할 출처 확인 기록이 아직 없어요.'}</p>
        <div className="source-status-grid">{sources.map(source => <div key={source.id}>
          <span className={`status-dot ${source.ok ? '' : 'pending'}`} aria-hidden="true"/>
          <a href={source.website} target="_blank" rel="noreferrer">{source.name}{source.id.startsWith('steam-') ? ` · 앱 ${source.id.slice(6)}` : ''}<ArrowUpRight size={12}/></a>
          <small>{sourceResult(source)}</small>
          <span className="source-last-success">{source.lastSuccessAt ? <>최근 성공 <time dateTime={source.lastSuccessAt}>{newsTime(source.lastSuccessAt)} KST</time></> : '최근 성공 시각 미확인'}</span>
        </div>)}</div>
        {quickLinks.length > 0 && <div className="news-direct-sources">
          <span>웹 기사 바로가기</span>
          {quickLinks.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.name}<ArrowUpRight size={13}/></a>)}
        </div>}
        <p>한국어 기사와 관련 커뮤니티 글을 수집합니다. 페이지를 열 때 마지막 확인 후 한 시간이 지났으면 새로 확인합니다.</p>
      </div>}
    </section>

    {editor && <NewsPreferencesDialog preferences={editor} games={games} onClose={() => setEditor(null)} onSave={async preferences => {
      await news.savePreferences(preferences);
      setFeedback('관심 설정을 저장했어요.');
    }}/>}
  </div>;
}

function NewsRow({ article, news, onMute, onSource, savingPreferences }: {
  article: NewsArticle;
  news: ReturnType<typeof useNews>;
  onMute: (id: string, label: string) => Promise<void>;
  onSource: (article: NewsArticle, mode: NewsSourceMode) => Promise<void>;
  savingPreferences: boolean;
}) {
  const category = newsCategory(article.categories[0]);
  const rec = article.recommendation;
  const recommendationKind = rec?.webtoonEvent ? webtoonNewsEvents[rec.webtoonEvent] : rec?.kind ? newsKinds[rec.kind] : '';
  const sourceHost = newsSourceHost(article.sourceUrl);
  const sourceMode = news.response?.preferences.sourcePreferences?.find(source => source.host === sourceHost)?.mode;
  return <article className={`news-reading-row ${article.read ? 'article-read' : ''}`}>
    <div className="news-reading-copy">
      <a href={article.url} target="_blank" rel="noreferrer" onClick={() => { if (!article.read) news.setArticleState(article, 'read', true); }}>
        <h3>{article.title}<ArrowUpRight size={14} aria-hidden="true"/></h3>
      </a>
      <div className="news-reading-meta"><SourceMeta article={article}/><span className={`news-category-tag ${category.accent}`}>{category.label}</span></div>
      {rec && <p className="news-recommendation">추천 · {rec.topicLabel}{recommendationKind ? ` · ${recommendationKind}` : ''}{rec.official ? ' · 공식 원문' : ''}{rec.preferredSource ? ' · 선호 출처' : ''}</p>}
      {article.description && <p className="news-reading-description">{article.description}</p>}
    </div>
    <button type="button" className="news-bookmark" aria-pressed={article.saved} disabled={news.pending.has(`${article.id}:saved`)} aria-label={`${article.title} 스크랩`} title={article.saved ? '스크랩 해제' : '스크랩'} onClick={() => news.setArticleState(article, 'saved', !article.saved)}>
      <Bookmark size={20} fill={article.saved ? 'currentColor' : 'none'} aria-hidden="true"/>
    </button>
    <div className="news-reading-details">
      {rec?.workId && <Link className="text-button blue news-work-link" href={`/watch/?${new URLSearchParams({ work:rec.workId })}`} aria-label={`${rec.topicLabel} 작품 기록 보기`}>작품 기록 보기</Link>}
      {!!article.related?.length && <details className="news-related">
        <summary>같은 소식 {article.related.length}건 더 보기</summary>
        <ul>{article.related.map(item => <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.sourceName} · {item.title}<ArrowUpRight size={13} aria-hidden="true"/></a></li>)}</ul>
      </details>}
      <details className="news-row-options">
        <summary aria-label={`${article.title} 기사 옵션`}>기사 옵션</summary>
        <div className="news-row-actions">
          <button type="button" disabled={news.pending.has(`${article.id}:read`)} onClick={() => news.setArticleState(article, 'read', !article.read)}>{article.read ? '읽지 않음으로 표시' : '읽음으로 표시'}</button>
          <button type="button" disabled={news.pending.has(`${article.id}:hidden`)} onClick={() => news.setArticleState(article, 'hidden', !article.hidden)}>{article.hidden ? '숨김 해제' : '기사 숨기기'}</button>
          {rec && !rec.workId && <button type="button" disabled={savingPreferences} onClick={() => void onMute(rec.topicId, rec.topicLabel)}>이 주제 덜 보기</button>}
        </div>
        {sourceHost && <div className="news-row-actions" role="group" aria-label={`${article.sourceName} 출처 선호`}>
          <button type="button" aria-pressed={sourceMode === 'more'} disabled={savingPreferences} onClick={() => void onSource(article, 'more')}>이 출처 더 보기</button>
          <button type="button" aria-pressed={sourceMode === 'less'} disabled={savingPreferences} onClick={() => void onSource(article, 'less')}>이 출처 덜 보기</button>
        </div>}
      </details>
    </div>
  </article>;
}

export function HomeNews({ documentRevision }: { documentRevision: number }) {
  const news = useNews({ limit:12, documentRevision });
  const candidates = (news.response?.articles ?? []).filter(article => !article.hidden);
  const topics = new Set<string>();
  const diverse = candidates.filter(article => {
    const id = article.recommendation?.topicId ?? article.id;
    if (topics.has(id)) return false;
    topics.add(id);
    return true;
  });
  const articles = [...diverse, ...candidates.filter(article => !diverse.includes(article))].slice(0,3);
  return <section className="panel hub-news-highlights">
    <div className="panel-heading"><h2>관심 뉴스</h2><Link className="text-button muted" href="/news/">뉴스 더 보기<ArrowUpRight size={14}/></Link></div>
    {articles.length ? <div className="home-news-list">{articles.map((article, index) => <a key={article.id} href={article.url} target="_blank" rel="noreferrer" onClick={() => { if (!article.read) news.setArticleState(article, 'read', true); }}>
      {index === 0 ? <img className="home-news-thumbnail" src="/news-fallback.jpg" width={48} height={36} alt="" loading="lazy"/>
        : <span className={`home-news-dot ${newsCategory(article.categories[0]).accent}`}/>}
      <div><h3>{article.title}</h3><SourceMeta article={article}/></div><ArrowUpRight size={14}/>
    </a>)}</div> : <div className="home-news-empty">
      <Newspaper size={24}/><p>{news.error || (news.loading || news.response?.sync.running ? '새 소식을 확인하고 있어요.' : '새 관심 뉴스가 없어요.')}</p>
      <Link href="/news/?view=all" className="text-button blue">전체 최신 보기</Link>
    </div>}
  </section>;
}
