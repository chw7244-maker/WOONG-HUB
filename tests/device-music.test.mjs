import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultRules, parseM3u, playlistFileName, playlistM3u, playlistSuffix, selectTracks, trackFromPath, validateDeviceLibrary } from '../src/lib/device-music.ts';

const sd = '/storage/1A2B-3C4D/Music';
const exported = `\uFEFF#EXTM3U
#EXTINF:245,Sample Artist - First Song
${sd}/Sample Artist/First Album/01 First Song.flac
#EXTINF:-1,
${sd}/Sample Artist/First Album/02. Second Song.flac
${sd}/Sample Artist/First Album/02. Second Song.flac

/storage/emulated/0/Music/Other Band/Live/CD2/1-03 Encore.dsf
/storage/emulated/0/Download/Loose Artist - Loose Track.mp3
C:\\Music\\Windows Path.flac
`;

test('an exported playlist gives each path once with its length and label', () => {
  const tracks = parseM3u(exported);
  assert.equal(tracks.length, 5);
  assert.deepEqual(tracks[0], { p: `${sd}/Sample Artist/First Album/01 First Song.flac`, s: 245, a: 'Sample Artist', t: 'First Song' });
  assert.deepEqual(tracks[1], { p: `${sd}/Sample Artist/First Album/02. Second Song.flac` });
  assert.equal(tracks[4].p, 'C:/Music/Windows Path.flac');
});

test('artist, album, disc, track, title, format and storage come from the path', () => {
  const [first, second, encore, loose] = parseM3u(exported).map(trackFromPath);
  assert.deepEqual([first.artist, first.album, first.track, first.title, first.format, first.seconds, first.volume], ['Sample Artist', 'First Album', 1, 'First Song', 'FLAC', 245, '메모리 카드']);
  assert.deepEqual([second.track, second.title, second.seconds], [2, 'Second Song', null]);
  assert.deepEqual([encore.artist, encore.album, encore.disc, encore.track, encore.title, encore.format, encore.volume], ['Other Band', 'Live', 1, 3, 'Encore', 'DSD', '내장 메모리']);
  assert.deepEqual([loose.artist, loose.album, loose.title, loose.format], ['Loose Artist', '앨범 미상', 'Loose Track', 'MP3']);
  const bare = trackFromPath({ p: '/storage/emulated/0/song.wav' });
  assert.deepEqual([bare.artist, bare.album, bare.title], ['아티스트 미상', '앨범 미상', 'song']);
});

test('the server keeps only absolute, bounded paths', () => {
  const ok = validateDeviceLibrary({ name: '전체.playlist.m3u8', suffix: '.playlist.m3u8', importedAt: '2026-11-24T00:00:00Z', tracks: [{ p: '/storage/x/a.flac', s: 10, a: 'A', t: '' }] });
  assert.deepEqual(ok.tracks, [{ p: '/storage/x/a.flac', s: 10, a: 'A' }]);
  for (const tracks of [[], [{ p: 'relative/a.flac' }], [{ p: '/a\u0001.flac' }], [{ p: '/a.flac', s: 0 }], [{ p: '/' + 'x'.repeat(1000) }]])
    assert.throws(() => validateDeviceLibrary({ name: 'x', suffix: '.m3u8', importedAt: '2026-11-24T00:00:00Z', tracks }));
  assert.throws(() => validateDeviceLibrary({ name: 'x', suffix: 'm3u8', importedAt: '2026-11-24T00:00:00Z', tracks: [{ p: '/a' }] }));
});

const library = [
  ['A', 'Alpha', 1, 'One', 'flac', 200], ['A', 'Alpha', 2, 'Two', 'flac', 200], ['A', 'Beta', 1, 'Three', 'mp3', 300],
  ['B', 'Gamma', 1, '밤의 노래', 'dsf', 400], ['B', 'Gamma', 2, 'Day Song', 'flac', null],
].map(([artist, album, n, title, ext, s]) => trackFromPath({ p: `/storage/emulated/0/Music/${artist}/${album}/0${n} ${title}.${ext}`, ...(s ? { s } : {}) }));

test('rules filter by words, artists, albums and formats, then order and cut by count or minutes', () => {
  const rules = (extra) => ({ ...defaultRules(), ...extra });
  assert.deepEqual(selectTracks(library, rules({ order: 'album', amount: 10 })).tracks.map(t => t.title), ['One', 'Two', 'Three', '밤의 노래', 'Day Song']);
  assert.deepEqual(selectTracks(library, rules({ query: '노래 gamma', order: 'album' })).tracks.map(t => t.title), ['밤의 노래']);
  assert.deepEqual(selectTracks(library, rules({ artists: ['A'], formats: ['FLAC'], order: 'album' })).tracks.map(t => t.title), ['One', 'Two']);
  assert.deepEqual(selectTracks(library, rules({ albums: ['Beta — A'] })).tracks.map(t => t.title), ['Three']);
  const timed = selectTracks(library, rules({ order: 'album', limit: 'minutes', amount: 12 }));
  assert.deepEqual(timed.tracks.map(t => t.title), ['One', 'Two', 'Three']); // 200+200+300 s = 11:40, the next would pass 12 min
  assert.equal(timed.matched, 5);
  assert.equal(selectTracks(library, rules({ order: 'album', amount: 2 })).tracks.length, 2);
  assert.deepEqual(selectTracks(library, rules({ order: 'album' }), new Set([library[0].path])).tracks[0].title, 'Two');
});

test('shuffling depends only on the seed', () => {
  const a = selectTracks(library, { ...defaultRules(), seed: 7 }).tracks.map(t => t.path);
  assert.deepEqual(selectTracks(library, { ...defaultRules(), seed: 7 }).tracks.map(t => t.path), a);
  assert.equal(new Set(a).size, 5);
  const others = [1, 2, 3, 4, 5, 6].map(seed => selectTracks(library, { ...defaultRules(), seed }).tracks.map(t => t.path).join());
  assert.ok(new Set(others).size > 1);
});

test('the playlist file uses the device paths and the exported extension', () => {
  const m3u = playlistM3u('밤\n플레이리스트', library.slice(3));
  assert.equal(m3u, `#EXTM3U\n#PLAYLIST:밤 플레이리스트\n#EXTINF:400,B - 밤의 노래\n${library[3].path}\n#EXTINF:-1,B - Day Song\n${library[4].path}\n`);
  assert.equal(playlistSuffix('전체 곡.PLAYLIST.M3U8'), '.playlist.m3u8');
  assert.equal(playlistSuffix('all.m3u'), '.m3u');
  assert.equal(playlistSuffix('all.txt'), '.m3u8');
  assert.equal(playlistFileName('밤: 재즈/보컬?', '.playlist.m3u8'), '밤 재즈 보컬.playlist.m3u8');
  assert.equal(playlistFileName('  ', '.m3u8'), 'HUB 플레이리스트.m3u8');
});
