// 피그마 플러그인 연결 (작업실 API /api/studio/figma/* + figma-plugin/)
// 준비 → 플러그인이 레이어·이미지를 받음 → 고친 카드를 돌려보냄(문구 비교) → 작업실 화면 정보, 연결 코드·다른 출처 처리
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { ROOT } = require('./helpers');
const { createStudio } = require('../scripts/lib/studio-api');
const { buildPluginCode } = require('../scripts/build-figma-plugin');
const { buildCardFrames } = require('../scripts/lib/figma-builder');

const SRC = 'toneup-sunscreen-r1';
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'); // PNG 머리말만 (검사는 시그니처만)
const CODE = 'ABC123';

function layersFor(id) {
  const color = { r: 0.1, g: 0.1, b: 0.1, a: 1 };
  return {
    product_id: id, product: '시험 제품', scale: 2,
    cards: [1, 2].map((no) => ({
      file: `card-0${no}`, no, page: `시험 제품 (${id})`, width: 1080, height: 1080,
      layers: [
        { kind: 'raster', id: 'L1', name: 'img (사진)', box: { x: 0, y: 0, w: 10, h: 10 }, upload: `${id}__c0${no}__L1` },
        { kind: 'text', id: 'L2', name: 'title (글자)', box: { x: 0, y: 0, w: 100, h: 50 }, opacity: 1, text: `제목 ${no}\n둘째 줄`, align: 'LEFT', family: 'Pretendard', weight: 800, size: 40, lineHeight: 50, letterSpacing: 0, color, runs: [] },
        // 설명형 항목처럼 같은 이름 글자 레이어가 여럿
        ...['항목 하나', '항목 둘'].map((text, i) => ({ kind: 'text', id: `L${3 + i}`, name: 'item (글자)', box: { x: 0, y: 60 + i * 40, w: 100, h: 30 }, opacity: 1, text, align: 'LEFT', family: 'Pretendard', weight: 600, size: 20, lineHeight: 30, letterSpacing: 0, color, runs: [] })),
      ],
    })),
  };
}

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-figma-'));
  const productsDir = path.join(dir, 'products');
  const id = 'figma-test';
  fs.mkdirSync(path.join(productsDir, id, 'output', 'png'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'products', SRC, 'input.md'), path.join(productsDir, id, 'input.md'));
  fs.copyFileSync(path.join(ROOT, 'products', SRC, 'cards.json'), path.join(productsDir, id, 'cards.json'));
  fs.writeFileSync(path.join(productsDir, id, 'output', 'png', 'card-01.png'), PNG);
  const prepared = [];
  const rendered = [];
  fs.writeFileSync(path.join(dir, 'export.json'), JSON.stringify({ out_dir: path.join(dir, 'web'), projects: [] }));
  const figmaConfigFile = path.join(dir, 'figma.json');
  fs.writeFileSync(figmaConfigFile, JSON.stringify({ file_url: 'https://www.figma.com/design/TESTKEY' }));
  const studio = createStudio({
    productsDir,
    reportsDir: path.join(dir, 'reports'),
    exportConfigFile: path.join(dir, 'export.json'),
    webIndexFile: path.join(dir, 'web', 'index.json'),
    figmaCode: CODE,
    aiAuto: false,
    figmaConfigFile,
    exportFn: () => ({ ok: false, output: [], excluded: [`${'figma-test'} | PNG_MISSING | PNG가 없어요: 2번 카드 (npm run render)`] }),
    renderFn: (pid) => { rendered.push(pid); return { ok: true, output: [] }; },
    figmaExportFn: (pid) => {
      prepared.push(pid);
      const out = path.join(productsDir, pid, 'output', 'figma-export');
      fs.mkdirSync(path.join(out, 'images'), { recursive: true });
      const data = layersFor(pid);
      fs.writeFileSync(path.join(out, 'layers.json'), JSON.stringify(data));
      for (const c of data.cards) fs.writeFileSync(path.join(out, 'images', `${c.layers[0].upload}.png`), PNG);
      return { ok: true, output: [] };
    },
  });
  const server = http.createServer(async (req, res) => {
    if (!(await studio.handle(req, res))) { res.statusCode = 404; res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/studio`;
  const call = async (method, p, { body, headers = {}, raw = false } = {}) => {
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  return { dir, id, prepared, rendered, call, close: () => new Promise((r) => server.close(r)) };
}

test('작업실 → 피그마 플러그인 → 작업실: 준비, 가져오기, 돌려보내기(문구 비교)', async () => {
  const s = await start();
  try {
    // 웹 화면: 준비 전 정보, 준비(쓰기 요청이라 X-Studio 필요)
    let r = await s.call('GET', `/products/${s.id}`);
    assert.equal(r.body.figma.code, CODE);
    assert.equal(r.body.figma.file_url, 'https://www.figma.com/design/TESTKEY');
    assert.equal(r.body.figma.prepared_at, null);
    r = await s.call('POST', `/products/${s.id}/figma`);
    assert.equal(r.status, 403, 'X-Studio 없으면 거부');
    r = await s.call('POST', `/products/${s.id}/figma`, { headers: { 'x-studio': '1', 'content-type': 'application/json' } });
    assert.equal(r.status, 200);
    assert.deepEqual(s.prepared, [s.id]);
    assert.ok(r.body.product.figma.prepared_at);

    // 플러그인: 연결 코드 없으면 거부, 다른 출처 허용 헤더
    r = await s.call('GET', '/figma/products');
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    r = await s.call('OPTIONS', '/figma/products', { headers: { origin: 'null', 'access-control-request-method': 'POST' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-private-network'), 'true');
    r = await s.call('GET', `/figma/products?code=${CODE.toLowerCase()}`);
    assert.equal(r.status, 200, '코드는 대소문자 무관');
    assert.deepEqual(r.body.products.map((p) => [p.id, p.cards]), [[s.id, 2]]);

    r = await s.call('GET', `/figma/products/${s.id}/layers?code=${CODE}`);
    assert.equal(r.body.cards.length, 2);
    const upload = r.body.cards[0].layers.find((l) => l.kind === 'raster').upload;
    r = await s.call('GET', `/figma/products/${s.id}/images/${upload}.png`, { headers: { 'x-figma-code': CODE } });
    assert.equal(r.status, 200);
    assert.ok(r.body.subarray(0, 4).equals(PNG.subarray(0, 4)));
    r = await s.call('GET', `/figma/products/${s.id}/images/..%2F..%2Finput.md?code=${CODE}`);
    assert.equal(r.status, 404, '이미지 이름 형식 밖은 거부');

    // 돌려보내기: 플러그인처럼 text/plain 본문 (미리 요청 없이). 1번은 문구 그대로, 2번은 제목을 고침
    const png = PNG.toString('base64');
    const body = JSON.stringify({ page: '시험 제품 (x) · 11.02 16:30', cards: [
      { file: 'card-01', png, texts: [{ name: 'title (글자)', text: '제목 1 둘째 줄' }, { name: 'item (글자)', text: '항목 하나' }, { name: 'item (글자)', text: '항목 둘' }] },
      { file: 'card-02', png, texts: [{ name: 'title (글자)', text: '바꾼 제목' }, { name: 'item (글자)', text: '항목 하나' }, { name: 'item (글자)', text: '항목 둘 고침' }, { name: '새 글자', text: '추가' }] },
    ] });
    r = await s.call('POST', `/figma/products/${s.id}/edited?code=${CODE}`, { body, raw: true, headers: { 'content-type': 'text/plain' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.cards[0].changed, [], '줄바꿈·공백 차이는 같은 문구');
    assert.deepEqual(r.body.cards[1].changed.map((c) => [c.name, c.before, c.after]), [
      ['title (글자)', '제목 2\n둘째 줄', '바꾼 제목'],
      ['item (글자)', '항목 둘', '항목 둘 고침'], // 같은 이름 중 두 번째만 바뀐 걸 정확히 잡음
      ['새 글자', null, '추가'],
    ]);
    assert.ok(fs.existsSync(path.join(s.dir, 'products', s.id, 'output', 'figma-edited', 'card-02.png')));

    // 웹 화면에 돌려받은 카드가 보이고, 파일로 받을 수 있음
    r = await s.call('GET', `/products/${s.id}`);
    assert.deepEqual(r.body.figma.edited.cards.map((c) => c.png), ['card-01.png', 'card-02.png']);
    assert.equal(r.body.figma.edited.page, '시험 제품 (x) · 11.02 16:30', '어느 피그마 페이지에서 보냈는지 기록');
    r = await s.call('GET', `/products/${s.id}/files/figma-edited/card-02.png`);
    assert.equal(r.status, 200);

    // 잘못된 본문
    r = await s.call('POST', `/figma/products/${s.id}/edited?code=${CODE}`, { body: JSON.stringify({ cards: [{ file: '../x', png }] }), raw: true });
    assert.equal(r.status, 400);
    r = await s.call('POST', `/figma/products/${s.id}/edited?code=${CODE}`, { body: JSON.stringify({ cards: [{ file: 'card-01', png: Buffer.from('nope').toString('base64') }] }), raw: true });
    assert.equal(r.status, 400, 'PNG가 아니면 거부');
  } finally {
    await s.close();
  }
});

test('피그마 플러그인 code.js가 소스와 같고, 문법 오류가 없음', () => {
  const file = path.join(ROOT, 'figma-plugin', 'code.js');
  assert.equal(fs.readFileSync(file, 'utf8'), buildPluginCode(), 'npm run figma-plugin 으로 다시 만드세요');
  assert.doesNotThrow(() => new Function(fs.readFileSync(file, 'utf8')));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'figma-plugin', 'manifest.json'), 'utf8'));
  assert.equal(manifest.main, 'code.js');
  assert.ok(manifest.networkAccess.devAllowedDomains.includes('http://localhost:5173'));
});

test('프레임 만드는 함수: 가짜 피그마로 카드 2장, 이미지 없는 카드는 건너뜀', async () => {
  const made = [];
  const node = (type) => {
    const n = { type, id: `${type}-${made.length}`, children: [], width: 100, height: 20, fills: [], resize(w, h) { this.width = w; this.height = h; }, appendChild(c) { this.children.push(c); c.parent = this; }, remove() { made.push(['remove', this.name]); } };
    made.push([type]);
    return n;
  };
  const page = { name: '', children: [], appendChild(c) { this.children.push(c); }, id: 'P1' };
  const figma = {
    root: { children: [] },
    createPage() { this.root.children.push(page); return page; },
    async setCurrentPageAsync() {},
    async listAvailableFontsAsync() { return [{ fontName: { family: 'Gothic A1', style: 'ExtraBold' } }, { fontName: { family: 'Gothic A1', style: 'Regular' } }]; },
    async loadFontAsync() {},
    createFrame: () => node('FRAME'),
    createRectangle: () => node('RECTANGLE'),
    createText: () => Object.assign(node('TEXT'), { setRangeFontName() {}, setRangeFontSize() {}, setRangeFills() {} }),
  };
  const data = layersFor('fake');
  const r = await buildCardFrames(figma, data.cards, { imageHash: (l) => (l.upload.endsWith('c01__L1') ? 'HASH' : null) });
  assert.equal(r.frames.length, 1, '이미지를 못 받은 2번은 건너뜀');
  assert.deepEqual(r.missing, ['fake__c02__L1']);
  assert.equal(r.fonts['Pretendard 800'], 'Gothic A1 ExtraBold', 'Pretendard 없으면 대체 글꼴');
  assert.equal(page.name, '시험 제품 (fake)');
});

test('프레임 만드는 함수: newPage면 기존 페이지를 두고 새 페이지를 만들고, 이름이 겹치면 #2', async () => {
  const pages = [];
  const node = (type) => ({ type, id: `${type}-${Math.random()}`, children: [], width: 100, height: 20, fills: [], resize(w, h) { this.width = w; this.height = h; }, appendChild(c) { this.children.push(c); }, remove() { throw new Error('지우면 안 됨'); } });
  const figma = {
    root: { children: pages },
    createPage() { const p = { name: '', children: [], appendChild(c) { this.children.push(c); }, id: `P${pages.length + 1}` }; pages.push(p); return p; },
    async setCurrentPageAsync() {},
    async listAvailableFontsAsync() { return [{ fontName: { family: 'Gothic A1', style: 'Regular' } }]; },
    async loadFontAsync() {},
    createFrame: () => node('FRAME'),
    createRectangle: () => node('RECTANGLE'),
    createText: () => Object.assign(node('TEXT'), { setRangeFontName() {}, setRangeFontSize() {}, setRangeFills() {} }),
  };
  const data = layersFor('fake');
  const opts = { imageHash: () => 'HASH', newPage: true, pageName: '시험 제품 (fake) · 11.02 16:30' };
  const a = await buildCardFrames(figma, data.cards, opts);
  const b = await buildCardFrames(figma, data.cards, opts);
  assert.deepEqual(pages.map((p) => p.name), ['시험 제품 (fake) · 11.02 16:30', '시험 제품 (fake) · 11.02 16:30 #2']);
  assert.equal(b.pageName, '시험 제품 (fake) · 11.02 16:30 #2');
  assert.equal(pages[0].children.length, 2, '처음 페이지 카드는 그대로');
  assert.equal(a.frames.length, 2);
});

test('플러그인 보내기: 지금 페이지가 그 제품이면 그 페이지, 아니면 가장 최근 페이지', async () => {
  const vm = require('node:vm');
  const frame = (name) => ({ type: 'FRAME', name, width: 1080, async exportAsync() { return new Uint8Array([1]); }, findAll() { return []; } });
  const page = (name) => ({ name, children: [frame('card-01')], async loadAsync() {} });
  const pages = [page('사용법'), page('시험 제품 (fake) · 11.01 10:00'), page('다른 제품 (other) · 11.02 09:00'), page('시험 제품 (fake) · 11.02 16:30')];
  const posted = [];
  const figma = {
    root: { children: pages }, currentPage: pages[1],
    showUI() {}, ui: { postMessage: (m) => posted.push(m) },
    clientStorage: { async getAsync() { return {}; }, async setAsync() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'figma-plugin', 'code.js'), 'utf8'), { figma, __html__: '', console });
  await figma.ui.onmessage({ type: 'collect', id: 'fake' });
  assert.equal(posted.at(-1).page, '시험 제품 (fake) · 11.01 10:00', '보고 있는 페이지');
  figma.currentPage = pages[0];
  await figma.ui.onmessage({ type: 'collect', id: 'fake' });
  assert.equal(posted.at(-1).page, '시험 제품 (fake) · 11.02 16:30', '다른 페이지를 보면 가장 아래(최근) 페이지');
  await figma.ui.onmessage({ type: 'collect', id: 'none' });
  assert.equal(posted.at(-1).type, 'error');
});

test('작업실: 내보내기 실패 이유를 그대로 알려주고, 카드 이미지만 다시 만들 수 있음', async () => {
  const s = await start();
  try {
    const w = { 'x-studio': '1', 'content-type': 'application/json' };
    // 시험 제품 cards.json은 approved (toneup-sunscreen-r1)
    let r = await s.call('POST', `/products/${s.id}/export`, { headers: w });
    assert.equal(r.status, 422);
    assert.match(r.body.error, /내보내지 못했어요: PNG_MISSING — PNG가 없어요: 2번 카드/);
    r = await s.call('GET', `/products/${s.id}`);
    assert.equal(r.body.actions.can_render, true);
    r = await s.call('POST', `/products/${s.id}/render`, { headers: w });
    assert.equal(r.status, 200);
    assert.deepEqual(s.rendered, [s.id]);
  } finally {
    await s.close();
  }
});
