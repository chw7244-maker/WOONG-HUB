import assert from 'node:assert/strict';
import test from 'node:test';
import { prefetchAlias } from '../scripts/prefetch-alias.mjs';

test('exported page segments get the flat name Next prefetches, at one and two levels', () => {
  assert.equal(prefetchAlias('/audio/__next.$d$section/__PAGE__.txt'), '/audio/__next.$d$section.__PAGE__.txt');
  assert.equal(prefetchAlias('/games/steam/__next.games/steam/__PAGE__.txt'), '/games/steam/__next.games.steam.__PAGE__.txt');
  assert.equal(prefetchAlias('/games/xbox/__next.games/xbox/__PAGE__.txt'), '/games/xbox/__next.games.xbox.__PAGE__.txt');
  assert.equal(prefetchAlias('/music/spotify/__next.music/spotify/__PAGE__.txt'), '/music/spotify/__next.music.spotify.__PAGE__.txt');
});

test('files that are already flat or are not page segments get no alias', () => {
  assert.equal(prefetchAlias('/__next.__PAGE__.txt'), null);
  assert.equal(prefetchAlias('/games/__next._tree.txt'), null);
  assert.equal(prefetchAlias('/games/index.txt'), null);
  assert.equal(prefetchAlias('/_next/static/chunks/app.js'), null);
});
