// AI 디자인 카드(scripts/ai-card.js): 요청문에 승인 문구가 그대로 들어가고, 제품 잠금 점수가 어긋남을 잡는지 (브라우저·Codex 없이)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPrompt, productBox, lockScore, generatedPath, LOCK } = require('../scripts/ai-card');

test('요청문: cards.json 문구를 그대로(줄 나눔 유지) 넣고, 제품 잠금·스크립트 금지 문장이 있음', () => {
  const p = buildPrompt('cover', { badge: 'SPF50+', title: '노란 톤은 잡고\n화사한 쿨톤으로', subtitle: '3중 기능성 워터풀 톤업 선크림(퍼플)' });
  assert.match(p, /- small rounded badge: SPF50\+/);
  assert.match(p, /headline \(2 lines\):\n {4}노란 톤은 잡고\n {4}화사한 쿨톤으로/);
  assert.match(p, /- subtitle: 3중 기능성 워터풀 톤업 선크림\(퍼플\)/);
  assert.match(p, /THE PRODUCT IS LOCKED/);
  assert.match(p, /Do not write or run any code or scripts/);
  const c = buildPrompt('closing', { title: '매일 부담 없이', subtitle: '줄\n바꿈' });
  assert.doesNotMatch(c, /badge/);
  assert.match(c, /left 50% of the image/);
  assert.match(c, /- subtitle: 줄 바꿈/);
});

test('제품 상자: 세로로 긴 제품은 높이 기준, 넓적한 제품은 폭 기준으로 줄이고 바닥선은 같음', () => {
  const tall = productBox('cover', 200, 600);
  assert.equal(tall.h, 512);
  assert.equal(tall.y + tall.h, Math.round(1024 * 0.92));
  const wide = productBox('cover', 600, 400);
  assert.ok(wide.w <= Math.round(1024 * 0.52));
  assert.ok(wide.h < 512);
  const closing = productBox('closing', 200, 600);
  assert.ok(closing.x + closing.w / 2 > 1024 * 0.65, '마무리 카드는 제품이 오른쪽');
});

// 가짜 픽셀: 원본 제품(w×h, 줄무늬)과 AI 결과(주변 pad만큼 넓게)
function fixture({ shift = [0, 0], noise = 0 }) {
  const w = 20; const h = 30; const P = LOCK.search; const aw = w + 2 * P; const ah = h + 2 * P;
  const orig = new Uint8Array(w * h * 4);
  const color = (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 53) % 256, (x * 19 + y * 7) % 256];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) orig.set([...color(x, y), 255], (y * w + x) * 4);
  const ai = new Uint8Array(aw * ah * 4).fill(200);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x + P + shift[0]; const Y = y + P + shift[1];
      ai.set(color(x, y).map((v) => Math.min(255, v + noise)).concat(255), (Y * aw + X) * 4);
    }
  }
  return { ai, aw, orig, mask: new Uint8Array(w * h).fill(1), w, h, pad: P };
}

test('제품 잠금 점수: 그대로면 유지, 크게 옮기거나 색을 바꾸면 어긋남', () => {
  assert.deepEqual(lockScore(fixture({})), { ok: true, diff: 0, shift: [0, 0] });
  assert.equal(lockScore(fixture({ shift: [2, 0] })).ok, true, '2px는 허용');
  const moved = lockScore(fixture({ shift: [12, -8] }));
  assert.equal(moved.ok, false);
  assert.deepEqual(moved.shift, [12, -8]);
  assert.equal(lockScore(fixture({ noise: 60 })).ok, false, '색이 바뀌면 어긋남');
});

test('codex 출력에서 AI 원본 이미지 경로를 찾고, 없으면 out.png', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-card-'));
  const gen = path.join(dir, 'generated_images', 'x', 'exec-1.png');
  fs.mkdirSync(path.dirname(gen), { recursive: true });
  fs.writeFileSync(gen, 'x');
  assert.equal(generatedPath(`copy '${gen}' ./out.png`, dir), gen);
  assert.equal(generatedPath('없음', dir), null);
  fs.writeFileSync(path.join(dir, 'out.png'), 'x');
  assert.equal(generatedPath('없음', dir), path.join(dir, 'out.png'));
});
