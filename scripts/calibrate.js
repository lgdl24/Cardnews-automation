// 글자 수 기준 측정: 템플릿을 실제로 출력해서 칸마다 넘치기 직전 글자 수를 잰다.
// 사용법:
//   node scripts/calibrate.js           칸별 최대 글자 수 측정 (현재 기준과 비교)
//   node scripts/calibrate.js --check   모든 칸을 기준 글자 수까지 채워도 넘치거나 이미지와 겹치지 않는지 확인 (실패 시 종료 코드 1)
//   node scripts/calibrate.js --json    결과를 JSON으로 출력
// 템플릿 CSS나 config/templates.json을 고쳤으면 --check로 확인합니다. (npm run test:render에 포함)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { paths, loadConfig, countChars } = require('./lib/common');
const { buildCardHtml, inspectPage, launchBrowser } = require('./lib/card-html');

// 측정용 문장 유형: 줄바꿈 위치가 달라지므로 여러 유형 중 가장 적게 들어가는 값을 기준으로 삼음
const PATTERNS = {
  '한글 문장': '피부 톤을 자연스럽게 밝혀 주는 가벼운 로션 제형의 데일리 선크림 메이크업 전 단계에 바르기 좋아요 ',
  '긴 단어': '자연스러운톤업 끈적임없는로션 메이크업전단계 데일리선크림 백탁없는밀착력 ',
  '영문·숫자 섞임': 'SPF50+ PA++++ 자외선 차단 WATERPROOF 50ml 판테놀 함유 MADE IN KOREA ',
};

const SAMPLE_PRODUCT = '데일리 글로우 톤업 선크림';
const SAMPLE_IMAGE_DIR = path.join(paths.root, 'products', 'toneup-sunscreen', 'images');
const SAMPLE_IMAGE = 'main.png';

// pattern을 반복해 정확히 n자(줄바꿈 제외) 문자열을 만든다. 앞뒤 공백은 글자로 바꿈
function makeText(pattern, n) {
  const chars = [];
  while (chars.length < n) chars.push(...pattern);
  const out = chars.slice(0, n);
  if (out[0] === ' ') out[0] = '톤';
  if (out[out.length - 1] === ' ') out[out.length - 1] = '요';
  return out.join('');
}

function createRenderer(page, theme, templates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-calibrate-'));
  let seq = 0;
  async function check(templateKey, copy, { image = true } = {}) {
    const tpl = templates[templateKey];
    const card = { no: 1, template: templateKey, image: tpl.image !== 'none' && image ? SAMPLE_IMAGE : null, copy };
    const html = buildCardHtml({ card, total: 5, product: SAMPLE_PRODUCT, tpl, theme, htmlDir: dir, imageDir: SAMPLE_IMAGE_DIR });
    seq += 1;
    const file = path.join(dir, `c${seq}.html`);
    fs.writeFileSync(file, html);
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const { issues, overlaps, fontOk } = await inspectPage(page);
    // 칸마다 실제 줄 수 (줄 높이 기준)
    const lines = await page.evaluate(() => [...document.querySelectorAll('[data-fit]')]
      .filter((el) => el.textContent.trim())
      .map((el) => ({
        text: el.textContent.replace(/\s/g, ''),
        lines: Math.round(el.scrollHeight / parseFloat(getComputedStyle(el).lineHeight)),
      })));
    fs.rmSync(file);
    return { ok: issues.length === 0 && overlaps.length === 0, issues, overlaps, fontOk, lines };
  }
  return { check, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// 측정하는 칸 외에는 필수 칸만 짧게 채움
function baseCopy(tpl) {
  const copy = {};
  for (const [field, rule] of Object.entries(tpl.fields)) {
    if (!rule.required) continue;
    copy[field] = field === 'items' ? ['짧은 항목'] : '짧은 제목';
  }
  return copy;
}

// 칸 하나에 들어가는 최대 글자 수 (이진 탐색)
//   mode 'total': 넘치지 않는 최대 글자 수 / mode 'line': 자동 줄바꿈 없이 한 줄에 들어가는 최대 글자 수
async function capacity(r, templateKey, tpl, field, pattern, mode = 'total') {
  let lo = 0;
  let hi = 120;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const copy = baseCopy(tpl);
    const text = makeText(pattern, mid);
    copy[field] = field === 'items' ? [text] : text;
    const res = await r.check(templateKey, copy);
    let ok = res.ok;
    if (ok && mode === 'line') {
      const el = res.lines.find((l) => l.text === text.replace(/\s/g, ''));
      ok = Boolean(el) && el.lines <= 1;
    }
    if (ok) lo = mid; else hi = mid - 1;
  }
  return lo;
}

const ruleOf = (field, rule) => ({
  total: field === 'items' ? rule.maxCharsPerItem : rule.maxChars,
  perLine: rule.maxCharsPerLine,
  maxLines: rule.maxLines,
});

// 모든 칸을 기준 글자 수까지 채운 최악의 경우
function fullCopy(tpl, pattern) {
  const copy = {};
  for (const [field, rule] of Object.entries(tpl.fields)) {
    if (field === 'items') {
      copy.items = Array.from({ length: rule.maxItems }, (_, i) => makeText(pattern.slice(i * 7) + pattern.slice(0, i * 7), rule.maxCharsPerItem));
    } else {
      copy[field] = makeText(pattern, rule.maxChars);
    }
  }
  return copy;
}

async function measure({ fullOnly = false } = {}) {
  const { templates, theme } = loadConfig();
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: theme.size, deviceScaleFactor: 1 });
  const r = createRenderer(page, theme, templates);
  const fields = [];
  const full = [];
  let fontOk = true;
  try {
    for (const [key, tpl] of Object.entries(templates)) {
      if (key.startsWith('_')) continue;

      // 1) 최악의 경우: 모든 칸을 기준까지 채움 (이미지 있음·없음)
      const imageCases = tpl.image === 'optional' ? [true, false] : [tpl.image !== 'none'];
      for (const [pname, pattern] of Object.entries(PATTERNS)) {
        for (const image of imageCases) {
          const copy = fullCopy(tpl, pattern);
          const res = await r.check(key, copy, { image });
          fontOk = fontOk && res.fontOk;
          full.push({ template: key, pattern: pname, image, ok: res.ok, issues: res.issues, overlaps: res.overlaps });
        }
      }
      if (fullOnly) continue;

      // 2) 칸별 최대 글자 수 (전체, 한 줄)
      for (const [field, rule] of Object.entries(tpl.fields)) {
        const byPattern = {};
        const lineByPattern = {};
        for (const [pname, pattern] of Object.entries(PATTERNS)) {
          byPattern[pname] = await capacity(r, key, tpl, field, pattern, 'total');
          lineByPattern[pname] = await capacity(r, key, tpl, field, pattern, 'line');
        }
        const capTotal = Math.min(...Object.values(byPattern));
        const capLine = Math.min(...Object.values(lineByPattern));
        const limit = ruleOf(field, rule);
        fields.push({
          template: key,
          field,
          limit,
          capacity: { total: capTotal, perLine: capLine },
          byPattern,
          lineByPattern,
          ok: limit.total <= capTotal && (limit.perLine === undefined || limit.perLine <= capLine),
        });
      }
    }
  } finally {
    r.cleanup();
    await browser.close();
  }
  return { fields, full, fontOk };
}

function printResult({ fields, full, fontOk }) {
  if (!fontOk) console.log('[경고] 웹폰트를 불러오지 못해 측정값이 실제와 다를 수 있어요. npm install을 확인해 주세요.');
  if (fields.length) {
    console.log('\n== 칸별 최대 글자 수 (줄바꿈 제외, 측정 문장 유형 중 최소값) ==');
    console.log(`문장 유형: ${Object.keys(PATTERNS).join(' / ')}`);
    console.log('템플릿       칸         기준(전체/한 줄)  측정 최대(전체/한 줄)  전체 유형별 / 한 줄 유형별');
    for (const f of fields) {
      const lim = `${f.limit.total}/${f.limit.perLine ?? '-'}`;
      const cap = `${f.capacity.total}/${f.capacity.perLine}`;
      console.log(
        `${f.template.padEnd(12)} ${f.field.padEnd(9)} ${lim.padStart(14)}  ${cap.padStart(19)}    `
        + `${Object.values(f.byPattern).join('·')} / ${Object.values(f.lineByPattern).join('·')}`
        + (f.ok ? '' : '  ← 기준이 측정 최대보다 커요'),
      );
    }
  }
  console.log('\n== 모든 칸을 기준 글자 수까지 채운 경우 ==');
  for (const c of full) {
    const tag = c.ok ? '통과' : '실패';
    const detail = [
      ...c.issues.map((i) => `${i.code} ${i.target}`),
      ...c.overlaps.map((o) => `이미지 겹침 ${o.target} ${o.px}px`),
    ].join(', ');
    console.log(`[${tag}] ${c.template} · ${c.pattern} · 이미지 ${c.image ? '있음' : '없음'}${detail ? ` — ${detail}` : ''}`);
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  measure({ fullOnly: checkOnly })
    .then((res) => {
      if (argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
      else printResult(res);
      const failed = res.full.some((c) => !c.ok) || res.fields.some((f) => !f.ok);
      process.exit(failed ? 1 : 0);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}

module.exports = { measure, makeText, PATTERNS, countChars };
