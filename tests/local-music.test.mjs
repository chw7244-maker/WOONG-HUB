import assert from 'node:assert/strict';
import test from 'node:test';
import { albumFolder, albumKeyOf, albumMark, albumQuality, filterAlbums, groupAlbums, libraryDiff, sortAlbums, splitFolderName, trackFromTags, validateLocalLibrary } from '../src/lib/local-music.ts';

const flac = { container: 'FLAC', codec: 'FLAC', lossless: true, sampleRate: 96000, bitsPerSample: 24, duration: 187.4 };
const t = (path, tags = {}, format = flac, modified = 1) => trackFromTags(path, tags, format, modified);

test('tags win, then the "Artist_Album" folder and the file name fill what is missing', () => {
  const tagged = t('Flac/A_B/02 - Slow Walk.flac', { title: 'Slow Walk', artist: '샘플 트리오', albumartist: '샘플 트리오', album: '샘플 재즈 앨범', year: 2019, genre: ['Jazz'], track: { no: 2 }, disk: { no: null } });
  assert.deepEqual([tagged.title, tagged.artist, tagged.album, tagged.track, tagged.year, tagged.genre, tagged.seconds, tagged.format, tagged.sampleRate, tagged.bits, tagged.lossless], ['Slow Walk', '샘플 트리오', '샘플 재즈 앨범', 2, 2019, 'Jazz', 187, 'FLAC', 96000, 24, true]);
  const bare = t('Flac/샘플 밴드_태그 없는 앨범/01 - 첫 곡.flac', { track: { no: null }, disk: { no: null } });
  assert.deepEqual([bare.title, bare.artist, bare.albumArtist, bare.album, bare.track], ['첫 곡', '샘플 밴드', '샘플 밴드', '태그 없는 앨범', null]);
  const disc = t('Flac/Orchestra - Themes/CD2/01 Finale.flac');
  assert.deepEqual([disc.album, disc.artist, disc.disc, disc.title], ['Themes', 'Orchestra', 2, 'Finale']);
  const loose = t('Inbox/song.mp3', {}, { container: 'MPEG', codec: 'MPEG 1 Layer 3', lossless: false, sampleRate: 44100, bitrate: 320000, duration: 200 });
  assert.deepEqual([loose.title, loose.artist, loose.album, loose.format, loose.kbps, loose.lossless], ['song', '아티스트 미상', 'Inbox', 'MP3', 320, false]);
  const dsd = t('DSD/X/01 a.dsf', {}, { container: 'DSF', codec: 'DSD', sampleRate: 2822400, bitsPerSample: 1, duration: 300 });
  assert.deepEqual([dsd.format, dsd.lossless], ['DSD', true]);
  assert.deepEqual(splitFolderName('Artist - Album_Deluxe'), { artist: 'Artist', album: 'Album_Deluxe' });
  assert.deepEqual(splitFolderName('Just An Album'), { artist: '', album: 'Just An Album' });
  assert.equal(albumFolder('Flac/A_B/Disc 1/01.flac'), 'Flac/A_B');
});

test('quality labels and tiers come from the best track', () => {
  assert.deepEqual(albumQuality([t('a/b/1.flac')]), { quality: 'FLAC 24bit / 96kHz', tier: 'hires' });
  assert.deepEqual(albumQuality([t('a/b/1.flac', {}, { ...flac, sampleRate: 44100, bitsPerSample: 16 })]), { quality: 'FLAC 16bit / 44.1kHz', tier: 'cd' });
  assert.deepEqual(albumQuality([t('a/b/1.mp3', {}, { container: 'MPEG', lossless: false, bitrate: 320000 })]), { quality: 'MP3 320kbps', tier: 'lossy' });
  assert.deepEqual(albumQuality([t('a/b/1.dsf', {}, { codec: 'DSD', sampleRate: 2822400, bitsPerSample: 1 })]), { quality: 'DSD64', tier: 'hires' });
});

const tags = (album, artist, no, extra = {}) => ({ title: `Song ${no}`, artist, albumartist: artist, album, track: { no }, disk: { no: null }, ...extra });
const library = {
  folder: 'Music', scannedAt: '2026-11-24T00:00:00Z', covers: {},
  tracks: [
    t('Flac/J/02.flac', tags('Jazz Night', 'Trio', 2, { year: 2019, genre: ['Jazz'] }), flac, 5),
    t('Flac/J/01.flac', tags('Jazz Night', 'Trio', 1, { year: 2019, genre: ['Jazz'] }), flac, 4),
    t('Flac/P/01.flac', tags('Summer', '가수', 1, { year: 2023, genre: ['Pop'] }), { ...flac, sampleRate: 44100, bitsPerSample: 16 }, 9),
    t('Flac/T/CD2/01.flac', tags('Themes', 'Orchestra', 1, { disk: { no: 2 }, genre: ['Soundtrack'], year: 2018 }), flac, 2),
    t('Flac/T/CD1/01.flac', tags('Themes', 'Orchestra', 1, { disk: { no: 1 }, genre: ['Soundtrack'], year: 2018 }), flac, 3),
  ],
};

test('tracks group into albums in disc and track order, with a cover reference by album', () => {
  library.covers[albumKeyOf(library.tracks[0])] = { id: 'a'.repeat(32) };
  const albums = groupAlbums(library);
  assert.equal(albums.length, 3);
  const jazz = albums.find(a => a.title === 'Jazz Night');
  assert.deepEqual([jazz.artist, jazz.year, jazz.genre, jazz.tracks.map(x => x.title), jazz.seconds, jazz.addedAt, jazz.cover.id, jazz.folder], ['Trio', 2019, 'Jazz', ['Song 1', 'Song 2'], 374, 5, 'a'.repeat(32), 'Flac/J']);
  assert.deepEqual(albums.find(a => a.title === 'Themes').tracks.map(x => x.disc), [1, 2]);
  assert.deepEqual(sortAlbums(albums, 'recent').map(a => a.title), ['Summer', 'Jazz Night', 'Themes']);
  assert.deepEqual(sortAlbums(albums, 'year').map(a => a.title), ['Summer', 'Jazz Night', 'Themes']);
  assert.deepEqual(sortAlbums(albums, 'artist').map(a => a.artist), ['가수', 'Orchestra', 'Trio']);
  assert.deepEqual(filterAlbums(albums, { query: 'song 2', genre: '', tier: '' }).map(a => a.title), ['Jazz Night']);
  assert.deepEqual(filterAlbums(albums, { query: '', genre: 'Pop', tier: '' }).map(a => a.title), ['Summer']);
  assert.deepEqual(filterAlbums(albums, { query: '', genre: '', tier: 'cd' }).map(a => a.title), ['Summer']);
  assert.equal(albumMark('Night Session'), 'NS'); assert.equal(albumMark('겨울밤 노래'), '겨울'); assert.equal(albumMark('!!!'), '♪');
});

test('a new reading reports new albums and tracks, changed tags and files gone', () => {
  const next = [{ ...library.tracks[0], title: 'Renamed', modified: 99 }, library.tracks[1], library.tracks[2], t('Flac/N/01.flac', tags('New One', 'Band', 1))];
  assert.deepEqual(libraryDiff(library.tracks, next), { newAlbums: 1, newTracks: 1, changedTracks: 1, removedTracks: 2 });
  assert.deepEqual(libraryDiff(library.tracks, library.tracks.map(x => ({ ...x, modified: 7 }))), { newAlbums: 0, newTracks: 0, changedTracks: 0, removedTracks: 0 });
});

test('the server keeps relative paths, bounded text, and cover references of albums that exist', () => {
  const key = albumKeyOf(library.tracks[0]);
  const saved = validateLocalLibrary({ ...library, covers: { [key]: { id: 'b'.repeat(32), url: 'https://coverartarchive.org/release-group/x/front-250' }, 'gone\u0001album': { id: 'c'.repeat(32) }, [albumKeyOf(library.tracks[2])]: { id: 'not-hex', url: 'https://evil.test/x.jpg' } } });
  assert.deepEqual(saved.covers, { [key]: { id: 'b'.repeat(32), url: 'https://coverartarchive.org/release-group/x/front-250' } });
  for (const bad of [{ path: '/abs/a.flac' }, { path: 'a/../b.flac' }, { path: 'a\\b.flac' }, { title: '' }, { year: 99999 }, { lossless: 'yes' }])
    assert.throws(() => validateLocalLibrary({ ...library, tracks: [{ ...library.tracks[0], ...bad }] }));
  assert.throws(() => validateLocalLibrary({ ...library, tracks: [] }));
});
