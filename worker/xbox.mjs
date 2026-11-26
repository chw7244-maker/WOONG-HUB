const BASE = 'https://api.xbl.io/v2';
const MAX_TITLES = 1000;
const MAX_HISTORY_PAGES = 6;
const BATCH_SIZE = 100;
const MINUTES_PLAYED = 'MinutesPlayed';
const coverHosts = new Set(['store-images.s-microsoft.com','images-eds-ssl.xboxlive.com','images-eds.xboxlive.com','image-ssl.xboxlive.com']);
const coverTypes = ['TitledHeroArt','SuperHeroArt','BoxArt','Poster'];

class XboxError extends Error {
  constructor(code, status) {
    super(code);
    this.status = status;
  }
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
  });
}

function providerError(status) {
  if ([401, 402, 403].includes(status)) return new XboxError('xbox_access_denied', 502);
  if (status === 429) return new XboxError('xbox_rate_limited', 429);
  return new XboxError('xbox_unavailable', 502);
}

function logProviderFailure(stage, reason, status) {
  console.warn('xbox_provider_failure', {stage, reason, status});
}

function invalidProviderShape(stage) {
  logProviderFailure(stage, 'invalid_response_shape');
  return providerError(502);
}

async function openXbl(key, stage, path, body) {
  const headers = {Accept:'application/json', 'X-Authorization':key};
  if (body) headers['Content-Type'] = 'application/json';
  const signal = AbortSignal.timeout(8000);
  let response;
  try {
    response = await fetch(BASE + path, {
      headers,
      // Workers supports manual mode. Reject the response below without forwarding the API key.
      redirect:'manual',
      signal,
      ...(body && {method:'POST',body:JSON.stringify(body)})
    });
  } catch {
    logProviderFailure(stage, signal.aborted ? 'timeout' : 'fetch_failed');
    throw providerError(502);
  }
  if (!response.ok) {
    logProviderFailure(stage, 'http_status', response.status);
    throw providerError(response.status);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    logProviderFailure(stage, signal.aborted ? 'timeout' : 'invalid_json', response.status);
    throw providerError(502);
  }
  const code = Number(data?.code);
  if (code >= 400) {
    logProviderFailure(stage, 'api_error', Number.isInteger(code) && code <= 599 ? code : undefined);
    throw providerError(code);
  }
  return data?.content ?? data;
}

function dateString(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2000 ? date.toISOString() : null;
}

async function readHistory(key, stage, path) {
  const titles = [];
  let token = '';
  try {
    for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
      const query = token ? '?' + new URLSearchParams({continuationToken:token}) : '';
      const data = await openXbl(key, stage, path + query);
      if (!Array.isArray(data?.titles)) throw invalidProviderShape(stage);
      titles.push(...data.titles);
      const next = data.pagingInfo?.continuationToken;
      if (!next) return {titles, limited:false};
      if (typeof next !== 'string' || next === token || next.length > 2048 || titles.length >= MAX_TITLES) break;
      token = next;
    }
  } catch (error) {
    if (!titles.length) throw error;
    return {titles, limited:true, incomplete:true};
  }
  return {titles, limited:true};
}

function coverUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return undefined;
  try {
    const url = new URL(raw.startsWith('//') ? 'https:' + raw : raw);
    if (!coverHosts.has(url.hostname) || url.username || url.password || url.port || !['http:','https:'].includes(url.protocol)) return undefined;
    url.protocol = 'https:';
    url.hash = '';
    if (url.hostname === 'store-images.s-microsoft.com' && !url.search) url.searchParams.set('w','640');
    return url.href;
  } catch {
    return undefined;
  }
}

function playedGames(results) {
  const games = new Map();
  const covers = new Map();
  for (const titles of results) {
    for (const title of titles) {
      const id = String(title?.titleId ?? '');
      const name = typeof title?.name === 'string' ? title.name.trim().slice(0, 250) : '';
      if (!/^\d{1,10}$/.test(id) || !name || (title.type && String(title.type).toLowerCase() !== 'game')) continue;
      const lastPlayed = dateString(title.titleHistory?.lastTimePlayed);
      const previous = games.get(id)?.lastPlayed ?? null;
      games.set(id, {id, name, lastPlayed:lastPlayed && (!previous || lastPlayed > previous) ? lastPlayed : previous, minutes:null});

      const images = Array.isArray(title.images) ? title.images : [];
      const candidates = coverTypes.map(type=>images.find(image=>image?.type===type)?.url).concat(title.displayImage).map(coverUrl);
      const rank = candidates.findIndex(Boolean);
      if (rank >= 0 && rank < (covers.get(id)?.rank ?? Infinity)) {
        covers.set(id, {rank, url:candidates[rank]});
      }
    }
  }
  for (const [id,{url}] of covers) games.get(id).imageUrl = url;
  return Array.from(games.values()).sort((a,b)=>(b.lastPlayed??'').localeCompare(a.lastPlayed??'') || a.name.localeCompare(b.name));
}

function applyPlaytime(games, data) {
  if (!Array.isArray(data?.statlistscollection)) throw invalidProviderShape('playtime');
  const byId = new Map(games.map(game=>[game.id, game]));
  for (const list of data.statlistscollection) {
    if (!Array.isArray(list?.stats)) continue;
    for (const stat of list.stats) {
      if (stat?.name !== MINUTES_PLAYED || stat.value == null || !String(stat.value).trim()) continue;
      const game = byId.get(String(stat.titleid ?? stat.titleId ?? ''));
      const minutes = Number(stat.value);
      if (game && Number.isFinite(minutes) && minutes >= 0 && minutes <= Number.MAX_SAFE_INTEGER) game.minutes = Math.floor(minutes);
    }
  }
}

export async function handleXboxHistory(request, env) {
  // The deployed Site is owner-only. Service credentials do not supply a visitor identity.
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId || userId.length > 200) return json({error:'authentication_required'}, 401);
  if (request.method === 'GET') {
    try {
      return json({snapshot:await readSnapshot(env.DB, userId)});
    } catch {
      return json({error:'xbox_storage_unavailable'}, 503);
    }
  }
  if (request.method !== 'POST') return json({error:'method_not_allowed'}, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({error:'origin_not_allowed'}, 403);
  }
  const key = env.XBOX_OPENXBL_API_KEY?.trim();
  if (!key) return json({error:'xbox_not_configured'}, 503);
  if (!env.DB) return json({error:'xbox_storage_unavailable'}, 503);
  const checkedAt = new Date().toISOString();
  let snapshot;
  try {
    const account = await openXbl(key, 'account', '/account');
    const xuid = account?.profileUsers?.[0]?.id;
    if (typeof xuid !== 'string' || !/^\d{1,20}$/.test(xuid)) throw invalidProviderShape('account');

    const sources = await Promise.allSettled([
      readHistory(key, 'achievements', '/achievements/player/' + xuid),
      readHistory(key, 'title_history', '/player/titleHistory/' + xuid)
    ]);
    const history = sources.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (!history.length) throw sources[0].reason;
    const allGames = playedGames(history.map(page=>page.titles));
    const games = allGames.slice(0, MAX_TITLES);
    const batches = [];
    for (let start = 0; start < games.length; start += BATCH_SIZE) {
      const batch = games.slice(start, start + BATCH_SIZE);
      batches.push(batch);
    }
    const stats = await Promise.allSettled(batches.map(async batch => {
      const data = await openXbl(key, 'playtime', '/player/stats', {
        xuids:[xuid],
        stats:batch.map(game=>({titleId:game.id,name:MINUTES_PLAYED}))
      });
      applyPlaytime(batch, data);
    }));
    snapshot = {
      games,
      limited:allGames.length > MAX_TITLES || history.some(source=>source.limited),
      historyIncomplete:history.length < sources.length || history.some(source=>source.incomplete),
      playtimeIncomplete:stats.some(result=>result.status==='rejected'),
      checkedAt
    };
  } catch (error) {
    return error instanceof XboxError ? json({error:error.message}, error.status) : json({error:'xbox_unavailable'}, 502);
  }
  try {
    return json(await saveSnapshot(env.DB, userId, snapshot));
  } catch {
    return json({error:'xbox_storage_unavailable'}, 503);
  }
}

async function readSnapshot(db, userId) {
  const row = await db.prepare('SELECT snapshot FROM xbox_history_snapshots WHERE user_id = ?').bind(userId).first();
  return row ? JSON.parse(row.snapshot) : null;
}

async function saveSnapshot(db, userId, snapshot) {
  const incomplete = snapshot.historyIncomplete || snapshot.playtimeIncomplete;
  const conflict = incomplete ? 'DO NOTHING' : `DO UPDATE SET snapshot = excluded.snapshot, checked_at = excluded.checked_at
    WHERE excluded.checked_at > xbox_history_snapshots.checked_at`;
  const result = await db.prepare(`INSERT INTO xbox_history_snapshots (user_id, snapshot, checked_at)
    VALUES (?, ?, ?) ON CONFLICT(user_id) ${conflict}`)
    .bind(userId, JSON.stringify(snapshot), snapshot.checkedAt).run();
  if (result.meta.changes) return {snapshot};
  return {
    snapshot:await readSnapshot(db, userId),
    ...(incomplete && {warning:'xbox_refresh_incomplete'})
  };
}
