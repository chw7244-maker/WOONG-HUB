'use client';
import {useRef,useState} from 'react';
import {Download,FileUp} from 'lucide-react';
import type {Entry} from '@/lib/store';
import {audioCsv,audioImportPlan,audioImportRows,decodeCsv,importCategoryOptions,type AudioImportRow} from '@/lib/audio-csv';

const MAX_BYTES=1024*1024;
const why=(row:AudioImportRow)=>[row.skip==='same'?'이미 있는 장비 · 바뀐 칸 없음':row.skip==='repeat'?'파일 안에서 같은 이름':row.match?`바뀌는 칸: ${row.changes.join(' · ')}`:row.categoryFrom==='csv'?'CSV 분류':row.categoryFrom==='guess'?'이름으로 추측':'추측하지 못해 기타로',...row.notes].join(' · ');

/** "CSV로 가져오기" and "CSV 내보내기" next to the add button. Picking a file opens the preview below. */
export function AudioCsvButtons({entries,onPreview}:{entries:Entry[];onPreview:(file:{name:string;rows:AudioImportRow[]}|{error:string})=>void}){
  const input=useRef<HTMLInputElement>(null);
  async function read(file:File){
    if(file.size>MAX_BYTES){onPreview({error:'CSV는 1MB까지 가져올 수 있어요.'});return;}
    const rows=audioImportRows(decodeCsv(await file.arrayBuffer()),entries);
    onPreview(rows.length?{name:file.name,rows}:{error:'이름이 있는 줄을 찾지 못했어요. 첫 줄에 ‘이름’ 열이 있는지 확인해 주세요.'});
  }
  function download(){
    const url=URL.createObjectURL(new Blob([audioCsv(entries)],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`woong-hub-audio-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <>
    <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void read(file);}}/>
    <button type="button" className="button secondary audio-csv-button" onClick={()=>input.current?.click()}><FileUp size={15} aria-hidden="true"/>CSV로 가져오기</button>
    <button type="button" className="button secondary audio-csv-button" onClick={download} disabled={!entries.some(e=>e.audio?.type!=='setup')}><Download size={15} aria-hidden="true"/>CSV 내보내기</button>
  </>;
}

/**
 * The import preview: new gear, gear already in the HUB that the file changes (only its filled cells; each update can
 * be switched off), and skipped rows. Categories of new gear and of updates that set one can be changed before saving.
 */
export function AudioCsvPreview({name,rows,entries,onCancel,onImport}:{name:string;rows:AudioImportRow[];entries:Entry[];onCancel:()=>void;onImport:(plan:{added:Entry[];updated:Entry[]})=>void}){
  const [choices,setChoices]=useState<Record<number,string>>({}),[off,setOff]=useState<Set<number>>(()=>new Set());
  const options=importCategoryOptions(rows),fresh=rows.filter(r=>!r.skip&&!r.match),updates=rows.filter(r=>!r.skip&&r.match&&!off.has(r.line));
  const label=[fresh.length?`새 장비 ${fresh.length}개 추가`:'',updates.length?`${updates.length}개 수정`:''].filter(Boolean).join(' · ')||'바꿀 장비 없음';
  const editable=(row:AudioImportRow)=>!row.skip&&(!row.match||row.filled.includes('category'));
  return <section className="audio-csv" aria-labelledby="audio-csv-title">
    <div className="audio-csv-heading"><div><h2 id="audio-csv-title">CSV 미리보기</h2><span>{name} · {rows.length}줄</span></div><small>열: 이름 · 분류 · 제조사 · 상태 · 구매일 · 구매가 · 메모 (이름만 있어도 돼요)</small></div>
    <div className="audio-csv-rows" role="table" aria-label="가져올 장비">
      {rows.map(row=>{const updating=!row.skip&&!!row.match,on=updating&&!off.has(row.line);return <div role="row" key={row.line} className={row.skip||(updating&&!on)?'audio-csv-row skipped':'audio-csv-row'}>
        <strong role="cell">{row.name}</strong>
        <span role="cell">{editable(row)?<select aria-label={`${row.name} 분류`} value={choices[row.line]??row.category} onChange={event=>setChoices(current=>({...current,[row.line]:event.target.value}))}>{options.map(option=><option key={option}>{option}</option>)}</select>:row.category}</span>
        <small role="cell">{why(row)}</small>
        <span role="cell">{updating?<label className={on?'audio-csv-badge update':'audio-csv-badge skip'}><input type="checkbox" checked={on} onChange={event=>setOff(current=>{const next=new Set(current);if(event.target.checked)next.delete(row.line);else next.add(row.line);return next;})}/>수정</label>
          :<span className={row.skip?'audio-csv-badge skip':'audio-csv-badge'}>{row.skip?'건너뜀':'새 장비'}</span>}</span>
      </div>;})}
    </div>
    <div className="audio-csv-footer"><p>이미 있는 장비는 CSV에 값이 있는 칸만 바꾸고, 빈 칸은 기존 값을 그대로 둬요. 분류가 비어 있는 새 장비는 이름으로 추측해요. 저장 전에는 아무것도 바뀌지 않아요.</p>
      <div><button type="button" className="button secondary" onClick={onCancel}>취소</button><button type="button" className="button primary" disabled={!fresh.length&&!updates.length} onClick={()=>onImport(audioImportPlan(rows,entries,choices,off))}>{label}</button></div></div>
  </section>;
}
