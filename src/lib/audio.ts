import type { Entry } from './store.ts';

export const audioCategories=['이어폰','헤드폰','DAP','DAC · 앰프','이어팁','케이블','기타'];
/** The former combined category. Existing gear keeps it until the person splits it into 이어팁 and 케이블. */
export const legacyAccessoryCategory='케이블 · 이어팁';
const tipWords=/이어팁|ear ?tips?|spin ?fit|spiral ?dot|sedna ?earfit|\btype ?e\b|divinus|comply|폼팁/i;
const cableWords=/케이블|cable|eletech|nicehck|effect audio|cadmus|\b(?:2\.5|3\.5|4\.4)\s?mm\b|mmcx|2-?pin|↔/i;
/** Guess 이어팁 or 케이블 from a gear's name and details; null when the words point both ways or nowhere. */
export function guessAccessory(text:string):'이어팁'|'케이블'|null{
  const tip=tipWords.test(text),cable=cableWords.test(text);
  return tip&&!cable?'이어팁':cable&&!tip?'케이블':null;
}
/** Categories in display order: the standard ones first, then the legacy and any custom ones that are in use. */
export function audioCategoryOrder(used:string[]){
  const standard=[...audioCategories.slice(0,-1),legacyAccessoryCategory];
  const present=new Set(used);
  return [...standard.filter(c=>present.has(c)),...[...present].filter(c=>!standard.includes(c)&&c!=='기타').sort((a,b)=>a.localeCompare(b,'ko')),...(present.has('기타')?['기타']:[])];
}
export const audioStatuses=['보유 중','위시리스트','판매 완료'];
export type AudioGear={type:'gear';manufacturer:string;model:string;purchasedAt:string;priceKRW:number|null;sound:string;connection:string};
export type AudioSetup={type:'setup';deviceIds:string[]};
export type AudioDetails=AudioGear|AudioSetup;
export const emptyGear=():AudioGear=>({type:'gear',manufacturer:'',model:'',purchasedAt:'',priceKRW:null,sound:'',connection:''});
export const isSetup=(entry:Entry)=>entry.kind==='audio'&&entry.audio?.type==='setup';
export const isGear=(entry:Entry)=>entry.kind==='audio'&&!isSetup(entry);

export function validateAudio(input:unknown):AudioDetails {
  const a=input as AudioDetails;
  if(!a||typeof a!=='object')throw new Error('오디오 상세 정보의 형식을 확인해주세요.');
  if(a.type==='setup'){
    if(!Array.isArray(a.deviceIds)||a.deviceIds.length<1||a.deviceIds.length>12||a.deviceIds.some(id=>typeof id!=='string'||!id||id.length>200)||new Set(a.deviceIds).size!==a.deviceIds.length)throw new Error('조합은 중복 없이 1~12개 장비로 구성해주세요.');
    return {type:'setup',deviceIds:[...a.deviceIds]};
  }
  if(a.type!=='gear'||[['manufacturer',100],['model',150],['purchasedAt',10],['sound',1000],['connection',300]].some(([key,max])=>typeof a[key as keyof AudioGear]!=='string'||(a[key as keyof AudioGear] as string).length>Number(max)))throw new Error('오디오 상세 정보의 길이와 형식을 확인해주세요.');
  if(a.priceKRW!==null&&(typeof a.priceKRW!=='number'||!Number.isSafeInteger(a.priceKRW)||a.priceKRW<0||a.priceKRW>10000000000))throw new Error('구매가는 0~100억 원의 정수로 입력해주세요.');
  if(a.purchasedAt){const date=new Date(a.purchasedAt+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(a.purchasedAt)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==a.purchasedAt)throw new Error('구매일을 확인해주세요.');}
  return {type:'gear',manufacturer:a.manufacturer,model:a.model,purchasedAt:a.purchasedAt,priceKRW:a.priceKRW,sound:a.sound,connection:a.connection};
}
export function setupDevices(entry:Entry,entries:Entry[]){
  if(entry.audio?.type!=='setup')return [];
  return entry.audio.deviceIds.map(id=>({id,entry:entries.find(e=>e.id===id&&isGear(e))}));
}
export function audioStats(entries:Entry[]){
  const gear=entries.filter(isGear),owned=gear.filter(e=>e.status==='보유 중');
  const priced=owned.filter(e=>e.audio?.type==='gear'&&e.audio.priceKRW!==null);
  return {gear:gear.length,owned:owned.length,wishlist:gear.filter(e=>e.status==='위시리스트').length,setups:entries.filter(isSetup).length,priced:priced.length,total:priced.reduce((sum,e)=>sum+(e.audio?.type==='gear'?e.audio.priceKRW??0:0),0)};
}
