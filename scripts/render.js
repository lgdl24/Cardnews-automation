// 카드 출력: cards.json + 템플릿 → HTML → PNG(1080×1080), 렌더링 화면 기준 레이아웃 점검
// 사용법: node scripts/render.js <제품ID> [--card N] [--html-only] [--no-log]
//   --card N     : N번 카드만 다시 출력 (다른 카드 파일은 그대로)
//   --html-only  : PNG 없이 HTML 미리보기만 생성
//   레이아웃 점검 결과는 log.jsonl에 validate_result(check: layout)로 자동 기록됩니다.
// 환경변수 CHROMIUM_PATH : 시스템에 설치된 Chromium을 쓸 때 실행 파일 경로
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { paths, loadConfig, loadInput, createReport, printReport, requireProductId } = require('./lib/common');
const { validate } = require('./validate');
const { appendEvent, resultFields, shouldLog } = require('./lib/events');

function parseArgs(argv) {
  const cardIdx = argv.indexOf('--card');
  const card = cardIdx >= 0 ? Number(argv[cardIdx + 1]) : null;
  const rest = cardIdx >= 0 ? argv.filter((a, i) => i !== cardIdx && i !== cardIdx + 1) : argv;
  return { id: requireProductId(rest), card, htmlOnly: argv.includes('--html-only'), log: shouldLog(argv) };
}

const pad = (n) => String(n).padStart(2, '0');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const toHtmlText = (s) => escapeHtml(s).replace(/\n/g, '<br>');

function buildThemeCss(theme, htmlDir) {
  const faces = Object.entries(theme.font.files).map(([weight, rel]) => {
    const url = path.relative(htmlDir, path.join(paths.root, rel)).split(path.sep).join('/');
    return `@font-face { font-family: '${theme.font.family}'; font-weight: ${weight}; font-display: block; src: url('${url}') format('woff2'); }`;
  });
  const vars = Object.entries(theme.color).map(([k, v]) => `--color-${k}: ${v};`).join(' ');
  return `${faces.join('\n')}\n:root { ${vars} --font-family: '${theme.font.family}'; }`;
}

function buildCardHtml({ card, total, product, tpl, theme, htmlDir, imageDir }) {
  const template = fs.readFileSync(path.join(paths.root, tpl.file), 'utf8');
  const baseCss = fs.readFileSync(path.join(paths.root, 'templates', 'base.css'), 'utf8');
  const copy = card.copy || {};
  const useImage = tpl.image !== 'none' && card.image;
  const imageSrc = useImage
    ? path.relative(htmlDir, path.join(imageDir, card.image)).split(path.sep).join('/')
    : '';

  const values = {
    page: String(card.no),
    total: String(total),
    product: escapeHtml(product),
    image: escapeHtml(imageSrc),
    imageClass: useImage ? 'has-image' : 'no-image',
    items: (copy.items || [])
      .map((t) => `<li class="desc__item"><span class="desc__text" data-fit>${toHtmlText(t)}</span></li>`)
      .join(''),
  };
  for (const field of Object.keys(tpl.fields)) {
    if (field !== 'items') values[field] = toHtmlText(copy[field] || '');
  }

  const body = template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in values ? values[key] : ''));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(product)} - ${pad(card.no)}</title>
<style>
${buildThemeCss(theme, htmlDir)}
${baseCss}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function buildIndexHtml(product, cards) {
  const frames = cards.map((c) => `
    <figure>
      <div class="frame"><iframe src="card-${pad(c.no)}.html" width="1080" height="1080" scrolling="no"></iframe></div>
      <figcaption>${pad(c.no)} · ${escapeHtml(c.role)} · ${escapeHtml(c.template)}</figcaption>
    </figure>`).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(product)} 미리보기</title>
<style>
  body { margin: 0; padding: 32px; background: #eceae7; font-family: sans-serif; }
  h1 { font-size: 20px; margin: 0 0 24px; }
  .grid { display: flex; flex-wrap: wrap; gap: 24px; }
  figure { margin: 0; }
  .frame { width: 360px; height: 360px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
  iframe { border: 0; transform: scale(0.3333); transform-origin: 0 0; }
  figcaption { font-size: 13px; color: #555; margin-top: 8px; }
</style></head>
<body><h1>${escapeHtml(product)} — 카드 ${cards.length}장 미리보기</h1><div class="grid">${frames}</div></body></html>
`;
}

// 렌더링 화면에서 글자 넘침·이미지 로드 실패 점검
async function inspectPage(page) {
  return page.evaluate(() => {
    const issues = [];
    const label = (el) => el.className || el.tagName.toLowerCase();
    document.querySelectorAll('[data-fit]').forEach((el) => {
      if (!el.textContent.trim()) return;
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
        issues.push({ code: 'OVERFLOW', target: label(el), text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 30) });
      }
    });
    const card = document.querySelector('.card');
    if (card && card.scrollHeight > card.clientHeight + 1) {
      issues.push({ code: 'OVERFLOW', target: 'card', text: '카드 전체 높이 초과' });
    }
    document.querySelectorAll('img').forEach((img) => {
      if (img.offsetParent === null) return; // 숨김 처리된 이미지는 제외
      if (!img.complete || img.naturalWidth === 0) {
        issues.push({ code: 'IMAGE_ERROR', target: 'img', text: img.getAttribute('src') });
      }
    });
    // 페이지에서 실제로 쓰인 굵기만 로드되므로, 로드 실패가 없고 1개 이상 로드됐는지로 판단
    const faces = [...document.fonts];
    const fontOk = faces.some((f) => f.status === 'loaded') && !faces.some((f) => f.status === 'error');
    return { issues, fontOk };
  });
}

async function main() {
  const { id, card: onlyCard, htmlOnly, log } = parseArgs(process.argv.slice(2));
  const report = createReport();

  // 검증을 통과한 데이터만 출력
  const { report: vReport, data } = validate(id);
  if (vReport.errors.length) {
    printReport(`데이터 검증: ${id}`, vReport);
    console.error('\n검증 오류가 있어 출력을 중단했어요. 오류를 고친 뒤 다시 실행해 주세요.');
    process.exit(1);
  }
  if (data.stage === 'plan') {
    console.error('구성안 단계(stage: plan)는 문구가 없어 출력할 수 없어요.');
    process.exit(1);
  }

  const { templates, theme } = loadConfig();
  const input = loadInput(id);
  const product = (input.info['제품명'] || id).split('\n')[0];
  const outDir = paths.product(id, 'output');
  const htmlDir = path.join(outDir, 'html');
  const pngDir = path.join(outDir, 'png');
  const imageDir = paths.product(id, 'images');
  fs.mkdirSync(htmlDir, { recursive: true });
  fs.mkdirSync(pngDir, { recursive: true });

  if (onlyCard !== null && !data.cards.some((c) => c.no === onlyCard)) {
    console.error(`${onlyCard}번 카드가 없어요.`);
    process.exit(2);
  }
  const targets = data.cards.filter((c) => onlyCard === null || c.no === onlyCard);

  // HTML 생성
  for (const card of targets) {
    const html = buildCardHtml({
      card, total: data.cards.length, product, tpl: templates[card.template], theme, htmlDir, imageDir,
    });
    fs.writeFileSync(path.join(htmlDir, `card-${pad(card.no)}.html`), html);
  }
  fs.writeFileSync(path.join(htmlDir, 'index.html'), buildIndexHtml(product, data.cards));
  console.log(`HTML ${targets.length}장 생성: ${path.relative(paths.root, htmlDir)}`);
  if (htmlOnly) return;

  // PNG 출력 + 점검
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('playwright가 설치되어 있지 않아요. npm install 후 npx playwright install chromium 을 실행해 주세요.');
    process.exit(1);
  }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: theme.size, deviceScaleFactor: 1 });
  const results = [];
  try {
    for (const card of targets) {
      const htmlFile = path.join(htmlDir, `card-${pad(card.no)}.html`);
      await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const { issues, fontOk } = await inspectPage(page);
      const pngFile = path.join(pngDir, `card-${pad(card.no)}.png`);
      await page.screenshot({ path: pngFile, clip: { x: 0, y: 0, ...theme.size } });

      const where = `${card.no}번 카드`;
      if (!fontOk) report.warn(where, `웹폰트(${theme.font.family})를 불러오지 못했어요. npm install을 확인해 주세요`);
      for (const it of issues) {
        report.error(it.code, `${where} ${it.target}`, it.code === 'OVERFLOW' ? `글자가 영역을 넘쳐요: "${it.text}…"` : `이미지를 불러오지 못했어요: ${it.text}`);
      }
      results.push({ no: card.no, png: path.relative(paths.root, pngFile), issues, fontOk });
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(
    path.join(outDir, onlyCard === null ? 'render-report.json' : `render-report-card-${pad(onlyCard)}.json`),
    JSON.stringify({ product_id: id, rendered_at: new Date().toISOString(), results }, null, 2),
  );
  console.log(`PNG ${targets.length}장 저장: ${path.relative(paths.root, pngDir)}`);
  printReport(`레이아웃 점검: ${id}`, report);
  if (log) {
    appendEvent(id, 'validate_result', resultFields('layout', report, {
      stage: data.stage,
      rendered_cards: targets.map((c) => c.no),
    }));
  }
  process.exit(report.errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
