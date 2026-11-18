import type {Entry,Kind} from './store.ts';
import {progressLabel,watchStatuses,watchTypes} from './watch.ts';

export type SearchFilter='all'|'records'|'music'|'games'|'steam'|'watch';
export type EntrySearchHit={entry:Entry;label:string;matchedIn:string;excerpt:string};
const labels:Record<Kind,string>={todo:'할 일',note:'메모',bookmark:'북마크',audio:'오디오 장비',games:'게임',music:'앨범',event:'일정',work:'업무 기록',watch:'작품'};
export const normalizeSearch=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
export const searchTerms=(query:string)=>normalizeSearch(query).split(' ').filter(Boolean);
export function matchesSearch(values:string[],terms:string[]){const text=normalizeSearch(values.join(' '));return terms.every(term=>text.includes(term));}
function excerpt(value:string,terms:string[]){const text=value.replace(/\s+/g,' ').trim(),normalized=normalizeSearch(text),positions=terms.map(t=>normalized.indexOf(t)).filter(p=>p>=0),at=positions.length?Math.min(...positions):0,start=Math.max(0,at-35);return (start?'…':'')+text.slice(start,start+160)+(start+160<text.length?'…':'');}
export function searchEntries(entries:Entry[],query:string,filter:SearchFilter='all'):EntrySearchHit[]{
  if(filter==='steam')return [];const terms=searchTerms(query),normalized=normalizeSearch(query);
  return entries.flatMap((entry,index)=>{
    if(filter==='music'&&entry.kind!=='music'||filter==='games'&&entry.kind!=='games'||filter==='watch'&&entry.kind!=='watch')return [];
    const m=entry.music,g=entry.game,a=entry.audio,w=entry.watch,label=w?watchTypes[w.type]:m?.type==='playlist'?'플레이리스트':labels[entry.kind];
    const fields=[{name:'제목',text:entry.title},{name:'기록',text:[entry.detail,entry.category,entry.status,entry.date,entry.url,label].join(' ')}];
    if(m){fields.push({name:'음악 정보',text:[m.artist,m.genre,m.favoriteTrack,m.releaseDate,m.listenedAt,m.catalog?.title,m.catalog?.artist,m.spotify?.title].filter(Boolean).join(' ')},{name:'태그',text:m.tags.join(' ')});if(m.favorite)fields.push({name:'즐겨찾기',text:'즐겨찾기 좋아하는 플레이리스트'});for(const listen of m.listens??[])fields.push({name:'감상 기록',text:[listen.date,listen.track,listen.equipment,listen.note].join(' ')});}
    if(g)fields.push({name:'게임 정보',text:[...g.tags,g.steam?.name,...(g.steam?.developers??[]),...(g.steam?.genres??[]),g.steamAccount?.appId??g.steam?.appId].filter(Boolean).join(' ')});
    if(a?.type==='gear')fields.push({name:'장비 정보',text:[a.manufacturer,a.model,a.sound,a.connection].join(' ')});
    if(w)fields.push({name:'작품 정보',text:[watchStatuses[w.status],progressLabel(w),w.catalog?.title,w.catalog?.year].filter(Boolean).join(' ')});
    if(!matchesSearch(fields.map(f=>f.text),terms))return [];
    const match=terms.length?fields.find(f=>f.name!=='제목'&&terms.some(t=>normalizeSearch(f.text).includes(t))):undefined,title=normalizeSearch(entry.title),score=!normalized?0:title===normalized?100:title.startsWith(normalized)?80:title.includes(normalized)?60:20;
    return [{entry,label,matchedIn:match?.name??(terms.length?'제목':'최근 기록'),excerpt:excerpt(match?.text||entry.detail||entry.category||label,terms),score,index}];
  }).sort((a,b)=>b.score-a.score||a.index-b.index).map(({score,index,...hit})=>hit);
}
