import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDatabase,applyLocalMigrations} from '../scripts/local-db.mjs';
import {handleSteamAccounts,normalizeSteamWishlist} from '../worker/steam-account.mjs';
import {handleSteamSearch,steamSearchQuery,steamSearchResults} from '../worker/steam.mjs';
import {handleApi} from '../worker/api.mjs';

const capsule=id=>`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_231x87.jpg?t=1`;
const searchBody={total:4,items:[
  {type:'app',name:'Hades II',id:1145350,price:{currency:'KRW',final:3200000},tiny_image:capsule(1145350)},
  {type:'app',name:'Hades',id:1145360,tiny_image:'https://evil.test/steam/apps/1145360/x.jpg'},
  {type:'sub',name:'Hades Bundle',id:9},
  {type:'app',name:'Hades II',id:1145350,tiny_image:capsule(1145350)},
]};

test('store search keeps apps once by App ID, drops prices and images from other hosts, and checks the query', () => {
  assert.deepEqual(steamSearchResults(searchBody), [
    {appId:1145350,name:'Hades II',imageUrl:capsule(1145350)},
    {appId:1145360,name:'Hades',imageUrl:''},
  ]);
  assert.deepEqual(steamSearchResults({total:0,items:[]}), []);
  assert.throws(() => steamSearchResults({}));
  assert.equal(steamSearchQuery('  하데스   2 '), '하데스 2');
  for (const bad of ['', '   ', 'x'.repeat(101), 'a\u0000b']) assert.throws(() => steamSearchQuery(bad));
});

test('store search needs a HUB user, asks Steam in Korean and reports Steam trouble without details', async () => {
  const calls=[];
  const run=(q,user='alice',fetcher=async url=>{calls.push(url);return Response.json(searchBody);})=>handleSteamSearch(new Request('https://hub.test/api/games/steam/search?q='+encodeURIComponent(q),{headers:user?{'oai-authenticated-user-id':user}:{}}),{},null,{fetcher,cache:null});
  assert.equal((await run('hades',null)).status,401);
  assert.equal((await run('')).status,400);
  const ok=await run('hades');assert.equal(ok.status,200);
  const body=await ok.json();assert.equal(body.items.length,2);assert.equal(JSON.stringify(body).includes('KRW'),false);
  const asked=new URL(calls[0]);assert.equal(asked.origin+asked.pathname,'https://store.steampowered.com/api/storesearch/');assert.equal(asked.searchParams.get('l'),'koreana');assert.equal(asked.searchParams.get('term'),'hades');
  assert.equal((await run('hades','alice',async()=>new Response('busy',{status:429}))).status,503);
  assert.equal((await run('hades','alice',async()=>{throw new Error('offline');})).status,502);
  const routed=await handleApi(new Request('https://hub.test/api/games/steam/search?q=hades'),{});assert.equal(routed.status,401);
});

test('a wishlist becomes App IDs with the day added; private and empty look the same', () => {
  assert.deepEqual(normalizeSteamWishlist({response:{items:[{appid:620,priority:1,date_added:1794902400},{appid:620,date_added:1},{appid:0},{appid:'x'},{appid:10}]}}), [
    {appId:620,addedAt:'2026-11-17T08:00:00.000Z'},{appId:10,addedAt:''},
  ]);
  assert.deepEqual(normalizeSteamWishlist({response:{}}), []);
  assert.throws(() => normalizeSteamWishlist({}));
  assert.throws(() => normalizeSteamWishlist({response:{items:{}}}));
});

test('the wishlist is read for the HUB user\'s own linked account only, without sending a key', async t => {
  const DB=createLocalDatabase();await applyLocalMigrations(DB);t.after(()=>DB.sqlite.close());
  const env={DB},id='76561198000000001',calls=[];
  await DB.prepare('INSERT INTO steam_account_links (user_id,steam_id,link_version,name,connected_at) VALUES (?,?,?,?,?)').bind('alice',id,'v1','Alice','2026-11-01T00:00:00Z').run();
  const fetcher=async(url,init)=>{calls.push({url,init});return Response.json({response:{items:[{appid:1145360,date_added:1794902400}]}});};
  const run=(user,query='')=>handleSteamAccounts(new Request('https://hub.test/api/steam/wishlist'+query,{headers:user?{'oai-authenticated-user-id':user}:{}}),env,null,{fetcher,clock:()=>Date.parse('2026-11-23T00:00:00Z')});
  assert.equal((await run(null)).status,401);
  assert.equal((await run('bob')).status,404);
  assert.equal((await run('alice','?steamId=76561198000000002')).status,404);
  const ok=await run('alice');assert.equal(ok.status,200);
  assert.deepEqual(await ok.json(),{steamId:id,accountName:'Alice',items:[{appId:1145360,addedAt:'2026-11-17T08:00:00.000Z'}],checkedAt:'2026-11-23T00:00:00.000Z'});
  assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).searchParams.get('steamid'),id);assert.equal(new URL(calls[0].url).searchParams.has('key'),false);assert.equal(JSON.stringify(calls[0].init.headers).includes('webapi'),false);
  const failing=await handleSteamAccounts(new Request('https://hub.test/api/steam/wishlist',{headers:{'oai-authenticated-user-id':'alice'}}),env,null,{fetcher:async()=>new Response('busy',{status:429}),clock:Date.now});
  assert.equal(failing.status,429);
});
