import type {Entry} from './store.ts';

/** What "무엇이든 적기" will save: a link becomes a bookmark, a date makes a to-do due that day, anything else a note. */
export type Capture=
  |{kind:'bookmark';title:string;url:string;domain:string}
  |{kind:'todo';title:string;date:string;dateText:string}
  |{kind:'note';title:string;detail:string}
  |{kind:'empty'};

const weekdays=['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
const pad=(n:number)=>String(n).padStart(2,'0');
const isoDay=(y:number,m:number,d:number)=>{const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?`${y}-${pad(m)}-${pad(d)}`:null;};
const addDays=(day:string,n:number)=>{const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);};
const weekdayOf=(day:string)=>new Date(day+'T00:00:00Z').getUTCDay();

// 오늘 · 내일 · 모레, 월요일~일요일 (이번 주/다음 주), 12. 1. · 12.1 · 12/1 · 12월 1일, with 까지/에/엔 after it.
// The dotted form needs a space after the first dot or a closing dot (12. 1 · 12. 1. · 12.1.), so 3.5mm or v2.5 are not dates.
const datePattern=/(다음\s?주\s?)?(오늘|내일|모레|[월화수목금토일]요일)|(\d{1,2})\s?월\s?(\d{1,2})\s?일|(?<![\w.])(\d{1,2})(?:\s?\.\s(\d{1,2})\.?|\.(\d{1,2})\.|\/(\d{1,2}))(?![\dA-Za-z])/;
const particle=/^(?:까지|에는|에|엔|날)(?=\s|$)/;

/** The due day a date phrase points at, seen from `today` (YYYY-MM-DD, Korean time). Month-day dates already past roll to next year. */
export function dueDay(match:RegExpMatchArray,today:string):string|null{
  const [, nextWeek, word, km, kd, nm, d1, d2, d3]=match,nd=d1??d2??d3;
  if(word==='오늘')return today;if(word==='내일')return addDays(today,1);if(word==='모레')return addDays(today,2);
  if(word){const target=weekdays.indexOf(word),ahead=(target-weekdayOf(today)+7)%7;return addDays(today,nextWeek?ahead+7:ahead);}
  const month=Number(km??nm),day=Number(kd??nd),year=Number(today.slice(0,4));
  const sameYear=isoDay(year,month,day);if(!sameYear)return null;
  return sameYear<today?isoDay(year+1,month,day):sameYear;
}
const tidy=(text:string)=>text.replace(/\s+/g,' ').trim();

/** Reads one capture: the first link wins, then the first date phrase, then it is a note. */
export function detectCapture(input:string,today:string):Capture{
  const text=input.trim();if(!text)return {kind:'empty'};
  const link=text.match(/https?:\/\/[^\s<>"]+|(?<![\w@])www\.[^\s<>"]+/i);
  if(link){
    const url=link[0].replace(/[),.]+$/,'');const full=/^https?:\/\//i.test(url)?url:`https://${url}`;
    let domain='';try{domain=new URL(full).hostname.replace(/^www\./,'');}catch{domain='';}
    if(domain){const rest=tidy(text.replace(link[0],''));return {kind:'bookmark',title:(rest||domain).slice(0,200),url:full.slice(0,2000),domain};}
  }
  const firstLine=text.split(/\r?\n/)[0];
  const date=firstLine.match(datePattern),due=date?dueDay(date,today):null;
  if(date&&due){
    const before=firstLine.slice(0,date.index),after=firstLine.slice((date.index??0)+date[0].length).replace(/^\s*/,'').replace(particle,'');
    const title=tidy(`${before} ${after}`)||tidy(firstLine);
    return {kind:'todo',title:title.slice(0,200),date:due,dateText:tidy(date[0])};
  }
  const lines=text.split(/\r?\n/);
  return {kind:'note',title:tidy(lines[0]).slice(0,200),detail:lines.slice(1).join('\n').trim().slice(0,10000)};
}

/** The label under the box while typing. */
export function captureLabel(capture:Capture,today:string){
  if(capture.kind==='empty')return '적으면 종류를 알아서 골라요';
  if(capture.kind==='bookmark')return `북마크로 저장 · ${capture.domain}`;
  if(capture.kind==='todo')return `할 일로 저장 · ${dueLabel(capture.date,today)}`;
  return '메모로 저장';
}

const base=(now:Date)=>({id:crypto.randomUUID(),detail:'',category:'',status:'',url:'',date:'',done:false,createdAt:now.toISOString()});
/** The record a capture saves as. */
export function captureEntry(capture:Exclude<Capture,{kind:'empty'}>,now=new Date()):Entry{
  if(capture.kind==='bookmark')return {...base(now),kind:'bookmark',title:capture.title,url:capture.url};
  if(capture.kind==='todo')return {...base(now),kind:'todo',title:capture.title,date:capture.date};
  return {...base(now),kind:'note',title:capture.title,detail:capture.detail};
}
/**
 * Changes a just-saved record to another kind ("저장 뒤 종류 바꾸기"). A bookmark needs a link, so only a record with a
 * link can become one; a to-do keeps its due day when it has one.
 */
export function convertEntry(entry:Entry,kind:'note'|'todo'|'bookmark'):Entry|null{
  if(entry.kind===kind)return entry;
  if(kind==='bookmark'&&!entry.url)return null;
  return {...entry,kind,done:kind==='todo'?entry.done:false,date:kind==='todo'?entry.date:'',url:kind==='todo'?'':entry.url};
}

/** How a due day reads next to a to-do: 오늘, 내일, 어제, this week's weekday, or a month and day. */
export function dueLabel(date:string,today:string){
  const day=date.slice(0,10);if(!day)return '';
  const diff=Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
  if(diff===0)return '오늘';if(diff===1)return '내일';if(diff===-1)return '어제';if(diff===2)return '모레';
  if(diff>2&&diff<7&&weekdayOf(day)>weekdayOf(today))return weekdays[weekdayOf(day)];
  return `${Number(day.slice(5,7))}. ${Number(day.slice(8,10))}.`;
}
/** Open to-dos due from today through Sunday (Korean week), earliest first; overdue ones are listed separately by the to-do card. */
export function dueThisWeek(entries:Entry[],today:string){
  if(!today)return [];
  const end=addDays(today,(7-weekdayOf(today))%7);
  return entries.filter(e=>e.kind==='todo'&&!e.done&&e.date&&e.date.slice(0,10)>=today&&e.date.slice(0,10)<=end).sort((a,b)=>a.date.localeCompare(b.date));
}
/** Open to-dos first (overdue, then by due day, undated last), done ones after. */
export function sortTodos(entries:Entry[]){
  return [...entries].sort((a,b)=>Number(a.done)-Number(b.done)||(a.date?0:1)-(b.date?0:1)||a.date.localeCompare(b.date)||b.createdAt.localeCompare(a.createdAt));
}
