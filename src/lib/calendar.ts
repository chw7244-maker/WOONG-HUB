import type {Entry} from './store.ts';
export type CalendarSource={id:string;name:string;provider:'notion'|'google'};
export type CalendarEvent={id:string;sourceId:string;title:string;url:string;allDay:boolean;start:string;end:string};
export type CalendarSnapshot={version:1;timeZone:'Asia/Seoul';syncedAt:string;rangeStart:string;rangeEnd:string;sources:CalendarSource[];events:CalendarEvent[]};
export type CalendarResponse={revision:number;snapshot:CalendarSnapshot|null};
const validDay=(v:unknown):v is string=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
const validInstant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/.test(v)&&validDay(v.slice(0,10))&&Number(v.slice(11,13))<24&&Number.isFinite(Date.parse(v));
export function calendarEventUrl(value:unknown){try{if(typeof value!=='string'||value.length>4000)return '';const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(['calendar.notion.so','notion.so','www.notion.so','app.notion.com','calendar.google.com'].includes(u.hostname)||(u.hostname==='www.google.com'&&u.pathname.startsWith('/calendar/')))?u.href:'';}catch{return '';}}
export function validateCalendar(input:unknown):CalendarSnapshot{
  const d=input as CalendarSnapshot;
  if(!d||d.version!==1||d.timeZone!=='Asia/Seoul'||!validInstant(d.syncedAt)||!validDay(d.rangeStart)||!validDay(d.rangeEnd)||d.rangeEnd<=d.rangeStart||Date.parse(d.rangeEnd)-Date.parse(d.rangeStart)>184*86400000||!Array.isArray(d.sources)||!d.sources.length||d.sources.length>20||!Array.isArray(d.events)||d.events.length>4000)throw new Error('invalid_calendar');
  const sources=new Set<string>();
  for(const s of d.sources){if(!s||typeof s.id!=='string'||!s.id||s.id.length>200||typeof s.name!=='string'||!s.name.trim()||s.name.length>200||!['notion','google'].includes(s.provider)||sources.has(s.id))throw new Error('invalid_source');sources.add(s.id);}
  const ids=new Set<string>();
  for(const e of d.events){if(!e||typeof e.id!=='string'||!e.id||e.id.length>400||!sources.has(e.sourceId)||typeof e.title!=='string'||!e.title.trim()||e.title.length>2000||typeof e.allDay!=='boolean'||typeof e.url!=='string'||(e.url&&!calendarEventUrl(e.url)))throw new Error('invalid_event');
    const key=e.sourceId+':'+e.id;if(ids.has(key))throw new Error('duplicate_event');ids.add(key);
    if(e.allDay?(!validDay(e.start)||!validDay(e.end)||e.end<=e.start):(!validInstant(e.start)||!validInstant(e.end)||Date.parse(e.end)<Date.parse(e.start)))throw new Error('invalid_period');
    if(e.allDay?(e.start>=d.rangeEnd||e.end<=d.rangeStart):(Date.parse(e.start)>=Date.parse(d.rangeEnd+'T00:00:00+09:00')||Date.parse(e.end)<Date.parse(d.rangeStart+'T00:00:00+09:00')))throw new Error('event_outside_range');
  }
  return {version:1,timeZone:'Asia/Seoul',syncedAt:d.syncedAt,rangeStart:d.rangeStart,rangeEnd:d.rangeEnd,sources:d.sources.map(s=>({id:s.id,name:s.name,provider:s.provider})),events:d.events.map(e=>({id:e.id,sourceId:e.sourceId,title:e.title,url:e.url?calendarEventUrl(e.url):'',allDay:e.allDay,start:e.start,end:e.end}))};
}
export function eventOnDay(event:CalendarEvent,day:string){if(event.allDay)return day>=event.start&&day<event.end;const begin=Date.parse(day+'T00:00:00+09:00'),end=begin+86400000,start=Date.parse(event.start),finish=Date.parse(event.end);return start<end&&(finish===start?start>=begin:finish>begin);}
export function eventStartDay(event:CalendarEvent){return event.allDay?event.start:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.start));}
export function localCalendarEvent(entry:Entry):CalendarEvent|null{if(entry.kind!=='event'||!entry.date)return null;const allDay=!entry.date.includes('T');return {id:entry.id,sourceId:'hub-local',title:entry.title,url:'',allDay,start:allDay?entry.date:entry.date+':00+09:00',end:allDay?new Date(Date.parse(entry.date+'T00:00:00Z')+86400000).toISOString().slice(0,10):entry.date+':00+09:00'};}
export function calendarPeriod(event:CalendarEvent){
  if(event.allDay){const last=new Date(Date.parse(event.end+'T00:00:00Z')-86400000).toISOString().slice(0,10);return last===event.start?'종일':`${event.start.slice(5)} ~ ${last.slice(5)} · 종일`;}
  const format=(v:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v));
  return `${eventStartDay(event).slice(5)} ${format(event.start)}${event.end!==event.start?' – '+format(event.end):''} KST`;
}
