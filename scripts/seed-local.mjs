// Adds sample records to the LOCAL preview database only (.sites-runtime/local.sqlite), never to the site's DB.
// Run `pnpm preview` and open the site once first so the local document exists, then: node scripts/seed-local.mjs
// The names are made up on purpose: this repository is public, so it must not carry anyone's real collection.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const file = '.sites-runtime/local.sqlite';
if (!existsSync(file)) { console.error(`${file} 이 없습니다. pnpm preview로 미리보기를 한 번 연 뒤 다시 실행하세요.`); process.exit(1); }
const db = new DatabaseSync(file);
const row = db.prepare('SELECT user_id, data FROM hub_documents LIMIT 1').get();
if (!row) { console.error('로컬 문서가 없습니다. 미리보기 사이트를 브라우저에서 한 번 열어 주세요.'); process.exit(1); }

const doc = JSON.parse(row.data);
const now = new Date().toISOString();
const base = (id, kind, title, category, status) => ({ id: `seed-${id}`, kind, title, detail: '', category, status, url: '', date: '', done: false, createdAt: now });
const gear = (id, title, category, manufacturer = '', status = '보유 중') => ({ ...base(id, 'audio', title, category, status),
  audio: { type: 'gear', manufacturer, model: '', purchasedAt: '', priceKRW: null, sound: '', connection: '' } });
const game = (id, title, status, playMinutes, rating, detail = '', platform = 'PC') => ({ ...base(id, 'games', title, platform, status), detail,
  game: { playMinutes, rating, startedAt: '', completedAt: '', tags: [] } });

const seeds = [
  gear('ie-1', '샘플음향 이어폰 A1', '이어폰', '샘플음향'), gear('ie-2', '샘플음향 이어폰 B2', '이어폰', '샘플음향'), gear('ie-3', '무선 이어폰 테스트', '이어폰'),
  gear('hp-1', '오픈형 헤드폰 HX', '헤드폰', '오픈형', '위시리스트'), gear('dap-1', '포터블 플레이어 P1', 'DAP'), gear('amp-1', '데스크 앰프 D2', 'DAC · 앰프'),
  // The old combined category, to try 이어팁 · 케이블로 나누기: two tips, two cables and one the guess cannot place.
  gear('acc-1', 'SpinFit 샘플 이어팁', '케이블 · 이어팁'), gear('acc-2', '폼팁 샘플 M', '케이블 · 이어팁'), gear('acc-3', '샘플 4.4mm 케이블', '케이블 · 이어팁'),
  gear('acc-4', 'MMCX 업그레이드 선재', '케이블 · 이어팁'), gear('acc-5', '이름만 있는 액세서리', '케이블 · 이어팁'), gear('etc-1', '책상 스피커 S', '기타'),
  game('g-1', '샘플 퍼즐 게임', '완료', 750, 4.5, '짧고 완벽한 퍼즐\n\n엔딩까지 좋았던 긴 감상'), game('g-2', '샘플 협동 게임', '완료', null, 3), game('g-3', '샘플 전략 게임', '플레이 예정', null, null),
  // More games for the list's stars, groups, one-line memo and cover view.
  game('g-4', '샘플 리듬 게임', '완료', 106, 3.5, '손이 박자를 못 따라감'), game('g-5', '샘플 슈터 게임', '플레이 예정', 69, null), game('g-6', '샘플 로그라이크', '플레이 중', 300, 4),
  game('g-7', '샘플 파티 게임', '위시리스트', null, null), game('g-8', '샘플 액션 게임', '보류', 120, 2, '', 'PlayStation'),
];
const known = new Set(doc.entries.map(entry => entry.id));
const added = seeds.filter(entry => !known.has(entry.id));
doc.entries = [...added, ...doc.entries];
db.prepare('UPDATE hub_documents SET data = ?, revision = revision + 1 WHERE user_id = ?').run(JSON.stringify(doc), row.user_id);
console.log(`로컬 미리보기 DB에 예시 기록 ${added.length}개를 추가했습니다(이미 있던 ${seeds.length - added.length}개는 건너뜀). 브라우저를 새로고침하세요.`);
