import assert from 'node:assert/strict';
import test from 'node:test';
import { playlistCandidates, playlistExport, playlistRequest } from '../src/lib/local-playlist.ts';
import { emptyMusic, validateMusic } from '../src/lib/music.ts';
import { initial, validateData } from '../src/lib/store.ts';
import { handleMusicPlaylist } from '../worker/music-playlist.mjs';

const sample = (index, album = '샘플 앨범', artist = '샘플 연주자') => ({
  path: `${album}/${index}.flac`, title: `샘플 곡 ${index}`, artist, album, genre: '재즈', seconds: 180,
});
const body = { prompt: '조용한 재즈', count: 2, tracks: [sample(1), sample(2)] };
const headers = {
  'oai-authenticated-user-id': 'owner', Origin: 'https://hub.test',
  'Content-Type': 'application/json',
};
const request = (input = body, overrides = {}) => new Request('https://hub.test/api/music/local/playlist', {
  method: 'POST', headers: { ...headers, ...overrides }, body: JSON.stringify(input),
});
const env = { GEMINI_API_KEY: 'fixture-key' };
const gemini = result => Response.json({ candidates: [
  { finishReason: 'STOP', content: { parts: [{ thought: true, text: 'ignored' }, { text: JSON.stringify(result) }] } },
] });

test('take candidates across albums, while retaining explicitly requested artists', () => {
  const albums = Array.from({ length: 150 }, (_, index) => ({
    tracks: [sample(1, `앨범 ${index}`, index === 140 ? '요청 아티스트' : '일반 연주자'), sample(2, `앨범 ${index}`)],
  }));
  const picked = playlistCandidates(albums, '요청 아티스트 연주', () => 0);
  assert.equal(picked.length, 120);
  assert.equal(picked[0].artist, '요청 아티스트');
  assert.equal(new Set(picked.map(track => track.album)).size, 120);
  assert.deepEqual(playlistCandidates([], '재즈', () => 0), []);
  assert.deepEqual(Object.keys(playlistRequest('재즈', 2, picked).tracks[0]), ['title', 'artist', 'genre']);
});

test('export uses Unicode metadata and relative paths from the scanned folder', () => {
  const file = playlistExport('밤: 재즈\n', [sample(1), { ...sample(2), seconds: null, path: '#광고가 아닌 곡.flac' }]);
  assert.equal(file.filename, 'HUB - 밤 재즈.m3u8');
  assert.match(file.content, /#EXTM3U\n#PLAYLIST:밤: 재즈\n#EXTINF:180,샘플 연주자 - 샘플 곡 1\n\.\/샘플 앨범\/1\.flac/);
  assert.match(file.content, /#EXTINF:-1,샘플 연주자 - 샘플 곡 2\n\.\/#광고가 아닌 곡.flac\n$/);
  assert.throws(() => playlistExport('샘플', [{ ...sample(1), path: '../file.flac' }]));
});

test('local playlist track order survives backup validation and can be exported without the library', () => {
  const folder = '내 음원';
  const first = sample(2), second = { ...sample(1), seconds: null };
  const music = { ...emptyMusic(), type: 'playlist', favorite: true, localPlaylist: { folder, tracks: [first, second] } };
  const entry = { id: 'local-playlist', kind: 'music', title: '저녁 재즈', detail: '', category: '디지털',
    status: '컬렉션', url: '', date: '', done: false, createdAt: '2026-11-26T00:00:00.000Z', music };
  const restored = validateData(JSON.parse(JSON.stringify({ ...initial, entries: [entry] }))).entries[0];
  assert.equal(restored.music.type, 'playlist');
  assert.equal(restored.music.favorite, true);
  assert.equal(restored.music.localPlaylist.folder, folder);
  assert.deepEqual(restored.music.localPlaylist.tracks.map(track => track.path), [first.path, second.path]);
  assert.deepEqual(Object.keys(restored.music.localPlaylist.tracks[0]), ['path', 'title', 'artist', 'album', 'seconds']);
  assert.deepEqual(playlistExport(restored.title, restored.music.localPlaylist.tracks), playlistExport(entry.title, [first, second]));
  assert.throws(() => validateMusic({ ...music, type: 'album' }));
  assert.throws(() => validateMusic({ ...music, localPlaylist: { folder, tracks: [first, first] } }));
  assert.throws(() => validateMusic({ ...music, localPlaylist: { folder, tracks: [{ ...first, path: '../side.flac' }] } }));
});

test('calls the free-tier-capable model with bounded metadata and preserves the selected order', async () => {
  const response = await handleMusicPlaylist(request(), env, async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
    assert.equal(options.headers['x-goog-api-key'], env.GEMINI_API_KEY);
    assert.equal(options.redirect, 'manual');
    const { contents, generationConfig } = JSON.parse(options.body);
    const sent = JSON.parse(contents[0].parts[0].text);
    assert.deepEqual(sent.candidates[0], { id: 0, title: '샘플 곡 1', artist: '샘플 연주자', genre: '재즈' });
    assert.equal(generationConfig.responseJsonSchema.properties.trackIds.maxItems, 2);
    return gemini({ title: '한밤의 재즈', trackIds: [1, 0] });
  });
  assert.deepEqual(await response.json(), { title: '한밤의 재즈', trackIds: [1, 0] });
});

test('missing keys, cross-site requests, quota and hallucinated IDs fail without a fallback call', async () => {
  const never = () => assert.fail('unexpected upstream call');
  const absent = await handleMusicPlaylist(request(), {}, never);
  assert.deepEqual(await absent.json(), { error: 'gemini_not_connected' });
  assert.equal((await handleMusicPlaylist(request(body, { Origin: 'https://other.test' }), env, never)).status, 403);
  assert.equal((await handleMusicPlaylist(request(body, { 'oai-authenticated-user-id': '' }), env, never)).status, 401);
  assert.equal((await handleMusicPlaylist(request({ ...body, count: 3 }), env, never)).status, 400);
  let calls = 0;
  const limited = await handleMusicPlaylist(request(), env, async () => { calls++; return new Response(null, { status: 429 }); });
  assert.deepEqual(await limited.json(), { error: 'gemini_quota' });
  assert.equal(calls, 1);
  const redirected = await handleMusicPlaylist(request(), env, async () => new Response(null, {
    status: 302, headers: { Location: 'https://other.test/' },
  }));
  assert.equal(redirected.status, 502);
  for (const trackIds of [[2], [1, 1], [0, 1, 2]]) {
    const failed = await handleMusicPlaylist(request(), env, async () => gemini({ title: '추천 곡', trackIds }));
    assert.equal(failed.status, 502);
  }
});
