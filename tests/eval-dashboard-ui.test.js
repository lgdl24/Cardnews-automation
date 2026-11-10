// V3 평가 대시보드 — 가상 집계(tests/fixtures/eval-summary.json)로 화면만 확인. 실제 평가·제작은 실행하지 않음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/eval-summary.json'), 'utf8'));
let server, browser, origin;
test.before(async () => {
  process.env.CARDNEWS_STUDIO = '0';
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  server = await createServer({ root: path.join(ROOT, 'web'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, fs: { allow: [ROOT, fs.realpathSync(path.join(ROOT, 'web/node_modules'))] } } });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
});
test.after(async () => {
  await browser?.close();
  await server?.close();
});
async function open(t, url, { width = 1440, scheme = 'light', summary = fixture } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: scheme, reducedMotion: 'reduce', acceptDownloads: true });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/api/studio/**', (r) => r.fulfill({ status: 404, json: { error: 'Unavailable' } }));
  await page.route('**/data/eval/summary.json', (r) => (summary ? r.fulfill({ json: summary }) : r.fulfill({ status: 404, body: 'nope', contentType: 'text/plain' })));
  await page.goto(origin + url, { waitUntil: 'networkidle' });
  return page;
}
const noOverflow = async (page) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
const metric = (page, label) => page.locator('.metric', { has: page.locator('.metric-label', { hasText: label }) }).locator('.metric-value');
const runCount = (page, n) => metric(page, '평가 실행').filter({ hasText: new RegExp(`^${n}$`) }).waitFor();

test('요약 숫자는 필터에 따라 다시 계산되고, 필터는 주소에 남는다', async (t) => {
  const page = await open(t, '/eval');
  await runCount(page, fixture.runs.length);
  await page.getByText('규칙 버전 2개', { exact: false }).waitFor();
  await page.getByLabel('규칙 버전', { exact: true }).selectOption('v2');
  assert.equal(new URL(page.url()).searchParams.get('version'), 'v2');
  await runCount(page, fixture.runs.filter((r) => r.skill_version === 'v2').length);
  assert.equal(await page.getByText('규칙 버전 2개', { exact: false }).count(), 0);
  await page.getByRole('button', { name: '필터 초기화' }).first().click();
  await runCount(page, fixture.runs.length);
});

test('경계 입력은 입력마다 카드 하나, 실패한 기대 동작과 판정 대기가 보인다', async (t) => {
  const page = await open(t, '/eval?version=v1');
  const boundary = new Set(fixture.runs.filter((r) => r.input_type === 'boundary' && r.skill_version === 'v1').map((r) => r.input_id));
  assert.equal(await page.locator('.safety-card').count(), boundary.size);
  await noOverflow(page);
  const missing = page.locator('.safety-card', { hasText: '라벤더 수면 필로우 미스트' });
  await missing.locator('.row-fail', { hasText: '보고에 누락 항목' }).waitFor();
  await page.locator('.safety-card', { hasText: '시어버터 핸드크림' }).getByText('판정 대기').first().waitFor();
});

test('핵심 정보·품질·시간·버전 비교가 그려지고 설명 상자가 키보드로 열린다', async (t) => {
  const page = await open(t, '/eval');
  assert.ok((await page.locator('.heat-cell.heat-missed').count()) > 0);
  await page.locator('.heat-cell').first().focus();
  await page.getByRole('tooltip').waitFor();
  assert.match(await page.getByRole('tooltip').innerText(), /근거에 포함/);
  assert.ok((await page.locator('.strip-dot').count()) > 0);
  assert.ok((await page.locator('.bar-seg.bar-2').count()) > 0);
  const version = page.locator('section', { has: page.getByRole('heading', { name: '규칙 버전 비교' }) });
  await version.getByRole('columnheader', { name: 'v2', exact: true }).waitFor();
  await page.locator('section', { has: page.getByRole('heading', { name: '반복 일관성' }) }).locator('tbody tr').first().waitFor();
});

test('실행 기록 CSV에는 모든 실행이 한 줄씩 들어간다', async (t) => {
  const page = await open(t, '/eval');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV 내려받기' }).click()]);
  const text = fs.readFileSync(await download.path(), 'utf8').replace(/^﻿/, '');
  const lines = text.trim().split('\n');
  assert.equal(lines.length, fixture.runs.length + 1);
  assert.ok(lines[0].startsWith('run_id,batch,input_id'));
});

test('집계 파일이 없으면 만드는 방법을 안내하고, 어두운 모드·320px에서도 넘치지 않는다', async (t) => {
  const empty = await open(t, '/eval', { summary: null });
  await empty.getByText('아직 평가 집계가 없어요').waitFor();
  const page = await open(t, '/eval', { width: 320, scheme: 'dark' });
  await page.locator('.safety-card').first().waitFor();
  await noOverflow(page);
});
