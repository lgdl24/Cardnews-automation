// 작업실 인스타 게시 패널(B5, #104) 화면 검사 — 모든 API는 가로챈 모의 응답, 실제 게시·토큰은 쓰지 않음
// CARDNEWS_UI_CAPTURE_DIR를 주면 375/1440 × 밝게/어둡게 화면을 저장
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/public/data/projects/toneup-sunscreen-r1/project.json')));
const PNG_DIR = path.join(ROOT, 'web/public/data/projects/toneup-sunscreen-r1/png');
let server, browser, origin;

test.before(async () => {
  process.env.CARDNEWS_STUDIO = '0';
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  server = await createServer({ root: path.join(ROOT, 'web'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, fs: { allow: [ROOT, fs.realpathSync(path.join(ROOT, 'web/node_modules'))] } } });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
});
test.after(async () => { await browser?.close(); await server?.close(); });

const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();
const status = { ok: true, mode: 'web', claude: { installed: true, version: 't', logged_in: true }, form: require('../config/input-form.json'), revision_types: [], job: null, jobs: { running: null, queue: [] } };
const pngs = [1, 2, 3, 4, 5].map((n) => ({ file: `card-0${n}.png`, v: 1 }));
const product = {
  id: 'gel-cream', name: '리프레싱 젤 크림', brand: 'Sample', stage: 'approved', updated_at: ago(60), running: false,
  input: { values: {}, images: [], card_count: 5 }, check: { errors: [], warnings: [], cautions: [] },
  cards: { ...sample, stage: 'approved' }, validation: null, pngs, events: [], job: null,
  export: { listed: true, exported_at: ago(30) },
  actions: { running: false, can_export: true, last_job_ok: true, can_edit_input: false, can_plan: false, can_approve_plan: false, can_revise_plan: false, can_copy: false, can_approve_final: false, can_revise_final: false },
};
const steps = [['preparing', '게시용 이미지(JPEG)·캡션 준비'], ['opening_url', '이미지 공개 주소 열기'], ['uploading', '인스타에 이미지 올리기'], ['carousel', '캐러셀 묶기'], ['publishing', '게시'], ['confirming', '게시 링크 확인']].map(([key, label]) => ({ key, label }));
const caption = require('../scripts/lib/ig-caption-draft').formatDraft(require('./fixtures/ig-caption-content.json'), require('../config/instagram.json').caption).text;
function igStatus(over = {}) {
  return {
    configured: true, version: 'v-abc', approved: true, approved_at: ago(100), caption,
    cards: pngs.map((p, i) => ({ no: i + 1, file: p.file })),
    check: { ready: true, checks: [
      { id: 'approved', label: '최종 승인', status: 'pass', detail: '사람이 최종 승인했어요' },
      { id: 'caution', label: '광고 주의 표현', status: 'pass', detail: '주의 표현 0건' },
      { id: 'ai_image', label: 'GPT 이미지 확인', status: 'warn', detail: 'GPT 이미지 카드 1·5번에 사람·의료인이 없는지 확인' },
    ] },
    acks: [], current: null, published: [], history: [], schedule: null,
    can_publish: false, can_schedule: false, blockers: ["'사람 확인' 항목을 확인해 주세요: GPT 이미지 확인"], schedule_blockers: [],
    steps, limits: { schedule_min_minutes: 2, schedule_max_days: 30, grace_minutes: 10 }, public_url_mode: 'tunnel',
    ...over,
  };
}
const ready = () => igStatus({ acks: ['ai_image'], can_publish: true, can_schedule: true, blockers: [] });

async function open(t, { ig, width = 1440, scheme = 'light', requests = [], onWrite = null }) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  const state = { ig };
  await page.route('**/api/studio/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const png = u.pathname.match(/\/files\/png\/(card-\d{2}\.png)$/);
    if (png) return route.fulfill({ path: path.join(PNG_DIR, png[1]), contentType: 'image/png' });
    if (req.method() !== 'GET') {
      requests.push({ method: req.method(), path: u.pathname, body: req.postDataJSON() });
      if (onWrite) state.ig = onWrite(u.pathname, req.postDataJSON(), state.ig) ?? state.ig;
      return route.fulfill({ json: u.pathname.endsWith('/publish') ? { request: state.ig.current, instagram: state.ig } : state.ig });
    }
    if (u.pathname.endsWith('/status')) return route.fulfill({ json: status });
    if (u.pathname.endsWith('/jobs')) return route.fulfill({ json: status.jobs });
    if (u.pathname.endsWith('/instagram/account')) return route.fulfill({ json: { ok: true, username: 'glowif_lab', login: 'Unified Login', used: 1, total: 100 } });
    if (u.pathname.endsWith('/instagram')) return route.fulfill({ json: state.ig });
    return route.fulfill({ json: product });
  });
  await page.goto(`${origin}/studio/gel-cream`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { page, state };
}
async function capture(page, name) {
  const dir = process.env.CARDNEWS_UI_CAPTURE_DIR;
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `가로 넘침 ${width}`);
    if (!dir) continue;
    fs.mkdirSync(dir, { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => { document.documentElement.dataset.theme = th; }, theme);
      await page.locator('.ig-panel').screenshot({ path: path.join(dir, `ig-${name}-${width}-${theme}.png`) });
    }
  }
}

test('사람 확인 전에는 게시 버튼이 막히고, 확인하면 확인 창을 거쳐 그 버전으로 게시 요청', async (t) => {
  const requests = [];
  const { page } = await open(t, {
    ig: igStatus(),
    requests,
    onWrite: (p, body, cur) => (p.endsWith('/ack') ? ready() : p.endsWith('/publish') ? igStatus({ acks: ['ai_image'], current: { request_id: 'r', version: 'v-abc', trigger: 'manual', state: 'uploading', requested_at: ago(5), updated_at: ago(1), steps: [{ key: 'preparing', at: ago(5) }, { key: 'opening_url', at: ago(3) }, { key: 'uploading', at: ago(1) }], progress: { done: 3, total: 5 }, account: 'glowif_lab', media_id: null, permalink: null, error: null }, blockers: ['게시가 진행 중이에요'] }) : cur),
  });
  await page.getByRole('heading', { name: '인스타 게시' }).waitFor();
  await page.getByText('@glowif_lab').waitFor();
  const publishBtn = page.getByRole('button', { name: '지금 게시' });
  assert.equal(await publishBtn.isDisabled(), true);
  await page.getByText(/'사람 확인' 항목을 확인해 주세요/).waitFor();
  await capture(page, 'needs-ack');
  await page.getByLabel('확인했어요').check();
  await page.waitForFunction(() => !document.querySelector('.ig-actions .btn-primary')?.disabled);
  await publishBtn.click();
  const dialog = page.getByRole('dialog', { name: '인스타에 지금 공개 게시할까요?' });
  await dialog.waitFor();
  const text = await dialog.innerText();
  assert.match(text, /@glowif_lab에 카드 5장/);
  assert.match(text, /캡션 첫 줄: AI 활용/);
  assert.match(text, /되돌릴 수 없어요/);
  await capture(page, 'confirm');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/publish')), dialog.getByRole('button', { name: '게시하기' }).click()]);
  assert.deepEqual(requests.map((r) => [r.path.split('/').pop(), r.body]), [['ack', { version: 'v-abc', ids: ['ai_image'] }], ['publish', { version: 'v-abc' }]]);
  await page.getByText('인스타에 이미지 올리기 (3/5)').waitFor();
  const progress = await page.locator('.ig-progress').innerText();
  assert.doesNotMatch(progress, /%|남은 시간/);
  assert.equal(await page.locator('.ig-panel').getByRole('button', { name: /취소/ }).count(), 0, '진행 중 게시는 취소 버튼 없음');
  await capture(page, 'progress');
});

test('예약: 시각을 고르고 확인하면 예약 요청, 예약 중에는 취소할 수 있음', async (t) => {
  const requests = [];
  const { page } = await open(t, {
    ig: ready(),
    requests,
    onWrite: (p, body, cur) => (p.endsWith('/schedule') && body ? { ...cur, can_publish: false, can_schedule: false, schedule: { id: 's1', at: body.at, version: 'v-abc', state: 'scheduled', created_at: ago(1), reason: null }, blockers: ['예약이 있어요. 지금 게시하려면 예약을 먼저 취소해 주세요'] } : p.endsWith('/schedule') ? { ...ready(), schedule: { id: 's1', at: cur.schedule.at, version: 'v-abc', state: 'canceled', created_at: ago(1), reason: null } } : cur),
  });
  await page.getByRole('button', { name: '예약 게시' }).click();
  const at = new Date(Date.now() + 3 * 3600e3);
  at.setSeconds(0, 0);
  const local = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}T${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  await page.getByLabel('게시할 시각').fill(local);
  await page.getByRole('button', { name: '이 시각으로 예약' }).click();
  const dialog = page.getByRole('dialog', { name: '예약 게시를 정할까요?' });
  assert.match(await dialog.innerText(), /켜져 있어야 해요/);
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/schedule')), dialog.getByRole('button', { name: '예약하기' }).click()]);
  assert.equal(requests[0].body.at, at.toISOString());
  await page.getByText(/에 게시하도록 예약했어요/).waitFor();
  await page.locator('.pill', { hasText: '예약' }).first().waitFor();
  await capture(page, 'scheduled');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/schedule')), page.getByRole('button', { name: '예약 취소' }).click()]);
  assert.equal(requests[1].method, 'DELETE');
});

test('결과 불분명은 확인 버튼만, 놓친 예약은 이유와 지우기, 게시 완료는 링크', async (t) => {
  const unknown = igStatus({ acks: ['ai_image'], current: { request_id: 'r', version: 'v-abc', trigger: 'schedule', state: 'unknown', requested_at: ago(300), updated_at: ago(200), finished_at: ago(200), steps: [], progress: { done: 5, total: 5 }, account: 'glowif_lab', media_id: null, permalink: null, error: { message: '게시 요청을 보냈지만 결과를 받지 못했어요 (socket hang up). 실제로 게시됐는지 확인이 필요해요' } }, schedule: { id: 's', at: ago(400), version: 'v-abc', state: 'missed', created_at: ago(9000), reason: '예약 시각에 작업실이 꺼져 있었어요. 자동으로 게시하지 않았어요' }, blockers: ['지난 게시가 실제로 됐는지 먼저 확인해야 해요 (게시 여부 확인)'] });
  const done = igStatus({ acks: ['ai_image'], current: { ...unknown.current, state: 'published', media_id: 'm1', permalink: 'https://www.instagram.com/p/glowif1/', error: null }, published: [{ version: 'v-abc', media_id: 'm1', permalink: 'https://www.instagram.com/p/glowif1/', account: 'glowif_lab', published_at: ago(100), trigger: 'schedule' }], schedule: null, blockers: ['이 버전은 이미 게시했어요. 카드를 고쳐 새 버전이 되어야 다시 게시할 수 있어요'] });
  const requests = [];
  const { page } = await open(t, { ig: unknown, requests, onWrite: (p) => (p.endsWith('/verify') ? done : null) });
  await page.getByText('게시가 됐는지 확인이 필요해요').waitFor();
  await page.getByText(/예약을 놓쳤어요/).waitFor();
  assert.equal(await page.getByRole('button', { name: '지금 게시' }).isDisabled(), true);
  await capture(page, 'unknown');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/verify')), page.getByRole('button', { name: '인스타에서 게시 여부 확인' }).click()]);
  const link = page.getByRole('link', { name: /인스타에서 보기/ });
  await link.waitFor();
  assert.equal(await link.getAttribute('href'), 'https://www.instagram.com/p/glowif1/');
  await page.getByText('이 버전은 이미 게시했어요', { exact: false }).first().waitFor();
  await capture(page, 'published');
});
