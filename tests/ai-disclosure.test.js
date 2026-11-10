// AI 활용 표시(AI 기본법 제31조): 출력 PNG의 XMP 메타데이터
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { buildXmp, withXmp, stripXmp, readXmp, readDisclosure, samePng, stampProduct, SOURCE_TYPE } = require('../scripts/lib/ai-disclosure');

// 2×2 빨간 PNG (외부 도구 없이)
function tinyPng(color = [255, 0, 0]) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.from([0, ...color, ...color]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat([row, row]))), chunk('IEND', Buffer.alloc(0))]);
}

test('XMP를 IHDR 뒤에 넣고 다시 넣으면 바꿔 끼우며, 그림 데이터는 그대로', () => {
  const png = tinyPng();
  const a = withXmp(png, buildXmp({ productId: 'p', card: 1, parts: ['text', 'image'], skillVersion: 'v2', createdAt: '2026-11-10T00:00:00Z' }));
  assert.equal(a.toString('latin1', 33 + 4, 33 + 8), 'iTXt', 'IHDR(8+25바이트) 바로 뒤');
  const d = readDisclosure(a);
  assert.deepEqual(d, { sourceType: SOURCE_TYPE, parts: ['text', 'image'], product: 'p', card: 1 });
  assert.match(readXmp(a), /GPT 이미지 생성/);
  assert.match(readXmp(a), /cardnews:skillVersion="v2"/);
  const b = withXmp(a, buildXmp({ productId: 'p', card: 1, parts: ['text'] }));
  assert.equal((b.toString('latin1').match(/XML:com\.adobe\.xmp/g) || []).length, 1, 'XMP는 하나만');
  assert.deepEqual(readDisclosure(b).parts, ['text']);
  assert.ok(stripXmp(b).equals(png));
  assert.equal(readDisclosure(png), null);
  assert.throws(() => withXmp(Buffer.from('nope'), ''), /PNG가 아니에요/);
});

test('제품 출력에 표시를 넣고, 표시가 달라도 같은 그림은 같은 파일로 본다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-disclosure-'));
  const png = path.join(dir, 'output', 'png');
  fs.mkdirSync(png, { recursive: true });
  for (const no of [1, 2, 3]) fs.writeFileSync(path.join(png, `card-0${no}.png`), tinyPng([no * 40, 0, 0]));
  const original = path.join(dir, 'card-01-ai.png');
  fs.writeFileSync(original, tinyPng([40, 0, 0]));
  const cards = [1, 2, 3].map((no) => ({ no }));
  const done = stampProduct(dir, { productId: 'demo', cards, imageCards: [1], only: [1, 2] });
  assert.deepEqual(done, [{ card: 1, parts: ['text', 'image'] }, { card: 2, parts: ['text'] }]);
  assert.equal(readDisclosure(fs.readFileSync(path.join(png, 'card-03.png'))), null, 'only 밖은 그대로');
  assert.equal(readDisclosure(fs.readFileSync(path.join(png, 'card-01.png'))).product, 'demo');
  assert.ok(samePng(path.join(png, 'card-01.png'), original));
  assert.ok(!samePng(path.join(png, 'card-02.png'), original));
  fs.rmSync(dir, { recursive: true, force: true });
});
