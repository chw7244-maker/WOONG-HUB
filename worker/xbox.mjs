const BASE = 'https://api.xbl.io/v2';
const MAX_TITLES = 1000;
const MAX_HISTORY_PAGES = 6;
const BATCH_SIZE = 100;
const MINUTES_PLAYED = 'MinutesPlayed';

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

async function openXbl(key, path, body) {
  const headers = {Accept:'application/json', 'X-Authorization':key};
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(BASE + path, {
    headers,
    redirect:'error',
    signal:AbortSignal.timeout(8000),
    ...(body && {method:'POST',body:JSON.stringify(body)})
  });
  if (!response.ok) throw providerError(response.status);
  const data = await response.json();
  if (Number(data?.code) >= 400) throw providerError(Number(data.code));
  return data?.content ?? data;
}

function dateString(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2000 ? date.toISOString() : null;
}

async function readHistory(key, path) {
  const titles = [];
  let token = '';
  try {
    for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
      const query = token ? '?' + new URLSearchParams({continuationToken:token}) : '';
      const data = await openXbl(key, path + query);
      if (!Array.isArray(data?.titles)) throw providerError(502);
      titles.push(...data.titles);
      const next = data.pagingInfo?.continuationToken;
      if (!next) return {titles, limited:false};
      if (typeof next !== 'string' || next === token || next.length > 2048 || titles.length >= MAX_TITLES) break;
      token = next;
    }
  } catch (error) {
    if (!titles.length) throw error;
  }
  return {titles, limited:true};
}

function playedGames(results) {
  const games = new Map();
  for (const titles of results) {
    for (const title of titles) {
      const id = String(title?.titleId ?? '');
      const name = typeof title?.name === 'string' ? title.name.trim().slice(0, 250) : '';
      if (!/^\d{1,10}$/.test(id) || !name || (title.type && String(title.type).toLowerCase() !== 'game')) continue;
      const lastPlayed = dateString(title.titleHistory?.lastTimePlayed);
      const previous = games.get(id)?.lastPlayed ?? null;
      games.set(id, {id, name, lastPlayed:lastPlayed && (!previous || lastPlayed > previous) ? lastPlayed : previous, minutes:null});
    }
  }
  return Array.from(games.values()).sort((a,b)=>(b.lastPlayed??'').localeCompare(a.lastPlayed??'') || a.name.localeCompare(b.name));
}

function applyPlaytime(games, data) {
  if (!Array.isArray(data?.statlistscollection)) throw providerError(502);
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
  if (request.method !== 'GET') return json({error:'method_not_allowed'}, 405);
  const key = env.XBOX_OPENXBL_API_KEY?.trim();
  if (!key) return json({error:'xbox_not_configured'}, 503);
  try {
    const account = await openXbl(key, '/account');
    const xuid = account?.profileUsers?.[0]?.id;
    if (typeof xuid !== 'string' || !/^\d{1,20}$/.test(xuid)) throw providerError(502);

    const sources = await Promise.allSettled([
      '/achievements/player/', '/player/titleHistory/'
    ].map(path => readHistory(key, path + xuid)));
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
      const data = await openXbl(key, '/player/stats', {
        xuids:[xuid],
        stats:batch.map(game=>({titleId:game.id,name:MINUTES_PLAYED}))
      });
      applyPlaytime(batch, data);
    }));
    return json({
      games,
      limited:allGames.length > MAX_TITLES || history.some(source=>source.limited),
      historyIncomplete:history.length < sources.length,
      playtimeIncomplete:stats.some(result=>result.status==='rejected'),
      checkedAt:new Date().toISOString()
    });
  } catch (error) {
    return error instanceof XboxError ? json({error:error.message}, error.status) : json({error:'xbox_unavailable'}, 502);
  }
}
