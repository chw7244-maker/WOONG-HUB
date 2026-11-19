import { readFile } from 'node:fs/promises';

const origin = 'https://woong-personal-hub.woong22222.chatgpt.site';
const endpoint = `${origin}/api/briefings/publish`;

async function readInput() {
  process.stdin.setEncoding('utf8');
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdout.write('Ready for briefing JSON on stdin (input is hidden).\n');
  }
  let input = '';
  try {
    for await (const chunk of process.stdin) {
      if (chunk.includes('\u0003')) throw new Error('Cancelled');
      input += chunk;
      if (input.length > 150_000) throw new Error('Input too large');
      if (process.stdin.isTTY && /[\r\n]/.test(input)) break;
    }
  } finally {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  return JSON.parse(input);
}

async function publish() {
  const { token, drafts: inputDrafts = [] } = await readInput();
  const [flag, file, ...extra] = process.argv.slice(2);
  if ((flag && (flag !== '--draft-file' || !file || extra.length || inputDrafts.length))) throw new Error('Invalid draft file arguments');
  const drafts = file ? JSON.parse(await readFile(file, 'utf8')) : inputDrafts;
  if (typeof token !== 'string' || !token || /[\r\n]/.test(token) || !Array.isArray(drafts) || drafts.length > 2) throw new Error('Invalid publisher input');
  const headers = { 'OAI-Sites-Authorization': `Bearer ${token}` };
  async function request(suffix = '', options = {}) {
    const response = await fetch(endpoint + suffix, { ...options, headers: { ...headers, ...options.headers }, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Briefing service HTTP ${response.status}`);
    return response.json();
  }
  const contract = await request('?format=contract');
  if (contract.revision !== 2) throw new Error('Unexpected briefing contract');
  if (!drafts.length) { console.log(JSON.stringify({ contract: contract.revision, today: contract.today, editions: Object.keys(contract.editions) })); return; }
  for (const draft of drafts) {
    if (draft.date !== contract.today && !draft.chatUrl) throw new Error('Only chat reports may be imported for older dates');
    const saved = await request('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    if (!['published', 'already_published'].includes(saved.status)) throw new Error('Unexpected publish result');
    console.log(JSON.stringify(saved));
    const readback = await request(`?${new URLSearchParams({ date: draft.date })}`);
    const issue = readback.issues.find(issue => issue.edition === draft.edition);
    if (readback.date !== draft.date || !issue || issue.markdown !== draft.markdown.trim() || issue.chatUrl !== draft.chatUrl) {
      throw new Error('Published report differs from the draft');
    }
    console.log(JSON.stringify({ verified: true, date: readback.date, edition: issue.edition, length: issue.markdown.length, chat: Boolean(issue.chatUrl) }));
  }
}

try { await publish(); }
catch (error) {
  const message = error instanceof Error && /^Briefing service HTTP \d+$/.test(error.message) ? error.message : 'Briefing publish or readback failed';
  console.error(message);
  process.exitCode = 1;
}
