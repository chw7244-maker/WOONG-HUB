'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Check,Pencil,Pin,PinOff,Trash2} from 'lucide-react';
import {safeUrl,todayKST,type Entry} from '@/lib/store';
import {captureEntry,captureLabel,convertEntry,detectCapture,dueLabel,dueThisWeek,sortTodos} from '@/lib/capture';

type Filter='all'|'note'|'todo'|'bookmark';
const filterLabels:Record<Filter,string>={all:'전체',note:'메모',todo:'할 일',bookmark:'북마크'};
const kindLabel={note:'메모',todo:'할 일',bookmark:'북마크'} as const;
const shortDate=(iso:string)=>{const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(iso));return `${Number(day.slice(5,7))}. ${Number(day.slice(8,10))}.`;};
const domainOf=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}};

/**
 * 기록: one "무엇이든 적기" box that decides the kind, kind filters with counts and tags on the left; to-dos, memo
 * cards and bookmarks in the middle; this week's due to-dos and the pinned memo on the right. Phones get the box, the
 * kind chips and one merged list.
 */
export default function LibraryHub({entries,today,pinnedId,onPin,onAdd,onChange,onOpen,onToggle,onDelete}:{entries:Entry[];today:string;pinnedId?:string;onPin:(id:string|undefined)=>void;
  onAdd:(entry:Entry,message:string)=>void;onChange:(entry:Entry,message:string)=>void;onOpen:(entry:Entry)=>void;onToggle:(entry:Entry)=>void;onDelete:(entry:Entry)=>void}){
  const [text,setText]=useState(''),[filter,setFilter]=useState<Filter>('all'),[tag,setTag]=useState(''),[lastId,setLastId]=useState<string|null>(null),[showDone,setShowDone]=useState(false);
  useEffect(()=>{const tab=new URLSearchParams(window.location.search).get('tab');if(tab==='note'||tab==='todo'||tab==='bookmark')setFilter(tab);},[]);
  const capture=detectCapture(text,today||todayKST());
  const byTag=(e:Entry)=>!tag||e.category===tag;
  const notes=entries.filter(e=>e.kind==='note'),todos=entries.filter(e=>e.kind==='todo'),bookmarks=entries.filter(e=>e.kind==='bookmark');
  const counts:Record<Filter,number>={all:notes.length+todos.length+bookmarks.length,note:notes.length,todo:todos.length,bookmark:bookmarks.length};
  const tags=[...new Set(entries.map(e=>e.category.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  const shownTodos=sortTodos(todos.filter(byTag)),openTodos=shownTodos.filter(e=>!e.done),doneTodos=shownTodos.filter(e=>e.done);
  const shownNotes=notes.filter(byTag).sort((a,b)=>Number(b.id===pinnedId)-Number(a.id===pinnedId)||b.createdAt.localeCompare(a.createdAt));
  const shownBookmarks=bookmarks.filter(byTag).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const pinned=notes.find(e=>e.id===pinnedId),week=dueThisWeek(todos,today),last=entries.find(e=>e.id===lastId);
  const show=(kind:Exclude<Filter,'all'>)=>filter==='all'||filter===kind;
  function save(){
    if(capture.kind==='empty')return;
    const entry=captureEntry(capture);
    onAdd(entry,`${kindLabel[entry.kind as keyof typeof kindLabel]}${entry.kind==='todo'&&entry.date?`(${dueLabel(entry.date,today)})`:''}로 저장했어요.`);
    setText('');setLastId(entry.id);
  }
  function convert(kind:'note'|'todo'|'bookmark'){if(!last)return;const next=convertEntry(last,kind);if(next&&next!==last)onChange(next,`${kindLabel[kind]}로 바꿨어요.`);}
  const empty=!counts.all;
  return <div className="library-hub">
    <aside className="library-side">
      <section className="library-capture" aria-label="무엇이든 적기">
        <label htmlFor="library-capture-input">무엇이든 적기</label>
        <textarea id="library-capture-input" rows={4} value={text} maxLength={10000} placeholder="생각, 할 일, 링크를 그냥 적어요" onChange={event=>{setText(event.target.value);}} onKeyDown={event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();save();}}}/>
        <div className="library-capture-bar"><span className="library-capture-kind" role="status">{captureLabel(capture,today)}</span><button type="button" className="button primary" onClick={save} disabled={capture.kind==='empty'}>저장</button></div>
        {last&&!text?<div className="library-capture-last"><span>방금 {kindLabel[last.kind as keyof typeof kindLabel]}로 저장했어요 · 바꾸기</span>{(['note','todo','bookmark'] as const).filter(k=>k!==last.kind&&(k!=='bookmark'||!!last.url)).map(k=><button key={k} type="button" onClick={()=>convert(k)}>{kindLabel[k]}로</button>)}</div>
        :<p className="library-capture-hint">링크는 북마크, ‘내일’·‘금요일’·‘12. 1.’ 같은 날짜가 있으면 할 일, 나머지는 메모예요. Ctrl+Enter로 저장하고, 저장 뒤 종류를 바꿀 수 있어요.</p>}
      </section>
      <nav className="library-filters" aria-label="기록 종류">{(Object.keys(filterLabels) as Filter[]).map(f=><button key={f} type="button" aria-pressed={filter===f} onClick={()=>setFilter(f)}><span>{filterLabels[f]}</span><span>{counts[f]}</span></button>)}</nav>
      {tags.length>0&&<div className="library-tags" role="group" aria-label="분류">{tags.map(t=><button key={t} type="button" aria-pressed={tag===t} onClick={()=>setTag(tag===t?'':t)}>#{t}</button>)}</div>}
    </aside>

    <section className="library-main" aria-label="기록 목록">
      {empty&&<div className="library-empty"><h2>아직 기록이 없어요</h2><p>왼쪽 ‘무엇이든 적기’에 생각, 할 일, 링크를 적어 보세요.</p></div>}
      {show('todo')&&todos.length>0&&<div className="library-todos">
        <div className="library-card-heading"><h2>할 일</h2><span>{openTodos.length}개 남음</span></div>
        {openTodos.map(todo=><TodoRow key={todo.id} todo={todo} today={today} onToggle={onToggle} onOpen={onOpen}/>)}
        {!openTodos.length&&<p className="library-muted">남은 할 일이 없어요.</p>}
        {doneTodos.length>0&&<button type="button" className="library-done-toggle" aria-expanded={showDone} onClick={()=>setShowDone(!showDone)}>{showDone?'완료한 할 일 접기':`완료한 할 일 ${doneTodos.length}개 보기`}</button>}
        {showDone&&doneTodos.map(todo=><TodoRow key={todo.id} todo={todo} today={today} onToggle={onToggle} onOpen={onOpen}/>)}
      </div>}
      {show('note')&&shownNotes.length>0&&<div className="library-notes">{shownNotes.map(note=><article key={note.id} className={note.id===pinnedId?'library-note pinned':'library-note'}>
        <button type="button" className="library-note-open" onClick={()=>onOpen(note)}><strong>{note.title}</strong>{note.detail&&<p>{note.detail}</p>}<small>{[note.category?`#${note.category}`:'',shortDate(note.createdAt)].filter(Boolean).join(' · ')}</small></button>
        <div className="library-note-actions"><button type="button" className="icon-button" aria-pressed={note.id===pinnedId} aria-label={note.id===pinnedId?`${note.title} 고정 풀기`:`${note.title} 고정하기`} onClick={()=>onPin(note.id===pinnedId?undefined:note.id)}>{note.id===pinnedId?<PinOff size={15}/>:<Pin size={15}/>}</button><button type="button" className="icon-button" aria-label={`${note.title} 삭제`} onClick={()=>onDelete(note)}><Trash2 size={15}/></button></div>
      </article>)}</div>}
      {show('bookmark')&&shownBookmarks.length>0&&<div className="library-bookmarks">{shownBookmarks.map(mark=>{const url=mark.url&&safeUrl(mark.url);return <article key={mark.id} className="library-bookmark">
        {url?<a href={url} target="_blank" rel="noreferrer" className="library-bookmark-link"><span className="library-bookmark-initial" aria-hidden="true">{(mark.title||domainOf(url)).slice(0,1).toUpperCase()}</span><span><strong>{mark.title}</strong><small>{domainOf(url)}</small></span><ArrowUpRight size={15} aria-hidden="true"/></a>
          :<button type="button" className="library-bookmark-link" onClick={()=>onOpen(mark)}><span className="library-bookmark-initial" aria-hidden="true">{mark.title.slice(0,1)}</span><span><strong>{mark.title}</strong><small>링크 없음</small></span></button>}
        <button type="button" className="icon-button" aria-label={`${mark.title} 수정`} onClick={()=>onOpen(mark)}><Pencil size={15}/></button>
      </article>;})}</div>}
      {!empty&&filter!=='all'&&!counts[filter]&&<p className="library-muted">{filterLabels[filter]} 기록이 없어요.</p>}
    </section>

    <aside className="library-aside">
      <section className="library-week"><h2>이번 주 마감</h2>{week.length?week.map(todo=><button type="button" key={todo.id} className="library-week-row" onClick={()=>onOpen(todo)}><span className="library-week-day"><small>{['일','월','화','수','목','금','토'][new Date(todo.date.slice(0,10)+'T00:00:00Z').getUTCDay()]}</small><strong>{Number(todo.date.slice(8,10))}</strong></span><span>{todo.title}</span></button>):<p className="library-muted">이번 주에 마감인 할 일이 없어요.</p>}</section>
      <section className="library-pinned"><h2>고정한 메모</h2>{pinned?<><button type="button" className="library-pinned-open" onClick={()=>onOpen(pinned)}><strong>{pinned.title}</strong>{pinned.detail&&<p>{pinned.detail}</p>}</button><button type="button" className="text-button" onClick={()=>onPin(undefined)}><PinOff size={14}/>고정 풀기</button></>:<p className="library-muted">메모 카드의 핀을 누르면 여기에 고정돼요.</p>}</section>
    </aside>
  </div>;
}

function TodoRow({todo,today,onToggle,onOpen}:{todo:Entry;today:string;onToggle:(entry:Entry)=>void;onOpen:(entry:Entry)=>void}){
  const late=!todo.done&&!!todo.date&&todo.date.slice(0,10)<today;
  return <div className={todo.done?'library-todo done':'library-todo'}>
    <button type="button" className={late?'library-check late':'library-check'} role="checkbox" aria-checked={todo.done} aria-label={`${todo.title} ${todo.done?'완료 취소':'완료'}`} onClick={()=>onToggle(todo)}>{todo.done&&<Check size={14}/>}</button>
    <button type="button" className="library-todo-title" onClick={()=>onOpen(todo)}>{todo.title}</button>
    {todo.date&&<small className={late?'late':''}>{dueLabel(todo.date,today)}</small>}
  </div>;
}
