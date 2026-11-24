import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalDatabase, applyLocalMigrations } from '../scripts/local-db.mjs';
import { handleMusicDevice } from '../worker/music-device.mjs';
import { handleApi } from '../worker/api.mjs';

const origin = 'https://hub.test';
const library = (count = 2) => ({ name: '전체 곡.playlist.m3u8', suffix: '.playlist.m3u8', importedAt: '2026-11-24T09:00:00.000Z', tracks: Array.from({ length: count }, (_, i) => ({ p: `/storage/1A2B-3C4D/Music/A Fairly Long Artist Name ${i % 50}/The Deluxe Remastered Album Edition ${i % 300}/${String(i % 20).padStart(2, '0')} Track number ${i}.flac`, s: 200 + (i % 100) })) });
const request = (method, user = 'alice', body, headers = {}) => new Request(origin + '/api/music/device', { method, headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(body !== undefined ? { Origin: origin, 'Content-Type': 'application/json' } : method === 'DELETE' ? { Origin: origin } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });

async function setup(t) { const DB = createLocalDatabase(); await applyLocalMigrations(DB); t.after(() => DB.sqlite.close()); return { DB }; }

test('the track list is saved per HUB user, read back unchanged, replaced and removed', async t => {
  const env = await setup(t);
  assert.deepEqual(await (await handleMusicDevice(request('GET'), env)).json(), { library: null });
  const saved = await handleMusicDevice(request('PUT', 'alice', library()), env);
  assert.equal(saved.status, 200); assert.deepEqual(await saved.json(), { saved: true, count: 2 });
  assert.deepEqual((await (await handleMusicDevice(request('GET'), env)).json()).library, library());
  assert.deepEqual(await (await handleMusicDevice(request('GET', 'bob'), env)).json(), { library: null });
  await handleMusicDevice(request('PUT', 'alice', library(3)), env);
  assert.equal((await (await handleMusicDevice(request('GET'), env)).json()).library.tracks.length, 3);
  assert.equal((await handleMusicDevice(request('DELETE'), env)).status, 200);
  assert.deepEqual(await (await handleMusicDevice(request('GET'), env)).json(), { library: null });
});

test('20,000 tracks fit because the list is stored compressed', async t => {
  const env = await setup(t);
  const big = library(20000);
  assert.ok(JSON.stringify(big.tracks).length > 2_000_000); // larger than a D1 cell as plain JSON
  const saved = await handleMusicDevice(request('PUT', 'alice', big), env);
  assert.equal(saved.status, 200);
  const row = await env.DB.prepare('SELECT tracks, track_count FROM music_device_libraries WHERE user_id = ?').bind('alice').first();
  assert.ok(row.tracks.startsWith('gz:') && row.tracks.length < 1_800_000); assert.equal(row.track_count, 20000);
  assert.equal((await (await handleMusicDevice(request('GET'), env)).json()).library.tracks[19999].p, big.tracks[19999].p);
  assert.equal((await handleMusicDevice(request('PUT', 'alice', library(20001)), env)).status, 400);
});

test('writes need HUB identity, same origin and JSON; bad lists are refused without saving', async t => {
  const env = await setup(t);
  assert.equal((await handleMusicDevice(request('GET', null), env)).status, 401);
  assert.equal((await handleApi(request('GET', null), env)).status, 401);
  assert.equal((await handleMusicDevice(request('PUT', 'alice', library(), { Origin: 'https://evil.test' }), env)).status, 403);
  assert.equal((await handleMusicDevice(request('PUT', 'alice', library(), { 'Content-Type': 'text/plain' }), env)).status, 415);
  assert.equal((await handleMusicDevice(request('PUT', 'alice', '{'), env)).status, 400);
  assert.equal((await handleMusicDevice(request('PUT', 'alice', { ...library(), tracks: [{ p: 'relative.flac' }] }), env)).status, 400);
  assert.equal((await handleMusicDevice(request('POST', 'alice', library()), env)).status, 405);
  assert.deepEqual(await (await handleMusicDevice(request('GET'), env)).json(), { library: null });
});
