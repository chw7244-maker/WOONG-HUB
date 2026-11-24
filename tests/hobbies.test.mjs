import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceWatch, koreanWeekday, restoreWatchProgress, watchingNow, weeklyWatchPlan } from '../src/lib/watch.ts';
import { initial, todayKST, validateData } from '../src/lib/store.ts';
import { mergeData } from '../src/lib/merge.ts';
import { searchEntries } from '../src/lib/search.ts';
import { clubFixtures, handleFootball, leagueTable, premierLeagueSeason } from '../worker/football.mjs';
import { handleWatchSearch } from '../worker/watch.mjs';
import { handleWeather } from '../worker/weather.mjs';
import { fixtureCalendarHref, footballSourceId, saveFixture, savedFixtureEvents } from '../src/lib/football.ts';
import { dashboardDay, dashboardEvents, nextDashboardEvent } from '../src/lib/home-dashboard.ts';
import { hobbyCards } from '../src/lib/hobby-library.ts';
import { emptyGame } from '../src/lib/games.ts';
import { emptyMusic } from '../src/lib/music.ts';

const request = path => new Request(`https://hub.example${path}`, { headers: { 'oai-authenticated-user-id': 'owner' } });
const day = Date.parse('2026-11-18T10:00:00Z');
const feed = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:game-1\r\nDTSTART:20261121T123000Z\r\nSUMMARY:Manchester City v Fulham - Premier\r\n League\r\nSEQUENCE:0\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:game-1\r\nDTSTART:20261121T200000Z\r\nSUMMARY:Manchester City v Fulham - Premier League\r\nSTATUS:TENTATIVE\r\nSEQUENCE:1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:game-2\r\nDTSTART:20261124T200000Z\r\nSUMMARY:Napoli v Manchester City - Champions League\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const table = Array.from({ length: 20 }, (_, i) => ({ teamId: i + 1, teamName: i === 4 ? 'Manchester City' : `Team ${i}`, matches: 10, won: 4, draw: 3, lost: 3, points: 15, goalDiff: 0 }));
const watch = { id: 'watch', kind: 'watch', title: '감상 기록', detail: '', category: '', status: '', url: '', date: '', done: false,
  createdAt: new Date(day).toISOString(), watch: { type: 'tv', status: 'planned', season: 2, progress: 0, rating: 0, updatedAt: new Date(day).toISOString() } };

test('the hobby library sorts recorded activity, filters and keeps platform routes separate', () => {
  const { watch: details, ...base } = watch;
  const film = {...watch, watch:{...details,status:'watching',progress:4,updatedAt:'2026-11-24T11:00:00Z',catalog:{id:1,title:'감상 기록',posterPath:'/sample.jpg'}}};
  const steam = {...base,id:'steam',kind:'games',category:'PC',status:'플레이 중',game:{...emptyGame(),startedAt:'2026-11-22',steamAccount:{steamId:'76561198000000011',appId:620}}};
  const xbox = {...base,id:'xbox',kind:'games',category:'Xbox',status:'완료'};
  const album = {...base,id:'album',kind:'music',music:{...emptyMusic(),listenedAt:'2026-11-23'}};
  const note = {...base,id:'note',kind:'note'};
  const items = [steam, xbox, album, note, film];
  const selected = new Set(['album','xbox']);
  const ids = cards => cards.map(({entry})=>entry.id);
  const cards = hobbyCards(items,'all',selected);
  assert.deepEqual(ids(cards), ['watch','album','steam','xbox']);
  assert.equal(cards[0].poster, 'https://image.tmdb.org/t/p/w342/sample.jpg');
  assert.equal(cards[2].href, '/games/steam/?steamId=76561198000000011&q=620');
  assert.equal(cards[3].href, '/games/xbox/');
  assert.deepEqual(ids(hobbyCards(items,'active',selected)), ['watch','steam']);
  assert.deepEqual(ids(hobbyCards(items,'favorites',selected)), ['album','xbox']);
});

test('hobby favorites survive backup and combine independent device updates', () => {
  const { watch: details, ...record } = watch;
  const entries = [watch, {...record,id:'game',kind:'games'}, {...record,id:'album',kind:'music'}, {...record,id:'note',kind:'note'}];
  const snapshot = ids => validateData({...initial,entries,preferences:{...initial.preferences,hobbyFavoriteIds:ids}});
  const base = snapshot(['watch','deleted','note']);
  assert.deepEqual(base.preferences.hobbyFavoriteIds, ['watch']);
  assert.deepEqual(mergeData(base, snapshot(['game']), snapshot(['watch','album'])).data.preferences.hobbyFavoriteIds, ['album','game']);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(snapshot(['game','album'])))).preferences.hobbyFavoriteIds, ['game','album']);
  assert.throws(()=>snapshot([123]), /즐겨찾기/);
});

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

test('웹툰 소식 설정은 작품 백업과 회차 변경에 저장된다', () => {
  const entry = { ...watch, watch: { type:'webtoon', status:'planned', updatedAt:watch.createdAt, newsEvents:['completion','resume','resume'] } };
  const data = validateData(JSON.parse(JSON.stringify({ ...initial, entries:[entry] })));
  assert.deepEqual(data.entries[0].watch.newsEvents,['resume','completion']);
  assert.deepEqual(advanceWatch(data.entries[0]).watch.newsEvents,['resume','completion']);
  assert.throws(() => validateData({ ...initial, entries:[{ ...entry, watch:{ ...entry.watch, newsEvents:['unrecognized'] } }] }));
  assert.throws(() => validateData({ ...initial, entries:[{ ...watch, watch:{ ...watch.watch, newsEvents:['resume'] } }] }));
  assert.equal(validateData({ ...initial, entries:[{ ...entry, watch:{ ...entry.watch, newsEvents:[] } }] }).entries[0].watch.newsEvents,undefined);
});

test('주간 감상 계획은 KST 새해의 월~일과 완료 상태를 구분하고 백업에 남는다', () => {
  const work = (id, details) => ({ ...watch, id, watch: { updatedAt:watch.createdAt,status:'planned',...details } });
  const entries = [
    work('movie',{type:'movie',plannedDate:'2026-12-31'}),
    work('drama',{type:'tv',plannedDate:'2027-01-03'}),
    work('webtoon',{type:'webtoon',weekday:4}),
    work('completed',{type:'tv',status:'completed',plannedDate:'2027-01-01'}),
    work('out-of-week',{type:'movie',plannedDate:'2027-01-04'}),
    work('no-date',{type:'movie'}),
  ];
  const restored = validateData(JSON.parse(JSON.stringify({...initial,entries}))).entries;
  const now = new Date('2026-12-31T15:30:00Z');
  assert.equal(todayKST(now),'2027-01-01');
  assert.deepEqual(weeklyWatchPlan(restored,todayKST(now)).map(day=>[day.date,day.entries.map(entry=>entry.id)]),[
    ['2026-12-28',[]],['2026-12-29',[]],['2026-12-30',[]],['2026-12-31',['movie']],
    ['2027-01-01',['webtoon']],['2027-01-02',[]],['2027-01-03',['drama']],
  ]);
  assert.throws(()=>validateData({...initial,entries:[work('invalid',{type:'movie',plannedDate:'2027-02-29'})]}));
  assert.throws(()=>validateData({...initial,entries:[work('webtoon',{type:'webtoon',plannedDate:'2027-01-01'})]}));
});

test('회차 되돌리기는 직전 진행도와 상태를 복원하고 새 회차나 별도 예정일을 덮지 않는다', () => {
  const old = { ...watch,watch:{...watch.watch,progress:undefined} };
  const advanced = advanceWatch(old,new Date(day+1000));
  assert.equal(advanced.watch.progress,1);
  assert.equal(advanced.watch.status,'watching');
  const scheduled = {...advanced,watch:{...advanced.watch,plannedDate:'2026-11-20'}};
  const restored = restoreWatchProgress(scheduled,old.watch,advanced.watch);
  assert.equal(restored.watch.progress,undefined);
  assert.equal(restored.watch.status,'planned');
  assert.equal(restored.watch.plannedDate,'2026-11-20');
  assert.equal(restoreWatchProgress(advanceWatch(advanced,new Date(day+2000)),old.watch,advanced.watch),null);
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
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'manual');
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

test('캘린더 조회는 지난 공식 경기와 취소 상태를 조회하고 순위표 소스는 호출하지 않는다', async () => {
  const fetcher = async url => {
    assert.equal(new URL(url).hostname, 'api-prod.mancity.com');
    return new Response(feed.replace('SUMMARY:Napoli', 'STATUS:CANCELLED\r\nSUMMARY:Napoli'));
  };
  const now = Date.parse('2026-11-23T10:00:00Z');
  const calendar = await (await handleFootball(request('/api/football?view=calendar'), null, { fetcher, now })).json();
  assert.deepEqual(calendar.fixtures.items.map(item=>[item.id,item.postponed]), [['game-1','tentative'],['game-2','cancelled']]);
  assert.equal(calendar.standings, null);
  assert.equal(calendar.results, null);
  const home = await (await handleFootball(request('/api/football?view=home'), null, { fetcher, now })).json();
  assert.deepEqual(home.fixtures.items.map(item=>item.id), ['game-2']);
});

test('담은 경기만 캘린더에 추가하고 KST 날짜가 바뀐 경기와 취소를 구분한다', () => {
  const [first,second] = clubFixtures(feed);
  const old = { ...first,kickOff:'2026-11-21T12:30:00Z',postponed:null };
  const personal = { ...watch,id:'personal',kind:'event',date:'2026-11-22T05:00' };
  const saved = [saveFixture(old)];
  const source = { items:[first,second],stale:false,checkedAt:new Date(day).toISOString() };
  const updated = savedFixtureEvents(saved,source,day,false);
  assert.equal(updated.length,1);
  assert.equal(fixtureCalendarHref(updated[0].start),'/calendar/?date=2026-11-22');
  assert.match(updated[0].note,/킥오프 변경/);
  assert.deepEqual(dashboardDay(dashboardEvents([personal],null,[],updated),'2026-11-22').map(event=>event.id).sort(),['game-1','personal']);
  assert.deepEqual(dashboardDay(dashboardEvents([],null,[footballSourceId],updated),'2026-11-22'),[]);
  const cancelled = savedFixtureEvents(saved,{...source,items:[{...first,postponed:'cancelled'}]},day,false);
  assert.match(cancelled[0].note,/경기 취소/);
  assert.equal(nextDashboardEvent(cancelled,day,'2026-11-18'),null);
  const unavailable = savedFixtureEvents(saved,null,day,true);
  assert.equal(unavailable[0].start,old.kickOff);
  assert.match(unavailable[0].note,/저장 당시 시간/);
  assert.match(savedFixtureEvents(saved,{...source,stale:true},day,false)[0].note,/마지막 조회 정보/);
});

test('담은 경기 백업과 기기 간 병합은 경기별 추가와 취소를 보존한다', () => {
  const [first, second] = clubFixtures(feed).map(saveFixture);
  const withFixtures = savedFixtures => ({ ...initial,preferences:{...initial.preferences,savedFixtures} });
  const base = withFixtures([first]);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(base))),base);
  assert.deepEqual(mergeData(initial, withFixtures([first]),withFixtures([first,second])).data.preferences.savedFixtures,[first,second]);
  assert.deepEqual(mergeData(base,withFixtures([]),withFixtures([first,second])).data.preferences.savedFixtures,[second]);
  assert.throws(()=>validateData(withFixtures([first,first])));
  assert.throws(()=>validateData(withFixtures([{...first,kickOff:'2026-02-30T00:00:00Z'}])));
});

test('TMDB lookup handles missing configuration and only returns validated poster paths', async () => {
  const search = request('/api/watch/search?type=movie&q=Contact');
  assert.equal((await (await handleWatchSearch(search, {})).json()).error, 'catalog_not_connected');
  const response = await handleWatchSearch(search, { TMDB_READ_TOKEN: 'test-token' }, async (url, options) => {
    assert.equal(new URL(url).searchParams.get('language'), 'ko-KR');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.redirect, 'manual');
    return Response.json({ results: [{ id: 12, title: '콘택트', release_date: '1997-07-11', poster_path: '/poster.jpg' }, { id: 13, title: 'Invalid', poster_path: '/../../poster.jpg' }] });
  });
  assert.deepEqual((await response.json()).items, [{ id: 12, title: '콘택트', year: '1997', posterPath: '/poster.jpg' }]);
  const redirect = await handleWatchSearch(search, { TMDB_READ_TOKEN: 'test-token' }, async () => Response.redirect('https://example.com/'));
  assert.equal(redirect.status, 502);
});

test('weather proxy uses the fixed forecast origin and validates the city before requesting it', async () => {
  const fetcher = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.open-meteo.com');
    assert.equal(options.redirect, 'manual');
    return Response.json({ current: { time: '2026-11-18T12:00', temperature_2m: 11 } });
  };
  const valid = await handleWeather(request('/api/weather?city=suwon'), null, { fetcher });
  assert.equal((await valid.json()).current.temperature, 11);
  assert.equal((await handleWeather(request('/api/weather?city=constructor'), null, { fetcher })).status, 400);
});

test('weather fallback labels MET Norway data and keeps KST and rainfall units distinct', async () => {
  const fetcher = async (url, options) => {
    if (new URL(url).hostname === 'api.open-meteo.com') return new Response('', { status: 429 });
    assert.equal(new URL(url).hostname, 'api.met.no');
    assert.match(options.headers['User-Agent'], /WoongHub/);
    return Response.json({ properties: { timeseries: [{ time: '2026-11-18T15:00:00Z', data: {
      instant: { details: { air_temperature: 3, wind_speed: 5 } },
      next_1_hours: { summary: { symbol_code: 'rain_night' }, details: { precipitation_amount: 0.4 } },
    } }] } });
  };
  const forecast = await (await handleWeather(request('/api/weather?city=suwon'), null, { fetcher })).json();
  assert.equal(forecast.source, 'met-norway');
  assert.equal(forecast.current.time, '2026-11-19T00:00');
  assert.equal(forecast.current.wind, 18);
  assert.equal(forecast.hours[0].rainAmount, 0.4);
  assert.equal(forecast.hours[0].rain, null);
});
