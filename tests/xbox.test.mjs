import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../worker/api.mjs';

const endpoint = 'https://hub.example/api/games/xbox';
const owner = {'oai-authenticated-user-id':'test-owner'};
const env = {XBOX_OPENXBL_API_KEY:'test-secret'};
const xuid = '2533274000000000';

test('Xbox history requires a visitor and a configured server key before calling OpenXBL', async t => {
  const fetch = t.mock.method(globalThis, 'fetch');
  assert.equal((await handleApi(new Request(endpoint), env)).status, 401);
  assert.equal((await handleApi(new Request(endpoint, {headers:owner,method:'POST'}), env)).status, 405);
  const missing = await handleApi(new Request(endpoint, {headers:owner}), {});
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), {error:'xbox_not_configured'});
  assert.equal(fetch.mock.callCount(), 0);
});

test('Xbox history merges paged titles and keeps zero and missing minutes distinct', async t => {
  const remote = data => Response.json({code:200,content:data});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers['X-Authorization'], env.XBOX_OPENXBL_API_KEY);
    assert.equal(options.redirect, 'manual');
    const target = new URL(url);
    assert.equal(target.origin, 'https://api.xbl.io');
    switch (target.pathname) {
      case '/v2/account':
        return remote({profileUsers:[{id:xuid}]});
      case '/v2/achievements/player/' + xuid:
        return target.searchParams.get('continuationToken') === 'next'
          ? remote({titles:[{titleId:3,name:'Older PC game',devices:['Win32']}]})
          : remote({titles:[{titleId:1,name:'First game'},{titleId:4,name:'Video app',type:'App'}],pagingInfo:{continuationToken:'next'}});
      case '/v2/player/titleHistory/' + xuid:
        return remote({titles:[
          {titleId:1,name:'First game',type:'Game',titleHistory:{lastTimePlayed:'2026-11-23T16:00:00Z'}},
          {titleId:2,name:'Second game',type:'Game',titleHistory:{lastTimePlayed:'2026-11-22T16:00:00Z'}},
        ]});
      case '/v2/player/stats':
        assert.equal(options.method, 'POST');
        assert.deepEqual(JSON.parse(options.body), {
          xuids:[xuid],
          stats:['1','2','3'].map(titleId=>({titleId,name:'MinutesPlayed'}))
        });
        return remote({statlistscollection:[{stats:[
          {titleid:1,name:'MinutesPlayed',value:'120'},
          {titleid:2,name:'MinutesPlayed',value:'0'},
        ]}]});
      default:
        throw new Error('Unexpected provider route');
    }
  });
  const response = await handleApi(new Request(endpoint, {headers:owner}), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const result = await response.json();
  assert.deepEqual(result.games.map(({name,minutes})=>[name,minutes]), [
    ['First game',120],['Second game',0],['Older PC game',null],
  ]);
  assert.equal(result.games[0].lastPlayed, '2026-11-23T16:00:00.000Z');
  assert.equal(result.historyIncomplete, false);
  assert.equal(result.playtimeIncomplete, false);
  assert.equal(result.limited, false);
  assert.ok(!JSON.stringify(result).includes(env.XBOX_OPENXBL_API_KEY));
});

test('Xbox history keeps available games when one provider source and the playtime lookup fail', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/account')) return Response.json({profileUsers:[{id:xuid}]});
    if (url.includes('/titleHistory/')) return Response.json({titles:[{titleId:1,name:'Game'}]});
    return Response.json({content:'upstream details',code:429});
  });
  const response = await handleApi(new Request(endpoint, {headers:owner}), env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.historyIncomplete, true);
  assert.equal(result.playtimeIncomplete, true);
  assert.equal(result.games[0].minutes, null);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [
    ['xbox_provider_failure', {stage:'achievements', reason:'api_error', status:429}],
    ['xbox_provider_failure', {stage:'playtime', reason:'api_error', status:429}],
  ]);
});

test('Xbox history rejects redirects without following or logging the destination', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.xbl.io/v2/account');
    assert.equal(options.redirect, 'manual');
    return Response.redirect('https://example.com/account/' + xuid, 302);
  });
  const response = await handleApi(new Request(endpoint, {headers:owner}), env);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {error:'xbox_unavailable'});
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [
    ['xbox_provider_failure', {stage:'account', reason:'http_status', status:302}],
  ]);
});
