import type {Entry} from './store.ts';
import {validateSteamRef,type SteamAccountRef} from './steam-account.ts';

export const gamePlatforms=['PC','PlayStation','Nintendo','Xbox','모바일','기타'];
export const gameStatuses=['플레이 예정','플레이 중','완료','위시리스트','보류'];
export type SteamMetadata={appId:number;name:string;developers:string[];publishers:string[];genres:string[];releaseDate:string;comingSoon:boolean;description:string;storeUrl:string;imageUrl:string;checkedAt:string};
export type GameDetails={playMinutes:number|null;rating:number|null;startedAt:string;completedAt:string;tags:string[];steam?:SteamMetadata;steamAccount?:SteamAccountRef};
export const emptyGame=():GameDetails=>({playMinutes:null,rating:null,startedAt:'',completedAt:'',tags:[]});
const day=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
export function steamAppId(value:string):number|null{
  const input=value.trim();let id=input;
  if(!/^\d+$/.test(input))try{if(input.includes('\\')||/\/(?:\.|%2e){1,2}(?:\/|$)/i.test(input.split(/[?#]/)[0]))return null;const url=new URL(input);if(url.protocol!=='https:'||url.hostname!=='store.steampowered.com'||url.username||url.password||url.port)return null;const match=url.pathname.match(/^\/app\/(\d+)(?:\/[^/]*)?\/?$/);if(!match)return null;id=match[1];}catch{return null;}
  const number=Number(id);return /^\d{1,10}$/.test(id)&&Number.isSafeInteger(number)&&number>0&&number<=2147483647?number:null;
}
export function steamImageUrl(value:unknown,appId:number){try{if(typeof value!=='string'||value.length>2000)return '';const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.endsWith('.steamstatic.com')||!url.pathname.includes(`/steam/apps/${appId}/`)||!/^\/(?:store_item_assets\/)?steam\/apps\//.test(url.pathname)||!/\.(?:jpg|jpeg|png|webp)$/i.test(url.pathname))return '';return url.href;}catch{return '';}}
export function validateSteam(input:unknown):SteamMetadata{
  const s=input as SteamMetadata;
  if(!s||!Number.isSafeInteger(s.appId)||steamAppId(String(s.appId))!==s.appId||typeof s.name!=='string'||!s.name.trim()||s.name.length>200||typeof s.releaseDate!=='string'||s.releaseDate.length>100||typeof s.comingSoon!=='boolean'||typeof s.description!=='string'||s.description.length>450||s.storeUrl!==`https://store.steampowered.com/app/${s.appId}/`||typeof s.imageUrl!=='string'||(s.imageUrl&&!steamImageUrl(s.imageUrl,s.appId))||typeof s.checkedAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(s.checkedAt)||s.checkedAt.length>50||!Number.isFinite(Date.parse(s.checkedAt)))throw new Error('Steam 정보의 형식을 확인해주세요.');
  for(const list of [s.developers,s.publishers,s.genres])if(!Array.isArray(list)||list.length>12||list.some(v=>typeof v!=='string'||!v.trim()||v.length>120))throw new Error('Steam 제작사·장르 정보를 확인해주세요.');
  return {appId:s.appId,name:s.name,developers:[...s.developers],publishers:[...s.publishers],genres:[...s.genres],releaseDate:s.releaseDate,comingSoon:s.comingSoon,description:s.description,storeUrl:s.storeUrl,imageUrl:s.imageUrl?steamImageUrl(s.imageUrl,s.appId):'',checkedAt:s.checkedAt};
}
export function validateGame(input:unknown):GameDetails{
  const g=input as GameDetails;
  if(!g||typeof g!=='object'||(g.playMinutes!==null&&(!Number.isSafeInteger(g.playMinutes)||g.playMinutes<0||g.playMinutes>6000000))||(g.rating!==null&&(typeof g.rating!=='number'||!Number.isFinite(g.rating)||g.rating<0||g.rating>5||g.rating*2%1!==0))||typeof g.startedAt!=='string'||typeof g.completedAt!=='string'||(g.startedAt&&!day(g.startedAt))||(g.completedAt&&!day(g.completedAt))||(g.startedAt&&g.completedAt&&g.completedAt<g.startedAt)||!Array.isArray(g.tags)||g.tags.length>8||g.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>30))throw new Error('플레이 시간·별점·날짜·태그를 확인해주세요.');
  const ref=g.steamAccount!==undefined?validateSteamRef(g.steamAccount):undefined;if(ref&&g.steam&&ref.appId!==g.steam.appId)throw new Error('Steam 상점 정보와 연결할 게임의 App ID가 달라요.');
  return {playMinutes:g.playMinutes,rating:g.rating,startedAt:g.startedAt,completedAt:g.completedAt,tags:[...new Set(g.tags.map(t=>t.trim()))],...(g.steam!==undefined?{steam:validateSteam(g.steam)}:{}),...(ref?{steamAccount:ref}:{})};
}
/**
 * The play time a game shows. Steam's total wins whenever it has any minutes; the time recorded by hand only shows
 * for games Steam reports as 0 minutes or does not know (not linked, other platforms). `steam` is undefined while
 * a linked account is still being read, so a hand-recorded value does not flash before Steam's arrives.
 */
export type PlayTimeSource='steam'|'own'|'loading'|null;
export function effectivePlayTime(own:number|null,steam:number|null|undefined,linked:boolean):{minutes:number|null;source:PlayTimeSource}{
  if(typeof steam==='number'&&steam>0)return {minutes:steam,source:'steam'};
  if(linked&&steam===undefined)return {minutes:null,source:'loading'};
  if(own!==null)return {minutes:own,source:'own'};
  if(typeof steam==='number')return {minutes:0,source:'steam'};
  return {minutes:null,source:null};
}
export function playTimeLabel({minutes,source}:{minutes:number|null;source:PlayTimeSource}){
  if(source==='loading')return 'Steam 시간 확인 중';
  if(source==='steam')return `Steam ${playTime(minutes)}`;
  if(source==='own')return `직접 ${playTime(minutes)}`;
  return playTime(null);
}
/** Whether the hand-recorded time is in use, i.e. Steam has no minutes for this game. */
export const ownPlayTimeShown=(steam:number|null|undefined)=>!(typeof steam==='number'&&steam>0);

export function playTime(minutes:number|null){if(minutes===null)return '시간 미기록';if(minutes===0)return '0분';const hours=Math.floor(minutes/60),rest=minutes%60;return `${hours?`${hours.toLocaleString('ko-KR')}시간`:''}${hours&&rest?' ':''}${rest?`${rest}분`:''}`;}
export function gameStats(entries:Entry[]){const games=entries.filter(e=>e.kind==='games'),recorded=games.filter(e=>e.game?.playMinutes!==null&&e.game?.playMinutes!==undefined);return {count:games.length,playing:games.filter(e=>e.status==='플레이 중').length,completed:games.filter(e=>e.status==='완료').length,wishlist:games.filter(e=>e.status==='위시리스트').length,recorded:recorded.length,minutes:recorded.reduce((sum,e)=>sum+(e.game?.playMinutes??0),0)};}

/** PC stars: picking a star sets that score; picking the star the score already sits on takes half a point off (4 → 3.5). */
export function inlineRating(current:number|null,star:number){return current===star?star-0.5:star;}
/** Phone star strip: a position across the strip (0 at the left edge, 1 at the right) in half-star steps, never below 0.5. */
export function ratingFromPosition(fraction:number){const f=Number.isFinite(fraction)?Math.min(Math.max(fraction,0),1):0;return Math.min(5,Math.max(0.5,Math.ceil(f*10)/2));}
export const ratingLabel=(rating:number|null)=>rating===null?'—':rating.toFixed(1);

/** The one-line memo a game row shows is the first line of its play memo (`entry.detail`). */
export function memoLine(detail:string){return (detail.split(/\r?\n/,1)[0]??'').trim();}
/** Writes `line` as the memo's first line and keeps the rest; an empty line removes the first line. */
export function withMemoLine(detail:string,line:string){
  const next=line.replace(/\s+/g,' ').trim(),lines=detail.split(/\r?\n/),rest=detail.trim()?lines.slice(1).join('\n'):'';
  return next?(rest?`${next}\n${rest}`:next):rest.replace(/^\s*\n/,'').trimStart();
}

export type GameGroupBy='none'|'rating'|'genre'|'status'|'platform';
export const gameGroupModes:{id:GameGroupBy;label:string}[]=[{id:'rating',label:'별점'},{id:'genre',label:'장르'},{id:'status',label:'상태'},{id:'platform',label:'플랫폼'},{id:'none',label:'없음'}];
const ratingBuckets:[string,(r:number|null)=>boolean][]=[['★ 4.5 – 5',r=>r!==null&&r>=4.5],['★ 4',r=>r!==null&&r>=4&&r<4.5],['★ 3 – 3.5',r=>r!==null&&r>=3&&r<4],['★ 2.5 이하',r=>r!==null&&r<3],['아직 별점 없음',r=>r===null]];
const statusOrder=['플레이 중','플레이 예정','위시리스트','완료','보류'];
const broadSteamGenres = new Map([
  ['action', 'action'], ['액션', 'action'],
  ['adventure', 'adventure'], ['어드벤처', 'adventure'],
  ['indie', 'indie'], ['인디', 'indie'],
]);
const steamStoreLabels = new Set(['free to play', 'early access', '무료 플레이', '앞서 해보기']);
export function gameGenre(entry: Entry) {
  const genres = (entry.game?.steam?.genres ?? [])
    .map(genre => genre.trim())
    .filter(genre => genre && !steamStoreLabels.has(genre.toLowerCase()));
  const specific = genres.find(genre => !broadSteamGenres.has(genre.toLowerCase()));
  if (specific) return specific;

  const broad = new Set(genres.map(genre => broadSteamGenres.get(genre.toLowerCase())));
  if (broad.has('action') && broad.has('adventure')) return '액션 어드벤처';
  return genres[0] ?? '장르 미기록';
}
const ratingOf=(entry:Entry)=>entry.game?.rating??null;
/** Highest rating first, unrated last, then by title. */
export const byRatingThenTitle=(a:Entry,b:Entry)=>(ratingOf(b)??-1)-(ratingOf(a)??-1)||a.title.localeCompare(b.title,'ko');
/**
 * Splits games into the groups "묶어 보기" shows, in a fixed order: rating bands high to low then unrated, statuses
 * from playing to on hold, platforms in the form's order, genres by size with unrecorded genres last. Inside a group
 * games run from the highest rating, then by title. Empty groups are left out; 'none' keeps the given order as one group.
 */
export function groupGames(entries:Entry[],by:GameGroupBy):{label:string;entries:Entry[]}[]{
  if(by==='none')return entries.length?[{label:'',entries}]:[];
  const sorted=[...entries].sort(byRatingThenTitle);
  if(by==='rating')return ratingBuckets.map(([label,test])=>({label,entries:sorted.filter(e=>test(ratingOf(e)))})).filter(g=>g.entries.length);
  const keyOf=(e:Entry)=>by==='genre'?gameGenre(e):by==='status'?(e.status||'상태 미기록'):(e.category||'플랫폼 미기록');
  const groups=new Map<string,Entry[]>();for(const e of sorted){const key=keyOf(e);groups.set(key,[...(groups.get(key)??[]),e]);}
  const order=by==='status'?statusOrder:by==='platform'?gamePlatforms:null;
  const rank=(label:string)=>{const i=order?order.indexOf(label):-1;return i<0?order?order.length:0:i;};
  const missing=by==='genre'?'장르 미기록':by==='status'?'상태 미기록':'플랫폼 미기록';
  return [...groups].map(([label,list])=>({label,entries:list})).sort((a,b)=>Number(a.label===missing)-Number(b.label===missing)||(order?rank(a.label)-rank(b.label):b.entries.length-a.entries.length)||a.label.localeCompare(b.label,'ko'));
}
/** Average of the rated games in a group, or null when none is rated. */
export function averageRating(entries:Entry[]){const rated=entries.map(ratingOf).filter((r):r is number=>r!==null);return rated.length?rated.reduce((s,r)=>s+r,0)/rated.length:null;}
/** "다음에 할 게임": planned games, the most recently added first. */
export const plannedGames=(entries:Entry[])=>entries.filter(e=>e.status==='플레이 예정').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
