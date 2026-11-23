import type {Entry} from './store.ts';
import {audioCategories,audioStatuses,emptyGear,guessAccessory,isGear,validateAudio} from './audio.ts';

/* Name-based category guess. Each pattern names model families or words; a name that matches more than one category (or none) is left unguessed. */
const categoryWords:[string,RegExp][]=[
  ['헤드폰',/헤드폰|headphones?|헤드셋|over-?ear|\bhd ?\d{3}|\bhe ?\d{3}|\bdt ?\d{3}|sundara|ananda|arya|\bath-?m\d|wh-?1000|\bk\d{3}\b|crossfade|lagoon|focal|grado/i],
  ['이어폰',/이어폰|earphones?|\biem\b|in-?ear|airpods|galaxy buds|\bbuds\b|이어버드|earbuds?/i],
  ['DAP',/\bdap\b|플레이어|player|walkman|\bnw-?[a-z]?\d|\bkann\b|\bsp ?\d{3}\b|\bsr ?\d{2,3}\b|\bse ?\d{3}\b|fiio ?m\d{1,2}\b|ibasso ?dx\d/i],
  ['DAC · 앰프',/\bdac\b|\bamp(?:lifier)?\b|앰프|dongle|동글|\bbtr ?\d|\bzen ?(?:dac|can)|go ?link|hip-?dac|\bpb ?\d\b|topping|schiit|ru ?\d\b|\bdc ?\d{2}/i],
];
/** Guesses a category from the gear name and maker: ear tips and cables first, then the other categories; null when unsure. */
export function guessCategory(text:string):string|null{
  const accessory=guessAccessory(text);if(accessory)return accessory;
  const hits=categoryWords.filter(([,pattern])=>pattern.test(text)).map(([category])=>category);
  return hits.length===1?hits[0]:null;
}

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks; a leading BOM and blank lines are ignored. */
export function parseCsv(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  const source=text.replace(/^﻿/,'');
  for(let i=0;i<source.length;i++){
    const c=source[i];
    if(quoted){if(c==='"'){if(source[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;continue;}
    if(c==='"'&&field==='')quoted=true;
    else if(c===','){row.push(field);field='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field!==''||row.length){row.push(field);rows.push(row);}
  return rows.filter(r=>r.some(cell=>cell.trim()!==''));
}

type Column='name'|'category'|'manufacturer'|'status'|'purchasedAt'|'price'|'memo'|'model'|'connection'|'sound'|'url';
const headerNames:Record<Column,string[]>={name:['이름','장비','장비 이름','name'],category:['분류','종류','category','type'],manufacturer:['제조사','브랜드','manufacturer','brand','maker'],status:['상태','status'],purchasedAt:['구매일','구매 날짜','purchased','purchase date','date'],price:['구매가','가격','price'],memo:['메모','청음 메모','memo','note','notes'],model:['모델','모델명','model'],connection:['연결','연결 · 출력','연결·출력','connection'],sound:['소리 성향','sound'],url:['링크','관련 링크','url','link']};
const exportColumns:[Column,string][]=[['name','이름'],['category','분류'],['manufacturer','제조사'],['status','상태'],['purchasedAt','구매일'],['price','구매가'],['memo','메모'],['model','모델'],['connection','연결 · 출력'],['sound','소리 성향'],['url','링크']];
const defaultOrder:Column[]=['name','category','manufacturer','status','purchasedAt','price','memo'];
const normalize=(value:string)=>value.toLocaleLowerCase().replace(/\s+/g,' ').trim();
const columnOf=(header:string)=>(Object.keys(headerNames) as Column[]).find(column=>headerNames[column].includes(normalize(header)));

/**
 * One CSV row in the preview. `filled` lists the cells that held a readable value: only those change gear the HUB
 * already has (`match`, by name), so an empty cell never erases a recorded value. `changes` names what would change;
 * a known name with nothing to change is skipped as 'same', a name repeated in the file as 'repeat'.
 */
export type AudioImportRow={line:number;name:string;category:string;categoryFrom:'csv'|'guess'|'none';manufacturer:string;status:string;purchasedAt:string;priceKRW:number|null;memo:string;model:string;connection:string;sound:string;url:string;filled:Column[];match:string|null;changes:string[];skip:'same'|'repeat'|null;notes:string[]};
const changeLabels:Record<Column,string>={name:'이름',category:'분류',manufacturer:'제조사',status:'상태',purchasedAt:'구매일',price:'구매가',memo:'메모',model:'모델',connection:'연결 · 출력',sound:'소리 성향',url:'링크'};
/** The gear a filled row would leave behind: the existing record with every filled cell taken from the row. */
export function applyImportRow(entry:Entry,row:AudioImportRow,category?:string):Entry{
  const gear=entry.audio?.type==='gear'?entry.audio:emptyGear(),has=(c:Column)=>row.filled.includes(c);
  return {...entry,category:has('category')?category??row.category:entry.category,status:has('status')?row.status:entry.status,detail:has('memo')?row.memo:entry.detail,url:has('url')?row.url:entry.url,
    audio:validateAudio({...gear,manufacturer:has('manufacturer')?row.manufacturer:gear.manufacturer,model:has('model')?row.model:gear.model,purchasedAt:has('purchasedAt')?row.purchasedAt:gear.purchasedAt,priceKRW:has('price')?row.priceKRW:gear.priceKRW,sound:has('sound')?row.sound:gear.sound,connection:has('connection')?row.connection:gear.connection})};
}
/** Labels of the fields a row would change on an existing record. */
export function importChanges(entry:Entry,row:AudioImportRow,category?:string){
  const next=applyImportRow(entry,row,category),before=entry.audio?.type==='gear'?entry.audio:emptyGear(),after=next.audio?.type==='gear'?next.audio:emptyGear();
  const differs:Record<Column,boolean>={name:false,category:next.category!==entry.category,status:next.status!==entry.status,memo:next.detail!==entry.detail,url:next.url!==entry.url,manufacturer:after.manufacturer!==before.manufacturer,model:after.model!==before.model,purchasedAt:after.purchasedAt!==before.purchasedAt,price:after.priceKRW!==before.priceKRW,sound:after.sound!==before.sound,connection:after.connection!==before.connection};
  return (Object.keys(changeLabels) as Column[]).filter(c=>differs[c]).map(c=>changeLabels[c]);
}

function day(value:string){const m=value.trim().match(/^(\d{4})[-./ ](\d{1,2})[-./ ](\d{1,2})\.?$/);if(!m)return null;const iso=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;const date=new Date(iso+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:null;}
function price(value:string){const digits=value.replace(/[₩원,\s]|krw/gi,'');return /^\d{1,11}$/.test(digits)&&Number(digits)<=10000000000?Number(digits):null;}
const cut=(value:string|undefined,max:number)=>(value??'').replace(/\s+/g,' ').trim().slice(0,max);

/**
 * Reads a CSV of gear into rows for the import preview. A header row is matched by name (Korean or English); without
 * one the columns are taken in the order 이름 · 분류 · 제조사 · 상태 · 구매일 · 구매가 · 메모. Rows without a name are left
 * out. Gear whose name the HUB already has is matched for an update; a missing category is guessed for new gear only.
 */
export function audioImportRows(text:string,entries:Entry[]):AudioImportRow[]{
  const table=parseCsv(text);if(!table.length)return [];
  const header=table[0].map(columnOf),hasHeader=header.filter(Boolean).length>=1&&header.includes('name');
  const columns=hasHeader?header:defaultOrder,body=hasHeader?table.slice(1):table;
  const known=new Map<string,Entry>();for(const e of entries.filter(isGear)){const key=normalize(e.title);if(!known.has(key))known.set(key,e);}
  const seen=new Set<string>();
  return body.slice(0,1000).flatMap((cells,index):AudioImportRow[]=>{
    const get=(column:Column)=>{const at=columns.indexOf(column);return at<0?'':cells[at]??'';};
    const name=cut(get('name'),200);if(!name)return [];
    const notes:string[]=[],manufacturer=cut(get('manufacturer'),100),given=cut(get('category'),50);
    const guessed=given?null:guessCategory(`${name} ${manufacturer} ${get('connection')}`);
    const category=given||guessed||'기타';
    const rawStatus=cut(get('status'),30),status=audioStatuses.includes(rawStatus)?rawStatus:'보유 중';
    if(rawStatus&&rawStatus!==status)notes.push(`상태 ‘${rawStatus}’ → 보유 중`);
    const rawDay=get('purchasedAt').trim(),purchasedAt=rawDay?day(rawDay)??'':'';if(rawDay&&!purchasedAt)notes.push('구매일을 읽지 못함');
    const rawPrice=get('price').trim(),priceKRW=rawPrice?price(rawPrice):null;if(rawPrice&&priceKRW===null)notes.push('구매가를 읽지 못함');
    const url=cut(get('url'),2000);if(url&&!/^https?:\/\//i.test(url))notes.push('링크는 http(s) 주소만');
    const memo=(get('memo')??'').trim().slice(0,10000),model=cut(get('model'),150),connection=cut(get('connection'),300),sound=get('sound').trim().slice(0,1000),link=/^https?:\/\//i.test(url)?url:'';
    const filled=(['category','manufacturer','model','connection'] as Column[]).filter(c=>({category:given,manufacturer,model,connection} as Record<string,string>)[c]);
    if(rawStatus&&rawStatus===status)filled.push('status');if(purchasedAt)filled.push('purchasedAt');if(priceKRW!==null)filled.push('price');if(memo)filled.push('memo');if(sound)filled.push('sound');if(link)filled.push('url');
    const key=normalize(name),existing=known.get(key),repeat=seen.has(key);seen.add(key);
    if(existing&&rawStatus&&rawStatus!==status)notes[notes.indexOf(`상태 ‘${rawStatus}’ → 보유 중`)]=`상태 ‘${rawStatus}’ → 그대로 둠`;
    const row:AudioImportRow={line:(hasHeader?2:1)+index,name,category:existing&&!given?existing.category:category,categoryFrom:given?'csv':existing?'none':guessed?'guess':'none',manufacturer,status,purchasedAt,priceKRW,memo,model,connection,sound,url:link,filled,match:existing?.id??null,changes:[],skip:repeat?'repeat':null,notes};
    if(existing&&!repeat){row.changes=importChanges(existing,row);if(!row.changes.length)row.skip='same';}
    return [row];
  });
}

/**
 * What an import saves: new gear for unmatched rows, and the matched gear with its filled cells applied, using the
 * category chosen in the preview. Updates start from the record as it is now and leave out rows switched off
 * (`keep`) or that no longer change anything.
 */
export function audioImportPlan(rows:AudioImportRow[],entries:Entry[],categories:Record<number,string>={},skipped:Set<number>=new Set(),now=new Date()){
  const current=new Map(entries.map(e=>[e.id,e]));
  const updated=rows.flatMap(r=>{if(r.skip||!r.match||skipped.has(r.line))return [];const entry=current.get(r.match);if(!entry)return [];return importChanges(entry,r,categories[r.line]).length?[applyImportRow(entry,r,categories[r.line])]:[];});
  return {added:audioImportEntries(rows.filter(r=>!r.match),categories,now),updated};
}
/** The gear records an import adds: rows not skipped and not matching existing gear, with the category chosen in the preview. */
export function audioImportEntries(rows:AudioImportRow[],categories:Record<number,string>={},now=new Date()):Entry[]{
  return rows.filter(r=>!r.skip&&!r.match).map((r,i)=>({id:crypto.randomUUID(),kind:'audio',title:r.name,detail:r.memo,category:categories[r.line]??r.category,status:r.status,url:r.url,date:'',done:false,createdAt:new Date(now.getTime()-i).toISOString(),
    audio:validateAudio({...emptyGear(),manufacturer:r.manufacturer,model:r.model,purchasedAt:r.purchasedAt,priceKRW:r.priceKRW,sound:r.sound,connection:r.connection})}));
}

const cell=(value:string)=>/[",\r\n]/.test(value)||/^\s|\s$/.test(value)?`"${value.replace(/"/g,'""')}"`:value;
/** All gear (not listening setups) as CSV with a BOM so Excel reads Korean correctly; the import reads the same columns back. */
export function audioCsv(entries:Entry[]){
  const rows=entries.filter(isGear).map(e=>{const a=e.audio?.type==='gear'?e.audio:emptyGear();const values:Record<Column,string>={name:e.title,category:e.category,manufacturer:a.manufacturer,status:e.status,purchasedAt:a.purchasedAt,price:a.priceKRW===null?'':String(a.priceKRW),memo:e.detail,model:a.model,connection:a.connection,sound:a.sound,url:e.url};return exportColumns.map(([column])=>cell(values[column]));});
  return '﻿'+[exportColumns.map(([,label])=>label),...rows].map(r=>r.join(',')).join('\r\n')+'\r\n';
}
/** Categories the import preview offers: the standard ones, plus the legacy and any custom ones the rows use. */
export const importCategoryOptions=(rows:AudioImportRow[])=>[...new Set([...audioCategories,...rows.map(r=>r.category)])];
/** Excel in Korean saves "CSV" as EUC-KR unless "CSV UTF-8" is chosen, so a file that is not valid UTF-8 is read as EUC-KR. */
export function decodeCsv(bytes:ArrayBuffer|Uint8Array){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('euc-kr').decode(bytes);}}
