export const newsCategories = [
  {id:'audio-music',label:'오디오 · 음악',short:'AUDIO & MUSIC',accent:'violet'},
  {id:'games',label:'게임',short:'GAMES',accent:'blue'},
  {id:'pc-it',label:'PC · IT',short:'TECHNOLOGY',accent:'teal'},
  {id:'korean-audio',label:'국내 오디오',short:'LOCAL AUDIO',accent:'orange'},
  {id:'korea',label:'국내 이슈',short:'KOREA',accent:'green'},
  {id:'world',label:'해외',short:'WORLD',accent:'slate'},
] as const;
export type NewsCategory = typeof newsCategories[number]['id'];
export type NewsArticle = {id:string;title:string;url:string;sourceName:string;sourceUrl:string;description:string;publishedAt:string;firstSeenAt:string;categories:NewsCategory[];language:string;read:boolean;saved:boolean;hidden:boolean;stateUpdatedAt:string|null};
export type FeedStatus = {id:string;name:string;website:string;category:NewsCategory;language:string;checkedAt:string;ok:boolean;count:number;error:string|null};
export type NewsSync = {running:boolean;lastAttemptAt:string|null;lastSuccessAt:string|null;finishedAt:string|null;nextAutoAt:string|null;sources:FeedStatus[];count:number};
export type NewsResponse = {articles:NewsArticle[];counts:{all:number;unread:number;saved:number};categoryCounts:Record<string,number>;sync:NewsSync;nextCursor:string|null};
export function newsCategory(id:string){return newsCategories.find(c=>c.id===id)??newsCategories[0];}
export function newsTime(date:string){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(date));}
