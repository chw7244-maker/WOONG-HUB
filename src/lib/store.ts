export type Kind = 'todo' | 'note' | 'bookmark' | 'audio' | 'games' | 'music' | 'event' | 'work';
import {validateAudio,type AudioDetails} from './audio.ts';
import {validateGame,type GameDetails} from './games.ts';
import {validateMusic,type MusicDetails} from './music.ts';
export type Entry = { id: string; kind: Kind; title: string; detail: string; category: string; status: string; url: string; date: string; done: boolean; createdAt: string; audio?:AudioDetails; game?:GameDetails; music?:MusicDetails };
export type Preferences = { theme: 'dark' | 'light'; city: string; widgets: string[]; calendarHiddenSources?:string[] };
export type HubData = { version: 1; entries: Entry[]; preferences: Preferences };
export const KEY = 'woong-hub:v1';
export const kinds: Kind[] = ['todo','note','bookmark','audio','games','music','event','work'];
export const widgets = ['weather','calendar','todos','bookmarks','news','interests','note'];
export const cities: Record<string, {label: string; lat: number; lon: number}> = {
  seoul: {label:'서울',lat:37.5665,lon:126.978}, busan: {label:'부산',lat:35.1796,lon:129.0756}, incheon: {label:'인천',lat:37.4563,lon:126.7052}, daegu:{label:'대구',lat:35.8714,lon:128.6014}, daejeon:{label:'대전',lat:36.3504,lon:127.3845}, gwangju:{label:'광주',lat:35.1595,lon:126.8526}, jeju:{label:'제주',lat:33.4996,lon:126.5312}
};
export const initial: HubData = {version:1, entries:[], preferences:{theme:'dark',city:'seoul',widgets}};
export function safeUrl(value: string): string { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
export function validateData(input: unknown): HubData {
  if (!input || typeof input !== 'object') throw new Error('올바른 HUB 백업 파일이 아닙니다.');
  const d = input as HubData;
  if(d.version !== 1 || !Array.isArray(d.entries) || d.entries.length > 10000 || !d.preferences) throw new Error('지원하지 않는 백업 형식입니다.');
  const ids = new Set<string>();
  for(const e of d.entries) {
    if(!e || !kinds.includes(e.kind) || typeof e.done !== 'boolean' || ['id','title','detail','category','status','url','date','createdAt'].some(k=>typeof e[k as keyof Entry] !== 'string') || !e.id || e.id.length>200 || !e.title.trim() || e.title.length > 200 || e.detail.length > 10000 || e.category.length>100 || e.status.length>100 || e.url.length>2000 || e.createdAt.length>50 || !Number.isFinite(Date.parse(e.createdAt)) || ids.has(e.id)) throw new Error('기록의 형식을 확인해주세요.');
    if(e.url && !safeUrl(e.url)) throw new Error('허용되지 않는 링크가 포함되어 있습니다.');
    if(e.audio!==undefined){if(e.kind!=='audio')throw new Error('오디오 상세는 오디오 기록에만 저장할 수 있습니다.');validateAudio(e.audio);if(e.audio.type==='setup'&&e.audio.deviceIds.includes(e.id))throw new Error('조합에 자기 자신을 넣을 수 없습니다.');}
    if(e.game!==undefined){if(e.kind!=='games')throw new Error('게임 상세는 게임 기록에만 저장할 수 있습니다.');validateGame(e.game);}
    if(e.music!==undefined){if(e.kind!=='music')throw new Error('음악 상세는 앨범 기록에만 저장할 수 있습니다.');validateMusic(e.music);}
    if(e.date && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(e.date)) throw new Error('날짜의 형식을 확인해주세요.');
    if(e.date){const date=new Date(`${e.date.slice(0,10)}T00:00:00Z`);if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==e.date.slice(0,10) || (e.date.includes('T')&&(Number(e.date.slice(11,13))>23||Number(e.date.slice(14,16))>59)))throw new Error('유효하지 않은 날짜입니다.');}
    ids.add(e.id);
  }
  const p=d.preferences;
  if(p.calendarHiddenSources!==undefined&&(!Array.isArray(p.calendarHiddenSources)||p.calendarHiddenSources.length>100||p.calendarHiddenSources.some(id=>typeof id!=='string'||!id||id.length>200)))throw new Error('캘린더 표시 설정을 확인해주세요.');
  if(!['dark','light'].includes(p.theme) || !Object.hasOwn(cities,p.city) || !Array.isArray(p.widgets) || p.widgets.length>widgets.length || p.widgets.some(w=>!widgets.includes(w))) throw new Error('설정의 형식이 올바르지 않습니다.');
  // Keep the persisted shape explicit, including when importing untrusted JSON.
  return { version:1, entries:d.entries.map(e=>({id:e.id,kind:e.kind,title:e.title,detail:e.detail,category:e.category,status:e.status,url:e.url,date:e.date,done:e.done,createdAt:e.createdAt,...(e.audio!==undefined?{audio:validateAudio(e.audio)}:{}),...(e.game!==undefined?{game:validateGame(e.game)}:{}),...(e.music!==undefined?{music:validateMusic(e.music)}:{})})),preferences:{theme:p.theme,city:p.city,widgets:[...new Set(p.widgets)],...(p.calendarHiddenSources!==undefined?{calendarHiddenSources:[...new Set(p.calendarHiddenSources)]}:{})} };
}
export function todayKST(date = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export function koreanDate(value: string) { if(!value) return ''; const [y,m,d] = value.slice(0,10).split('-'); return `${Number(m)}월 ${Number(d)}일${value.includes('T') ? ` ${value.slice(11,16)}` : ''}`; }
