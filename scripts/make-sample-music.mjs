// Writes a small made-up music folder for trying 내 음원 라이브러리 locally: tag-only FLAC files (STREAMINFO for the
// length, Vorbis comments for the tags, an optional front-cover PICTURE), no audio. Names are invented on purpose:
// this repository is public. Usage: node scripts/make-sample-music.mjs [folder]   (default .sites-runtime/sample-music)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const be = (n, bytes) => { const b = Buffer.alloc(bytes); for (let i = bytes - 1; i >= 0; i--) { b[i] = n & 0xff; n = Math.floor(n / 256); } return b; };
const le32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const block = (type, body, last) => Buffer.concat([Buffer.from([(last ? 0x80 : 0) | type]), be(body.length, 3), body]);

function streamInfo(seconds, rate, bits) {
  const samples = BigInt(seconds * rate), b = Buffer.alloc(34);
  b.writeUInt16BE(4096, 0); b.writeUInt16BE(4096, 2);
  // 20-bit sample rate, 3-bit channels-1 (stereo), 5-bit bits-1, 36-bit total samples
  const packed = (BigInt(rate) << 44n) | (1n << 41n) | (BigInt(bits - 1) << 36n) | samples;
  for (let i = 0; i < 8; i++) b[10 + i] = Number((packed >> BigInt(8 * (7 - i))) & 0xffn);
  return b;
}
function comments(tags) {
  const vendor = Buffer.from('woong-hub sample');
  const items = Object.entries(tags).filter(([, v]) => v !== undefined).map(([k, v]) => Buffer.from(`${k}=${v}`));
  return Buffer.concat([le32(vendor.length), vendor, le32(items.length), ...items.flatMap(i => [le32(i.length), i])]);
}
// A plain-colour PNG drawn here so the sample needs no image files.
function png(size, [r, g, bl]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); return Buffer.concat([be(data.length, 4), t, data, be(crc(Buffer.concat([t, data])), 4)]); };
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3).map((_, i) => [r, g, bl][i % 3])]);
  const raw = Buffer.concat(Array.from({ length: size }, (_, y) => y % 40 < 6 ? Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 240)]) : row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', Buffer.concat([be(size, 4), be(size, 4), Buffer.from([8, 2, 0, 0, 0])])), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function picture(image) {
  const mime = Buffer.from('image/png'), desc = Buffer.alloc(0);
  return Buffer.concat([be(3, 4), be(mime.length, 4), mime, be(desc.length, 4), desc, be(600, 4), be(600, 4), be(24, 4), be(0, 4), be(image.length, 4), image]);
}
function flac({ seconds, rate = 44100, bits = 16, tags, cover }) {
  const blocks = [block(0, streamInfo(seconds, rate, bits), false), block(4, comments(tags), !cover)];
  if (cover) blocks.push(block(6, picture(cover), true));
  return Buffer.concat([Buffer.from('fLaC'), ...blocks]);
}

const albums = [
  { folder: '샘플 트리오_샘플 재즈 앨범', artist: '샘플 트리오', album: '샘플 재즈 앨범', year: 2019, genre: 'Jazz', rate: 96000, bits: 24, color: [61, 79, 107], cover: 'embedded', songs: ['Opening', 'Slow Walk', '창가에서', 'Late Night'] },
  { folder: 'Sample Quartet_Night Session', artist: 'Sample Quartet', album: 'Night Session', year: 2021, genre: 'Jazz', rate: 192000, bits: 24, color: [47, 95, 87], cover: 'folder', songs: ['Blue Door', 'Midnight', 'Rain'] },
  { folder: '샘플 가수_여름 노래 모음', artist: '샘플 가수', album: '여름 노래 모음', year: 2023, genre: 'Pop', rate: 44100, bits: 16, color: [154, 91, 46], cover: 'embedded', songs: ['여름의 시작', '바다', '불꽃놀이', '안녕'] },
  { folder: 'Sample Orchestra_Cinema Themes/CD1', artist: 'Sample Orchestra', album: 'Cinema Themes', year: 2018, genre: 'Soundtrack', rate: 48000, bits: 24, color: [90, 63, 46], cover: 'embedded', disc: 1, songs: ['Main Title', 'The Chase'] },
  { folder: 'Sample Orchestra_Cinema Themes/CD2', artist: 'Sample Orchestra', album: 'Cinema Themes', year: 2018, genre: 'Soundtrack', rate: 48000, bits: 24, color: [90, 63, 46], cover: 'embedded', disc: 2, songs: ['Finale'] },
  { folder: '샘플 밴드_태그 없는 앨범', artist: undefined, album: undefined, year: undefined, genre: undefined, rate: 44100, bits: 16, color: null, cover: 'none', songs: ['01 - 첫 곡', '02 - 둘째 곡'] },
];

const root = path.resolve(process.argv[2] ?? '.sites-runtime/sample-music');
let count = 0;
for (const a of albums) {
  const dir = path.join(root, 'Flac', ...a.folder.split('/'));
  await mkdir(dir, { recursive: true });
  const art = a.color ? png(600, a.color) : null;
  if (a.cover === 'folder' && art) await writeFile(path.join(dir, 'cover.png'), art);
  for (const [i, song] of a.songs.entries()) {
    const tags = { TITLE: a.artist ? song : undefined, ARTIST: a.artist, ALBUMARTIST: a.artist, ALBUM: a.album, DATE: a.year, GENRE: a.genre, TRACKNUMBER: a.artist ? i + 1 : undefined, DISCNUMBER: a.disc };
    const name = a.artist ? `${String(i + 1).padStart(2, '0')} - ${song}.flac` : `${song}.flac`;
    await writeFile(path.join(dir, name), flac({ seconds: 150 + ((count * 37) % 200), rate: a.rate, bits: a.bits, tags, cover: a.cover === 'embedded' ? art : null }));
    count++;
  }
}
console.log(`${root} 에 예시 곡 ${count}개를 만들었습니다.`);
