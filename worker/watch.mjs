import { validateWatchCatalog } from '../src/lib/watch.ts';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });

export async function handleWatchSearch(request, env, fetcher = fetch) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user || user.length > 200) return json({ error: 'authentication_required' }, 401);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  const params = new URL(request.url).searchParams;
  const type = params.get('type'), query = params.get('q')?.trim();
  if (!['movie', 'tv'].includes(type) || !query || query.length > 100) return json({ error: 'invalid_query' }, 400);
  const token = env.TMDB_READ_TOKEN?.trim();
  if (!token) return json({ error: 'catalog_not_connected' }, 503);
  const search = new URLSearchParams({ query, language: 'ko-KR', include_adult: 'false' });
  try {
    const response = await fetcher(`https://api.themoviedb.org/3/search/${type}?${search}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || Number(response.headers.get('Content-Length')) > 500_000) {
      await response.body?.cancel();
      return json({ error: 'catalog_unavailable' }, 502);
    }
    const { results } = await response.json();
    if (!Array.isArray(results)) return json({ error: 'catalog_unavailable' }, 502);
    return json({ items: results.slice(0, 8).flatMap(item => {
      if (item.adult) return [];
      const title = type === 'movie' ? item.title : item.name;
      const year = (type === 'movie' ? item.release_date : item.first_air_date)?.slice(0, 4) || undefined;
      try { return [validateWatchCatalog({ id: item.id, title, year, posterPath: item.poster_path || undefined })]; }
      catch { return []; }
    }) });
  } catch { return json({ error: 'catalog_unavailable' }, 502); }
}
