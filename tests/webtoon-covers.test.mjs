import assert from 'node:assert/strict';
import test from 'node:test';
import { hobbyCards } from '../src/lib/hobby-library.ts';
import { initial, validateData } from '../src/lib/store.ts';
import { advanceWatch } from '../src/lib/watch.ts';
import { validateWebtoonCover, webtoonPlatform } from '../src/lib/webtoon.ts';
import { handleWebtoonSearch } from '../worker/webtoon.mjs';

const secret = { KMAS_API_KEY: 'test-key' };
const lookup = (platform = '네이버웹툰') => new Request(
  `https://hub.test/api/watch/webtoons?${new URLSearchParams({ q: '예시 작품', platform })}`,
  { headers: { 'oai-authenticated-user-id': 'owner' } },
);
const row = (overrides = {}) => ({
  title: '예시작품', listSeCd: '1', pltfomCdNm: '네이버웹툰', sntncWritrNm: '예시 작가',
  imageDownloadUrl: '/common/file/atchmnflDownload.ajax?fileImageId=sample', ...overrides,
});
const payload = (rows, totalCount = rows.length) => Response.json({ result: { resultState: 'success', totalCount }, itemlist: rows });

test('search is owner-scoped and requires a configured KMAS secret', async () => {
  const never = () => assert.fail('unexpected upstream call');
  assert.equal((await handleWebtoonSearch(new Request(lookup().url), secret, never)).status, 401);
  const missing = await handleWebtoonSearch(lookup(), {}, never);
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { error: 'catalog_not_connected' });
  assert.equal((await handleWebtoonSearch(lookup('unknown'), secret, never)).status, 400);
});

test('search excludes print editions and preselects a unique exact title and platform', async () => {
  const response = await handleWebtoonSearch(lookup(), secret, async (url, init) => {
    assert.equal(url.origin + url.pathname, 'https://www.kmas.or.kr/openapi/search/bookAndWebtoonList');
    assert.equal(url.searchParams.get('prvKey'), secret.KMAS_API_KEY);
    assert.equal(url.searchParams.get('title'), '예시 작품');
    assert.equal(init.redirect, 'manual');
    return payload([
      row({ listSeCd: '2', isbn: '9780000000000' }),
      row({ pltfomCdNm: '카카오웹툰', imageDownloadUrl: '/cover/other.jpg' }),
      row({ subtitl: '시즌 2', imageDownloadUrl: '/cover/season2.jpg' }),
      row({ title: '다른 작품', imageDownloadUrl: '/cover/different.jpg' }),
      row(),
    ]);
  });
  const { items, recommended } = await response.json();
  assert.equal(recommended, 0);
  assert.deepEqual(items[0], { title: '예시작품', platform: '네이버웹툰', creator: '예시 작가',
    cover: { source: 'kmas', imageUrl: 'https://www.kmas.or.kr/common/file/atchmnflDownload.ajax?fileImageId=sample' } });
  assert.deepEqual(items.map(item => item.title), ['예시작품', '예시작품', '예시작품 · 시즌 2', '다른 작품']);
});

test('ambiguous, incomplete and platform-less matches require review', async () => {
  for (const [request, rows, total] of [
    [lookup(), [row(), row({ imageDownloadUrl: '' })], 2],
    [lookup(), [row()], 50],
    [lookup(''), [row()], 1],
    [lookup(), [row(), row({ imageDownloadUrl: 'https://kmas.or.kr.evil.test/cover.jpg' })], 2],
  ]) {
    const result = await handleWebtoonSearch(request, secret, async () => payload(rows, total));
    const { items, recommended } = await result.json();
    assert.equal(recommended, null);
    assert.equal(items.length, 1);
  }
  const limited = await handleWebtoonSearch(lookup(), secret, async () => new Response(null, { status: 429 }));
  assert.deepEqual(await limited.json(), { error: 'catalog_limited' });
});

test('official links identify only known platforms and cover data survives backup and progress', () => {
  assert.equal(webtoonPlatform('https://comic.naver.com/webtoon/list?titleId=100'), '네이버웹툰');
  assert.equal(webtoonPlatform('https://page.kakao.com/content/100'), '카카오페이지');
  assert.equal(webtoonPlatform('https://webtoon.kakao.com/content/예시/100'), '카카오웹툰');
  assert.equal(webtoonPlatform('https://comic.naver.com.example/webtoon/list?titleId=100'), '');
  assert.equal(webtoonPlatform('https://comic.naver.com/webtoon'), '');
  const imageUrl = 'https://www.kmas.or.kr/cover.jpg';
  const webtoonCover = { source: 'kmas', imageUrl };
  assert.throws(() => validateWebtoonCover({ ...webtoonCover, imageUrl: imageUrl + '?prvKey=secret' }));
  const now = '2026-11-26T01:00:00.000Z';
  const entry = { id: 'sample', kind: 'watch', title: '예시 작품', detail: '메모', category: '', status: '', url: '',
    date: '', done: false, createdAt: now, watch: { type: 'webtoon', status: 'watching', progress: 12, weekday: 2,
      rating: 5, updatedAt: now, newsEvents: ['resume'], webtoonCover } };
  const data = validateData(JSON.parse(JSON.stringify({ ...initial, entries: [entry] })));
  assert.deepEqual(data.entries, [entry]);
  assert.deepEqual(advanceWatch(data.entries[0]).watch.webtoonCover, webtoonCover);
  assert.equal(hobbyCards(data.entries, 'all', new Set())[0].poster, imageUrl);
  assert.throws(() => validateData({ ...data, entries: [{ ...entry, watch: { type: 'movie', status: 'planned', updatedAt: now, webtoonCover } }] }));
});
