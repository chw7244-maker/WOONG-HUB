import assert from 'node:assert/strict';
import test from 'node:test';
import { crestIndex, crestKey, crestSource, handleCrest } from '../worker/football.mjs';
import { effectivePlayTime, ownPlayTimeShown, playTimeLabel } from '../src/lib/games.ts';
import { audioCategories, audioCategoryOrder, guessAccessory, legacyAccessoryCategory } from '../src/lib/audio.ts';

const request = path => new Request(`https://hub.example${path}`, { headers: { 'oai-authenticated-user-id': 'owner' } });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('crest names match across the club calendar and OpenLigaDB spellings', () => {
  assert.equal(crestKey('FC Arsenal'), crestKey('Arsenal'));
  assert.equal(crestKey('Brentford F.C.'), crestKey('Brentford'));
  assert.equal(crestKey('Chelsea FC'), crestKey('Chelsea'));
  assert.equal(crestKey('Brighton & Hove Albion'), crestKey('Brighton and Hove Albion'));
  assert.equal(crestKey('AFC Bournemouth'), 'bournemouth');
  assert.equal(crestKey('Manchester City'), 'manchestercity');
  const index = crestIndex([{ teamName: 'FC Arsenal', shortName: 'Arsenal', teamIconUrl: 'https://upload.wikimedia.org/a.svg' }]);
  assert.equal(index.get('arsenal'), 'https://upload.wikimedia.org/a.svg');
});

test('crest sources allow only known image hosts over https and inline raster images', () => {
  assert.deepEqual(crestSource('http://mediadb.kicker.de/x.png'), { url: 'https://mediadb.kicker.de/x.png' });
  assert.deepEqual(crestSource('https://upload.wikimedia.org/wikipedia/en/x.svg'), { url: 'https://upload.wikimedia.org/wikipedia/en/x.svg' });
  assert.deepEqual(crestSource('https://upload.wikimedia.org/wikipedia/en/thumb/2/2a/Brentford_FC_crest.svg/1920px-Brentford_FC_crest.svg.png'), { url: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2a/Brentford_FC_crest.svg/250px-Brentford_FC_crest.svg.png' });
  assert.equal(crestSource('https://preview.redd.it/logo.png'), null);
  assert.equal(crestSource('http://img.uefa.com/logo.png'), null);
  assert.equal(crestSource('javascript:alert(1)'), null);
  assert.equal(crestSource('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.deepEqual(crestSource(`data:image/png;base64,${png}`), { inline: 'image/png', data: png });
});

test('the crest endpoint serves a sandboxed image, uses overrides for broken icons and 404s for unknown clubs', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('getbltable')) return Response.json(Array.from({ length: 20 }, (_, i) => ({ teamName: i === 0 ? 'FC Arsenal' : `Team ${i}`, shortName: '', teamIconUrl: i === 0 ? `data:image/png;base64,${png}` : 'https://preview.redd.it/x.png' })));
    if (url.startsWith('https://upload.wikimedia.org/')) return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'Content-Type': 'image/svg+xml' } });
    return new Response('no', { status: 404 });
  };
  const city = await handleCrest(request('/api/football/crest?name=Manchester%20City'), null, { fetcher, cache: null });
  assert.equal(city.status, 200);
  assert.equal(city.headers.get('Content-Type'), 'image/svg+xml');
  assert.match(city.headers.get('Content-Security-Policy'), /sandbox/);
  assert.ok(calls[0].startsWith('https://upload.wikimedia.org/'), 'City uses the override, not the league table');
  const arsenal = await handleCrest(request('/api/football/crest?name=Arsenal'), null, { fetcher, cache: null });
  assert.equal(arsenal.headers.get('Content-Type'), 'image/png');
  assert.equal((await arsenal.arrayBuffer()).byteLength > 0, true);
  assert.equal((await handleCrest(request('/api/football/crest?name=Napoli'), null, { fetcher, cache: null })).status, 404);
  assert.equal((await handleCrest(request('/api/football/crest?name=Team%203'), null, { fetcher, cache: null })).status, 404);
  assert.equal((await handleCrest(new Request('https://hub.example/api/football/crest?name=Arsenal'), null, { fetcher, cache: null })).status, 401);
  const busy = await handleCrest(request('/api/football/crest?name=Chelsea'), null, { fetcher: async () => new Response('slow down', { status: 429 }), cache: null });
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get('Cache-Control'), 'no-store');
});

test('Steam minutes win; the hand-recorded time shows only when Steam has none', () => {
  assert.deepEqual(effectivePlayTime(300, 120, true), { minutes: 120, source: 'steam' });
  assert.deepEqual(effectivePlayTime(300, 0, true), { minutes: 300, source: 'own' });
  assert.deepEqual(effectivePlayTime(null, 0, true), { minutes: 0, source: 'steam' });
  assert.deepEqual(effectivePlayTime(90, null, false), { minutes: 90, source: 'own' });
  assert.deepEqual(effectivePlayTime(90, undefined, true), { minutes: null, source: 'loading' });
  assert.equal(playTimeLabel(effectivePlayTime(90, null, false)), '직접 1시간 30분');
  assert.equal(playTimeLabel(effectivePlayTime(null, 0, true)), 'Steam 0분');
  assert.equal(playTimeLabel(effectivePlayTime(null, null, false)), '시간 미기록');
  assert.equal(ownPlayTimeShown(15), false);
  assert.equal(ownPlayTimeShown(0), true);
  assert.equal(ownPlayTimeShown(null), true);
});

test('accessories split into ear tips and cables by name, and categories keep a stable order', () => {
  for (const name of ['JVC Spiral Dot Original (EP-FX9)', 'final Type E', 'Divinus Velvet Wide Bore', 'AZLA SednaEarfit MAX', 'SpinFit CP145']) assert.equal(guessAccessory(name), '이어팁', name);
  for (const name of ['Eletech Baroque Stage', 'iFi Audio 4.4mm ↔ 4.4mm 케이블', 'Effect Audio Cadmus 8W', 'NICEHCK SnowAg']) assert.equal(guessAccessory(name), '케이블', name);
  assert.equal(guessAccessory('AZLA Mithril'), null);
  assert.ok(audioCategories.includes('이어팁') && audioCategories.includes('케이블') && !audioCategories.includes(legacyAccessoryCategory));
  assert.deepEqual(audioCategoryOrder(['기타', '케이블', legacyAccessoryCategory, '이어폰', '스피커']), ['이어폰', '케이블', legacyAccessoryCategory, '스피커', '기타']);
});
