import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWatch, koreanWeekday, watchingNow } from '../src/lib/watch.ts';
import { initial, validateData } from '../src/lib/store.ts';
import { mergeData } from '../src/lib/merge.ts';
import { searchEntries } from '../src/lib/search.ts';
import { clubFixtures, handleFootball, leagueTable, premierLeagueSeason } from '../worker/football.mjs';
import { handleWatchSearch } from '../worker/watch.mjs';

const request = path => new Request(`https://hub.example${path}`, { headers: { 'oai-authenticated-user-id': 'owner' } });
const day = Date.parse('2026-11-18T10:00:00Z');
const feed = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:game-1\r\nDTSTART:20261121T123000Z\r\nSUMMARY:Manchester City v Fulham - Premier\r\n League\r\nSEQUENCE:0\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:game-1\r\nDTSTART:20261121T200000Z\r\nSUMMARY:Manchester City v Fulham - Premier League\r\nSTATUS:TENTATIVE\r\nSEQUENCE:1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:game-2\r\nDTSTART:20261124T200000Z\r\nSUMMARY:Napoli v Manchester City - Champions League\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const table = Array.from({ length: 20 }, (_, i) => ({ teamId: i + 1, teamName: i === 4 ? 'Manchester City' : `Team ${i}`, matches: 10, won: 4, draw: 3, lost: 3, points: 15, goalDiff: 0 }));
const watch = { id: 'watch', kind: 'watch', title: '감상 기록', detail: '', category: '', status: '', url: '', date: '', done: false,
  createdAt: new Date(day).toISOString(), watch: { type: 'tv', status: 'planned', season: 2, progress: 0, rating: 0, updatedAt: new Date(day).toISOString() } };

test('works survive backup, three-way merge, searching and one-episode progression', () => {
  const saved = advanceWatch(watch, new Date(day + 1));
  const local = validateData(JSON.parse(JSON.stringify({ ...initial, entries: [saved], preferences: { ...initial.preferences, homeOrder: ['week', 'resume'], hiddenNewWidgets: ['football'] } })));
  const merged = mergeData(initial, local, { ...initial, preferences: { ...initial.preferences, theme: 'light' } }).data;
  assert.equal(merged.preferences.theme, 'light');
  assert.deepEqual(merged.preferences.homeOrder, ['week', 'resume']);
  assert.deepEqual(merged.preferences.hiddenNewWidgets, ['football']);
  assert.equal(watchingNow(merged.entries)[0].watch.progress, 1);
  assert.equal(watchingNow(merged.entries)[0].watch.rating, 0);
  assert.equal(searchEntries(merged.entries, '시즌 2', 'watch').length, 1);
  assert.equal(koreanWeekday(new Date('2026-11-15T16:00:00Z')), 0);
  assert.equal(advanceWatch({ ...saved, watch: { ...saved.watch, status: 'completed' } }).watch.progress, 1);
  assert.throws(() => validateData({ ...initial, entries: [{ ...saved, watch: { ...saved.watch, type: 'movie' } }] }));
  assert.throws(() => validateData({ ...initial, preferences: { ...initial.preferences, homeOrder: ['unknown'] } }));
});

test('club calendar uses the newest revision, retains all competitions and keeps UTC for KST display', () => {
  assert.deepEqual(clubFixtures(feed).map(match => [match.competition, match.kickOff, match.postponed]), [
    ['Premier League', '2026-11-21T20:00:00Z', 'tentative'], ['Champions League', '2026-11-24T20:00:00Z', null],
  ]);
  assert.equal(premierLeagueSeason(new Date('2027-06-01')), 2026);
  assert.equal(premierLeagueSeason(new Date('2027-08-01')), 2027);
  assert.equal(leagueTable(table).find(row => row.city).rank, 5);
  assert.throws(() => leagueTable(table.slice(1)));
});

test('home loads just the official schedule and league failures do not hide it', async () => {
  let calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.startsWith('https://api-prod.mancity.com/')) return new Response(feed);
    if (url.endsWith('getbltable/pl/2026')) return Response.json(table);
    return new Response('unavailable', { status: 503 });
  };
  const home = await (await handleFootball(request('/api/football?view=home'), null, { fetcher, now: day })).json();
  assert.equal(calls.length, 1);
  assert.equal(home.fixtures.items.length, 2);
  const full = await (await handleFootball(request('/api/football'), null, { fetcher, now: day })).json();
  assert.equal(full.standings.items.length, 20);
  assert.equal(full.results, null);
  const anonymous = await handleFootball(new Request('https://hub.example/api/football'), null, { fetcher, now: day });
  assert.equal(anonymous.status, 401);
});

test('TMDB lookup handles missing configuration and only returns validated poster paths', async () => {
  const search = request('/api/watch/search?type=movie&q=Contact');
  assert.equal((await (await handleWatchSearch(search, {})).json()).error, 'catalog_not_connected');
  const response = await handleWatchSearch(search, { TMDB_READ_TOKEN: 'test-token' }, async (url, options) => {
    assert.equal(new URL(url).searchParams.get('language'), 'ko-KR');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return Response.json({ results: [{ id: 12, title: '콘택트', release_date: '1997-07-11', poster_path: '/poster.jpg' }, { id: 13, title: 'Invalid', poster_path: '/../../poster.jpg' }] });
  });
  assert.deepEqual((await response.json()).items, [{ id: 12, title: '콘택트', year: '1997', posterPath: '/poster.jpg' }]);
});
