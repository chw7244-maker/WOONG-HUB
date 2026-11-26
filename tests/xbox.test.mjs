import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../worker/api.mjs';
import {applyLocalMigrations, createLocalDatabase} from '../scripts/local-db.mjs';

const endpoint = 'https://hub.example/api/games/xbox';
const origin = new URL(endpoint).origin;
const owner = {'oai-authenticated-user-id':'test-owner',Origin:origin};
const key = 'test-secret';
const xuid = '2533274000000000';

async function setup(t) {
  const DB = createLocalDatabase();
  t.after(()=>DB.sqlite.close());
  await applyLocalMigrations(DB);
  return {DB,XBOX_OPENXBL_API_KEY:key};
}

const refresh = (env, headers = owner) => handleApi(new Request(endpoint, {headers,method:'POST'}), env);
const saved = (env, headers = owner) => handleApi(new Request(endpoint, {headers}), env);

test('Xbox history requires a visitor and a configured server key before calling OpenXBL', async t => {
  const env = await setup(t);
  const fetch = t.mock.method(globalThis, 'fetch');
  assert.equal((await handleApi(new Request(endpoint), env)).status, 401);
  assert.equal((await refresh(env, {Origin:origin})).status, 401);
  assert.equal((await refresh(env, {...owner,Origin:'https://elsewhere.example'})).status, 403);
  assert.equal((await handleApi(new Request(endpoint, {headers:owner,method:'DELETE'}), env)).status, 405);
  const missing = await refresh({DB:env.DB});
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), {error:'xbox_not_configured'});
  assert.deepEqual(await (await saved({DB:env.DB})).json(), {snapshot:null});
  assert.equal(fetch.mock.callCount(), 0);
});

test('Xbox history merges paged titles and keeps zero and missing minutes distinct', async t => {
  const env = await setup(t);
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
          ? remote({titles:[{titleId:3,name:'Older PC game',devices:['Win32'],displayImage:'https://unsafe.example/cover.jpg'}]})
          : remote({titles:[{titleId:1,name:'First game',displayImage:'http://store-images.s-microsoft.com/image/icon'},{titleId:4,name:'Video app',type:'App'}],pagingInfo:{continuationToken:'next'}});
      case '/v2/player/titleHistory/' + xuid:
        return remote({titles:[
          {titleId:1,name:'First game',type:'Game',titleHistory:{lastTimePlayed:'2026-11-23T16:00:00Z'},images:[
            {type:'BoxArt',url:'https://store-images.s-microsoft.com/image/box'},
            {type:'TitledHeroArt',url:'//store-images.s-microsoft.com/image/banner'},
          ]},
          {titleId:2,name:'Second game',type:'Game',titleHistory:{lastTimePlayed:'2026-11-22T16:00:00Z'},displayImage:'http://images-eds-ssl.xboxlive.com/image/cover'},
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
  const response = await refresh(env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const {snapshot:result} = await response.json();
  assert.deepEqual(result.games.map(({name,minutes})=>[name,minutes]), [
    ['First game',120],['Second game',0],['Older PC game',null],
  ]);
  assert.equal(result.games[0].lastPlayed, '2026-11-23T16:00:00.000Z');
  assert.deepEqual(result.games.map(game=>game.imageUrl), [
    'https://store-images.s-microsoft.com/image/banner?w=640',
    'https://images-eds-ssl.xboxlive.com/image/cover',
    undefined,
  ]);
  assert.equal(result.historyIncomplete, false);
  assert.equal(result.playtimeIncomplete, false);
  assert.equal(result.limited, false);
  assert.ok(!JSON.stringify(result).includes(env.XBOX_OPENXBL_API_KEY));
  const savedResponse = await saved({DB:env.DB});
  assert.equal(savedResponse.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await savedResponse.json(), {snapshot:result});
  assert.deepEqual(await (await saved(env, {...owner,'oai-authenticated-user-id':'another-user'})).json(), {snapshot:null});
});

test('Xbox history keeps available games when one provider source and the playtime lookup fail', async t => {
  const env = await setup(t);
  const warn = t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/account')) return Response.json({profileUsers:[{id:xuid}]});
    if (url.includes('/titleHistory/')) return Response.json({titles:[{titleId:1,name:'Game'}]});
    return Response.json({content:'upstream details',code:429});
  });
  const response = await refresh(env);
  const {snapshot:result} = await response.json();
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
  const env = await setup(t);
  const warn = t.mock.method(console, 'warn', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.xbl.io/v2/account');
    assert.equal(options.redirect, 'manual');
    return Response.redirect('https://example.com/account/' + xuid, 302);
  });
  const response = await refresh(env);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {error:'xbox_unavailable'});
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [
    ['xbox_provider_failure', {stage:'account', reason:'http_status', status:302}],
  ]);
});

test('Xbox history keeps the saved playtime and date after a partial or failed refresh', async t => {
  const env = await setup(t);
  t.mock.method(console, 'warn', () => {});
  let failure;
  const provider = t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/account')) {
      return failure === 'all' ? new Response(null, {status:429}) : Response.json({profileUsers:[{id:xuid}]});
    }
    if (url.endsWith('/player/stats')) {
      return failure ? new Response(null, {status:429})
        : Response.json({statlistscollection:[{stats:[{titleid:1,name:'MinutesPlayed',value:'40'}]}]});
    }
    return Response.json({titles:[{titleId:1,name:'Game'}]});
  });
  const {snapshot} = await (await refresh(env)).json();
  assert.equal(snapshot.games[0].minutes, 40);
  failure = 'stats';
  assert.deepEqual(await (await refresh(env)).json(), {snapshot,warning:'xbox_refresh_incomplete'});
  failure = 'all';
  assert.equal((await refresh(env)).status, 429);
  const calls = provider.mock.callCount();
  assert.deepEqual(await (await saved({DB:env.DB})).json(), {snapshot});
  assert.equal(provider.mock.callCount(), calls);
});
