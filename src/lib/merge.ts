import { type Entry, type HubData, validateData } from './store.ts';

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function hash(value: string) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}

/** Three-way merge. Concurrent edits retain both versions; edited records beat deletions. */
export function mergeData(base: HubData, local: HubData, remote: HubData): { data: HubData; conflicts: number } {
  const b = new Map(base.entries.map(e => [e.id, e]));
  const l = new Map(local.entries.map(e => [e.id, e]));
  const r = new Map(remote.entries.map(e => [e.id, e]));
  const output = new Map<string, Entry>();
  let conflicts = 0;
  for (const id of new Set([...l.keys(), ...r.keys(), ...b.keys()])) {
    const before = b.get(id), mine = l.get(id), theirs = r.get(id);
    if (same(mine, theirs)) { if (mine) output.set(id, mine); continue; }
    if (same(mine, before)) { if (theirs) output.set(id, theirs); continue; }
    if (same(theirs, before)) { if (mine) output.set(id, mine); continue; }
    conflicts++;
    if (theirs) output.set(id, theirs);
    if (mine) {
      const suffix = theirs ? ' · 다른 기기 변경 사본' : ' · 복구 사본';
      const stem = `copy-${id.slice(0,80)}-${hash(JSON.stringify(mine))}`;
      let copyId = stem, n = 1;
      while (output.has(copyId) || l.has(copyId) || r.has(copyId)) copyId = `${stem}-${n++}`;
      output.set(copyId, { ...mine, id: copyId, title: mine.title.slice(0,200-suffix.length) + suffix });
    }
  }
  const preferences = { ...remote.preferences };
  for (const key of ['theme','city','widgets','calendarHiddenSources','mediaWidgets','pinnedAudioSetup','pinnedNote','homeOrder','hiddenNewWidgets'] as const) {
    if (!same(local.preferences[key], base.preferences[key])) Object.assign(preferences, { [key]: local.preferences[key] });
  }
  if (local.preferences.savedFixtures || remote.preferences.savedFixtures || base.preferences.savedFixtures) {
    const before = new Map(base.preferences.savedFixtures?.map(fixture => [fixture.id, fixture]));
    const mine = new Map(local.preferences.savedFixtures?.map(fixture => [fixture.id, fixture]));
    const theirs = new Map(remote.preferences.savedFixtures?.map(fixture => [fixture.id, fixture]));
    preferences.savedFixtures = [];
    for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
      const selected = same(mine.get(id), before.get(id)) ? theirs.get(id) : mine.get(id);
      if (selected) preferences.savedFixtures.push(selected);
    }
  }
  return { data: validateData({version:1,entries:[...output.values()],preferences}), conflicts };
}
