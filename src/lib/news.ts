export const newsCategories = [
  {id:'audio-music',label:'오디오 · 음악',short:'AUDIO & MUSIC',accent:'violet'},
  {id:'games',label:'게임',short:'GAMES',accent:'blue'},
  {id:'pc-it',label:'PC · IT',short:'TECHNOLOGY',accent:'teal'},
  {id:'korean-audio',label:'국내 오디오',short:'LOCAL AUDIO',accent:'orange'},
  {id:'music',label:'음악',short:'MUSIC',accent:'violet'},
  {id:'football',label:'축구',short:'FOOTBALL',accent:'blue'},
  {id:'korea',label:'국내 이슈',short:'KOREA',accent:'green'},
  {id:'world',label:'해외',short:'WORLD',accent:'slate'},
] as const;
export type NewsCategory = typeof newsCategories[number]['id'];
export const newsKinds = {
  release:'출시·발표', update:'패치·펌웨어', deal:'할인·가격', availability:'입고·청음',
  music:'신보·재발매', squad:'부상·복귀', transfer:'이적·계약', fixture:'경기 일정', performance:'성능·기술', review:'리뷰',
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
export type NewsPreferences = { revision: number; topics: NewsTopic[] };
export const newsTopicLimit = 20;
export const steamNewsLimit = 8;
export const starterNewsTopics: NewsTopic[] = [
  { id:'gta', label:'GTA VI', terms:['GTA VI','GTA 6','GTA6','Grand Theft Auto VI','그랜드 테프트 오토 6'], category:'games', kinds:['release','update','performance'], muted:false },
  { id:'fm', label:'Football Manager', terms:['Football Manager','풋볼 매니저','풋볼매니저','FM27','FM26'], category:'games', kinds:['release','update','deal'], muted:false },
  { id:'cyberpunk', label:'사이버펑크 2077', terms:['Cyberpunk 2077','사이버펑크 2077'], category:'games', kinds:['release','update','deal'], muted:false, steamAppId:'1091500' },
  { id:'witcher', label:'위쳐', terms:['The Witcher','위쳐','더 위처'], category:'games', kinds:['release','update','deal'], muted:false, steamAppId:'292030' },
  { id:'korean-games', label:'국내 게임 행사', terms:['지스타','G-STAR','GSTAR','플레이엑스포','PlayX4','대한민국 게임대상'], category:'games', kinds:[], muted:false },
  { id:'iem', label:'국내 오디오', terms:[], category:'korean-audio', kinds:['availability','deal','release'], muted:false },
  { id:'audio-update', label:'오디오 장비', terms:['DAC','DAP','IEM','headphone','earphone','헤드폰','이어폰','펌웨어'], category:'audio-music', kinds:['release','update'], muted:false },
  { id:'new-music', label:'음악 신보', terms:[], category:'music', kinds:['music'], muted:false },
  { id:'city', label:'맨시티', terms:['Manchester City','Man City','맨시티','맨체스터 시티'], category:'football', kinds:['squad','transfer','fixture'], muted:false },
  { id:'pc-hardware', label:'PC 하드웨어', terms:['CPU','GPU','RTX','GeForce','Radeon','Ryzen','그래픽카드','모니터','SSD','메모리'], category:'pc-it', kinds:['release','update','deal','performance','review'], muted:false },
];
export type NewsRelated = {id:string;url:string;title:string;sourceName:string};
export type NewsRecommendation = {topicId:string;topicLabel:string;kind?:NewsKind;official:boolean};
export type NewsArticle = NewsRelated & {sourceUrl:string;description:string;publishedAt:string;firstSeenAt:string;categories:NewsCategory[];language:string;read:boolean;saved:boolean;hidden:boolean;stateUpdatedAt:string|null;recommendation?:NewsRecommendation;related?:NewsRelated[]};
export type FeedStatus = {id:string;name:string;website:string;category:NewsCategory;language:string;checkedAt:string;ok:boolean;count:number;error:string|null};
export type NewsSync = {running:boolean;lastAttemptAt:string|null;lastSuccessAt:string|null;finishedAt:string|null;nextAutoAt:string|null;sources:FeedStatus[];count:number};
export type NewsResponse = {articles:NewsArticle[];counts:{all:number;unread:number;saved:number};categoryCounts:Record<string,number>;sync:NewsSync;nextCursor:string|null;preferences:NewsPreferences};
export function newsCategory(id:string){return newsCategories.find(c=>c.id===id)??newsCategories[0];}
export function newsTime(date:string){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(date));}
