'use client';
import {useState,type FormEvent} from 'react';
import {ArrowDown,ArrowUp,ArrowUpRight,Cable,Check,CircleDot,Database,Ear,Headphones,Layers3,Plus,Search,SlidersHorizontal,SlidersVertical,Smartphone,Speaker,Split,Trash2,Pencil} from 'lucide-react';
import {type Entry,safeUrl} from '@/lib/store';
import {audioCategories,audioCategoryOrder,audioStatuses,audioStats,emptyGear,guessAccessory,isGear,isSetup,legacyAccessoryCategory,setupDevices,validateAudio,type AudioGear} from '@/lib/audio';
import Dialog from './dialog';
import { SectionFilters, SectionStats } from './section-controls';
import { AudioHighlights } from './hobby-highlights';
import { AudioCsvButtons, AudioCsvPreview } from './audio-csv';
import { guessCategory } from '@/lib/audio-csv';
import type { AudioImportRow } from '@/lib/audio-csv';

const won=(value:number)=>new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(value);
const gearLabel=(entry:Entry)=>entry.audio?.type==='gear'?[entry.audio.manufacturer,entry.audio.model].filter(Boolean).join(' ')||entry.title:entry.title;

const categoryIcons:Record<string,typeof Headphones>={'이어폰':Ear,'헤드폰':Headphones,'DAP':Smartphone,'DAC · 앰프':SlidersVertical,'이어팁':CircleDot,'케이블':Cable,[legacyAccessoryCategory]:Cable,'기타':Speaker};
/** A tile's two lines: the model on top and the maker below, taken from the recorded manufacturer when the name starts with it. */
function tileLines(entry:Entry){
  const maker=entry.audio?.type==='gear'?entry.audio.manufacturer.trim():'';
  if(maker&&entry.title.toLocaleLowerCase().startsWith(maker.toLocaleLowerCase()+' '))return {main:entry.title.slice(maker.length+1),sub:maker};
  return {main:entry.title,sub:maker};
}

export default function AudioHub({entries,music,pinned,onPin,onAdd,onEdit,onDelete,onRecategorize,onImport}:{entries:Entry[];music:Entry[];pinned?:string;onPin:(id:string)=>void;onAdd:()=>void;onEdit:(entry:Entry)=>void;onDelete:(entry:Entry)=>void;onRecategorize:(changes:{id:string;category:string}[])=>void;onImport:(plan:{added:Entry[];updated:Entry[]})=>void}){
  const [csv,setCsv]=useState<{name:string;rows:AudioImportRow[]}|{error:string}|null>(null);
  const [tab,setTab]=useState<'gear'|'setup'>('gear'),[query,setQuery]=useState(''),[category,setCategory]=useState('전체'),[status,setStatus]=useState('전체'),[sort,setSort]=useState('recent'),[selectedId,setSelectedId]=useState<string|null>(null),[splitting,setSplitting]=useState(false);
  const stats=audioStats(entries),selected=entries.find(e=>e.id===selectedId),gear=entries.filter(isGear);
  const categoryOf=(entry:Entry)=>entry.category||'기타';
  const categories=audioCategoryOrder(gear.map(categoryOf));
  const activeCategory=category!=='전체'&&!categories.includes(category)?'전체':category;
  const records=entries.filter(e=>(tab==='setup'?isSetup(e):isGear(e))&&(tab==='setup'||activeCategory==='전체'||categoryOf(e)===activeCategory)&&(status==='전체'||e.status===status)&&[e.title,e.detail,e.category,e.audio?.type==='gear'?`${e.audio.manufacturer} ${e.audio.model} ${e.audio.sound} ${e.audio.connection}`:setupDevices(e,entries).map(x=>x.entry?.title??'').join(' ')].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>sort==='name'?a.title.localeCompare(b.title,'ko'):b.createdAt.localeCompare(a.createdAt));
  const groups=tab==='gear'?categories.map(c=>({category:c,items:records.filter(e=>categoryOf(e)===c)})).filter(g=>g.items.length):[];
  const legacy=gear.filter(e=>e.category===legacyAccessoryCategory);
  const filtered=!!query||activeCategory!=='전체'||status!=='전체';
  function newSetup(){onEdit({id:crypto.randomUUID(),kind:'audio',title:'',detail:'',category:'조합',status:'사용 중',url:'',date:'',done:false,createdAt:new Date().toISOString(),audio:{type:'setup',deviceIds:[]}});}
  return <div className="audio-hub">
    <AudioHighlights audio={entries} music={music} pinned={pinned} onPin={onPin} onOpen={entry=>setSelectedId(entry.id)}/>
    <div className="audio-section-top"><div className="tabs" role="group" aria-label="오디오 보기"><button className={tab==='gear'?'selected':''} onClick={()=>{setTab('gear');setStatus('전체');}}>장비 컬렉션 <span>{stats.gear}</span></button><button className={tab==='setup'?'selected':''} onClick={()=>{setTab('setup');setStatus('전체');}}>청음 조합 <span>{stats.setups}</span></button></div><div className="audio-top-actions">{tab==='gear'&&<AudioCsvButtons entries={entries} onPreview={setCsv}/>}<button className="button primary" onClick={tab==='setup'?newSetup:onAdd} disabled={tab==='setup'&&!gear.length}><Plus size={15}/>{tab==='setup'?'조합 만들기':'장비 추가'}</button></div></div>
    {csv&&tab==='gear'&&('error' in csv?<p className="form-error audio-csv-error" role="alert">{csv.error}<button type="button" className="text-button" onClick={()=>setCsv(null)}>닫기</button></p>:<AudioCsvPreview key={csv.name+csv.rows.length} name={csv.name} rows={csv.rows} entries={entries} onCancel={()=>setCsv(null)} onImport={plan=>{setCsv(null);onImport(plan);}}/>)}
    {tab==='gear'&&gear.length>0&&<div className="tabs audio-category-tabs" role="group" aria-label="장비 분류">{['전체',...categories].map(c=><button key={c} type="button" className={activeCategory===c?'selected':''} aria-pressed={activeCategory===c} onClick={()=>setCategory(c)}>{c}<span>{c==='전체'?gear.length:gear.filter(e=>categoryOf(e)===c).length}</span></button>)}</div>}
    <div className="audio-filters"><label className="audio-search"><Search size={16}/><input aria-label="오디오 검색" placeholder="장비, 소리 성향, 메모 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <SectionFilters active={Number(status!=='전체')+Number(sort!=='recent')}><label><span>상태</span><select aria-label="오디오 상태" value={status} onChange={e=>setStatus(e.target.value)}>{['전체',...(tab==='gear'?audioStatuses:['사용 중','보관']),...new Set(entries.filter(e=>tab==='gear'?isGear(e):isSetup(e)).map(e=>e.status).filter(s=>s&&!(tab==='gear'?audioStatuses:['사용 중','보관']).includes(s)))].map(s=><option key={s}>{s}</option>)}</select></label><label><span>정렬</span><select aria-label="오디오 정렬" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">최근 등록순</option><option value="name">이름순</option></select></label></SectionFilters></div>
    <div className="audio-result-count">{records.length}개의 {tab==='gear'?'장비':'조합'}</div>
    {!records.length?<section className="panel audio-empty"><Headphones size={36} strokeWidth={1.2}/><h2>{filtered?'조건에 맞는 기록이 없어요':tab==='gear'?'내가 좋아하는 소리부터.':'장비를 연결해 나만의 소리를.'}</h2><p>{filtered?'검색어나 분류를 바꿔보세요.':tab==='gear'?'보유 장비와 위시리스트를 하나씩 기록해보세요.':'등록한 장비로 DAP → DAC·앰프 → 이어폰 같은 조합을 저장하세요.'}</p><button className="button primary" onClick={tab==='setup'&&gear.length?newSetup:onAdd}><Plus size={15}/>{tab==='setup'&&gear.length?'첫 조합 만들기':'장비 추가하기'}</button></section>
    :tab==='gear'?<div className="audio-groups">{groups.map(({category:c,items})=>{
      const Icon=categoryIcons[c]??Speaker;
      return <section key={c} className="audio-group" aria-labelledby={`audio-group-${c}`}>
        <div className="audio-group-heading"><span className="audio-group-icon" aria-hidden="true"><Icon size={19}/></span><h2 id={`audio-group-${c}`}>{c}</h2><span className="audio-group-count">{items.length}개</span>
          {c===legacyAccessoryCategory&&<button type="button" className="text-button blue audio-split-trigger" onClick={()=>setSplitting(true)}><Split size={15} aria-hidden="true"/>이어팁 · 케이블로 나누기</button>}</div>
        <div className="audio-tile-grid">{items.map(entry=>{const {main,sub}=tileLines(entry);return <button key={entry.id} type="button" className="audio-tile" title={entry.title} onClick={()=>setSelectedId(entry.id)}>
          <strong>{main}</strong>{sub&&<small>{sub}</small>}{entry.status&&entry.status!=='보유 중'&&<span className="audio-tile-status">{entry.status}</span>}
        </button>;})}</div>
      </section>;
    })}</div>
    :<div className="audio-record-list">
      {records.map(entry=><article key={entry.id} className="audio-record-row">
        <span className="audio-card-icon" aria-hidden="true"><Layers3 size={21}/></span>
        <button type="button" className="audio-record-title" onClick={()=>setSelectedId(entry.id)}>
          <strong>{entry.title}</strong><small>{`${setupDevices(entry,entries).length}개 장비`}{entry.status&&<span className="audio-status-mobile"> · {entry.status}</span>}</small>
        </button>
        <span className="audio-record-status">{entry.status||entry.category}</span>
        <div className="audio-record-actions">
          <button type="button" className="icon-button" aria-label={`${entry.title} 수정`} onClick={()=>onEdit(entry)}><Pencil size={15}/></button>
          <button type="button" className="icon-button" aria-label={`${entry.title} 삭제`} onClick={()=>onDelete(entry)}><Trash2 size={15}/></button>
        </div>
      </article>)}
    </div>}
    <SectionStats label="오디오 컬렉션 요약"><section className="audio-overview" aria-label="오디오 컬렉션 현황"><div><span>보유 장비</span><strong>{stats.owned}<small>대</small></strong></div><div><span>위시리스트</span><strong>{stats.wishlist}<small>대</small></strong></div><div><span>나의 조합</span><strong>{stats.setups}<small>개</small></strong></div><div><span>기록한 보유 장비 구매가</span><strong className="audio-value">{stats.priced?won(stats.total):'아직 기록 전'}</strong><small>{stats.priced}/{stats.owned}대 구매가 기준 · 현재 시세 아님</small></div></section></SectionStats>
    <p className="audio-footnote"><SlidersHorizontal size={14}/>장비 사양과 구매가는 직접 기록한 정보입니다. 외부 제품·가격 정보는 자동 조회하지 않습니다.</p>
    {splitting&&<AccessorySplit items={legacy} onClose={()=>setSplitting(false)} onApply={changes=>{setSplitting(false);if(changes.length)onRecategorize(changes);}}/>}
    {selected&&<Dialog title={selected.title} onClose={()=>setSelectedId(null)} className="audio-dialog section-detail"><div className="audio-detail"><div className="audio-detail-label"><span className="badge">{selected.category||'오디오'}</span><span className="badge">{selected.status||'상태 미기록'}</span></div>{selected.audio?.type==='gear'?<><h3>{gearLabel(selected)}</h3><dl className="audio-specs"><div><dt>제조사</dt><dd>{selected.audio.manufacturer||'미기록'}</dd></div><div><dt>모델</dt><dd>{selected.audio.model||'미기록'}</dd></div><div><dt>구매일</dt><dd>{selected.audio.purchasedAt||'미기록'}</dd></div><div><dt>구매가</dt><dd>{selected.audio.priceKRW===null?'미기록':won(selected.audio.priceKRW)}</dd></div><div><dt>연결 · 출력</dt><dd>{selected.audio.connection||'미기록'}</dd></div><div><dt>소리 성향</dt><dd>{selected.audio.sound||'미기록'}</dd></div></dl></>:isSetup(selected)?<><h3>내가 기록한 연결 순서</h3><DeviceChain entry={selected} entries={entries}/><p className="audio-detail-hint">전기적 호환성을 자동 검증하지 않습니다. 출력·입력 규격은 직접 확인해주세요.</p></>:<p className="audio-detail-hint">이전 장비 기록입니다. 수정에서 제조사, 모델, 구매 정보를 추가할 수 있어요.</p>}<h3>청음 · 사용 메모</h3><p className="audio-memo">{selected.detail||'아직 남긴 메모가 없어요.'}</p>{selected.url&&<a className="text-button blue" href={safeUrl(selected.url)} target="_blank" rel="noreferrer">관련 링크 열기<ArrowUpRight size={14}/></a>}</div><div className="dialog-footer"><button className="button secondary audio-delete" onClick={()=>{setSelectedId(null);onDelete(selected);}}><Trash2 size={14}/>삭제</button><button className="button secondary" onClick={()=>setSelectedId(null)}>닫기</button><button className="button primary" onClick={()=>{setSelectedId(null);onEdit(selected);}}><Pencil size={14}/>수정하기</button></div></Dialog>}
  </div>;
}

/** Moves gear from the old combined category into 이어팁 or 케이블, guessing from the name; nothing changes until 적용. */
function AccessorySplit({items,onClose,onApply}:{items:Entry[];onClose:()=>void;onApply:(changes:{id:string;category:string}[])=>void}){
  const textOf=(entry:Entry)=>[entry.title,entry.audio?.type==='gear'?`${entry.audio.manufacturer} ${entry.audio.model} ${entry.audio.connection}`:''].join(' ');
  const [choices,setChoices]=useState<Record<string,string>>(()=>Object.fromEntries(items.map(entry=>[entry.id,guessAccessory(textOf(entry))??legacyAccessoryCategory])));
  const changes=items.filter(entry=>choices[entry.id]!==legacyAccessoryCategory).map(entry=>({id:entry.id,category:choices[entry.id]}));
  const unsure=items.filter(entry=>!guessAccessory(textOf(entry))).length;
  return <Dialog title="이어팁 · 케이블로 나누기" onClose={onClose} className="audio-dialog audio-split-dialog">
    <div className="audio-split">
      <p>이름으로 분류를 추측했어요. 맞지 않는 장비는 바꿔 주세요.{unsure>0&&` 추측하지 못한 ${unsure}개는 ‘그대로 두기’로 남아요.`}</p>
      <ul>{items.map(entry=><li key={entry.id}><span>{entry.title}</span>
        <div className="audio-split-choice" role="radiogroup" aria-label={`${entry.title} 분류`}>{['이어팁','케이블',legacyAccessoryCategory].map(option=><label key={option} data-checked={choices[entry.id]===option||undefined}><input type="radio" name={`split-${entry.id}`} checked={choices[entry.id]===option} onChange={()=>setChoices(current=>({...current,[entry.id]:option}))}/>{option===legacyAccessoryCategory?'그대로 두기':option}</label>)}</div>
      </li>)}</ul>
    </div>
    <div className="dialog-footer"><button type="button" className="button secondary" onClick={onClose}>취소</button><button type="button" className="button primary" disabled={!changes.length} onClick={()=>onApply(changes)}><Check size={15}/>{changes.length}개 분류 바꾸기</button></div>
  </Dialog>;
}

function DeviceChain({entry,entries}:{entry:Entry;entries:Entry[]}){return <ol className="audio-device-chain">{setupDevices(entry,entries).map(({id,entry:device},i)=><li key={id}><span>{String(i+1).padStart(2,'0')}</span><div><strong>{device?.title??'삭제되었거나 찾을 수 없는 장비'}</strong><small>{device?`${device.category} · ${device.status||'상태 미기록'}`:'조합 수정에서 연결을 제거할 수 있어요'}</small></div></li>)}</ol>;}

export function AudioEntryModal({entry,entries,onSave,onClose}:{entry?:Entry;entries:Entry[];onSave:(entry:Entry)=>boolean;onClose:()=>void}){
  const setup=entry?.audio?.type==='setup';
  const [categoryTouched,setCategoryTouched]=useState(!!entry?.title);
  const [title,setTitle]=useState(entry?.title??''),[category,setCategory]=useState(entry?.category||audioCategories[0]),[status,setStatus]=useState(entry?.status||(setup?'사용 중':'보유 중')),[detail,setDetail]=useState(entry?.detail??''),[url,setUrl]=useState(entry?.url??''),[a,setA]=useState<AudioGear>(entry?.audio?.type==='gear'?entry.audio:emptyGear()),[price,setPrice]=useState(entry?.audio?.type==='gear'&&entry.audio.priceKRW!==null?String(entry.audio.priceKRW):''),[members,setMembers]=useState<string[]>(entry?.audio?.type==='setup'?entry.audio.deviceIds:[]),[error,setError]=useState('');
  const gear=entries.filter(isGear),missing=members.filter(id=>!gear.some(g=>g.id===id));
  function move(index:number,direction:number){setMembers(current=>{const next=[...current],other=index+direction;if(other>=0&&other<next.length)[next[index],next[other]]=[next[other],next[index]];return next;});}
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();try{if(!title.trim())throw new Error('이름을 입력해주세요.');if(url.trim()&&!safeUrl(url.trim()))throw new Error('http:// 또는 https://로 시작하는 주소를 입력해주세요.');if(price&&!/^\d+$/.test(price))throw new Error('구매가는 원 단위 정수로 입력해주세요.');const purchasedAt=String(new FormData(event.currentTarget).get('purchasedAt')??'');const audio=validateAudio(setup?{type:'setup',deviceIds:members}:{...a,purchasedAt,manufacturer:a.manufacturer.trim(),model:a.model.trim(),sound:a.sound.trim(),connection:a.connection.trim(),priceKRW:price===''?null:Number(price)});onSave({id:entry?.id??crypto.randomUUID(),kind:'audio',title:title.trim(),detail:detail.trim(),category:setup?'조합':category,status,url:url.trim()?safeUrl(url.trim()):'',date:entry?.date??'',done:entry?.done??false,createdAt:entry?.createdAt??new Date().toISOString(),audio});}catch(e){setError(e instanceof Error?e.message:'입력 내용을 확인해주세요.');}}
  return <Dialog title={`${setup?'청음 조합':'오디오 장비'} ${entry?.title?'수정':'추가'}`} onClose={onClose} className="audio-dialog"><form onSubmit={submit}><div className="entry-form"><label>{setup?'조합 이름':'장비 이름'} *<input autoFocus required maxLength={200} value={title} onChange={e=>{setTitle(e.target.value);if(!setup&&!categoryTouched){const guess=guessCategory(e.target.value);if(guess)setCategory(guess);}}} placeholder={setup?'주말의 데스크톱 조합':'목록에서 알아보기 쉬운 이름'}/></label><div className="form-two-columns">{!setup&&<label>장비 분류<select value={category} onChange={e=>{setCategory(e.target.value);setCategoryTouched(true);}}>{[...new Set([...audioCategories,category])].map(c=><option key={c}>{c}</option>)}</select></label>}<label>상태<select value={status} onChange={e=>setStatus(e.target.value)}>{[...new Set([...(setup?['사용 중','보관']:audioStatuses),status])].map(s=><option key={s}>{s}</option>)}</select></label></div>
    {setup?<><fieldset className="audio-member-picker"><legend>함께 사용할 장비 · 최대 12개</legend>{gear.map(g=><label key={g.id}><input type="checkbox" checked={members.includes(g.id)} disabled={!members.includes(g.id)&&members.length>=12} onChange={e=>setMembers(current=>e.target.checked?[...current,g.id]:current.filter(id=>id!==g.id))}/><span>{g.title}<small>{g.category} · {g.status||'상태 미기록'}</small></span></label>)}{missing.map(id=><label key={id}><input type="checkbox" checked onChange={()=>setMembers(current=>current.filter(x=>x!==id))}/><span>삭제되었거나 찾을 수 없는 장비<small>선택을 해제하면 조합에서 제거됩니다</small></span></label>)}{!gear.length&&<p>조합에 넣을 장비를 먼저 등록해주세요.</p>}</fieldset><div className="audio-member-order"><strong>연결 순서</strong>{members.map((id,i)=><div key={id}><span>{i+1}. {gear.find(g=>g.id===id)?.title??'찾을 수 없는 장비'}</span><button type="button" className="icon-button" aria-label={`${i+1}번 장비 위로`} disabled={i===0} onClick={()=>move(i,-1)}><ArrowUp size={15}/></button><button type="button" className="icon-button" aria-label={`${i+1}번 장비 아래로`} disabled={i===members.length-1} onClick={()=>move(i,1)}><ArrowDown size={15}/></button></div>)}<small>선택한 순서로 저장합니다. 버튼으로 연결 순서를 바꿀 수 있어요.</small></div></>:<><div className="form-two-columns"><label>제조사<input maxLength={100} value={a.manufacturer} onChange={e=>setA({...a,manufacturer:e.target.value})} placeholder="직접 입력"/></label><label>모델명<input maxLength={150} value={a.model} onChange={e=>setA({...a,model:e.target.value})} placeholder="직접 입력"/></label></div><div className="form-two-columns"><label>구매일<input type="date" name="purchasedAt" defaultValue={a.purchasedAt}/></label><label>구매가 (원)<input type="number" inputMode="numeric" min="0" max="10000000000" step="1" placeholder="미기록" value={price} onChange={e=>setPrice(e.target.value)}/></label></div><label>연결 · 출력 정보<input maxLength={300} value={a.connection} onChange={e=>setA({...a,connection:e.target.value})} placeholder="3.5mm / 4.4mm / USB 등"/></label><label>소리 성향<textarea rows={3} maxLength={1000} value={a.sound} onChange={e=>setA({...a,sound:e.target.value})} placeholder="저음, 보컬, 고음, 공간감에 대한 나의 인상"/></label></>}
    <label>관련 링크<input type="url" maxLength={2000} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://"/></label><label>청음 · 사용 메모<textarea rows={4} maxLength={10000} value={detail} onChange={e=>setDetail(e.target.value)} placeholder="들었던 곡, 함께 쓴 장비, 오래 남기고 싶은 느낌"/></label>{error&&<p className="form-error" role="alert">{error}</p>}</div><div className="dialog-footer"><span><Database size={12}/>기기에 보관 후 서버와 동기화합니다</span><button type="button" className="button secondary" onClick={onClose}>취소</button><button type="submit" className="button primary"><Check size={15}/>저장하기</button></div></form></Dialog>;
}
