import assert from 'node:assert/strict';
import test from 'node:test';
import { averageRating, groupGames, inlineRating, memoLine, plannedGames, ratingFromPosition, ratingLabel, withMemoLine } from '../src/lib/games.ts';

const game = (title, { rating = null, status = '완료', platform = 'PC', genres, createdAt = '2026-11-01T00:00:00Z' } = {}) => ({
  id: title, kind: 'games', title, detail: '', category: platform, status, url: '', date: '', done: false, createdAt,
  game: { playMinutes: null, rating, startedAt: '', completedAt: '', tags: [], ...(genres ? { steam: { genres } } : {}) },
});
const titles = groups => groups.map(g => [g.label, g.entries.map(e => e.title)]);

test('PC stars set the picked score and take half a point off when the same star is picked again', () => {
  assert.equal(inlineRating(null, 4), 4);
  assert.equal(inlineRating(3.5, 4), 4);
  assert.equal(inlineRating(4, 4), 3.5);
  assert.equal(inlineRating(1, 1), 0.5);
  assert.equal(inlineRating(4.5, 2), 2);
});

test('the phone star strip fills in half steps from the touch position, 0.5 at least and 5 at most', () => {
  assert.equal(ratingFromPosition(0), 0.5);
  assert.equal(ratingFromPosition(-1), 0.5);
  assert.equal(ratingFromPosition(0.05), 0.5); // left half of the first star
  assert.equal(ratingFromPosition(0.15), 1); // right half of the first star
  assert.equal(ratingFromPosition(0.75), 4);
  assert.equal(ratingFromPosition(0.71), 4);
  assert.equal(ratingFromPosition(0.69), 3.5);
  assert.equal(ratingFromPosition(1), 5);
  assert.equal(ratingFromPosition(1.4), 5);
  assert.equal(ratingFromPosition(Number.NaN), 0.5);
  assert.equal(ratingLabel(null), '—');
  assert.equal(ratingLabel(4), '4.0');
});

test('the one-line memo is the first line of the play memo, and editing it keeps the rest', () => {
  assert.equal(memoLine(''), '');
  assert.equal(memoLine('  짧고 완벽한 퍼즐  \n\n엔딩 노래까지 좋았음'), '짧고 완벽한 퍼즐');
  assert.equal(memoLine('윈도우 줄바꿈\r\n둘째 줄'), '윈도우 줄바꿈');
  assert.equal(withMemoLine('', '다음엔 어려움으로'), '다음엔 어려움으로');
  assert.equal(withMemoLine('옛 첫 줄\n\n긴 감상', '새 첫 줄'), '새 첫 줄\n\n긴 감상');
  assert.equal(withMemoLine('옛 첫 줄\n긴 감상', '  여러   칸\t공백  '), '여러 칸 공백\n긴 감상');
  assert.equal(withMemoLine('옛 첫 줄\n\n긴 감상', ''), '긴 감상');
  assert.equal(withMemoLine('한 줄뿐', ''), '');
  assert.equal(withMemoLine('   ', '새 메모'), '새 메모');
});

test('rating groups run from the highest band to unrated, highest rating then title inside each', () => {
  const list = [game('Takoyaki', { rating: 2 }), game('XCOM 2', { rating: 4 }), game('Portal', { rating: 4.5 }), game('Division 2'), game('Bunny', { rating: 4 }), game('Dance', { rating: 3.5 }), game('Only Up', { rating: 3 })];
  assert.deepEqual(titles(groupGames(list, 'rating')), [
    ['★ 4.5 – 5', ['Portal']], ['★ 4', ['Bunny', 'XCOM 2']], ['★ 3 – 3.5', ['Dance', 'Only Up']], ['★ 2.5 이하', ['Takoyaki']], ['아직 별점 없음', ['Division 2']],
  ]);
  assert.deepEqual(titles(groupGames([game('A', { rating: 5 })], 'rating')), [['★ 4.5 – 5', ['A']]]);
});

test('status and platform groups follow a fixed order, genres go by size with unrecorded genres last', () => {
  const list = [game('Done'), game('Planned', { status: '플레이 예정' }), game('Playing', { status: '플레이 중' }), game('Odd', { status: '나중에' }), game('Wish', { status: '위시리스트' })];
  assert.deepEqual(groupGames(list, 'status').map(g => g.label), ['플레이 중', '플레이 예정', '위시리스트', '완료', '나중에']);
  const platforms = [game('Switch', { platform: 'Nintendo' }), game('Pc'), game('Ps', { platform: 'PlayStation' })];
  assert.deepEqual(groupGames(platforms, 'platform').map(g => g.label), ['PC', 'PlayStation', 'Nintendo']);
  const genres = [game('A', { genres: ['Puzzle'] }), game('B'), game('C', { genres: ['Action', 'Indie'] }), game('D', { genres: ['Action'] })];
  assert.deepEqual(titles(groupGames(genres, 'genre')), [['Action', ['C', 'D']], ['Puzzle', ['A']], ['장르 미기록', ['B']]]);
});

test('no grouping keeps the given order as one group, and empty lists give no groups', () => {
  const list = [game('Z'), game('A')];
  assert.deepEqual(titles(groupGames(list, 'none')), [['', ['Z', 'A']]]);
  assert.deepEqual(groupGames([], 'none'), []);
  assert.deepEqual(groupGames([], 'rating'), []);
});

test('the group average leaves unrated games out, and the next game is the latest planned one', () => {
  assert.equal(averageRating([game('A', { rating: 4 }), game('B'), game('C', { rating: 3 })]), 3.5);
  assert.equal(averageRating([game('A')]), null);
  const list = [game('Old', { status: '플레이 예정', createdAt: '2026-10-01T00:00:00Z' }), game('Done'), game('New', { status: '플레이 예정', createdAt: '2026-11-20T00:00:00Z' })];
  assert.deepEqual(plannedGames(list).map(e => e.title), ['New', 'Old']);
});
