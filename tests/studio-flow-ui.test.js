// 작업실 개편 화면 검사 — 모든 API는 가로챈 모의 응답이며 실제 제품 저장·Claude 작업·게시는 실행하지 않음
// CARDNEWS_UI_CAPTURE_DIR를 주면 375/768/1024/1440 × 밝게/어둡게 화면을 저장
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

const now = Date.now();
const ago = (sec) => new Date(now - sec * 1000).toISOString();
const status = { ok: true, mode: 'web', claude: { installed: true, version: '2.1.test', logged_in: true }, form: require('../config/input-form.json'), revision_types: [{ code: 'LEN', label: '길이', example: '짧게' }, { code: 'FACT', label: '사실', example: '원문과 다름' }], job: null, jobs: { running: null, queue: [] } };
const pngs = ['card-01.png', 'card-02.png', 'card-03.png', 'card-04.png', 'card-05.png'].map((file) => ({ file, v: 1 }));
const baseActions = { running: false, job_state: null, wait_ahead: 0, last_job_ok: true, can_edit_input: false, can_plan: false, can_approve_plan: false, can_revise_plan: false, can_copy: false, can_approve_final: false, can_revise_final: false, can_export: false };
function detail(over = {}) {
  return {
    id: 'gel-cream', name: '리프레싱 젤 크림 — 아주 긴 제품 이름도 줄바꿈되는지 확인', brand: 'Sample', stage: 'copy', updated_at: ago(60), running: false,
    input: { values: { 제품명: '리프레싱 젤 크림', '콘텐츠 목적': '제품 소개', 무드: '기본' }, images: [{ file: 'main.png', desc: '제품 단독 컷', source: '직접 촬영', usage: '가능', kind: '제품' }], card_count: 5 },
    check: { errors: [], warnings: [], cautions: [] },
    cards: { ...sample, stage: over.stage ?? 'copy' },
    validation: { errors: [], warnings: [{ where: '전체', message: '카드에 쓰이지 않은 원문 1개' }], cautions: [{ where: '3번 카드.copy.title', message: '"완벽" 표현' }], quality: { coverage: 0.8, evidence_rate: 0.6, caution: { total: 1 } } },
    pngs, events: [{ ts: ago(600), event: 'input_submitted', job_id: null }, { ts: ago(300), event: 'job_finished', job_id: 'j1', kind: 'plan', ok: true }],
    job: null, export: { listed: false, exported_at: null }, actions: { ...baseActions },
    ...over,
  };
}
const summaries = [
  { id: 'gel-cream', name: '리프레싱 젤 크림', brand: 'Sample', stage: 'copy', updated_at: ago(60), running: false, thumb: { file: 'card-01.png', v: 1 }, png_count: 5, card_count: 5, last_job: { kind: 'copy', ok: true, error_code: null, ts: ago(60) } },
  { id: 'toner-plan', name: '진정 토너', brand: null, stage: 'plan', updated_at: ago(3600), running: false, thumb: null, png_count: 0, card_count: 5, last_job: { kind: 'plan', ok: true, error_code: null, ts: ago(3600) } },
  { id: 'serum-run', name: '비타 세럼', brand: 'Brand', stage: 'input', updated_at: ago(30), running: true, thumb: null, png_count: 0, last_job: null },
  { id: 'mask-wait', name: '수분 마스크', brand: 'Brand', stage: 'plan', updated_at: ago(20), running: false, queued: true, queue_position: 1, thumb: null, png_count: 0, last_job: null },
  { id: 'oil-fail', name: '클렌징 오일', brand: 'Brand', stage: 'input', updated_at: ago(90), running: false, thumb: null, png_count: 0, last_job: { kind: 'plan', ok: false, error_code: 'USAGE_LIMIT', ts: ago(90) } },
  { id: 'sun-done', name: '톤업 선크림', brand: 'Brand', stage: 'approved', updated_at: ago(86400), running: false, thumb: { file: 'card-01.png', v: 1 }, png_count: 5, last_job: { kind: 'copy', ok: true, error_code: null, ts: ago(86400) } },
];

async function open(t, url, { width = 1440, scheme = 'light', product = detail(), requests = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/api/studio/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const png = u.pathname.match(/\/files\/png\/(card-\d{2}\.png)$/);
    if (png) return route.fulfill({ path: path.join(PNG_DIR, png[1]), contentType: 'image/png' });
    if (/\/files\/images\//.test(u.pathname)) return route.fulfill({ path: path.join(PNG_DIR, 'card-01.png'), contentType: 'image/png' });
    if (req.method() !== 'GET') { requests.push({ method: req.method(), path: u.pathname, body: req.postDataJSON() }); return route.fulfill({ json: { product } }); }
    if (u.pathname.endsWith('/status')) return route.fulfill({ json: status });
    if (u.pathname.endsWith('/jobs')) return route.fulfill({ json: status.jobs });
    if (u.pathname.endsWith('/products')) return route.fulfill({ json: { products: summaries } });
    return route.fulfill({ json: product });
  });
  await page.goto(origin + url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'horizontal overflow');
}
const SIZES = [375, 768, 1024, 1440];
async function captureAll(page, name) {
  const dir = process.env.CARDNEWS_UI_CAPTURE_DIR;
  for (const width of SIZES) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
    if (!dir) continue;
    fs.mkdirSync(dir, { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => { document.documentElement.dataset.theme = th; document.activeElement?.blur(); window.scrollTo(0, 0); }, theme);
      await page.screenshot({ path: path.join(dir, `${name}-${width}-${theme}.png`), fullPage: true });
    }
  }
}

test('목록: 대표 카드·상태 배지·이어서 할 일, 실패만 따로 보기', async (t) => {
  const page = await open(t, '/studio');
  const tiles = page.locator('.studio-tile');
  assert.equal(await tiles.count(), summaries.length);
  // 사람이 먼저 봐야 하는 실패가 맨 앞
  assert.match(await tiles.first().innerText(), /클렌징 오일[\s\S]*원인 확인/);
  for (const text of ['작업 중', '대기 1번째', '구성안 실패', '카드 검토', '구성안 검토', '승인 완료']) await page.locator('.pill', { hasText: text }).first().waitFor();
  assert.equal(await page.locator('.studio-tile img').count(), 2);
  await page.getByRole('button', { name: '실패', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.studio-tile').length === 1);
  assert.equal(new URL(page.url()).searchParams.get('stage'), 'failed');
  await page.getByRole('button', { name: '전체', exact: true }).click();
  await captureAll(page, 'studio-list');
});

test('진행 중: 실제 단계·경과 시간·마지막 활동을 보여주고 퍼센트·예상 시간은 없다', async (t) => {
  const job = { status: 'running', job_id: 'j2', kind: 'plan', started_at: ago(95), progress: [
    { ts: ago(90), type: 'init', model: 'test' },
    { ts: ago(80), type: 'tool', tool: 'Bash', detail: 'npm run check -- gel-cream' },
    { ts: ago(40), type: 'tool', tool: 'Write', detail: 'products/gel-cream/cards.json' },
    { ts: ago(12), type: 'tool', tool: 'Bash', detail: 'npm run validate -- gel-cream' },
    { ts: ago(10), type: 'text', text: '구성안 검증을 진행하고 있어요' },
  ] };
  const page = await open(t, '/studio/gel-cream', { product: detail({ stage: 'input', cards: null, job, running: true, actions: { ...baseActions, running: true, job_state: 'running' } }) });
  await page.getByRole('heading', { name: '구성안 작업 진행 중' }).waitFor();
  const card = page.locator('.job-card');
  const text = await card.innerText();
  for (const s of ['입력 확인', '카드 데이터(cards.json) 저장', '데이터 검증', '경과', '마지막 활동', '구성안 검증을 진행하고 있어요']) assert.ok(text.includes(s), s);
  assert.doesNotMatch(text, /%|남은 시간|예상/);
  assert.equal(await page.locator('.step-running').count(), 1);
  assert.equal(await page.getByRole('button', { name: /취소/ }).count(), 0, '진행 중 작업에는 취소 버튼이 없다');
  await captureAll(page, 'studio-running');
});

test('대기 중: 순서·앞 작업과 대기 취소', async (t) => {
  const requests = [];
  const job = { status: 'queued', job_id: null, kind: 'copy', started_at: ago(30), queued_at: ago(30), progress: [], position: 2, ahead: { product_id: 'serum-run', name: '비타 세럼', kind: 'plan' } };
  const page = await open(t, '/studio/gel-cream', { requests, product: detail({ stage: 'plan', job, queued: true, actions: { ...baseActions, running: true, job_state: 'queued' } }) });
  await page.getByRole('heading', { name: '문구·출력 작업 대기 중 · 2번째' }).waitFor();
  await page.getByRole('link', { name: '비타 세럼' }).waitFor();
  assert.equal(await page.locator('.step-queued').count(), 1);
  await Promise.all([page.waitForResponse((r) => r.request().method() !== 'GET'), page.getByRole('button', { name: '대기 취소' }).click()]);
  assert.deepEqual(requests.map((r) => [r.method, r.path]), [['DELETE', '/api/studio/products/gel-cream/queue']]);
});

test('실패: 원인·안내·다시 하기 경로, 결과는 반영하지 않았다고 알림', async (t) => {
  const requests = [];
  const job = { status: 'done', job_id: 'j3', kind: 'plan', started_at: ago(200), finished_at: ago(150), progress: [], ok: false, error_code: 'USAGE_LIMIT', crash: null, report: { 결과: '중단', 단계: 'plan', 오류: [], 알림: ['한도 안내'] }, verify: null };
  const page = await open(t, '/studio/oil-fail', { requests, product: detail({ id: 'oil-fail', stage: 'input', cards: null, job, actions: { ...baseActions, last_job_ok: false, can_plan: true, can_edit_input: true } }) });
  await page.getByRole('heading', { name: /Claude 사용량 한도에 걸렸어요/ }).waitFor();
  assert.ok((await page.locator('.job-card').innerText()).includes('이번 작업 결과는 반영하지 않았어요'));
  assert.equal(await page.locator('.step-failed').count(), 1);
  await page.getByRole('link', { name: '입력 고치기' }).first().waitFor();
  await Promise.all([page.waitForResponse((r) => r.request().method() !== 'GET'), page.getByRole('button', { name: '구성안 다시 만들기' }).click()]);
  assert.deepEqual(requests.map((r) => [r.path, r.body]), [['/api/studio/products/oil-fail/jobs', { kind: 'plan' }]]);
  await captureAll(page, 'studio-failed');
});

test('실패한 수정 요청은 이전 요청 내용으로 다시 보낼 수 있다', async (t) => {
  const job = { status: 'done', job_id: 'j4', kind: 'revise', started_at: ago(100), finished_at: ago(50), progress: [], ok: false, error_code: 'CHAR_LIMIT', revision: { stage: 'final', cards: [3], types: ['LEN'], memo: '3번 제목 짧게' }, report: { 결과: '중단', 단계: 'copy', 오류: ['CHAR_LIMIT 3 copy.title'], 알림: [] }, verify: null };
  const page = await open(t, '/studio/gel-cream', { product: detail({ job, actions: { ...baseActions, last_job_ok: false, can_revise_final: true, can_approve_final: true } }) });
  await page.getByRole('button', { name: '수정 요청 다시 보내기' }).click();
  assert.equal(await page.getByRole('textbox', { name: '요청 내용' }).inputValue(), '3번 제목 짧게');
  assert.equal(await page.getByLabel('3번', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('길이', { exact: true }).isChecked(), true);
});

test('구성안 검토: 카드를 고르면 연결된 원문이 보이고, 승인 막대에서 승인', async (t) => {
  const requests = [];
  const page = await open(t, '/studio/gel-cream', { requests, product: detail({ stage: 'plan', pngs: [], actions: { ...baseActions, can_approve_plan: true, can_revise_plan: true, can_select_design: true } }) });
  await page.getByRole('heading', { name: '구성안 검토' }).waitFor();
  const withEvidence = sample.cards.find((c) => c.evidence?.length);
  await page.locator('.plan-item').nth(sample.cards.indexOf(withEvidence)).click();
  const quote = sample.sources.find((s) => s.id === withEvidence.evidence[0]).quote;
  await page.locator('.plan-detail').getByText(quote, { exact: false }).waitFor();
  await Promise.all([page.waitForResponse((r) => r.request().method() !== 'GET'), page.getByRole('button', { name: '구성안 승인하고 카드 만들기' }).click()]);
  assert.deepEqual(requests.map((r) => [r.path, r.body]), [['/api/studio/products/gel-cream/approve', { stage: 'plan' }]]);
  await captureAll(page, 'studio-plan');
});

test('카드 검토: 필름 스트립·키보드 이동·전체 흐름·카드별 주의, 확인한 장수', async (t) => {
  const page = await open(t, '/studio/gel-cream', { product: detail({ actions: { ...baseActions, can_approve_final: true, can_revise_final: true } }) });
  await page.getByRole('img', { name: '1번 카드 미리보기' }).waitFor();
  assert.equal(await page.locator('.film img').count(), 5);
  await page.getByRole('button', { name: '1번 카드', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('img', { name: '3번 카드 미리보기' }).waitFor();
  assert.ok((await page.locator('.review-copy').innerText()).includes('[주의]'), '3번 카드의 주의 표현을 그 카드 옆에 보여준다');
  assert.ok((await page.locator('.review-bar').innerText()).includes('3/5장 확인함'));
  await page.getByRole('button', { name: '전체 흐름' }).click();
  assert.equal(await page.locator('.flow-item').count(), 5);
  assert.ok((await page.locator('.review-bar').innerText()).includes('5/5장 확인함'));
  await page.getByRole('button', { name: '4번 카드 자세히 보기' }).click();
  await page.getByRole('img', { name: '4번 카드 미리보기' }).waitFor();
  await page.getByRole('button', { name: '최종 승인' }).waitFor();
  await captureAll(page, 'studio-cards');
});

test('입력: 제출하면 빠진 항목을 요약해 이동시키고, 글 입력은 임시 저장 후 다시 불러온다', async (t) => {
  const requests = [];
  const page = await open(t, '/studio/new', { requests });
  await page.getByRole('button', { name: '자료 저장하고 계속' }).click();
  const summary = page.locator('.error-summary');
  await summary.waitFor();
  assert.equal(await summary.evaluate((el) => el === document.activeElement), true, '오류 요약으로 초점 이동');
  const items = await summary.locator('li').allInnerTexts();
  assert.ok(items.some((x) => x.startsWith('제품ID')), items.join(' | '));
  assert.ok(items.some((x) => x.startsWith('이미지')), items.join(' | '));
  assert.equal(requests.length, 0, '빠진 항목이 있으면 저장 요청을 보내지 않는다');
  await summary.getByRole('link', { name: /^제품ID/ }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'field-product-id');
  await page.locator('#field-product-id').fill('draft-test');
  await page.getByLabel(/^제품명/).fill('임시 저장 제품');
  await page.waitForTimeout(800);
  await captureAll(page, 'studio-form');
  await page.reload();
  await page.getByRole('button', { name: '불러오기' }).click();
  assert.equal(await page.getByLabel(/^제품명/).inputValue(), '임시 저장 제품');
  assert.equal(await page.locator('#field-product-id').inputValue(), 'draft-test');
});
