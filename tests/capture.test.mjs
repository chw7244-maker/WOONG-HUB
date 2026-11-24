import assert from 'node:assert/strict';
import test from 'node:test';
import { captureEntry, captureLabel, convertEntry, detectCapture, dueLabel, dueThisWeek, sortTodos } from '../src/lib/capture.ts';
import { initial, validateData } from '../src/lib/store.ts';

const today = '2026-11-23'; // a Monday
const keep = entry => validateData({ ...initial, entries: [entry] }).entries[0];

test('a link makes a bookmark titled by the other words or the domain', () => {
  assert.deepEqual(detectCapture('https://www.openligadb.de/table', today), { kind: 'bookmark', title: 'openligadb.de', url: 'https://www.openligadb.de/table', domain: 'openligadb.de' });
  assert.deepEqual(detectCapture('Steam 할인 일정 store.steampowered.com', today).kind, 'note'); // no scheme and no www: not a link
  const www = detectCapture('할인 일정 www.example.com/sale).', today);
  assert.deepEqual([www.kind, www.title, www.url], ['bookmark', '할인 일정', 'https://www.example.com/sale']);
  assert.equal(detectCapture('내일 볼 글 https://a.example/x', today).kind, 'bookmark'); // the link wins over the date
});

test('date words make a to-do due that day and are taken out of the title', () => {
  const at = text => { const c = detectCapture(text, today); return c.kind === 'todo' ? [c.title, c.date] : [c.kind]; };
  assert.deepEqual(at('오늘 펌웨어 업데이트'), ['펌웨어 업데이트', '2026-11-23']);
  assert.deepEqual(at('내일까지 백업 내보내기'), ['백업 내보내기', '2026-11-24']);
  assert.deepEqual(at('모레 택배'), ['택배', '2026-11-25']);
  assert.deepEqual(at('토요일 이어패드 교체'), ['이어패드 교체', '2026-11-28']);
  assert.deepEqual(at('월요일에 회의'), ['회의', '2026-11-23']);
  assert.deepEqual(at('다음 주 금요일 발표'), ['발표', '2026-12-04']);
  assert.deepEqual(at('12월 1일 결제'), ['결제', '2026-12-01']);
  assert.deepEqual(at('카드 결제 12. 1.'), ['카드 결제', '2026-12-01']);
  assert.deepEqual(at('12.5. 정기 점검'), ['정기 점검', '2026-12-05']);
  assert.deepEqual(at('1/5 신년 계획'), ['신년 계획', '2027-01-05']); // already past this year → next year
  assert.deepEqual(at('오늘'), ['오늘', '2026-11-23']); // nothing else: keep the words
  assert.deepEqual(at('2월 30일 이상한 날'), ['note']);
  assert.deepEqual(at('3.5mm 케이블 사기'), ['note']);
  assert.deepEqual(at('펌웨어 v2.5 확인'), ['note']);
  assert.deepEqual(at('일요일 아침'), ['아침', '2026-11-29']);
});

test('anything else is a note: first line as title, the rest as the body', () => {
  assert.deepEqual(detectCapture('  EA2000 청음 \n저음이 단단함\n\n보컬은 뒤  ', today), { kind: 'note', title: 'EA2000 청음', detail: '저음이 단단함\n\n보컬은 뒤' });
  assert.deepEqual(detectCapture('   ', today), { kind: 'empty' });
  assert.equal(captureLabel(detectCapture('', today), today), '적으면 종류를 알아서 골라요');
  assert.equal(captureLabel(detectCapture('금요일 보고', today), today), '할 일로 저장 · 금요일');
  assert.equal(captureLabel(detectCapture('https://x.example', today), today), '북마크로 저장 · x.example');
});

test('captures save as valid records and can switch kind afterwards', () => {
  const todo = captureEntry(detectCapture('토요일 이어패드 교체', today));
  assert.deepEqual([todo.kind, todo.title, todo.date, todo.done], ['todo', '이어패드 교체', '2026-11-28', false]); keep(todo);
  const note = captureEntry(detectCapture('그냥 생각', today)); keep(note);
  const mark = captureEntry(detectCapture('읽을 글 https://a.example', today)); keep(mark);
  assert.equal(convertEntry(note, 'bookmark'), null);
  assert.deepEqual([convertEntry(note, 'todo').kind, convertEntry(note, 'todo').date], ['todo', '']);
  const back = convertEntry(todo, 'note'); assert.deepEqual([back.kind, back.date], ['note', '']); keep(back);
  const asTodo = convertEntry(mark, 'todo'); assert.deepEqual([asTodo.kind, asTodo.url], ['todo', '']);
  assert.equal(convertEntry(mark, 'bookmark'), mark);
});

test('due labels, this week\'s due list and to-do order', () => {
  assert.deepEqual(['2026-11-23', '2026-11-24', '2026-11-22', '2026-11-25', '2026-11-27', '2026-11-30', '2026-11-23T09:00'].map(d => dueLabel(d, today)), ['오늘', '내일', '어제', '모레', '금요일', '11. 30.', '오늘']);
  const todo = (id, date, done = false) => ({ id, kind: 'todo', title: id, detail: '', category: '', status: '', url: '', date, done, createdAt: '2026-11-01T00:00:00Z' });
  const list = [todo('late', '2026-11-20'), todo('fri', '2026-11-27'), todo('today', '2026-11-23'), todo('next', '2026-11-30'), todo('none', ''), todo('done', '2026-11-24', true)];
  assert.deepEqual(dueThisWeek(list, ''), []);
  assert.deepEqual(dueThisWeek(list, today).map(e => e.id), ['today', 'fri']);
  assert.deepEqual(sortTodos(list).map(e => e.id), ['late', 'today', 'fri', 'next', 'none', 'done']);
});
