import { validateDeviceLibrary } from '../src/lib/device-music.ts';

/*
 * A portable player's track list (paths only), one per HUB user, in `music_device_libraries`. The list is gzip-
 * compressed because 20,000 paths would pass D1's 2 MB cell limit as plain JSON.
 */
const MAX_BODY = 4 * 1024 * 1024, MAX_STORED = 1_800_000;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });

export async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'gz:' + btoa(binary);
}
export async function gunzip(stored) {
  if (!stored.startsWith('gz:')) return stored;
  const bytes = Uint8Array.from(atob(stored.slice(3)), c => c.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
export async function boundedJson(request, max = MAX_BODY) {
  if (Number(request.headers.get('content-length')) > max) throw new Error('too_large');
  const reader = request.body?.getReader(); if (!reader) throw new Error('invalid_json');
  const decoder = new TextDecoder(); let size = 0, text = '';
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new Error('too_large'); } text += decoder.decode(value, { stream: true }); }
  try { return JSON.parse(text + decoder.decode()); } catch { throw new Error('invalid_json'); }
}

export async function handleMusicDevice(request, env) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user || user.length > 200) return json({ error: 'authentication_required' }, 401);
  if (!env.DB) return json({ error: 'database_unavailable' }, 503);
  try {
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT name, suffix, tracks, imported_at FROM music_device_libraries WHERE user_id = ?').bind(user).first();
      if (!row) return json({ library: null });
      return json({ library: validateDeviceLibrary({ name: row.name, suffix: row.suffix, importedAt: row.imported_at, tracks: JSON.parse(await gunzip(row.tracks)) }) });
    }
    if (!['PUT', 'DELETE'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'DELETE') { await env.DB.prepare('DELETE FROM music_device_libraries WHERE user_id = ?').bind(user).run(); return json({ removed: true }); }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'json_required' }, 415);
    let library;
    try { library = validateDeviceLibrary(await boundedJson(request)); } catch (e) { return json({ error: e.message === 'too_large' ? 'too_large' : 'invalid_library' }, e.message === 'too_large' ? 413 : 400); }
    const stored = await gzip(JSON.stringify(library.tracks));
    if (stored.length > MAX_STORED) return json({ error: 'too_large' }, 413);
    await env.DB.prepare('INSERT INTO music_device_libraries (user_id, name, suffix, tracks, track_count, imported_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, suffix = excluded.suffix, tracks = excluded.tracks, track_count = excluded.track_count, imported_at = excluded.imported_at')
      .bind(user, library.name, library.suffix, stored, library.tracks.length, library.importedAt).run();
    return json({ saved: true, count: library.tracks.length });
  } catch {
    // No SQL or track paths in error responses.
    return json({ error: 'database_unavailable' }, 503);
  }
}
