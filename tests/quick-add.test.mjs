import assert from 'node:assert/strict';
import test from 'node:test';
import { albumEntry, gameAppIds, steamGameEntry, steamReference, storeInfoMissing, watchEntry, wishlistChanges, withStoreInfo } from '../src/lib/quick-add.ts';
import { initial, validateData } from '../src/lib/store.ts';

const now = new Date('2026-11-23T09:00:00Z');
const steam = (appId, name = `Game ${appId}`) => ({ appId, name, developers: ['Dev'], publishers: [], genres: ['액션'], releaseDate: '2020년 9월 17일', comingSoon: false, description: '', storeUrl: `https://store.steampowered.com/app/${appId}/`, imageUrl: '', checkedAt: now.toISOString() });
const game = (id, { status = '완료', store, linked } = {}) => ({ id, kind: 'games', title: id, detail: '', category: 'PC', status, url: '', date: '', done: false, createdAt: now.toISOString(),
  game: { playMinutes: null, rating: null, startedAt: '', completedAt: '', tags: [], ...(store ? { steam: steam(store) } : {}), ...(linked ? { steamAccount: { steamId: '76561198000000001', appId: linked } } : {}) } });
const keep = entry => validateData({ ...initial, entries: [entry] }).entries[0];

test('the box treats store links and bare App IDs as Steam references and anything else as a name', () => {
  assert.equal(steamReference('1145360'), 1145360);
  assert.equal(steamReference('https://store.steampowered.com/app/1145360/Hades/'), 1145360);
  assert.equal(steamReference('Hades'), null);
  assert.equal(steamReference('https://evil.test/app/1/'), null);
  assert.equal(steamReference('2077 cyberpunk'), null);
});

test('new games keep store details when Steam answered and a name alone when it did not, and pass HUB validation', () => {
  const full = steamGameEntry({ name: 'hades', steam: steam(1145360, 'Hades') }, '플레이 예정', now);
  assert.equal(full.title, 'Hades'); assert.equal(full.status, '플레이 예정'); assert.equal(full.url, 'https://store.steampowered.com/app/1145360/'); assert.equal(full.game.steam.genres[0], '액션');
  assert.deepEqual(keep(full).game.steam.appId, 1145360);
  const bare = steamGameEntry({ name: '  수동 게임 ' }, '위시리스트', now, '2026-11-01T00:00:00.000Z');
  assert.equal(bare.title, '수동 게임'); assert.equal(bare.game.steam, undefined); assert.equal(bare.createdAt, '2026-11-01T00:00:00.000Z');
  assert.equal(keep(bare).title, '수동 게임');
});

test('App IDs come from store details and linked accounts; store details fill only games that lack them', () => {
  const list = [game('a', { store: 10 }), game('b', { linked: 20 }), game('c'), { id: 'n', kind: 'note', title: 'x', detail: '', category: '', status: '', url: '', date: '', done: false, createdAt: now.toISOString() }];
  assert.deepEqual([...gameAppIds(list)].sort((x, y) => x - y), [10, 20]);
  assert.deepEqual(storeInfoMissing(list).map(e => e.id), ['b']);
  const filled = withStoreInfo({ ...list[1], title: '내가 붙인 이름' }, steam(20));
  assert.equal(filled.title, '내가 붙인 이름'); assert.equal(filled.game.steam.appId, 20); assert.equal(filled.game.steamAccount.appId, 20); assert.equal(filled.url, 'https://store.steampowered.com/app/20/');
  assert.throws(() => withStoreInfo(list[1], steam(21)));
});

test('the wishlist adds only unknown games, newest first, and reports HUB wishlist games Steam no longer lists', () => {
  const list = [game('owned', { linked: 1 }), game('wish-kept', { status: '위시리스트', store: 2 }), game('wish-dropped', { status: '위시리스트', store: 3 }), game('done-not-listed', { store: 4 }), game('wish-manual', { status: '위시리스트' })];
  const { fresh, gone } = wishlistChanges(list, [{ appId: 1, addedAt: '2026-11-01T00:00:00Z' }, { appId: 2, addedAt: '' }, { appId: 5, addedAt: '2026-10-01T00:00:00Z' }, { appId: 6, addedAt: '2026-11-20T00:00:00Z' }]);
  assert.deepEqual(fresh.map(i => i.appId), [6, 5]);
  assert.deepEqual(gone, ['wish-dropped']);
});

test('movies, series and albums from search become valid HUB records', () => {
  const movie = watchEntry({ id: 27205, title: '인셉션', year: '2010', posterPath: '/a.jpg' }, 'movie', 'planned', now);
  assert.equal(movie.url, 'https://www.themoviedb.org/movie/27205?language=ko-KR'); assert.equal(movie.watch.status, 'planned'); assert.equal(keep(movie).watch.catalog.id, 27205);
  const show = watchEntry({ id: 1396, title: '브레이킹 배드' }, 'tv', 'watching', now);
  assert.equal(keep(show).watch.type, 'tv');
  const album = albumEntry({ id: '0b1f2e3d-1111-4222-8333-444455556666', title: 'Discovery', artist: 'Daft Punk', firstReleaseDate: '2001-03-07', type: 'Album', sourceUrl: 'https://musicbrainz.org/release-group/0b1f2e3d-1111-4222-8333-444455556666', coverUrl: 'https://coverartarchive.org/release-group/0b1f2e3d-1111-4222-8333-444455556666/front-250', checkedAt: now.toISOString() }, '컬렉션', now);
  assert.equal(album.status, '컬렉션'); assert.equal(album.music.artist, 'Daft Punk'); assert.equal(album.music.releaseDate, '2001-03-07');
  assert.equal(keep(album).music.catalog.title, 'Discovery');
});
