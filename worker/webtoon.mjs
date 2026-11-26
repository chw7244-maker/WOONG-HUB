import { validateWebtoonCover, webtoonMatchKey } from '../src/lib/webtoon.ts';
import { boundedJson } from './compress.mjs';

const origin = 'https://www.kmas.or.kr';
const platforms = ['네이버웹툰', '카카오웹툰', '카카오페이지'];
const text = (value, max = 200) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
const json = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' },
});

function candidate(row) {
  const platform = text(row?.pltfomCdNm, 100);
  const kind = text(row?.listSeCdNm, 60);
  const code = String(row?.listSeCd ?? '');
  const name = text(row?.title) || text(row?.prdctNm);
  const subtitle = text(row?.subtitl);
  const edition = text(row?.edtn, 100);
  if (!name || (!platform && code !== '1' && kind !== '웹툰') || (code && code !== '1') ||
    (kind && kind !== '웹툰') || text(row?.isbn) || text(row?.setIsbn) || edition) return null;

  const title = subtitle && !webtoonMatchKey(name).includes(webtoonMatchKey(subtitle)) ? `${name} · ${subtitle}` : name;
  const creator = [...new Set([text(row?.sntncWritrNm, 120), text(row?.pictrWritrNm, 120)].filter(Boolean))].join(' · ');
  let cover;
  try {
    const path = text(row?.imageDownloadUrl, 500);
    if (path) {
      const url = new URL(path, origin);
      if (url.protocol === 'http:') url.protocol = 'https:';
      cover = validateWebtoonCover({ source: 'kmas', imageUrl: url.href });
    }
  } catch {}
  return { title, platform, creator, cover };
}

function catalogResults(payload, query, platform) {
  const result = payload?.result;
  const rows = payload?.itemlist ?? result?.itemlist;
  if (String(result?.resultState).toLowerCase() !== 'success' || !Array.isArray(rows) || rows.length > 25) {
    throw new Error('invalid_catalog_response');
  }
  const options = rows.map(candidate).filter(Boolean);
  const matches = platform ? options.filter(option => webtoonMatchKey(option.title) === webtoonMatchKey(query) &&
    webtoonMatchKey(option.platform) === webtoonMatchKey(platform)) : [];
  const recommended = Number(result.totalCount) === rows.length && matches.length === 1 && matches[0].cover ? matches[0] : null;
  const available = options.filter(option => option.cover);
  if (recommended) available.splice(available.indexOf(recommended), 1);
  const unique = [...new Map(available.map(option => [JSON.stringify(option), option])).values()];
  return { items: (recommended ? [recommended, ...unique] : unique).slice(0, 8), recommended: recommended ? 0 : null };
}

export async function handleWebtoonSearch(request, env, fetcher = fetch) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user || user.length > 200) return json({ error: 'authentication_required' }, 401);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  const params = new URL(request.url).searchParams;
  const query = text(params.get('q'), 200), platform = params.get('platform') ?? '';
  if (!query || (platform && !platforms.includes(platform))) return json({ error: 'invalid_query' }, 400);

  const key = env.KMAS_API_KEY?.trim();
  if (!key) return json({ error: 'catalog_not_connected' }, 503);
  const url = new URL('/openapi/search/bookAndWebtoonList', origin);
  url.search = new URLSearchParams({ prvKey: key, title: query, pageNo: '0', viewItemCnt: '25' });
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return response.status === 429 ? json({ error: 'catalog_limited' }, 503) : json({ error: 'catalog_unavailable' }, 502);
    }
    return json(catalogResults(await boundedJson(response, 500_000), query, platform));
  } catch { return json({ error: 'catalog_unavailable' }, 502); }
}
