const clubFeed = 'https://api-prod.mancity.com/fixturecalendars/v1/DownloadCalendar?calendar=mens&lang=en';
const leagueApi = 'https://api.openligadb.de';
const freshness = 15 * 60 * 1000;
const pending = new Map();
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const clean = value => typeof value === 'string' ? value.trim().slice(0, 135) : '';
const city = name => /^(?:manchester city|man city)(?: fc)?$/i.test(name);

export function premierLeagueSeason(now) {
  return now.getUTCFullYear() - (now.getUTCMonth() < 7 ? 1 : 0);
}

export function clubFixtures(text) {
  if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) throw new Error('invalid_calendar');
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const fixtures = new Map();
  let event;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { event = {}; continue; }
    if (!event) continue;
    if (line !== 'END:VEVENT') {
      const position = line.indexOf(':');
      if (position > 0) event[line.slice(0, position).split(';')[0]] = line.slice(position + 1);
      continue;
    }
    const { UID, DTSTART, SUMMARY = '', STATUS, LOCATION, SEQUENCE } = event;
    event = undefined;
    const start = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(DTSTART ?? '');
    const summary = /^(.+?)\s+v(?:s\.?){0,1}\s+(.+?)\s+-\s+(.+)$/.exec(SUMMARY.replace(/\\([,;\\])/g, '$1'));
    if (!UID || !start || !summary) continue;
    const [, year, month, day, hour, minute, second] = start;
    const kickOff = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    if (!Number.isFinite(Date.parse(kickOff))) continue;
    const [, home, away, competition] = summary;
    if (!city(home) && !city(away)) continue;
    const sequence = Number(SEQUENCE) || 0;
    if ((fixtures.get(UID)?.sequence ?? -1) > sequence) continue;
    fixtures.set(UID, { id: UID.slice(0, 100), home: clean(home), away: clean(away), competition: clean(competition),
      kickOff, venue: clean(LOCATION?.replace(/\\([,;\\])/g, '$1')), postponed: STATUS === 'TENTATIVE' ? 'tentative' : STATUS === 'CANCELLED' ? 'cancelled' : null, sequence });
  }
  if (!fixtures.size) throw new Error('empty_calendar');
  return [...fixtures.values()].sort((a, b) => a.kickOff.localeCompare(b.kickOff));
}

export function leagueTable(data) {
  if (!Array.isArray(data) || data.length !== 20) throw new Error('incomplete_table');
  const teams = new Set();
  const rows = data.map((row, index) => {
    const { teamId, teamName, matches, won, draw, lost, goalDiff, points } = row;
    const name = clean(teamName);
    if (!name || teams.has(teamId) || ![teamId, matches, won, draw, lost, goalDiff, points].every(Number.isSafeInteger)) throw new Error('invalid_table');
    teams.add(teamId);
    return { rank: index + 1, teamId, name, matches, won, draw, lost, goalDiff, points, city: city(name) };
  });
  if (!rows.some(row => row.city)) throw new Error('invalid_table');
  return rows;
}

/*
 * Club crests. OpenLigaDB's community-edited table carries an icon address per team, but those mix Wikimedia files,
 * inline data images, plain http hosts and an unreachable UEFA image server. The worker resolves a crest by team name,
 * fetches it once and serves it from this site, so pages never contact those hosts and a dead address only means a badge.
 */
export const crestKey = name => clean(name).toLowerCase().replace(/&/g, ' ').replace(/\b(?:a?f\.?c\.?|and)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
// Teams whose OpenLigaDB icon does not load (UEFA's image host does not answer) or is not a crest file.
const crestOverrides = {
  manchestercity: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg',
  chelsea: 'https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg',
  tottenhamhotspur: 'https://upload.wikimedia.org/wikipedia/en/b/b4/Tottenham_Hotspur.svg',
  newcastleunited: 'https://upload.wikimedia.org/wikipedia/en/5/56/Newcastle_United_Logo.svg',
  liverpool: 'https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg',
};
const crestHosts = new Set(['upload.wikimedia.org', 'mediadb.kicker.de']);
const crestTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
const crestHeaders = type => ({
  'Content-Type': type, 'Cache-Control': 'private, max-age=604800', 'X-Content-Type-Options': 'nosniff',
  // An SVG opened directly from this origin must not run anything.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
});

/** The address to fetch a crest from: an allowed https host (http is upgraded) or an inline raster image. */
export function crestSource(icon) {
  if (typeof icon !== 'string') return null;
  const inline = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=]+)$/i.exec(icon.trim());
  if (inline) return inline[2].length <= 200_000 ? { inline: inline[1].toLowerCase(), data: inline[2] } : null;
  try {
    const url = new URL(icon.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !crestHosts.has(url.hostname)) return null;
    url.protocol = 'https:';
    // Wikimedia thumbnails can be 1920px wide; a crest never shows above 84px, so ask for a standard small size.
    if (url.hostname === 'upload.wikimedia.org' && url.pathname.includes('/thumb/')) url.pathname = url.pathname.replace(/\/\d+px-([^/]+)$/, '/250px-$1');
    return { url: url.href };
  } catch { return null; }
}

/** Every team in the league table, by name key, with the address its crest comes from. */
export function crestIndex(data) {
  const index = new Map();
  if (!Array.isArray(data)) return index;
  for (const row of data) {
    for (const name of [row?.teamName, row?.shortName]) {
      const key = crestKey(name ?? '');
      if (key && !index.has(key)) index.set(key, row?.teamIconUrl);
    }
  }
  return index;
}

async function crestBytes(source, fetcher) {
  if (source.inline) {
    const bytes = Uint8Array.from(atob(source.data), char => char.charCodeAt(0));
    return { bytes, type: source.inline };
  }
  const response = await fetcher(source.url, { redirect: 'follow', signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'WOONG-HUB/1.0 (personal dashboard; crest cache)' } });
  const type = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!response.ok || !crestTypes.has(type) || Number(response.headers.get('Content-Length')) > 400_000) { await response.body?.cancel(); throw new Error('crest_unavailable'); }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 400_000) throw new Error('crest_too_large');
  return { bytes, type };
}

export async function handleCrest(request, ctx, { fetcher = fetch, cache = globalThis.caches?.default, now = Date.now() } = {}) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user || user.length > 200) return json({ error: 'authentication_required' }, 401);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  const name = new URL(request.url).searchParams.get('name') ?? '';
  const key = crestKey(name);
  if (!key || name.length > 80) return json({ error: 'invalid_team' }, 400);
  const cacheKey = new Request(new URL(`/__metadata/football-crest-v1/${key}`, request.url));
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) return new Response(hit.body, { headers: crestHeaders(hit.headers.get('Content-Type')) });
  } catch { /* resolve it again */ }
  let icon = crestOverrides[key];
  if (!icon) {
    const season = premierLeagueSeason(new Date(now));
    // The table is cached for crests separately because the standings cache keeps only the fields pages show.
    const table = await cachedSource(request, `crest-table-${season}`, async () => {
      const rows = JSON.parse(await fetchText(fetcher, `${leagueApi}/getbltable/pl/${season}`, 1_000_000));
      return [...crestIndex(rows)].map(([team, address]) => ({ team, address: typeof address === 'string' ? address.slice(0, 200_100) : null }));
    }, { cache, ctx, now });
    icon = table?.items.find(item => item.team === key)?.address;
  }
  const source = crestSource(icon);
  const missing = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'private, max-age=86400' } });
  if (!source) return missing();
  try {
    const { bytes, type } = await crestBytes(source, fetcher);
    if (cache) {
      const write = Promise.resolve().then(() => cache.put(cacheKey, new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=2592000' } }))).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(write); else await write;
    }
    return new Response(bytes, { headers: crestHeaders(type) });
  } catch {
    // A busy or failing image host: the page shows the badge now and asks again on the next visit.
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export function cityLeagueResults(matches) {
  if (!Array.isArray(matches) || !matches.length) throw new Error('invalid_matches');
  return matches.flatMap(match => {
    const home = clean(match.team1?.teamName), away = clean(match.team2?.teamName), kickOff = match.matchDateTimeUTC;
    if (!match.matchIsFinished || !home || !away || (!city(home) && !city(away)) || !Number.isFinite(Date.parse(kickOff))) return [];
    const result = match.matchResults?.find(row => row.resultTypeKind === 'After90Minutes' || row.resultTypeID === 2);
    if (!result || ![result.pointsTeam1, result.pointsTeam2].every(Number.isSafeInteger)) return [];
    return [{ id: String(match.matchID), home, away, kickOff, homeGoals: result.pointsTeam1, awayGoals: result.pointsTeam2 }];
  }).sort((a, b) => Date.parse(b.kickOff) - Date.parse(a.kickOff)).slice(0, 5);
}

async function fetchText(fetcher, url, limit) {
  const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(9000) });
  if (!response.ok || Number(response.headers.get('Content-Length')) > limit || !response.body) {
    await response.body?.cancel();
    throw new Error('source_unavailable');
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new Error('source_too_large'); }
    text += decoder.decode(value, { stream: true });
  }
}

async function cachedSource(request, key, fetchData, { cache, ctx, now }) {
  const cacheKey = new Request(new URL(`/__metadata/football-v1/${key}`, request.url));
  let previous;
  try { previous = await (await cache?.match(cacheKey))?.json(); } catch { /* fetch the source */ }
  if (previous && now - Date.parse(previous.checkedAt) < freshness) return { ...previous, stale: false };
  const pendingKey = cacheKey.url;
  if (!pending.has(pendingKey)) {
    pending.set(pendingKey, (async () => {
      try {
        const response = { items: await fetchData(), checkedAt: new Date(now).toISOString() };
        if (cache) {
          const write = Promise.resolve().then(() => cache.put(cacheKey, Response.json(response, { headers: { 'Cache-Control': 'public, max-age=172800' } }))).catch(() => {});
          if (ctx?.waitUntil) ctx.waitUntil(write);
          else await write;
        }
        return { ...response, stale: false };
      } finally { pending.delete(pendingKey); }
    })());
  }
  try { return await pending.get(pendingKey); }
  catch { return previous ? { ...previous, stale: true } : null; }
}

export async function footballSnapshot(request, ctx, view, { fetcher = fetch, cache = globalThis.caches?.default, now = Date.now() } = {}) {
  const season = premierLeagueSeason(new Date(now));
  const options = { cache, ctx, now };
  const [fixtures, standings, results] = await Promise.all([
    cachedSource(request, 'club', async () => clubFixtures(await fetchText(fetcher, clubFeed, 500_000)), options),
    view === 'full' ? cachedSource(request, `table-${season}`, async () => leagueTable(JSON.parse(await fetchText(fetcher, `${leagueApi}/getbltable/pl/${season}`, 1_000_000))), options) : null,
    view === 'full' ? cachedSource(request, `results-${season}`, async () => cityLeagueResults(JSON.parse(await fetchText(fetcher, `${leagueApi}/getmatchdata/pl/${season}`, 12_000_000))), options) : null,
  ]);
  const visibleFixtures = fixtures && view !== 'calendar'
    ? { ...fixtures, items: fixtures.items.filter(match => Date.parse(match.kickOff) >= now).slice(0, view === 'home' ? 5 : 24) }
    : fixtures;
  return { season, fixtures: visibleFixtures, standings, results };
}

export async function handleFootball(request, ctx, options) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user || user.length > 200) return json({ error: 'authentication_required' }, 401);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  const view = new URL(request.url).searchParams.get('view');
  return json(await footballSnapshot(request, ctx, view === 'home' || view === 'calendar' ? view : 'full', options));
}
