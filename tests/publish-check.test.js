// 게시 전 점검 (docs/proposals/ax-plan.md A4)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { publishCheck } = require('../scripts/lib/publish-check');
const { stampProduct } = require('../scripts/lib/ai-disclosure');
const caution = require('../config/caution-expressions.json');

function tinyPng() {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 1, 2, 3]))), chunk('IEND', Buffer.alloc(0))]);
}

function setup({ copy = '촉촉하게 마무리돼요', stage = 'approved', stamp = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-check-'));
  const out = path.join(dir, 'output');
  fs.mkdirSync(path.join(out, 'png'), { recursive: true });
  const data = { stage, cards: [1, 2].map((no) => ({ no, copy: { title: no === 2 ? copy : '가벼운 수분 크림' } })) };
  for (const c of data.cards) fs.writeFileSync(path.join(out, 'png', `card-0${c.no}.png`), tinyPng());
  fs.writeFileSync(path.join(out, 'render-report.json'), JSON.stringify({ rendered_at: '2026-11-10T00:00:00Z', results: data.cards.map((c) => ({ no: c.no, issues: [] })) }));
  if (stamp) stampProduct(dir, { productId: 'demo', cards: data.cards });
  return { dir, data, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const status = (r) => Object.fromEntries(r.checks.map((c) => [c.id, c.status]));

test('승인·검증·출력·표시가 모두 되면 캡션만 남고, 캡션이 생기면 게시 가능', () => {
  const s = setup();
  try {
    const r = publishCheck({ productDir: s.dir, data: s.data, validation: { errors: [] }, caution });
    assert.deepEqual(status(r), { approved: 'pass', validate: 'pass', render: 'pass', caution: 'pass', ai_label: 'pass', ai_image: 'pass', caption: 'todo' });
    assert.equal(r.ready, false);
    const ok = publishCheck({ productDir: s.dir, data: { ...s.data, caption: { text: 'AI 활용 · 가벼운 수분 크림' } }, validation: { errors: [] }, caution });
    assert.equal(ok.ready, true);
    const noLabel = publishCheck({ productDir: s.dir, data: { ...s.data, caption: { text: '가벼운 수분 크림\n#AI활용' } }, validation: { errors: [] }, caution });
    // ig prepare가 만든 캡션 파일도 읽음
    fs.mkdirSync(path.join(s.dir, 'output', 'instagram'));
    fs.writeFileSync(path.join(s.dir, 'output', 'instagram', 'caption.txt'), '🤖 AI를 활용해 제작한 카드뉴스예요\n본문');
    assert.equal(publishCheck({ productDir: s.dir, data: s.data, validation: { errors: [] }, caution }).ready, true);
    assert.equal(status(noLabel).caption, 'fail');
  } finally {
    s.cleanup();
  }
});

test('가상 전문가 추천 표현·AI 표시 누락·검증 오류·승인 전은 막는다', () => {
  const s = setup({ copy: '약사 추천 진정 크림', stage: 'copy', stamp: false });
  try {
    const r = publishCheck({ productDir: s.dir, data: s.data, validation: { errors: [{ code: 'CHAR_LIMIT' }] }, caution, sourceText: '진정 크림' });
    const st = status(r);
    assert.equal(st.approved, 'todo');
    assert.equal(st.validate, 'fail');
    assert.equal(st.caution, 'fail');
    assert.match(r.checks.find((c) => c.id === 'caution').detail, /약사 추천.*가상 인물·전문가 추천/);
    assert.equal(st.ai_label, 'fail');
    assert.equal(r.ready, false);
    // 원문에 있는 표현이면 사람 판단(warn)
    const inSource = publishCheck({ productDir: s.dir, data: s.data, validation: { errors: [] }, caution, sourceText: '약사 추천 진정 크림' });
    assert.equal(status(inSource).caution, 'warn');
  } finally {
    s.cleanup();
  }
});

test('작업실 API: GET /products/:id/precheck 는 점검 결과를, 점검할 수 없으면 404', async () => {
  const http = require('node:http');
  const { createStudio } = require('../scripts/lib/studio-api');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precheck-studio-'));
  fs.mkdirSync(path.join(dir, 'products', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'products', 'demo', 'input.md'), '# 입력');
  const seen = [];
  const studio = createStudio({
    productsDir: path.join(dir, 'products'),
    reportsDir: path.join(dir, 'reports'),
    aiAuto: false,
    precheckFn: (id) => (seen.push(id), id === 'demo' ? { ready: false, counts: { pass: 1, warn: 0, fail: 0, todo: 1 }, checks: [] } : null),
  });
  const server = http.createServer(async (req, res) => {
    if (!(await studio.handle(req, res))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/studio`;
    const r = await fetch(`${base}/products/demo/precheck`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).counts.todo, 1);
    assert.deepEqual(seen, ['demo']);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
