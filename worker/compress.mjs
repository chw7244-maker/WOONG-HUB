// gzip helpers shared by API handlers: stored text is "gz:" + base64 of the gzip bytes; request bodies are read with a size cap.
const MAX_BODY = 4 * 1024 * 1024;

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
