export const newsCategories = [
  {id:'audio-music',label:'오디오 기기',short:'AUDIO',accent:'violet'},
  {id:'games',label:'게임',short:'GAMES',accent:'blue'},
  {id:'pc-it',label:'PC · IT',short:'TECHNOLOGY',accent:'teal'},
  {id:'korean-audio',label:'국내 오디오',short:'LOCAL AUDIO',accent:'orange'},
  {id:'music',label:'음악',short:'MUSIC',accent:'violet'},
  {id:'screen',label:'영화·드라마',short:'FILM & SERIES',accent:'orange'},
  {id:'webtoon',label:'웹툰',short:'WEBTOON',accent:'green'},
  {id:'football',label:'축구',short:'FOOTBALL',accent:'blue'},
  {id:'korea',label:'국내 이슈',short:'KOREA',accent:'green'},
  {id:'world',label:'해외',short:'WORLD',accent:'slate'},
] as const;
export type NewsCategory = typeof newsCategories[number]['id'];
export const newsKinds = {
  release:'출시·발표', update:'패치·펌웨어', deal:'할인·가격', availability:'입고·청음',
  music:'신보·재발매', serialization:'연재·완결', squad:'부상·복귀', transfer:'이적·계약', fixture:'경기 일정', performance:'성능·기술', review:'리뷰',
} as const;
export type NewsKind = keyof typeof newsKinds;
export type NewsTopic = {
  id: string;
  label: string;
  terms: string[];
  category: NewsCategory | 'all';
  kinds: NewsKind[];
  muted: boolean;
  steamAppId?: string;
};
export type NewsSourceMode = 'more' | 'less';
export type NewsSourcePreference = { host: string; label: string; mode: NewsSourceMode };
export type NewsPreferences = { revision: number; topics: NewsTopic[]; sourcePreferences: NewsSourcePreference[] };
export const newsTopicLimit = 20;
export const newsSourcePreferenceLimit = 64;
export const steamNewsLimit = 8;
export const starterNewsTopics: NewsTopic[] = [
  { id:'gta', label:'GTA VI', terms:['GTA VI','GTA 6','GTA6','Grand Theft Auto VI','그랜드 테프트 오토 6'], category:'games', kinds:['release','update','performance'], muted:false },
  { id:'fm', label:'Football Manager', terms:['Football Manager','풋볼 매니저','풋볼매니저','FM27','FM26'], category:'games', kinds:['release','update','deal'], muted:false },
  { id:'cyberpunk', label:'사이버펑크 2077', terms:['Cyberpunk 2077','사이버펑크 2077'], category:'games', kinds:['release','update','deal'], muted:false, steamAppId:'1091500' },
  { id:'witcher', label:'위쳐', terms:['The Witcher','위쳐','더 위처'], category:'games', kinds:['release','update','deal'], muted:false, steamAppId:'292030' },
  { id:'korean-games', label:'국내 게임 행사', terms:['지스타','G-STAR','GSTAR','플레이엑스포','PlayX4','대한민국 게임대상'], category:'games', kinds:[], muted:false },
  { id:'iem', label:'국내 오디오', terms:[], category:'korean-audio', kinds:['availability','deal','release'], muted:false },
  { id:'audio-update', label:'오디오 장비', terms:[], category:'audio-music', kinds:['release','update','review','deal'], muted:false },
  { id:'new-music', label:'신보·음반 리뷰', terms:[], category:'music', kinds:['music','review'], muted:false },
  { id:'screen-news', label:'영화·드라마 공개 소식', terms:[], category:'screen', kinds:['release'], muted:false },
  { id:'webtoon-news', label:'웹툰 신작·연재', terms:[], category:'webtoon', kinds:['release','serialization'], muted:false },
  { id:'city', label:'맨시티', terms:['Manchester City','Man City','맨시티','맨체스터 시티'], category:'football', kinds:[], muted:false },
  { id:'epl', label:'EPL', terms:['EPL','프리미어리그','Premier League'], category:'football', kinds:['squad','transfer','fixture'], muted:false },
  { id:'pc-hardware', label:'PC 하드웨어', terms:['CPU','GPU','RTX','GeForce','Radeon','Ryzen','그래픽카드','모니터','SSD','메모리'], category:'pc-it', kinds:['release','update','deal','performance','review'], muted:false },
];
export type NewsRelated = {id:string;url:string;title:string;sourceName:string};
export type NewsRecommendation = {topicId:string;topicLabel:string;kind?:NewsKind;official:boolean;preferredSource?:boolean};
export type NewsArticle = NewsRelated & {sourceUrl:string;description:string;publishedAt:string;firstSeenAt:string;categories:NewsCategory[];language:string;read:boolean;saved:boolean;hidden:boolean;stateUpdatedAt:string|null;recommendation?:NewsRecommendation;related?:NewsRelated[]};
export type FeedStatus = {id:string;name:string;website:string;category:NewsCategory;language:string;checkedAt:string;lastSuccessAt:string|null;ok:boolean;count:number;error:string|null};
export type NewsSync = {running:boolean;lastAttemptAt:string|null;lastSuccessAt:string|null;finishedAt:string|null;nextAutoAt:string|null;sources:FeedStatus[];count:number};
export type NewsResponse = {articles:NewsArticle[];counts:{all:number;unread:number;saved:number};categoryCounts:Record<string,number>;sync:NewsSync;nextCursor:string|null;preferences:NewsPreferences};
export function newsCategory(id:string){return newsCategories.find(c=>c.id===id)??newsCategories[0];}
export function newsTime(date:string,dateOnly=false){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',...(dateOnly?{}:{hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}).format(new Date(date));}
export function newsSourceHost(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.hostname.replace(/^www\./u,'').replace(/\.$/u,'') : '';
  } catch { return ''; }
}
export function newsSourceLabel(value: string) {
  return value.replace(/ · Google 뉴스$/u, '').trim().slice(0, 80);
}
