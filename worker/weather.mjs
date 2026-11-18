import { forecastUrl, parseForecast } from '../src/lib/weather.ts';
import { weatherCities } from '../src/lib/weather-cities.ts';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });

export async function weatherForecast(request, ctx, city, { fetcher = fetch, cache = globalThis.caches?.default } = {}) {
  const cacheKey = new Request(new URL(`/__metadata/weather-v1/${city}`, request.url));
  try {
    const cached = await cache?.match(cacheKey);
    if (cached?.ok) return await cached.json();
  } catch { /* try the forecast source */ }
  try {
    const reply = await fetcher(forecastUrl(city), { redirect: 'manual', signal: AbortSignal.timeout(6500) });
    if (!reply.ok) { await reply.body?.cancel(); return null; }
    const parsed = parseForecast(await reply.json());
    if (cache && ctx?.waitUntil) {
      ctx.waitUntil(Promise.resolve().then(() => cache.put(cacheKey, Response.json(parsed, { headers: { 'Cache-Control': 'public, max-age=600' } }))).catch(() => {}));
    }
    return parsed;
  } catch { return null; }
}

export async function handleWeather(request, ctx, options) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user || user.length > 200) return json({ error: 'authentication_required' }, 401);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  const city = new URL(request.url).searchParams.get('city') ?? '';
  if (!Object.hasOwn(weatherCities, city)) return json({ error: 'invalid_city' }, 400);
  const forecast = await weatherForecast(request, ctx, city, options);
  return forecast ? json(forecast) : json({ error: 'weather_unavailable' }, 502);
}
