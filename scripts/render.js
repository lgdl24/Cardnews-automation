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
const { pad, buildCardHtml, buildIndexHtml, inspectPage, launchBrowser } = require('./lib/card-html');

function parseArgs(argv) {
  const cardIdx = argv.indexOf('--card');
  const card = cardIdx >= 0 ? Number(argv[cardIdx + 1]) : null;
  const rest = cardIdx >= 0 ? argv.filter((a, i) => i !== cardIdx && i !== cardIdx + 1) : argv;
  return { id: requireProductId(rest), card, htmlOnly: argv.includes('--html-only'), log: shouldLog(argv) };
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
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const page = await browser.newPage({ viewport: theme.size, deviceScaleFactor: 1 });
  const results = [];
  try {
    for (const card of targets) {
      const htmlFile = path.join(htmlDir, `card-${pad(card.no)}.html`);
      await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const { issues, overlaps, fontOk } = await inspectPage(page);
      const pngFile = path.join(pngDir, `card-${pad(card.no)}.png`);
      await page.screenshot({ path: pngFile, clip: { x: 0, y: 0, ...theme.size } });

      const where = `${card.no}번 카드`;
      if (!fontOk) report.warn(where, `웹폰트(${theme.font.family})를 불러오지 못했어요. npm install을 확인해 주세요`);
      for (const o of overlaps) report.warn(`${where} ${o.target}`, `글자가 제품 이미지와 ${o.px}px 겹쳐요. 이미지 여백을 확인해 주세요`);
      for (const it of issues) {
        report.error(it.code, `${where} ${it.target}`, it.code === 'OVERFLOW' ? `글자가 영역을 넘쳐요: "${it.text}…"` : `이미지를 불러오지 못했어요: ${it.text}`);
      }
      results.push({ no: card.no, png: path.relative(paths.root, pngFile), issues, overlaps, fontOk });
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
