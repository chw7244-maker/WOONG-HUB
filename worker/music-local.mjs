import { validateLocalLibrary } from '../src/lib/local-music.ts';
import { boundedJson, gunzip, gzip } from './music-device.mjs';

/*
 * 내 음원 라이브러리 API. The library (tags only) is gzip JSON in `music_local_libraries`; covers are small JPEG
 * thumbnails in `music_local_covers`, addressed by the first 32 hex digits of their SHA-256, so each is stored once
 * and can be cached by the browser for good.
 */
const MAX_LIBRARY_BODY = 12 * 1024 * 1024, MAX_STORED = 1_800_000, MAX_COVER_BYTES = 80 * 1024, MAX_COVERS = 3000;
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => Response.json(body, { status, headers });
const sameOrigin = request => request.headers.get('Origin') === new URL(request.url).origin && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const coverId = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 32);

export async function handleMusicLocal(request, env) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user || user.length > 200) return json({ error: 'authentication_required' }, 401);
  if (!env.DB) return json({ error: 'database_unavailable' }, 503);
  const url = new URL(request.url), path = url.pathname;
  try {
    if (path === '/api/music/local/cover') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      const id = url.searchParams.get('id') ?? '';
      if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'invalid_id' }, 400);
      const row = await env.DB.prepare('SELECT data FROM music_local_covers WHERE user_id = ? AND id = ?').bind(user, id).first();
      if (!row) return json({ error: 'not_found' }, 404);
      return new Response(Uint8Array.from(atob(row.data), c => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (path === '/api/music/local/covers') {
      if (request.method === 'GET') return json({ ids: (await env.DB.prepare('SELECT id FROM music_local_covers WHERE user_id = ?').bind(user).all()).results.map(r => r.id) });
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!sameOrigin(request)) return json({ error: 'origin_not_allowed' }, 403);
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('image/jpeg')) return json({ error: 'jpeg_required' }, 415);
      if (Number(request.headers.get('content-length')) > MAX_COVER_BYTES) return json({ error: 'too_large' }, 413);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > MAX_COVER_BYTES) return json({ error: 'too_large' }, 413);
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return json({ error: 'jpeg_required' }, 415);
      const id = await coverId(bytes);
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM music_local_covers WHERE user_id = ?').bind(user).first();
      if ((count?.n ?? 0) >= MAX_COVERS) return json({ error: 'too_many_covers' }, 409);
      let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await env.DB.prepare('INSERT OR IGNORE INTO music_local_covers (user_id, id, data, created_at) VALUES (?, ?, ?, ?)').bind(user, id, btoa(binary), new Date().toISOString()).run();
      return json({ id });
    }
    if (path !== '/api/music/local') return json({ error: 'not_found' }, 404);
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT data FROM music_local_libraries WHERE user_id = ?').bind(user).first();
      return json({ library: row ? validateLocalLibrary(JSON.parse(await gunzip(row.data))) : null });
    }
    if (!['PUT', 'DELETE'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    if (!sameOrigin(request)) return json({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'DELETE') {
      await env.DB.batch([env.DB.prepare('DELETE FROM music_local_libraries WHERE user_id = ?').bind(user), env.DB.prepare('DELETE FROM music_local_covers WHERE user_id = ?').bind(user)]);
      return json({ removed: true });
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'json_required' }, 415);
    let library;
    try { library = validateLocalLibrary(await boundedJson(request, MAX_LIBRARY_BODY)); } catch (e) { return json({ error: e.message === 'too_large' ? 'too_large' : 'invalid_library' }, e.message === 'too_large' ? 413 : 400); }
    const stored = await gzip(JSON.stringify(library));
    if (stored.length > MAX_STORED) return json({ error: 'too_large' }, 413);
    await env.DB.prepare('INSERT INTO music_local_libraries (user_id, folder, data, track_count, scanned_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET folder = excluded.folder, data = excluded.data, track_count = excluded.track_count, scanned_at = excluded.scanned_at')
      .bind(user, library.folder, stored, library.tracks.length, library.scannedAt).run();
    // Covers no album points at any more are dropped so the table does not grow forever.
    // D1 takes at most 100 bound values per query, so stale ids are deleted in chunks.
    const kept = new Set(Object.values(library.covers).map(c => c.id).filter(Boolean));
    const stale = (await env.DB.prepare('SELECT id FROM music_local_covers WHERE user_id = ?').bind(user).all()).results.map(r => r.id).filter(id => !kept.has(id));
    for (let i = 0; i < stale.length; i += 90) { const part = stale.slice(i, i + 90); await env.DB.prepare(`DELETE FROM music_local_covers WHERE user_id = ? AND id IN (${part.map(() => '?').join(',')})`).bind(user, ...part).run(); }
    return json({ saved: true, tracks: library.tracks.length });
  } catch {
    return json({ error: 'database_unavailable' }, 503);
  }
}
