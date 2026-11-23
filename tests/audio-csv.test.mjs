import assert from 'node:assert/strict';
import test from 'node:test';
import { audioCsv, audioImportEntries, audioImportPlan, audioImportRows, decodeCsv, guessCategory, parseCsv } from '../src/lib/audio-csv.ts';
import { initial, validateData } from '../src/lib/store.ts';

const gear = (title, extra = {}) => ({ id: title, kind: 'audio', title, detail: '', category: '이어폰', status: '보유 중', url: '', date: '', done: false, createdAt: '2026-11-01T00:00:00.000Z',
  audio: { type: 'gear', manufacturer: '', model: '', purchasedAt: '', priceKRW: null, sound: '', connection: '', ...extra } });

test('names guess a category only when one category fits', () => {
  assert.equal(guessCategory('샘플 오픈형 헤드폰'), '헤드폰');
  assert.equal(guessCategory('Sennheiser HD 600'), '헤드폰');
  assert.equal(guessCategory('무선 이어폰 테스트'), '이어폰');
  assert.equal(guessCategory('Apple AirPods Pro 3'), '이어폰');
  assert.equal(guessCategory('FiiO M23'), 'DAP');
  assert.equal(guessCategory('포터블 플레이어 P1'), 'DAP');
  assert.equal(guessCategory('FiiO BTR17'), 'DAC · 앰프');
  assert.equal(guessCategory('iFi ZEN DAC V3'), 'DAC · 앰프');
  assert.equal(guessCategory('USB 동글 DAC'), 'DAC · 앰프');
  assert.equal(guessCategory('SpinFit 샘플 이어팁'), '이어팁');
  assert.equal(guessCategory('샘플 4.4mm 케이블'), '케이블');
  assert.equal(guessCategory('이름만 있는 액세서리'), null);
  assert.equal(guessCategory('헤드폰 앰프'), null); // points two ways
});

test('the CSV reader handles quotes, commas, line breaks, CRLF, a BOM and blank lines', () => {
  assert.deepEqual(parseCsv('﻿이름,메모\r\n"A, B","말 ""따옴표""\n둘째 줄"\r\n\r\nC,\n'), [['이름', '메모'], ['A, B', '말 "따옴표"\n둘째 줄'], ['C', '']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('x'), [['x']]);
});

test('import rows read named columns, guess missing categories, clean dates and prices, and skip known names with nothing to change', () => {
  const csv = '장비 이름,분류,브랜드,상태,구매일,가격,메모\n'
    + '오픈형 헤드폰 HX,,샘플음향,보유 중,2025.3.7,"₩359,000",좋음\n'
    + '샘플 이어폰 A1,이어폰,,팔았음,2025-13-01,싸게,\n'
    + '샘플 이어폰 a1,,,,,,\n'
    + '이미 있는 장비,,,,,,\n'
    + ',이어폰,,,,,\n'
    + '이름만 있는 액세서리,,,,,,';
  const rows = audioImportRows(csv, [gear('이미 있는 장비')]);
  assert.deepEqual(rows.map(r => [r.line, r.name, r.category, r.categoryFrom, r.skip]), [
    [2, '오픈형 헤드폰 HX', '헤드폰', 'guess', null],
    [3, '샘플 이어폰 A1', '이어폰', 'csv', null],
    [4, '샘플 이어폰 a1', '이어폰', 'guess', 'repeat'],
    [5, '이미 있는 장비', '이어폰', 'none', 'same'],
    [7, '이름만 있는 액세서리', '기타', 'none', null],
  ]);
  assert.equal(rows[0].purchasedAt, '2025-03-07'); assert.equal(rows[0].priceKRW, 359000); assert.equal(rows[0].manufacturer, '샘플음향'); assert.equal(rows[0].memo, '좋음');
  assert.equal(rows[1].status, '보유 중'); assert.equal(rows[1].purchasedAt, ''); assert.equal(rows[1].priceKRW, null);
  assert.deepEqual(rows[1].notes, ['상태 ‘팔았음’ → 보유 중', '구매일을 읽지 못함', '구매가를 읽지 못함']);
});

test('without a header the columns are taken in the documented order', () => {
  const rows = audioImportRows('샘플 DAP,DAP,샘플,위시리스트,2024-01-02,1000,메모', []);
  assert.deepEqual([rows[0].line, rows[0].name, rows[0].category, rows[0].status, rows[0].priceKRW], [1, '샘플 DAP', 'DAP', '위시리스트', 1000]);
});

test('imported gear uses the category chosen in the preview, leaves skipped rows out and passes HUB validation', () => {
  const rows = audioImportRows('이름,분류\n새 장비 하나,\n이미 있는 장비,\n새 장비 둘,케이블', [gear('이미 있는 장비')]);
  const added = audioImportEntries(rows, { 2: '이어팁' });
  assert.deepEqual(added.map(e => [e.title, e.category]), [['새 장비 하나', '이어팁'], ['새 장비 둘', '케이블']]);
  const data = validateData({ ...initial, entries: added });
  assert.equal(data.entries.length, 2);
});

test('export writes every gear field with a BOM and reads back the same through the import', () => {
  const source = [gear('A, "따옴표" 장비', { manufacturer: '샘플', model: 'X1', purchasedAt: '2025-01-02', priceKRW: 12000, sound: '밝음\n둘째 줄', connection: '4.4mm' }), { ...gear('조합'), audio: { type: 'setup', deviceIds: ['x'] } }];
  source[0].detail = '메모'; source[0].url = 'https://example.com/a';
  const csv = audioCsv(source);
  assert.ok(csv.startsWith('﻿이름,분류,제조사,상태,구매일,구매가,메모,모델,연결 · 출력,소리 성향,링크\r\n'));
  assert.equal(csv.includes('조합'), false);
  const [row] = audioImportRows(csv, []);
  assert.deepEqual({ name: row.name, category: row.category, manufacturer: row.manufacturer, purchasedAt: row.purchasedAt, priceKRW: row.priceKRW, memo: row.memo, model: row.model, connection: row.connection, sound: row.sound, url: row.url },
    { name: 'A, "따옴표" 장비', category: '이어폰', manufacturer: '샘플', purchasedAt: '2025-01-02', priceKRW: 12000, memo: '메모', model: 'X1', connection: '4.4mm', sound: '밝음\n둘째 줄', url: 'https://example.com/a' });
});

test('files saved by Korean Excel as EUC-KR are read as well as UTF-8 ones', () => {
  assert.equal(decodeCsv(new Uint8Array([0xC0, 0xCC, 0xB8, 0xA7, 0x2C, 0x41])), '이름,A');
  assert.equal(decodeCsv(new TextEncoder().encode('﻿이름,A')), '이름,A'); // the decoder drops the BOM
});

test('gear already in the HUB is updated from the filled cells only; empty cells keep recorded values', () => {
  const owned = gear('샘플 헤드폰 HX', { manufacturer: '샘플음향', model: 'HX', purchasedAt: '2024-05-01', priceKRW: 300000, sound: '따뜻함', connection: '3.5mm' });
  owned.detail = '예전 메모'; owned.url = 'https://example.com/old'; owned.category = '헤드폰';
  const csv = '이름,분류,제조사,상태,구매일,구매가,메모,모델,연결 · 출력,소리 성향,링크\n'
    + '샘플 헤드폰 hx,,,위시리스트,,"359,000",새 메모,,,,\n' // name differs only in case
    + '새 장비,,,,,,,,,,\n';
  const [update, added] = audioImportRows(csv, [owned]);
  assert.equal(update.match, owned.id); assert.equal(update.skip, null); assert.equal(update.category, '헤드폰');
  assert.deepEqual(update.changes, ['상태', '구매가', '메모']);
  assert.equal(added.match, null);
  const plan = audioImportPlan([update, added], [owned]);
  assert.equal(plan.added.length, 1);
  const [after] = plan.updated;
  assert.deepEqual([after.id, after.title, after.category, after.status, after.detail, after.url], [owned.id, '샘플 헤드폰 HX', '헤드폰', '위시리스트', '새 메모', 'https://example.com/old']);
  assert.deepEqual(after.audio, { type: 'gear', manufacturer: '샘플음향', model: 'HX', purchasedAt: '2024-05-01', priceKRW: 359000, sound: '따뜻함', connection: '3.5mm' });
  validateData({ ...initial, entries: [after] });
  assert.deepEqual(audioImportPlan([update], [owned], {}, new Set([update.line])).updated, []); // switched off in the preview
});

test('a category in the file replaces the recorded one (or the one picked in the preview); unreadable cells change nothing', () => {
  const owned = gear('샘플 DAC'); owned.category = '기타'; owned.audio.priceKRW = 1000;
  const [row] = audioImportRows('이름,분류,구매가,구매일,상태\n샘플 DAC,DAC · 앰프,싸게,어제,팔았음', [owned]);
  assert.deepEqual(row.changes, ['분류']);
  assert.equal(audioImportPlan([row], [owned]).updated[0].category, 'DAC · 앰프');
  assert.equal(audioImportPlan([row], [owned], { [row.line]: '케이블' }).updated[0].category, '케이블');
  assert.equal(audioImportPlan([row], [owned]).updated[0].audio.priceKRW, 1000);
});

test('re-importing an exported file changes nothing', () => {
  const list = [gear('A', { manufacturer: '샘플', priceKRW: 1, purchasedAt: '2025-01-02', sound: '두 줄\n소리' }), gear('B')];
  list[0].detail = '메모\n둘째 줄';
  const rows = audioImportRows(audioCsv(list), list);
  assert.deepEqual(rows.map(r => r.skip), ['same', 'same']);
  assert.deepEqual(audioImportPlan(rows, list), { added: [], updated: [] });
});

test('an unknown status on known gear is reported as left unchanged', () => {
  const [row] = audioImportRows('이름,상태\n샘플,팔았음', [gear('샘플')]);
  assert.deepEqual([row.skip, row.notes], ['same', ['상태 ‘팔았음’ → 그대로 둠']]);
});
