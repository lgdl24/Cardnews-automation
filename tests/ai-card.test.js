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

// 작업실 API: AI 디자인 카드 시작(202) → 상태 → 결과 파일. 실제 Codex 대신 aiCardFn으로 결과를 흉내냄
test('작업실: AI 디자인 카드를 뒤에서 만들고 상태·결과 카드를 보여줌', async () => {
  const http = require('http');
  const { createStudio } = require('../scripts/lib/studio-api');
  const ROOT = path.join(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-ai-'));
  const productsDir = path.join(dir, 'products');
  const id = 'ai-test';
  fs.mkdirSync(path.join(productsDir, id), { recursive: true });
  for (const f of ['input.md', 'cards.json']) fs.copyFileSync(path.join(ROOT, 'products', 'toneup-sunscreen-r1', f), path.join(productsDir, id, f));
  fs.writeFileSync(path.join(dir, 'export.json'), JSON.stringify({ out_dir: path.join(dir, 'web'), projects: [] }));
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3d8b1a40000000049454e44ae426082', 'hex');
  let release;
  const calls = [];
  const studio = createStudio({
    productsDir,
    reportsDir: path.join(dir, 'reports'),
    exportConfigFile: path.join(dir, 'export.json'),
    webIndexFile: path.join(dir, 'web', 'index.json'),
    figmaConfigFile: path.join(dir, 'figma.json'),
    aiCardFn: (pid, { card, onLine }) => {
      calls.push([pid, card]);
      onLine('  1번 1차 생성 중… (보통 1~2분)');
      return new Promise((resolve) => {
        release = () => {
          const out = path.join(productsDir, pid, 'output', 'ai-card');
          fs.mkdirSync(out, { recursive: true });
          fs.writeFileSync(path.join(out, 'card-01.png'), PNG);
          fs.writeFileSync(path.join(out, 'ai-card.json'), JSON.stringify({ made_at: 'now', cards: [{ no: 1, kind: 'cover', ok: true, file: 'card-01.png', text_checked: false, tries: [{ try: 1, ok: true, diff: 5, shift: [0, 0] }] }] }));
          onLine('1번: 완료 → output/ai-card/card-01.png (시도 1번)');
          resolve({ ok: true });
        };
      });
    },
  });
  const server = http.createServer(async (req, res) => { if (!(await studio.handle(req, res))) { res.statusCode = 404; res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/studio`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'x-studio': '1', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  try {
    let r = await call('GET', `/products/${id}`);
    assert.equal(r.body.actions.can_ai_card, true);
    assert.deepEqual(r.body.ai_card.cards, []);
    r = await call('POST', `/products/${id}/ai-card`, { card: 3 });
    assert.equal(r.status, 400, '가운데 카드는 안 됨');
    r = await call('POST', `/products/${id}/ai-card`, {});
    assert.equal(r.status, 202);
    assert.equal(r.body.ai_card.running, true);
    assert.equal(r.body.actions.can_ai_card, false);
    r = await call('POST', `/products/${id}/ai-card`, {});
    assert.equal(r.status, 409, '만드는 중에는 다시 못 누름');
    release();
    await new Promise((res) => setTimeout(res, 20));
    r = await call('GET', `/products/${id}`);
    assert.equal(r.body.ai_card.running, false);
    assert.equal(r.body.ai_card.run.ok, true);
    assert.match(r.body.ai_card.run.progress.at(-1), /완료/);
    assert.equal(r.body.ai_card.cards[0].file, 'card-01.png');
    assert.ok(r.body.ai_card.cards[0].v > 0);
    r = await call('GET', `/products/${id}/files/ai-card/card-01.png`);
    assert.equal(r.status, 200);
    r = await call('POST', `/products/${id}/ai-card`, { card: 1 });
    assert.equal(r.status, 202, '한 장만 다시 만들기');
    assert.deepEqual(calls, [[id, null], [id, 1]]);
    release();
  } finally {
    await new Promise((r) => server.close(r));
  }
});
