import type {Entry} from './store.ts';

export const gamePlatforms=['PC','PlayStation','Nintendo','Xbox','모바일','기타'];
export const gameStatuses=['플레이 예정','플레이 중','완료','위시리스트','보류'];
export type SteamMetadata={appId:number;name:string;developers:string[];publishers:string[];genres:string[];releaseDate:string;comingSoon:boolean;description:string;storeUrl:string;imageUrl:string;checkedAt:string};
export type GameDetails={playMinutes:number|null;rating:number|null;startedAt:string;completedAt:string;tags:string[];steam?:SteamMetadata};
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
  return {playMinutes:g.playMinutes,rating:g.rating,startedAt:g.startedAt,completedAt:g.completedAt,tags:[...new Set(g.tags.map(t=>t.trim()))],...(g.steam!==undefined?{steam:validateSteam(g.steam)}:{})};
}
export function playTime(minutes:number|null){if(minutes===null)return '시간 미기록';if(minutes===0)return '0분';const hours=Math.floor(minutes/60),rest=minutes%60;return `${hours?`${hours.toLocaleString('ko-KR')}시간`:''}${hours&&rest?' ':''}${rest?`${rest}분`:''}`;}
export function gameStats(entries:Entry[]){const games=entries.filter(e=>e.kind==='games'),recorded=games.filter(e=>e.game?.playMinutes!==null&&e.game?.playMinutes!==undefined);return {count:games.length,playing:games.filter(e=>e.status==='플레이 중').length,completed:games.filter(e=>e.status==='완료').length,wishlist:games.filter(e=>e.status==='위시리스트').length,recorded:recorded.length,minutes:recorded.reduce((sum,e)=>sum+(e.game?.playMinutes??0),0)};}
