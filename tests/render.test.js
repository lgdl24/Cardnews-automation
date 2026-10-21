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
