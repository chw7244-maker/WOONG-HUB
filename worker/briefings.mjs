import { briefingEditions, briefingSection, briefingSources, isBriefingDate, isBriefingEdition } from '../src/lib/briefings.ts';
import { todayKST } from '../src/lib/store.ts';
import { canonicalUrl } from './news-feeds.mjs';

const maxBody = 128 * 1024;
const dayMs = 86_400_000;
const columns = 'edition_date,edition,section,title,summary,why,source,source_date,source_status,url,published_at,briefing_markdown';
const chatLink = /^https:\/\/chatgpt\.com\/c\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });

function field(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('invalid_briefing');
  return value.trim();
}

export function validateBriefing(value, today) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_briefing');
  const { date, edition, overview, items, markdown, chatUrl } = value;
  if (typeof date !== 'string' || !isBriefingDate(date) || date > today ||
    typeof edition !== 'string' || !isBriefingEdition(edition) || !Array.isArray(items) || items.length > 15) throw new Error('invalid_briefing');
  if (chatUrl !== undefined && (typeof chatUrl !== 'string' || !chatLink.test(chatUrl))) throw new Error('invalid_briefing');
  const body = field(markdown, 32_000);
  const urls = new Set();
  const parsed = items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid_briefing');
    const { section, status, sourceDate } = item;
    if (typeof section !== 'string' || !briefingSection(edition, section) || typeof status !== 'string' || !Object.hasOwn(briefingSources, status)) throw new Error('invalid_briefing');
    if (sourceDate !== undefined && (typeof sourceDate !== 'string' || !isBriefingDate(sourceDate) || sourceDate > date)) throw new Error('invalid_briefing');
    const url = canonicalUrl(field(item.url, 1800));
    if (!url?.startsWith('https://') || urls.has(url)) throw new Error('invalid_or_duplicate_url');
    urls.add(url);
    return { section, status, title: field(item.title, 180), summary: field(item.summary, 600), why: field(item.why, 420), source: field(item.source, 100), url, ...(sourceDate && { sourceDate }) };
  });
  return { date, edition, overview: field(overview, 450), items: parsed, markdown: body, ...(chatUrl && { chatUrl }) };
}

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > maxBody) throw new Error('too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_json');
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return JSON.parse(text + decoder.decode());
    bytes += value.byteLength;
    if (bytes > maxBody) { await reader.cancel(); throw new Error('too_large'); }
    text += decoder.decode(value, { stream: true });
  }
}

const asIssue = row => ({ ...JSON.parse(row.document), publishedAt: row.published_at });
const range = (db, from, through) => db.prepare('SELECT document,published_at FROM daily_briefings WHERE day BETWEEN ? AND ? ORDER BY day DESC, edition DESC').bind(from, through).all();

function csvCell(value) {
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
}

export function briefingCsv(issues) {
  const rows = issues.flatMap(issue => {
    const items = issue.items.length ? issue.items : [{ summary: issue.overview }];
    return items.map((item, index) => [issue.date, issue.edition, item.section && briefingSection(issue.edition, item.section), item.title, item.summary,
      item.why, item.source, item.sourceDate, item.status, item.url, issue.publishedAt, index === 0 ? issue.markdown : ''].map(csvCell).join(','));
  });
  return `\uFEFF${[columns, ...rows].join('\r\n')}\r\n`;
}

export async function handleBriefings(request, env, { now = new Date() } = {}) {
  const url = new URL(request.url), path = url.pathname;
  const service = path === '/api/briefings/publish';
  const visitor = request.headers.get('oai-authenticated-user-id');
  // The owner-private Sites service gate authenticates calls to the shared writer.
  if (service && (visitor || request.headers.get('Origin') || request.headers.get('Sec-Fetch-Site'))) return json({ error: 'service_access_required' }, 403);
  if (!service && (!visitor || visitor.length > 200)) return json({ error: 'authentication_required' }, 401);
  if (!env.DB) return json({ error: 'database_unavailable' }, 503);
  if (!['GET', ...(service ? ['PUT'] : [])].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
  const today = todayKST(now);
  try {
    if (request.method === 'PUT') {
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'json_required' }, 415);
      let value;
      try { value = await readBody(request); } catch (error) { return json({ error: error.message === 'too_large' ? 'too_large' : 'invalid_json' }, error.message === 'too_large' ? 413 : 400); }
      let draft;
      try { draft = validateBriefing(value, today); } catch (error) { return json({ error: error.message }, 400); }
      const publishedAt = now.toISOString();
      const result = await env.DB.prepare(`
        INSERT INTO daily_briefings(day,edition,document,published_at) VALUES (?,?,?,?)
        ON CONFLICT(day,edition) DO UPDATE SET document=excluded.document, published_at=excluded.published_at
        WHERE json_extract(daily_briefings.document, '$.markdown') IS NULL
           OR (json_extract(daily_briefings.document, '$.chatUrl') IS NULL AND json_extract(excluded.document, '$.chatUrl') IS NOT NULL)
      `)
        .bind(draft.date, draft.edition, JSON.stringify(draft), publishedAt).run();
      if (result.meta.changes === 1) return json({ status: 'published', date: draft.date, edition: draft.edition, count: draft.items.length, publishedAt }, 201);
      const prior = await env.DB.prepare('SELECT document,published_at FROM daily_briefings WHERE day=? AND edition=?').bind(draft.date, draft.edition).first();
      if (!prior) return json({ error: 'briefing_unavailable' }, 503);
      const existing = asIssue(prior);
      return json({ status: 'already_published', date: existing.date, edition: existing.edition, count: existing.items.length, publishedAt: existing.publishedAt });
    }
    if (path === '/api/briefings/export') {
      const from = url.searchParams.get('from') ?? '', through = url.searchParams.get('through') ?? '';
      if (!isBriefingDate(from) || !isBriefingDate(through) || from > through || through > today || Date.parse(through) - Date.parse(from) > dayMs * 92) return json({ error: 'invalid_date_range' }, 400);
      const rows = await range(env.DB, from, through);
      return new Response(briefingCsv(rows.results.map(asIssue)), { headers: {
        'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="woong-hub-briefings-${from}-${through}.csv"`,
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      } });
    }
    if (service && url.searchParams.get('format') === 'contract') {
      return json({
        revision: 2, today, editions: briefingEditions, sourceStatuses: briefingSources,
        fields: { date: 'YYYY-MM-DD KST', edition: 'games | audio', overview: '1–450 characters for the home preview', items: '0–15 indexed items for home and CSV',
          markdown: 'required full report Markdown, up to 32,000 characters', chatUrl: 'optional original ChatGPT chat link only when copying its full report' },
        itemFields: { section: 'edition section key', title: '1–180 characters', summary: '1–600 characters', why: '1–420 characters',
          source: '1–100 characters', url: 'unique direct HTTPS source URL', status: 'official | reported | rumor', sourceDate: 'optional original publication date YYYY-MM-DD' },
        rules: [
          'Read today and yesterday before researching. Publish only missing editions. Reuse the prior issue only for meaningful follow-ups.',
          'Write the complete Korean report in markdown with a title and KST date, one-line lead, up to five verified top stories, topical sections, a seven-day calendar table and three follow-up checks when supported. Aim for four to six minutes of reading on an active day.',
          'For each story, include verified details, why it matters, its original date, and a direct HTTPS Markdown source link. Use primary sources first. Mark unconfirmed reporting, older items, overseas pricing and future releases.',
          'Games: cover PC and console, Korean studios and events, mobile, confirmed deals and subscriptions, and the calendar. Prioritize GTA VI, Cyberpunk, The Witcher and Football Manager when news changes.',
          'Audio: cover Scheherazade and major Korean dealers with available IEM stock, prices and auditions, followed by international hardware and firmware, music releases, and the calendar.',
          'A quiet day can be shorter. Explain sections with no verified updates without filling them with repeat stories. If source access fails, report it without writing that edition.',
          'PUT each edition, then GET the same date and verify the entire markdown. The first full report stays in place on retries. An original-chat import may replace an earlier standalone report.',
        ],
      });
    }
    const requestedDate = url.searchParams.get('date');
    if (requestedDate !== null && (!isBriefingDate(requestedDate) || requestedDate > today)) return json({ error: 'invalid_date' }, 400);
    const recent = await env.DB.prepare('SELECT DISTINCT day FROM daily_briefings WHERE day<=? ORDER BY day DESC LIMIT 60').bind(today).all();
    const dates = recent.results.map(row => row.day);
    const date = requestedDate ?? dates[0] ?? today;
    const result = await range(env.DB, date, date);
    return json({ date, today, dates, issues: result.results.map(asIssue) });
  } catch { return json({ error: 'briefing_unavailable' }, 503); }
}
