'use client';

import { ArrowUpRight, Bookmark, BriefcaseBusiness, Check, ChevronRight, ListTodo, Plus, StickyNote, Trash2 } from 'lucide-react';
import { koreanDate, safeUrl, type Entry } from '@/lib/store';

const icons = { note: StickyNote, todo: ListTodo, bookmark: Bookmark, work: BriefcaseBusiness };

export default function RecordList({ entries, filtered, label, onAdd, onOpen, onDelete, onToggle }: {
  entries: Entry[]; filtered: boolean; label: string; onAdd: () => void;
  onOpen: (entry: Entry) => void; onDelete: (entry: Entry) => void; onToggle: (entry: Entry) => void;
}) {
  if (!entries.length) return <div className="collection-empty">
    <h2>{filtered ? '이 분류에는 아직 기록이 없어요.' : `${label} 기록이 없어요.`}</h2>
    {!filtered && <button className="button secondary" type="button" onClick={onAdd}><Plus size={15}/>{label} 추가</button>}
  </div>;

  return <ul className="hub-record-list" aria-label={`${label} 목록`}>
    {entries.map(entry => {
      const Icon = icons[entry.kind as keyof typeof icons] ?? StickyNote;
      const firstLine = entry.detail.split(/\r?\n/).find(line => line.trim());
      const url = entry.url && safeUrl(entry.url);
      return <li key={entry.id}>
        {entry.kind === 'todo'
          ? <button type="button" className="record-list-check" role="checkbox" aria-checked={entry.done} aria-label={`${entry.title} ${entry.done?'완료 취소':'완료'}`} onClick={()=>onToggle(entry)}>{entry.done&&<Check size={15}/>}</button>
          : <span className="record-list-icon"><Icon size={19} aria-hidden="true"/></span>}
        <button type="button" className="record-list-open" onClick={()=>onOpen(entry)}>
          <span className={entry.done?'record-list-completed':undefined}>{entry.title}</span>
          {(firstLine || entry.date || entry.category) && <small>{[entry.date?koreanDate(entry.date):entry.category,firstLine].filter(Boolean).join(' · ')}</small>}
        </button>
        {url&&<a className="record-list-action" href={url} target="_blank" rel="noreferrer" aria-label={`${entry.title} 링크 열기`}><ArrowUpRight size={17}/></a>}
        <button type="button" className="record-list-action record-list-delete" onClick={()=>onDelete(entry)} aria-label={`${entry.title} 삭제`}><Trash2 size={16}/></button>
        <span className="record-list-chevron" aria-hidden="true"><ChevronRight size={15}/></span>
      </li>;
    })}
  </ul>;
}
