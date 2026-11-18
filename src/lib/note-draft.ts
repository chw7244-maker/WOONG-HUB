import type { Entry } from './store.ts';

export const noteCategories = ['일상', '아이디어', '취미', '업무'];
export type NoteFields = { title: string; detail: string; category: string; url: string };
export type NoteDraft = { base: NoteFields; fields: NoteFields };

export function noteFields(entry?: Entry): NoteFields {
  return { title: entry?.title ?? '', detail: entry?.detail ?? '', category: entry?.category ?? noteCategories[0], url: entry?.url ?? '' };
}

export function sameNote(a: NoteFields, b: NoteFields) {
  return a.title === b.title && a.detail === b.detail && a.category === b.category && a.url === b.url;
}

export function noteDraftKey(userId: string, entryId?: string) {
  return 'woong-hub:note-draft:v1:' + JSON.stringify([userId, entryId ?? null]);
}

export function parseNoteDraft(raw: string | null): NoteDraft | null {
  if (!raw || raw.length > 150_000) return null;
  const valid = (fields: unknown): fields is NoteFields => {
    if (!fields || typeof fields !== 'object') return false;
    const value = fields as NoteFields;
    return typeof value.title === 'string' && value.title.length <= 200 &&
      typeof value.detail === 'string' && value.detail.length <= 10_000 &&
      typeof value.category === 'string' && value.category.length <= 100 &&
      typeof value.url === 'string' && value.url.length <= 2_000;
  };
  try {
    const parsed = JSON.parse(raw);
    return valid(parsed?.base) && valid(parsed.fields) && !sameNote(parsed.base, parsed.fields) ? parsed : null;
  } catch {
    return null;
  }
}

export function noteNeedsCopy(entryId: string | undefined, base: NoteFields, latest?: Entry) {
  return Boolean(entryId && (!latest || !sameNote(noteFields(latest), base)));
}
