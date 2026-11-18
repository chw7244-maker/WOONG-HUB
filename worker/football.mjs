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
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(9000) });
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

export async function handleFootball(request, ctx, { fetcher = fetch, cache = globalThis.caches?.default, now = Date.now() } = {}) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user || user.length > 200) return json({ error: 'authentication_required' }, 401);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  const home = new URL(request.url).searchParams.get('view') === 'home';
  const season = premierLeagueSeason(new Date(now));
  const options = { cache, ctx, now };
  const [fixtures, standings, results] = await Promise.all([
    cachedSource(request, 'club', async () => clubFixtures(await fetchText(fetcher, clubFeed, 500_000)), options),
    home ? null : cachedSource(request, `table-${season}`, async () => leagueTable(JSON.parse(await fetchText(fetcher, `${leagueApi}/getbltable/pl/${season}`, 1_000_000))), options),
    home ? null : cachedSource(request, `results-${season}`, async () => cityLeagueResults(JSON.parse(await fetchText(fetcher, `${leagueApi}/getmatchdata/pl/${season}`, 12_000_000))), options),
  ]);
  return json({ season, fixtures: fixtures && { ...fixtures, items: fixtures.items.filter(match => Date.parse(match.kickOff) >= now).slice(0, home ? 5 : 24) }, standings, results });
}
