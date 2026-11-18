'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ChevronDown, ChevronLeft, SlidersHorizontal } from 'lucide-react';
import { noteCategories, noteDraftKey, noteFields, noteNeedsCopy, parseNoteDraft, sameNote, type NoteFields } from '@/lib/note-draft';
import { safeUrl, type Entry } from '@/lib/store';
import Dialog from './dialog';

export default function NoteEditor({ userId, entry, latest, onClose, onSave }: {
  userId: string | null; entry?: Entry; latest?: Entry; onClose: () => void; onSave: (entry: Entry) => boolean;
}) {
  const key = userId ? noteDraftKey(userId, entry?.id) : '';
  const [draft] = useState(() => {
    try { return key ? parseNoteDraft(localStorage.getItem(key)) : null; } catch { return null; }
  });
  const [base] = useState(() => draft?.base ?? noteFields(entry));
  const [fields, setFields] = useState(() => draft?.fields ?? base);
  const [draftFailed, setDraftFailed] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState('');
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const dirty = !sameNote(base, fields);
  const copy = noteNeedsCopy(entry?.id, base, latest);

  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const update = () => setViewport({ height: view.height, top: view.offsetTop });
    update();
    view.addEventListener('resize', update);
    view.addEventListener('scroll', update);
    return () => {
      view.removeEventListener('resize', update);
      view.removeEventListener('scroll', update);
    };
  }, []);

  function clearDraft() {
    if (key) localStorage.removeItem(key);
  }

  function change(name: keyof NoteFields, value: string) {
    const next = { ...fields, [name]: value };
    setFields(next);
    setError('');
    try {
      if (!key) throw new Error();
      if (sameNote(base, next)) clearDraft();
      else localStorage.setItem(key, JSON.stringify({ base, fields: next }));
      setDraftFailed(false);
    } catch {
      setDraftFailed(true);
    }
  }

  function close() {
    if (dirty && draftFailed) setConfirmClose(true);
    else onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const detail = fields.detail.trim();
    const title = fields.title.trim() || detail.split('\n')[0].slice(0, 200).trim();
    const url = fields.url.trim() ? safeUrl(fields.url.trim()) : '';
    if (!title) {
      setError('제목이나 메모를 입력해주세요.');
      titleInput.current?.focus();
      return;
    }
    if (fields.url.trim() && (!url || url.length > 2000)) {
      setError('http:// 또는 https://로 시작하는 링크를 확인해주세요.');
      if (details.current) details.current.open = true;
      urlInput.current?.focus();
      return;
    }
    const suffix = ' · 초안 사본';
    const source = copy ? undefined : latest ?? entry;
    if (onSave({
      id: source?.id ?? crypto.randomUUID(), kind: 'note', title: copy ? title.slice(0, 200 - suffix.length) + suffix : title,
      detail, category: fields.category, url, date: source?.date ?? '', status: source?.status ?? '',
      done: source?.done ?? false, createdAt: source?.createdAt ?? new Date().toISOString(),
    })) {
      try { clearDraft(); } catch { /* storage can be unavailable after the note has been saved */ }
    } else {
      setError('메모를 저장하지 못했어요. 저장 상태를 확인하고 다시 시도해주세요.');
    }
  }

  const style = viewport ? { '--hub-note-height': `${viewport.height}px`, '--hub-note-top': `${viewport.top}px` } as CSSProperties : undefined;
  return <>
    <Dialog title={entry ? '메모 수정' : '새 메모'} onClose={close} className="hub-note-dialog"
      backdropClassName="hub-note-backdrop" backdropStyle={style} focusField={false} header={null}>
      <form className="hub-note-form" onSubmit={submit} noValidate>
        <header className="hub-note-toolbar">
          <button type="button" className="hub-note-back" onClick={close}><ChevronLeft size={20}/>뒤로</button>
          <button type="submit" className="hub-note-done">완료</button>
        </header>
        <div className="hub-note-paper">
          <div className="hub-note-status" role="status">
            {draftFailed && dirty ? '이 기기에 초안을 보관하지 못했어요.' : dirty ? '이 기기에 초안 보관됨' : entry ? '메모 편집' : '새 메모'}
          </div>
          <input ref={titleInput} aria-label="제목" className="hub-note-title" placeholder="제목" maxLength={200}
            value={fields.title} onChange={event => change('title', event.target.value)}/>
          <details className="hub-note-details" ref={details}>
            <summary><SlidersHorizontal size={16} aria-hidden="true"/><span>분류 및 링크</span>
              <span className="hub-note-meta-summary">{fields.category || '분류 없음'}{fields.url.trim() && ' · 링크 있음'}</span>
              <ChevronDown className="hub-note-chevron" size={16} aria-hidden="true"/>
            </summary>
            <div className="hub-note-fields">
              <label>분류<select value={fields.category} onChange={event => change('category', event.target.value)}>
                {!noteCategories.includes(fields.category) && <option value={fields.category}>{fields.category || '분류 없음'}</option>}
                {noteCategories.map(category => <option key={category}>{category}</option>)}
              </select></label>
              <label>링크<input ref={urlInput} type="url" maxLength={2000} placeholder="링크 붙여넣기"
                value={fields.url} onChange={event => change('url', event.target.value)}/></label>
            </div>
          </details>
          {copy && <p className="hub-note-message" role="status">다른 기기에서 원본이 바뀌었어요. 완료하면 현재 내용은 사본으로 저장됩니다.</p>}
          {error && <p className="hub-note-message form-error" role="alert">{error}</p>}
          <textarea aria-label="메모 본문" className="hub-note-writing" placeholder="메모를 작성하세요"
            maxLength={10_000} value={fields.detail} onChange={event => change('detail', event.target.value)}/>
        </div>
      </form>
    </Dialog>
    {confirmClose && <Dialog title="초안을 저장하지 못했어요" onClose={() => setConfirmClose(false)}>
      <p className="dialog-description">이 화면을 닫으면 입력한 내용이 사라집니다.</p>
      <div className="dialog-footer">
        <button type="button" className="button secondary" onClick={onClose}>저장 없이 닫기</button>
        <button type="button" className="button primary" onClick={() => setConfirmClose(false)}>계속 작성</button>
      </div>
    </Dialog>}
  </>;
}
