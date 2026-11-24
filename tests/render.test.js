// 출력(render) 테스트: PNG 크기·장수, 카드 1장 재출력, 레이아웃 기록
// 브라우저가 필요해서 npm test와 분리 (npm run test:render). Chromium이 없으면 건너뜀.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { makeWorkspace } = require('./helpers');

// PNG 헤더(IHDR)에서 가로·세로 읽기
function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const NO_BROWSER = /Executable doesn't exist|playwright가 설치|browserType\.launch/;

test('예시 제품 5장을 1080×1080 PNG로 출력하고 레이아웃 점검을 기록한다', (t) => {
  const ws = makeWorkspace();
  try {
    const r = ws.run('render.js');
    if (r.status !== 0 && NO_BROWSER.test(r.stderr)) {
      t.skip('Chromium이 없어 건너뜀 (npx playwright install chromium)');
      return;
    }
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (let n = 1; n <= 5; n += 1) {
      const png = ws.file('output', 'png', `card-0${n}.png`);
      assert.ok(fs.existsSync(png), `card-0${n}.png가 없어요`);
      assert.deepEqual(pngSize(png), { width: 1080, height: 1080 });
    }
    assert.ok(fs.existsSync(ws.file('output', 'html', 'index.html')));

    const report = JSON.parse(fs.readFileSync(ws.file('output', 'render-report.json'), 'utf8'));
    assert.equal(report.results.length, 5);
    assert.ok(report.results.every((x) => x.issues.length === 0), JSON.stringify(report.results));

    const events = fs.readFileSync(ws.file('log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const layout = events.find((e) => e.check === 'layout');
    assert.ok(layout, 'layout 검사 기록이 없어요');
    assert.equal(layout.ok, true);
    assert.deepEqual(layout.rendered_cards, [1, 2, 3, 4, 5]);

    // 수정 요청 흐름: 3번 카드만 재출력하면 다른 카드 PNG는 그대로
    const before = fs.statSync(ws.file('output', 'png', 'card-01.png')).mtimeMs;
    ws.editCards((d) => { d.cards[2].copy.title = '가볍게 매일'; });
    const one = ws.run('render.js', ['--card', '3']);
    assert.equal(one.status, 0, one.stdout + one.stderr);
    assert.equal(fs.statSync(ws.file('output', 'png', 'card-01.png')).mtimeMs, before);
    assert.ok(fs.existsSync(ws.file('output', 'render-report-card-03.json')));
  } finally {
    ws.cleanup();
  }
});

test('카드 색: 제품 색이면 사진 대표 색으로 출력하고 render-report에 색·대비를 남긴다', (t) => {
  const ws = makeWorkspace();
  try {
    ws.writeInput(`${ws.readInput().trimEnd()}\n\n## 카드 색\n제품 색\n`);
    const r = ws.run('render.js', ['--no-log']);
    if (r.status !== 0 && NO_BROWSER.test(r.stderr)) {
      t.skip('Chromium이 없어 건너뜀 (npx playwright install chromium)');
      return;
    }
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /카드 색: 제품 색/);
    const { colors } = JSON.parse(fs.readFileSync(ws.file('output', 'render-report.json'), 'utf8'));
    assert.equal(colors.mode, '제품 색');
    assert.equal(colors.source, 'product');
    assert.equal(colors.image, 'main.png');
    assert.match(colors.representative, /^#[0-9A-F]{6}$/);
    assert.equal(colors.ok, true);
    assert.equal(colors.contrast.length, 7);
    // 카드 HTML에 바뀐 색이 들어감
    const html = fs.readFileSync(ws.file('output', 'html', 'card-01.html'), 'utf8');
    assert.ok(html.includes(`--color-primary: ${colors.color.primary};`));
  } finally {
    ws.cleanup();
  }
});

test('카드 색: 기본이면 기본 테마(대비 기준을 이미 만족)를 그대로 쓴다', (t) => {
  const ws = makeWorkspace();
  try {
    const r = ws.run('render.js', ['--html-only', '--no-log']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /카드 색: 기본/);
    const html = fs.readFileSync(ws.file('output', 'html', 'card-01.html'), 'utf8');
    const { adjustContrast } = require('../scripts/lib/color-mood');
    const { color } = adjustContrast(require('../config/theme.json').color);
    assert.ok(html.includes(`--color-primary: ${color.primary};`));
    assert.ok(html.includes(`--color-muted: ${color.muted};`));
  } finally {
    ws.cleanup();
  }
});

// 흰 배경 위 사각형 제품(투명 아님) PNG를 직접 만듦: 테스트용 최소 PNG 인코더 (RGB 8bit, 필터 없음)
function opaquePng(w, h, box) {
  const zlib = require('zlib');
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const td = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h, 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inBox = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
    const o = y * (w * 3 + 1) + 1 + x * 3;
    const [r, g, b] = inBox ? [40, 110, 220] : [253, 253, 252];
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('제품 사진 누끼(#134): 흰 배경 사진은 배경을 지운 투명 PNG로 카드에 얹고, 원본은 그대로 둔다', (t) => {
  const ws = makeWorkspace();
  try {
    const original = opaquePng(400, 600, { x: 120, y: 90, w: 160, h: 420 });
    fs.writeFileSync(ws.file('images', 'main.png'), original);
    const r = ws.run('render.js');
    if (r.status !== 0 && NO_BROWSER.test(r.stderr)) { t.skip('Chromium이 없어 건너뜀'); return; }
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /제품 사진 누끼: main\.png/);
    const cut = ws.file('output', 'cutout', 'main_png.png');
    assert.ok(fs.existsSync(cut), '누끼 파일이 없어요');
    assert.deepEqual(pngSize(cut), { width: 160, height: 420 }, '배경을 지우고 제품 크기로 잘림');
    assert.ok(fs.readFileSync(ws.file('images', 'main.png')).equals(original), '원본 사진은 바꾸지 않음');
    const htmls = fs.readdirSync(ws.file('output', 'html')).filter((f) => /^card-\d+\.html$/.test(f)).map((f) => fs.readFileSync(ws.file('output', 'html', f), 'utf8'));
    const withPhoto = htmls.filter((h) => /src="[^"]*main/.test(h));
    assert.ok(withPhoto.length > 0, '제품 사진을 쓰는 카드가 있어야 함');
    assert.ok(withPhoto.every((h) => h.includes('cutout/main_png.png') && !h.includes('images/main.png')), '카드는 누끼 파일을 씀');
    // 다시 출력하면 원본이 바뀌지 않은 한 누끼를 새로 만들지 않음
    const at = fs.statSync(cut).mtimeMs;
    const again = ws.run('render.js', ['--card', '1']);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.equal(fs.statSync(cut).mtimeMs, at);
  } finally {
    ws.cleanup();
  }
});

test('제품 사진 누끼(#134): 이미 투명한 사진은 누끼를 만들지 않고 원본을 쓴다', (t) => {
  const ws = makeWorkspace();
  try {
    const r = ws.run('render.js', ['--html-only']);
    if (r.status !== 0 && NO_BROWSER.test(r.stderr)) { t.skip('Chromium이 없어 건너뜀'); return; }
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(!fs.existsSync(ws.file('output', 'cutout')), '투명 PNG(예시 제품)는 그대로');
    const html = fs.readFileSync(ws.file('output', 'html', 'card-01.html'), 'utf8');
    assert.ok(!html.includes('cutout/'));
  } finally {
    ws.cleanup();
  }
});

test('검증 오류가 있거나 구성안 단계면 출력하지 않는다', () => {
  const ws = makeWorkspace();
  try {
    ws.editCards((d) => { d.cards[1].copy.title = '핑크 베이지 컬러로 피부 톤을 자연스럽게 보정해요'; });
    assert.equal(ws.run('render.js').status, 1);
    assert.ok(!fs.existsSync(ws.file('output', 'png')));

    ws.editCards((d) => {
      d.stage = 'plan';
      for (const c of d.cards) delete c.copy;
    });
    assert.equal(ws.run('render.js').status, 1);
  } finally {
    ws.cleanup();
  }
});
