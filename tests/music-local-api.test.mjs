import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalDatabase, applyLocalMigrations } from '../scripts/local-db.mjs';
import { coverId, handleMusicLocal } from '../worker/music-local.mjs';
import { handleApi } from '../worker/api.mjs';
import { albumKeyOf, trackFromTags } from '../src/lib/local-music.ts';

const origin = 'https://hub.test';
const jpeg = fill => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(fill), 0xff, 0xd9]);
const track = (album, no) => trackFromTags(`Flac/${album}/0${no}.flac`, { title: `Song ${no}`, artist: 'Band', albumartist: 'Band', album, track: { no }, disk: { no: null } }, { container: 'FLAC', lossless: true, sampleRate: 44100, bitsPerSample: 16, duration: 200 }, 1);
const library = covers => ({ folder: 'Music', scannedAt: '2026-11-24T00:00:00.000Z', tracks: [track('One', 1), track('One', 2), track('Two', 1)], covers });
const call = (method, path, { user = 'alice', body, type, headers = {} } = {}) => handleMusicLocal(new Request(origin + path, { method, headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(body !== undefined || method === 'DELETE' ? { Origin: origin } : {}), ...(type ? { 'Content-Type': type } : {}), ...headers }, ...(body !== undefined ? { body } : {}) }), env);
let env;
async function setup(t) { const DB = createLocalDatabase(); await applyLocalMigrations(DB); t.after(() => DB.sqlite.close()); env = { DB }; }
const putCover = (bytes, user) => call('POST', '/api/music/local/covers', { user, body: bytes, type: 'image/jpeg' });

test('covers are stored once by the hash of their bytes and served back to their owner only', async t => {
  await setup(t);
  const first = await putCover(jpeg(1)); assert.equal(first.status, 200);
  const { id } = await first.json(); assert.equal(id, await coverId(jpeg(1)));
  assert.equal((await putCover(jpeg(1))).status, 200);
  assert.deepEqual(await (await call('GET', '/api/music/local/covers')).json(), { ids: [id] });
  const image = await call('GET', `/api/music/local/cover?id=${id}`);
  assert.equal(image.status, 200); assert.equal(image.headers.get('Content-Type'), 'image/jpeg'); assert.match(image.headers.get('Cache-Control'), /immutable/);
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), jpeg(1));
  assert.equal((await call('GET', `/api/music/local/cover?id=${id}`, { user: 'bob' })).status, 404);
  assert.equal((await call('GET', '/api/music/local/cover?id=nope')).status, 400);
});

test('covers must be small JPEGs sent from the site', async t => {
  await setup(t);
  assert.equal((await putCover(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).status, 415);
  assert.equal((await call('POST', '/api/music/local/covers', { body: jpeg(2), type: 'image/png' })).status, 415);
  assert.equal((await putCover(new Uint8Array(90 * 1024).fill(0xff))).status, 413);
  assert.equal((await call('POST', '/api/music/local/covers', { body: jpeg(2), type: 'image/jpeg', headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await putCover(jpeg(2), null)).status, 401);
});

test('the library is saved per user, read back, and covers no album uses any more are removed', async t => {
  await setup(t);
  const a = (await (await putCover(jpeg(3))).json()).id, b = (await (await putCover(jpeg(4))).json()).id;
  const lib = library({ [albumKeyOf(track('One', 1))]: { id: a }, [albumKeyOf(track('Two', 1))]: { id: b } });
  const saved = await call('PUT', '/api/music/local', { body: JSON.stringify(lib), type: 'application/json' });
  assert.equal(saved.status, 200); assert.deepEqual(await saved.json(), { saved: true, tracks: 3 });
  assert.deepEqual((await (await call('GET', '/api/music/local')).json()).library, lib);
  assert.deepEqual(await (await call('GET', '/api/music/local', { user: 'bob' })).json(), { library: null });
  const fewer = library({ [albumKeyOf(track('One', 1))]: { id: a } });
  await call('PUT', '/api/music/local', { body: JSON.stringify(fewer), type: 'application/json' });
  assert.deepEqual((await (await call('GET', '/api/music/local/covers')).json()).ids, [a]);
  assert.equal((await call('PUT', '/api/music/local', { body: JSON.stringify({ ...fewer, tracks: [{ ...fewer.tracks[0], path: '/etc/x' }] }), type: 'application/json' })).status, 400);
  assert.equal((await call('PUT', '/api/music/local', { body: JSON.stringify(fewer), type: 'text/plain' })).status, 415);
  assert.equal((await call('DELETE', '/api/music/local')).status, 200);
  assert.deepEqual(await (await call('GET', '/api/music/local')).json(), { library: null });
  assert.deepEqual((await (await call('GET', '/api/music/local/covers')).json()).ids, []);
  assert.equal((await handleApi(new Request(origin + '/api/music/local'), env)).status, 401);
});

test('more than 100 stale covers are cleaned up despite the D1 bound-value limit', async t => {
  await setup(t);
  for (let i = 0; i < 130; i++) await putCover(jpeg(i));
  await call('PUT', '/api/music/local', { body: JSON.stringify(library({})), type: 'application/json' });
  assert.deepEqual((await (await call('GET', '/api/music/local/covers')).json()).ids, []);
});

test('the library can be sent gzip-compressed, and a rejected track is named in the reply', async t => {
  await setup(t);
  const gz = async text => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const lib = library({});
  const saved = await call('PUT', '/api/music/local', { body: await gz(JSON.stringify(lib)), type: 'application/gzip' });
  assert.equal(saved.status, 200); assert.deepEqual(await saved.json(), { saved: true, tracks: 3 });
  assert.deepEqual((await (await call('GET', '/api/music/local')).json()).library, lib);
  const bad = await call('PUT', '/api/music/local', { body: await gz(JSON.stringify({ ...lib, tracks: [{ ...lib.tracks[0], path: 'Flac/../x.flac' }] })), type: 'application/gzip' });
  assert.equal(bad.status, 400); assert.match((await bad.json()).detail, /Flac\/\.\.\/x\.flac/);
  const broken = await call('PUT', '/api/music/local', { body: new Uint8Array([1, 2, 3]), type: 'application/gzip' });
  assert.equal(broken.status, 400);
  const bomb = await gz('x'.repeat(13 * 1024 * 1024));
  assert.equal((await call('PUT', '/api/music/local', { body: bomb, type: 'application/gzip' })).status, 413);
});
