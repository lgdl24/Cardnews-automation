// 디자인 묶음이 시안과 같은 배치·색을 유지하는지 점검 (#74 시안 충실도)
// tests/fixtures/design-fidelity.json의 기준값은 시안 이미지(1080 기준)에서 잰 좌표·색을 우리 출력으로 맞춘 값이에요.
// 템플릿을 고쳐 주요 요소가 기준에서 tol(px) 넘게 움직이거나 색이 바뀌면 실패해요. 시안을 바꿀 때만 기준값을 고쳐요.
//   기준값 다시 뽑기: FIDELITY_PRINT=1 node --test tests/design-fidelity.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('./helpers');
const { loadConfig } = require('../scripts/lib/common');
const { buildCardHtml, waitForFit, launchBrowser } = require('../scripts/lib/card-html');

const SPEC = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-fidelity.json'), 'utf8'));
const IMAGE_DIR = path.join(ROOT, 'products', 'toneup-sunscreen', 'images');
const PRINT = process.env.FIDELITY_PRINT === '1';

// 글자 요소는 실제 글자 영역(Range), 도형·사진 칸은 요소 상자
async function boxesOf(page, checks) {
  return page.evaluate((checks) => checks.map((c) => {
    const el = document.querySelector(c.sel);
    if (!el) return null;
    let r = el.getBoundingClientRect();
    if (c.text) { const rg = document.createRange(); rg.selectNodeContents(el); r = rg.getBoundingClientRect(); }
    const cs = getComputedStyle(el);
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize };
  }), checks);
}

const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const toHex = (s) => '#' + rgb(s).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

for (const [design, spec] of Object.entries(SPEC.designs)) {
  test(`${design}: 시안(${spec.draft}) 배치·색 유지`, async () => {
    const { templates, theme } = loadConfig({ cond: { 무드: design } });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-fidelity-'));
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: theme.size, deviceScaleFactor: 1 });
    const printed = {};
    try {
      for (const kase of spec.cases) {
        const tpl = templates[kase.template];
        const card = { no: kase.no, role: kase.role, template: kase.template, image: kase.image ? 'main.png' : null, copy: kase.copy };
        const html = buildCardHtml({ card, cards: [card], total: 5, product: '브랜드명 자리', tpl, theme, htmlDir: dir, imageDir: IMAGE_DIR });
        const file = path.join(dir, `${kase.name}.html`);
        fs.writeFileSync(file, html);
        await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await waitForFit(page);
        const got = await boxesOf(page, kase.checks);
        if (PRINT) { printed[kase.name] = kase.checks.map((c, i) => ({ sel: c.sel, ...got[i], background: got[i] && toHex(got[i].background), color: got[i] && toHex(got[i].color) })); continue; }
        kase.checks.forEach((c, i) => {
          const g = got[i];
          const where = `${design} ${kase.name} ${c.sel}`;
          assert.ok(g, `${where}: 요소 없음`);
          const tol = c.tol ?? SPEC.tol;
          for (const k of ['left', 'top', 'width', 'height']) {
            if (c[k] === undefined) continue;
            assert.ok(Math.abs(g[k] - c[k]) <= tol, `${where}: ${k} ${g[k]} (기준 ${c[k]} ±${tol})`);
          }
          for (const k of ['background', 'color']) {
            if (!c[k]) continue;
            assert.ok(dist(rgb(g[k]), hexRgb(c[k])) <= SPEC.colorTol, `${where}: ${k} ${toHex(g[k])} (기준 ${c[k]})`);
          }
        });
      }
    } finally {
      await browser.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
    if (PRINT) console.log(design, JSON.stringify(printed, null, 1));
  });
}
