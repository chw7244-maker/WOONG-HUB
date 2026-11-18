import { forecastUrl, parseForecast } from '../src/lib/weather.ts';
import { weatherCities } from '../src/lib/weather-cities.ts';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const metAgent = 'WoongHub/0.8 (+https://github.com/chw7244-maker/WOONG-HUB)';
const finite = value => Number.isFinite(value) ? value : null;

function weatherCode(symbol = '') {
  if (symbol.includes('thunder')) return 95;
  if (symbol.includes('sleet')) return 66;
  if (symbol.includes('snow')) return 71;
  if (symbol.includes('rain')) return 61;
  return { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45 }[symbol.split('_')[0]] ?? null;
}

function parseMetForecast(value) {
  const series = value?.properties?.timeseries;
  if (!Array.isArray(series)) throw new Error('invalid_forecast');
  const samples = series.slice(0, 250).flatMap(row => {
    const date = Date.parse(row.time), fields = row.data?.instant?.details;
    if (!Number.isFinite(date) || !fields || !Number.isFinite(fields.air_temperature)) return [];
    const next = row.data.next_1_hours ?? row.data.next_6_hours;
    const symbol = next?.summary?.symbol_code;
    return [{ time: new Date(date + 9 * 3600000).toISOString().slice(0, 16), temperature: fields.air_temperature,
      wind: Number.isFinite(fields.wind_speed) ? Math.round(fields.wind_speed * 3.6) : null,
      feelsLike: finite(fields.apparent_air_temperature), code: weatherCode(symbol), night: !!symbol?.endsWith('_night'),
      rain: finite(next?.details?.probability_of_precipitation), rainAmount: finite(row.data.next_1_hours?.details?.precipitation_amount) }];
  });
  const first = samples[0];
  if (!first) throw new Error('empty_forecast');
  const localDays = new Map();
  for (const point of samples) {
    const day = point.time.slice(0, 10);
    if (!localDays.has(day)) localDays.set(day, []);
    localDays.get(day).push(point);
  }
  const days = [...localDays].slice(0, 7).map(([time, points]) => {
    const readings = points.map(point => point.temperature);
    const rain = points.flatMap(point => point.rain === null ? [] : [point.rain]);
    const noon = points.find(point => point.time.slice(11) >= '12:00') ?? points.at(-1);
    return { time, low: Math.min(...readings), high: Math.max(...readings), code: noon?.code ?? null, rain: rain.length ? Math.max(...rain) : null };
  });
  const { rain, rainAmount, ...current } = first;
  const hours = samples.slice(0, 24).map(({ time, temperature, code, night, rain, rainAmount }) => ({ time, temperature, code, night, rain, rainAmount }));
  return { source: 'met-norway', current, hours, days };
}

export async function weatherForecast(request, ctx, city, { fetcher = fetch, cache = globalThis.caches?.default } = {}) {
  const cacheKey = new Request(new URL(`/__metadata/weather-v1/${city}`, request.url));
  try {
    const cached = await cache?.match(cacheKey);
    if (cached?.ok) return await cached.json();
  } catch { /* try the forecast source */ }
  async function load(url, parse, headers, timeout) {
    const reply = await fetcher(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    if (!reply.ok) { await reply.body?.cancel(); throw new Error('weather_unavailable'); }
    return { parsed: parse(await reply.json()), expires: Date.parse(reply.headers.get('Expires') ?? '') };
  }
  let result;
  try { result = await load(forecastUrl(city), parseForecast, { Accept: 'application/json' }, 3700); }
  catch {
    const { lat, lon } = weatherCities[city];
    const query = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
    try { result = await load(`https://api.met.no/weatherapi/locationforecast/2.0/complete?${query}`, parseMetForecast, { 'User-Agent': metAgent }, 5500); }
    catch { return null; }
  }
  if (cache && ctx?.waitUntil) {
    const ttl = Math.max(600, Math.ceil((result.expires - Date.now()) / 1000) || 600);
    ctx.waitUntil(Promise.resolve().then(() => cache.put(cacheKey, Response.json(result.parsed, { headers: { 'Cache-Control': `public, max-age=${ttl}` } }))).catch(() => {}));
  }
  return result.parsed;
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
