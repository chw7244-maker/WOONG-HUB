import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLocalMigrations, createLocalDatabase } from '../scripts/local-db.mjs';
import { adjacentBriefingDate } from '../src/lib/briefings.ts';
import { handleBriefings, validateBriefing } from '../worker/briefings.mjs';

const now = new Date('2026-11-18T15:05:00Z');
const day = '2026-11-19';
const item = { section: 'headline', title: '검증용 소식', summary: '기사 요약', why: '확인할 이유', source: '매체', url: 'https://example.com/story?utm_source=test#article', status: 'official' };
const issue = { date: day, edition: 'games', overview: '검증용 브리핑', items: [item], markdown: '# 전문\n\n**본문**\n\n| 일정 | 내용 |\n|---|---|\n| 오늘 | 게임 |' };
const chatUrl = 'https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc';
const request = (path, options) => new Request(`https://hub.example/api/briefings${path}`, options);
const visitor = { headers: { 'oai-authenticated-user-id': 'owner' } };
const put = data => ({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

test('validates editions, local dates, trusted link shape and deduplicates tracking URLs', () => {
  assert.equal(validateBriefing(issue, day).items[0].url, 'https://example.com/story');
  assert.throws(() => validateBriefing({ ...issue, date: '2026-02-30' }, day));
  assert.throws(() => validateBriefing({ ...issue, date: '2026-11-20' }, day));
  assert.throws(() => validateBriefing({ ...issue, items: [{ ...item, url: 'javascript:alert(1)' }] }, day));
  assert.throws(() => validateBriefing({ ...issue, items: [{ ...item, section: 'local-audio' }] }, day));
  assert.throws(() => validateBriefing({ ...issue, items: [item, { ...item, url: 'https://example.com/story' }] }, day));
  assert.throws(() => validateBriefing({ ...issue, markdown: '   ' }, day));
  assert.throws(() => validateBriefing({ ...issue, chatUrl: 'https://chatgpt.com.example/c/1234' }, day));
});

test('briefing dates advance by single calendar days across month and year boundaries', () => {
  assert.equal(adjacentBriefingDate('2024-03-01', -1), '2024-02-29');
  assert.equal(adjacentBriefingDate('2026-12-31', 1), '2027-01-01');
  assert.equal(adjacentBriefingDate('0001-01-01', -1), undefined);
});

test('private service writes one issue per KST day and edition, and visitor reads and downloads it', async t => {
  const DB = createLocalDatabase();
  t.after(() => DB.sqlite.close());
  await applyLocalMigrations(DB);
  const run = req => handleBriefings(req, { DB }, { now });
  const contract = await (await run(request('/publish?format=contract'))).json();
  assert.equal(contract.today, day);
  assert.equal(contract.revision, 2);
  assert.equal((await run(request(''))).status, 401);
  assert.equal((await run(request('/publish', { ...put(issue), headers: { ...put(issue).headers, ...visitor.headers } }))).status, 403);
  const created = await run(request('/publish', put(issue)));
  assert.equal(created.status, 201);
  const repeat = await run(request('/publish', put({ ...issue, overview: '반복 실행' })));
  assert.equal((await repeat.json()).status, 'already_published');
  const audio = { ...issue, edition: 'audio', items: [{ ...item, section: 'local-audio', title: '=SUM(1+1)', summary: '쉼표, "인용"' }, { ...item, url: 'https://example.com/other' }] };
  assert.equal((await run(request('/publish', put(audio)))).status, 201);
  const readout = await (await run(request('', visitor))).json();
  assert.equal(readout.date, day);
  assert.deepEqual(readout.dates, [day]);
  assert.equal(readout.issues.length, 2);
  assert.equal(readout.issues.find(i => i.edition === 'games').overview, issue.overview);
  assert.equal((await (await run(request('/publish?date=2026-11-18'))).json()).issues.length, 0);
  assert.equal((await run(request('/export?from=2026-01-01&through=2026-11-19', visitor))).status, 400);
  const csv = await run(request(`/export?from=${day}&through=${day}`, visitor));
  assert.match(csv.headers.get('Content-Disposition'), /attachment;.*\.csv/);
  const bytes = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /"'=SUM\(1\+1\)"/);
  assert.match(text, /"쉼표, ""인용"""/);
  assert.match(text, /,briefing_markdown\r\n/);
  assert.equal(text.split('# 전문').length - 1, 2);
});

test('a full chat import replaces either an archived summary or a separately generated report exactly once', async t => {
  const DB = createLocalDatabase();
  t.after(() => DB.sqlite.close());
  await applyLocalMigrations(DB);
  const run = req => handleBriefings(req, { DB }, { now });
  const { markdown, ...summary } = issue;
  await DB.prepare('INSERT INTO daily_briefings(day,edition,document,published_at) VALUES (?,?,?,?)')
    .bind(day, 'games', JSON.stringify(summary), now.toISOString()).run();
  const audio = { ...issue, edition: 'audio', items: [] };
  assert.equal((await run(request('/publish', put(audio)))).status, 201);
  for (const draft of [{ ...issue, chatUrl }, { ...audio, markdown: markdown + '\n\n별도 원문', chatUrl }]) {
    assert.equal((await run(request('/publish', put(draft)))).status, 201);
    for (const replacement of [{ ...draft, markdown: '두 번째 원문' }, { ...draft, chatUrl: undefined }]) {
      assert.equal((await (await run(request('/publish', put(replacement)))).json()).status, 'already_published');
    }
    const readout = await (await run(request(`?date=${day}`, visitor))).json();
    const stored = readout.issues.find(entry => entry.edition === draft.edition);
    assert.equal(stored.markdown, draft.markdown);
    assert.equal(stored.chatUrl, chatUrl);
  }
});
