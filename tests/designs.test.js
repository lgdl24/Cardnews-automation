// 디자인 묶음 정하기·목록 (#74 1단계): 입력 무드 → cards.json design → 기본 순서, 목록(_catalog)과 묶음(_designs) 일치
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers');
const { resolveDesign, designOf, designCatalog, loadConfig, loadInput, readJson, paths } = require('../scripts/lib/common');
const { colorModeOf } = require('../scripts/lib/color-mood');
const { limitLines } = require('../scripts/lib/limits');

const config = require('../config/templates.json');
const premium = { design: { id: '프리미엄' } };

test('묶음 정하기: 입력 무드(직접 지정) → cards.json design → 기본', () => {
  const cases = [
    // [입력 cond, cards.json, 기대 id, 기대 source]
    [{}, null, '기본', 'default'],
    [{ 무드: '프리미엄' }, null, '프리미엄', 'input'],
    [{ 디자인: '프리미엄' }, null, '프리미엄', 'input'], // 예전 칸 이름 (#69)
    [{}, premium, '프리미엄', 'cards'],
    [{ 무드: '' }, premium, '프리미엄', 'cards'], // 빈 무드는 구성안에서 고른 것
    [{ 무드: '없는 묶음' }, premium, '프리미엄', 'cards'], // 목록에 없는 값은 건너뜀
    [{ 무드: '기본' }, premium, '기본', 'input'], // 사람이 직접 고른 기본이 우선
    [{}, { design: { id: '없는 묶음' } }, '기본', 'default'],
    [{}, { design: null }, '기본', 'default'],
  ];
  for (const [cond, data, id, source] of cases) {
    const got = resolveDesign({ input: { cond }, data, config });
    assert.deepEqual(got, { id, source }, JSON.stringify({ cond, data }));
    assert.equal(designOf({ cond }, config, data), id);
  }
  assert.deepEqual(resolveDesign(), { id: '기본', source: 'default' });
});

test('cards.json에서 고른 묶음이 설정·카드 색·글자 수 안내에 반영됨', () => {
  const { templates } = loadConfig(null, premium);
  assert.equal(templates.cover.file, 'templates/premium/cover.html');
  assert.equal(loadConfig(null, null).templates.cover.file, 'templates/cover.html');
  assert.equal(colorModeOf(null, premium), '제품 색');
  assert.equal(colorModeOf({ cond: { '카드 색': '기본' } }, premium), '기본'); // 직접 적은 카드 색이 우선
  const { design, lines } = limitLines({ cond: {} }, premium);
  assert.equal(design, '프리미엄');
  assert.match(lines[0], /^무드: 프리미엄/);
});

test('묶음 목록: 기본 + _designs의 모든 묶음, 필수 설명 칸', () => {
  const catalog = designCatalog(config);
  const ids = catalog.map((d) => d.id).sort();
  assert.deepEqual(ids, ['기본', ...Object.keys(config._designs)].sort());
  const NEEDS = ['required', 'optional', 'none'];
  for (const d of catalog) {
    assert.ok(d.name && d.summary, `${d.id}: name·summary`);
    assert.ok(Array.isArray(d.fits) && d.fits.length > 0, `${d.id}: fits`);
    assert.ok(Array.isArray(d.avoid), `${d.id}: avoid`);
    assert.ok(NEEDS.includes(d.needs?.product) && NEEDS.includes(d.needs?.background), `${d.id}: needs`);
    assert.match(String(d.version), /^\d+$/, `${d.id}: version`);
    if (d.preview !== null) assert.ok(fs.existsSync(path.join(ROOT, d.preview)), `${d.id}: preview ${d.preview}`);
  }
  assert.equal(catalog.find((d) => d.id === '프리미엄').colorMode, '제품 색');
  assert.equal(catalog.find((d) => d.id === '기본').colorMode, '기본');
});

test('지금 있는 제품은 묶음이 그대로 (cards.json에 design 없음 → 출력 변화 없음)', () => {
  const ids = fs.readdirSync(paths.products()).filter((id) => fs.existsSync(paths.product(id, 'cards.json')));
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const input = loadInput(id);
    if (!input) continue;
    const data = readJson(paths.product(id, 'cards.json'));
    assert.equal(data.design, undefined, `${id}: cards.json design`);
    assert.equal(designOf(input, config, data), designOf(input, config), id);
  }
});

// ── 3단계: cards.json design · 무드 자동 추천 · 작업실에서 바꾸기
const { makeWorkspace } = require('./helpers');
const { validate } = require('../scripts/validate');
const http = require('node:http');
const os = require('node:os');
const { createStudio } = require('../scripts/lib/studio-api');

const AUTO = '\n## 무드\n자동 추천\n';
const where = (r, code) => r.report.errors.filter((e) => !code || e.code === code).map((e) => e.where);

test('validate: 무드 자동 추천이면 design 필수, 목록에 있는 이름·고른 사람·이유 검사', () => {
  const ws = makeWorkspace();
  try {
    ws.editInput((t) => t + AUTO);
    let r = ws.use(validate);
    assert.ok(where(r, 'SCHEMA_ERROR').includes('design'), '자동 추천인데 design 없음');

    ws.editCards((d) => { d.design = { id: '기본', selected_by: 'claude', reason: '특징·수치 정보가 많고 사진이 한 장뿐이라 정보 중심 기본 묶음' }; });
    r = ws.use(validate);
    assert.deepEqual(where(r).filter((w) => w.startsWith('design')), []);

    ws.editCards((d) => { d.design = { id: '없는 묶음', selected_by: 'robot', reason: '' }; });
    r = ws.use(validate);
    assert.deepEqual(where(r, 'SCHEMA_ERROR').filter((w) => w.startsWith('design')).sort(), ['design.id', 'design.reason', 'design.selected_by']);
  } finally {
    ws.cleanup();
  }
});

test('validate: 입력에 무드를 직접 적으면 design보다 우선하고 경고', () => {
  const ws = makeWorkspace();
  try {
    ws.editInput((t) => t + '\n## 무드\n기본\n');
    ws.editCards((d) => { d.design = { id: '프리미엄', selected_by: 'claude', reason: '투명 배경 제품 사진' }; });
    const r = ws.use(validate);
    assert.ok(r.report.warnings.some((w) => w.where === 'design' && /'기본'/.test(w.message)));
    assert.deepEqual(where(r).filter((w) => w.startsWith('design')), []);
  } finally {
    ws.cleanup();
  }
});

test('check: 무드 자동 추천이면 글자 수 대신 묶음 목록, 고른 뒤에는 고른 묶음 기준', () => {
  const ws = makeWorkspace();
  try {
    ws.editInput((t) => t + AUTO);
    fs.rmSync(path.join(path.dirname(ws.use((id) => paths.product(id, 'cards.json'))), 'cards.json'));
    let out = ws.run('check-input.js').stdout;
    assert.match(out, /무드: 자동 추천 — 아직 묶음을 고르지 않았어요/);
    assert.match(out, /== 디자인 묶음 목록 \(무드 자동 추천\) ==/);
    assert.match(out, /- 프리미엄 \(v1\): /);
    assert.match(out, /필요한 사진: 제품 필수/);
    assert.doesNotMatch(out, /cover\(표지형\)/);

    ws.writeCards({ ...JSON.parse(fs.readFileSync(path.join(ROOT, 'products', 'toneup-sunscreen-r1', 'cards.json'), 'utf8')), design: { id: '프리미엄', selected_by: 'claude', reason: '제품 사진이 투명 배경' } });
    out = ws.run('check-input.js').stdout;
    assert.match(out, /무드: 프리미엄 \(구성안에서 Claude가 고름: 제품 사진이 투명 배경\)/);
    assert.match(out, /title: .*줄바꿈하면 한 줄 9자/);
  } finally {
    ws.cleanup();
  }
});

// 작업실: 구성안 확인 때 사람이 묶음을 바꿈 → cards.json design(selected_by human) + design_selected 기록
async function studioWith(products) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-design-'));
  const productsDir = path.join(dir, 'products');
  for (const [id, { mood, design }] of Object.entries(products)) {
    const src = path.join(ROOT, 'products', 'toneup-sunscreen-r1');
    const dst = path.join(productsDir, id);
    fs.mkdirSync(path.join(dst, 'images'), { recursive: true });
    fs.copyFileSync(path.join(src, 'images', 'main.png'), path.join(dst, 'images', 'main.png'));
    fs.writeFileSync(path.join(dst, 'input.md'), fs.readFileSync(path.join(src, 'input.md'), 'utf8') + (mood ? `\n## 무드\n${mood}\n` : ''));
    const cards = JSON.parse(fs.readFileSync(path.join(src, 'cards.json'), 'utf8'));
    cards.product_id = id;
    cards.stage = 'plan';
    for (const c of cards.cards) delete c.copy;
    if (design) cards.design = design;
    fs.writeFileSync(path.join(dst, 'cards.json'), JSON.stringify(cards, null, 2));
    fs.writeFileSync(path.join(dst, 'log.jsonl'), '');
  }
  const studio = createStudio({ productsDir, bin: path.join(__dirname, 'fixtures', 'fake-claude.js'), reportsDir: path.join(dir, 'reports'), exportConfigFile: path.join(dir, 'export.json'), webIndexFile: path.join(dir, 'web', 'index.json') });
  const server = http.createServer(async (req, res) => { if (!(await studio.handle(req, res))) { res.statusCode = 404; res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/studio`;
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(method === 'GET' ? {} : { 'x-studio': '1' }) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  return { call, productsDir, close: () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('작업실: 구성안 승인 전 디자인 묶음 바꾸기 (입력에 직접 적은 무드는 못 바꿈)', async () => {
  const s = await studioWith({
    'auto-pick': { mood: '자동 추천', design: { id: '기본', selected_by: 'claude', reason: '정보가 많은 선케어' } },
    'fixed-mood': { mood: '기본' },
  });
  try {
    let r = await s.call('GET', '/products/auto-pick');
    assert.equal(r.status, 200);
    assert.deepEqual({ id: r.body.design.id, source: r.body.design.source, auto: r.body.design.auto }, { id: '기본', source: 'cards', auto: true });
    assert.equal(r.body.design.selected.selected_by, 'claude');
    assert.deepEqual(r.body.design.catalog.map((d) => d.id).sort(), ['기본', ...Object.keys(config._designs)].sort());
    assert.equal(r.body.actions.can_select_design, true);

    assert.equal((await s.call('PUT', '/products/auto-pick/design', { id: '없는 묶음' })).status, 400);
    r = await s.call('PUT', '/products/auto-pick/design', { id: '프리미엄' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual({ id: r.body.design.id, by: r.body.design.selected.selected_by }, { id: '프리미엄', by: 'human' });
    assert.match(r.body.design.selected.reason, /구성안 추천: 기본/);
    const saved = JSON.parse(fs.readFileSync(path.join(s.productsDir, 'auto-pick', 'cards.json'), 'utf8'));
    assert.equal(saved.design.id, '프리미엄');
    const ev = r.body.events.find((e) => e.event === 'design_selected');
    assert.deepEqual({ design: ev.design, from: ev.from }, { design: '프리미엄', from: '기본' });

    assert.equal((await s.call('PUT', '/products/fixed-mood/design', { id: '프리미엄' })).status, 409, '입력 무드 우선');

    fs.appendFileSync(path.join(s.productsDir, 'auto-pick', 'log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), event: 'plan_approved', project_id: 'auto-pick', job_id: null, approved_by: 'human' }) + '\n');
    r = await s.call('GET', '/products/auto-pick');
    assert.equal(r.body.actions.can_select_design, false);
    assert.equal((await s.call('PUT', '/products/auto-pick/design', { id: '기본' })).status, 409, '승인 뒤에는 못 바꿈');
  } finally {
    s.close();
  }
});

// ── 4단계: 출력·웹 데이터·평가 결과에 남기는 묶음 기록
test('designRecord: 이름·버전·정한 곳, 구성안에서 골랐을 때만 고른 사람·이유', () => {
  const { designRecord } = require('../scripts/lib/common');
  assert.deepEqual(designRecord({ input: { cond: {} }, data: {}, config }), { id: '기본', name: '기본', version: '1', source: 'default', selected_by: null, reason: null });
  assert.deepEqual(designRecord({ input: { cond: { 무드: '프리미엄' } }, data: { design: { id: '기본', selected_by: 'claude', reason: 'x' } }, config }),
    { id: '프리미엄', name: '프리미엄', version: '1', source: 'input', selected_by: null, reason: null });
  assert.deepEqual(designRecord({ input: { cond: { 무드: '자동 추천' } }, data: { design: { id: '프리미엄', selected_by: 'human', reason: '사람이 고름' } }, config }),
    { id: '프리미엄', name: '프리미엄', version: '1', source: 'cards', selected_by: 'human', reason: '사람이 고름' });
});
