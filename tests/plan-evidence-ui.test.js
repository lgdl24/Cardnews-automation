// V2 구성안·근거의 브라우저 회귀 검사. 내보낸 예시를 응답에서만 바꿔 실제 제품·로그는 건드리지 않음.
// 실행: node --test tests/plan-evidence-ui.test.js (웹 의존성·Playwright Chromium 필요)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ID = 'toneup-sunscreen-r1';
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/public/data/projects', ID, 'project.json'), 'utf8'));
const captureDir = process.env.CARDNEWS_UI_CAPTURE_DIR;
let server;
let browser;
let origin;

test.before(async () => {
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  // 공용 5173 서버·실제 제작 API를 건드리지 않음. junction으로 연결한 폰트도 읽을 수 있게 실제 의존성 경로만 허용.
  process.env.CARDNEWS_STUDIO = '0';
  server = await createServer({
    root: path.join(ROOT, 'web'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [ROOT, fs.realpathSync(path.join(ROOT, 'web/node_modules'))] } },
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  await server?.close();
});

async function open(t, { edit = () => {}, width = 1280, query = '?card=2', brokenImage = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], '화면에서 JavaScript 오류가 발생함'));
  const project = structuredClone(sample);
  edit(project);
  await page.route(`**/data/projects/${ID}/project.json`, (route) => route.fulfill({ json: project }));
  if (brokenImage) await page.route('**/png/card-02.png', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto(`${origin}/projects/${ID}/plan${query}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByRole('heading', { name: '핵심 메시지', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function capture(page, name) {
  if (!captureDir) return;
  fs.mkdirSync(captureDir, { recursive: true });
  await page.screenshot({ path: path.join(captureDir, `${name}.png`), fullPage: true });
}

test('기본 화면: 카드·원문·구성안 표와 빈 수정 이력을 표시한다', async (t) => {
  const page = await open(t);
  assert.equal(await page.getByRole('img', { name: '2번 카드 (특징)' }).isVisible(), true);
  assert.equal(await page.getByRole('table').getByRole('row').count(), 6);
  assert.equal(await page.getByRole('heading', { name: '구성안 수정 요청 이력', exact: true }).isVisible(), true);
  assert.equal(await page.getByText('수정 요청 없음', { exact: true }).count(), 2);
  assert.equal(await page.evaluate(() => [...document.fonts].some((font) => font.family.includes('Pretendard') && font.status === 'loaded')), true);
  await capture(page, 'v2-desktop');
});

test('원문 칩은 키보드·클릭으로 열고 Escape로 닫을 수 있다', async (t) => {
  const page = await open(t);
  const chip = page.getByRole('button', { name: 'S1 원문 근거 보기', exact: true }).first();
  await chip.focus();
  await page.keyboard.press('Enter');
  const quote = page.getByRole('region', { name: 'S1 원문 근거', exact: true });
  await quote.waitFor();
  assert.equal(await chip.getAttribute('aria-expanded'), 'true');
  assert.ok((await quote.innerText()).includes(sample.sources.find((s) => s.id === 'S1').quote));
  await page.keyboard.press('Escape');
  assert.equal(await quote.count(), 0);
  await chip.click();
  await quote.getByRole('button', { name: '원문 닫기' }).click();
  assert.equal(await quote.count(), 0);
  assert.equal(await chip.evaluate((element) => element === document.activeElement), true);
});

test('카드 선택은 공유 주소를 유지하고, 구성안 표에서 고르면 선택 영역으로 이동한다', async (t) => {
  const page = await open(t, { query: '?card=2&from=review' });
  await page.getByRole('table').getByRole('button', { name: '5번 카드 보기', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('card'), '5');
  assert.equal(new URL(page.url()).searchParams.get('from'), 'review');
  await page.getByRole('img', { name: '5번 카드 (마무리)' }).waitFor();
  const selectedTop = await page.getByRole('navigation', { name: '카드 선택' }).evaluate((element) => element.getBoundingClientRect().top);
  assert.ok(selectedTop >= -2 && selectedTop < 100, `카드 선택 영역이 보이지 않음: ${selectedTop}`);
  await page.reload();
  await page.getByRole('img', { name: '5번 카드 (마무리)' }).waitFor();
  assert.equal(await page.getByRole('navigation', { name: '카드 선택' }).getByRole('button', { name: '5번 카드', exact: true }).getAttribute('aria-current'), 'true');
});

test('주의 표현은 지정된 문구 칸만 강조하고 카드 단위 근거와 이력을 구분한다', async (t) => {
  const page = await open(t, { edit: (p) => {
    const card = p.cards[1];
    card.copy.caption = '미백(기능성) 문구와 미백 표기를 확인해요';
    card.cautions = [
      { term: '미백', category: '기능성 표방', in_source: true, fields: [{ field: 'caption', index: null }] },
      { term: '미백(기능성)', category: '기능성 표방', in_source: false, fields: [{ field: 'caption', index: null }] },
    ];
    card.revisions = [{ ts: '2026-10-20T01:00:00.000Z', types: ['FACT'], memo: '시험 조건을 원문과 같이 확인' }];
    p.plan_revisions = [{ ts: '2026-10-20T00:00:00.000Z', types: ['ORDER'], memo: '기능성 카드를 먼저 배치' }];
    p.quality.coverage = 0.5;
    p.quality.coverage_detail = { covered: 1, total: 2, missing: [{ section: '주요 특징', text: '아직 쓰지 않은 원문 항목' }], excluded_count: 0 };
  } });
  const copy = page.getByRole('region', { name: '문구 ↔ 원문 근거', exact: true });
  assert.deepEqual(await copy.locator('mark').allTextContents(), ['미백(기능성)', '미백']);
  assert.equal(await copy.locator('.pe-field').first().locator('mark').count(), 0);
  assert.equal(await copy.getByText('아래 원문은 이 카드 전체에 연결된 근거예요.', { exact: true }).isVisible(), true);
  assert.equal(await page.getByText('원문에 없음 — 확인 필요', { exact: false }).isVisible(), true);
  assert.equal(await page.getByText('시험 조건을 원문과 같이 확인', { exact: true }).isVisible(), true);
  assert.equal(await page.getByText('기능성 카드를 먼저 배치', { exact: true }).isVisible(), true);
  assert.equal(await page.getByText('아직 쓰지 않은 원문 항목', { exact: false }).isVisible(), true);
  await capture(page, 'v2-review-states');
});

test('비교할 원문이 없을 때 모두 사용했다고 표시하지 않는다', async (t) => {
  const page = await open(t, { edit: (p) => {
    p.quality.coverage = null;
    p.quality.evidence_rate = null;
    p.quality.coverage_detail = { covered: 0, total: 0, missing: [], excluded_count: 0 };
  } });
  assert.equal(await page.getByText('비교할 주요 특징·사용 방법이 없어요.', { exact: true }).isVisible(), true);
  assert.equal(await page.getByText('주요 특징·사용 방법이 모두 카드 근거에 쓰였어요.', { exact: true }).count(), 0);
});

test('PNG 로드 실패·구성안 단계에 맞는 안내를 표시한다', async (t) => {
  const broken = await open(t, { brokenImage: true });
  await broken.getByText('카드 이미지를 불러오지 못했어요.', { exact: true }).waitFor();
  await broken.getByRole('navigation', { name: '카드 선택' }).getByRole('button', { name: '1번 카드', exact: true }).click();
  const image = broken.getByRole('img', { name: '1번 카드 (표지)' });
  await image.waitFor();
  assert.equal(await image.evaluate((element) => element.complete && element.naturalWidth > 0), true);
  const plan = await open(t, { edit: (p) => {
    p.stage = 'plan';
    p.cards.forEach((card) => { card.copy = null; card.chars = []; });
  } });
  assert.equal(await plan.getByText('아직 문구 단계 전이라 카드 이미지가 없어요.', { exact: true }).isVisible(), true);
});

test('휴대폰에서 긴 원문·이력과 글자 수 초과를 표시해도 가로로 넘치지 않는다', async (t) => {
  for (const width of [375, 320]) {
    const page = await open(t, { width, edit: (p) => {
      p.sources[0].quote = 'https://example.com/' + 'long-source-'.repeat(40);
      const card = p.cards[1];
      card.copy.caption = '아주긴문구'.repeat(30);
      card.chars = [{ field: 'caption', index: null, chars: 150, limit: 40, ratio: 3.75 }];
      card.revisions = [{ ts: '2026-10-20T01:00:00.000Z', types: ['LEN'], memo: 'revision-note-'.repeat(35) }];
    } });
    await page.getByRole('button', { name: 'S1 원문 근거 보기', exact: true }).first().click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px에서 가로 넘침`);
    const meter = page.getByRole('meter').first();
    assert.ok(Number(await meter.getAttribute('aria-valuenow')) <= Number(await meter.getAttribute('aria-valuemax')));
    assert.match(await meter.getAttribute('aria-valuetext'), /150.*40.*375%/);
    if (width === 375) await capture(page, 'v2-mobile-stress');
  }
  const clean = await open(t, { width: 375 });
  await capture(clean, 'v2-mobile');
});
