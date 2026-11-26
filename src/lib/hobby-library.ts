import type { Entry } from './store.ts';
import { lastListenedAt, musicCoverUrl } from './music.ts';
import { steamLibraryHref } from './steam-account.ts';
import { isWatchEntry, progressLabel, watchCoverUrl, watchTypes } from './watch.ts';

export type HobbyView = 'all' | 'active' | 'favorites';

export function hobbyCards(entries: Entry[], view: HobbyView, favorites: ReadonlySet<string>) {
  return entries.flatMap(entry => {
    if (view === 'favorites' && !favorites.has(entry.id)) return [];
    const card = hobbyCard(entry);
    return card && (view !== 'active' || card.active) ? [card] : [];
  }).sort((a, b) => b.activity - a.activity || Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt));
}

function hobbyCard(entry: Entry) {
  const common = { entry, href: '', poster: '', active: false, artwork: '', source: '', status: '', activity: Date.parse(entry.createdAt) };
  const onDay = (day: string) => day ? Date.parse(day + 'T00:00:00+09:00') : common.activity;
  if (isWatchEntry(entry)) {
    const { watch } = entry;
    return { ...common, source: '작품 · ' + watchTypes[watch.type], status: progressLabel(watch),
      poster: watchCoverUrl(watch), active: watch.status === 'watching', activity: Date.parse(watch.updatedAt) };
  }
  if (entry.kind === 'music') {
    const listened = lastListenedAt(entry.music);
    return { ...common, source: '음악 · ' + (entry.music?.type === 'playlist' ? '플레이리스트' : '앨범'),
      status: listened ? `${Number(listened.slice(5, 7))}. ${Number(listened.slice(8, 10))}. 감상` : entry.status,
      artwork: musicCoverUrl(entry.music), activity: onDay(listened) };
  }
  if (entry.kind === 'games') {
    const xbox = entry.category === 'Xbox';
    const steam = entry.game?.steamAccount;
    return { ...common, source: ['게임', xbox ? 'Xbox' : steam ? 'Steam' : entry.category].filter(Boolean).join(' · '),
      href: xbox ? '/games/xbox/' : steam ? steamLibraryHref(steam.steamId, steam.appId) : '',
      status: entry.status, artwork: entry.game?.steam?.imageUrl ?? '', active: entry.status === '플레이 중',
      activity: onDay(entry.game?.completedAt || entry.game?.startedAt || '') };
  }
  return null;
}
