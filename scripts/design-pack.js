// Claude 디자인용 자료 묶음: 제품 폴더 → Claude 디자인(디자인 캔버스)에 넣을 폴더 하나
// 사용법: node scripts/design-pack.js <제품ID> [--out <폴더>]
//   결과 (기본 products/<제품ID>/output/design-pack/):
//     brief.md      카드뉴스 디자인 지침 — 크기·카드 구성·문구·글자 수 기준·내용 규칙·사진 규칙
//     prompt.md     처음 한 번에 넣을 요청문 (Claude 디자인 화면에 붙여 넣거나 웹 모드 '디자인 시안' 작업 지시문으로 씀)
//     cards.json    카드 문구 (검증 통과한 cards.json에서 디자인에 필요한 칸만)
//     images/       제품 사진: 투명 여백과 사진 아래 붙은 반투명 그림자를 잘라낸 PNG
//     fonts/        Pretendard 400·600·800 (woff2)
//   폴더를 통째로 Claude 디자인에 끌어다 놓거나(Attach codebase), 로컬 Claude Code가 디자인 캔버스를 만들 때 자료로 씀.
//   docs/research/claude-design-test.md
// 환경변수 CHROMIUM_PATH : 시스템에 설치된 Chromium을 쓸 때 실행 파일 경로 (사진 자르기에 브라우저 사용)
const fs = require('fs');
const path = require('path');
const { paths, loadConfig, loadInput, requireProductId, designRecord } = require('./lib/common');
const { validate } = require('./validate');
const { launchBrowser } = require('./lib/card-html');
const { colorModeOf } = require('./lib/color-mood');

// 사진 자르기 기준: 알파가 이 값보다 큰 픽셀만 '제품'으로 봄.
// 상품 사진에는 바닥에 반투명 회색 그림자가 붙어 있는 경우가 많아(달바 퍼플: 알파 36~126) 그대로 쓰면 새 배경 위에서 떠 보임.
const OPAQUE_ALPHA = 200;
const ROLE_LABELS = { cover: '표지', feature: '특징', usage: '사용법', detail: '상세', closing: '마무리' };

function parseArgs(argv) {
  const id = requireProductId(argv);
  const i = argv.indexOf('--out');
  return { id, out: i >= 0 ? argv[i + 1] : null };
}

// 불투명 범위로 잘라 PNG로 저장. 투명 픽셀이 없는 사진(배경 있는 JPG 등)은 그대로 복사
async function trimProduct(page, file, outFile) {
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const src = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  const res = await page.evaluate(async ({ src, min }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    let l = W, t = H, r = -1, b = -1, transparent = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = d[(y * W + x) * 4 + 3];
        if (a < 255) transparent = true;
        if (a <= min) continue;
        if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
      }
    }
    if (!transparent || r < l) return { trimmed: false, width: W, height: H };
    const w = r - l + 1, h = b - t + 1;
    const o = document.createElement('canvas');
    o.width = w; o.height = h;
    o.getContext('2d').drawImage(img, l, t, w, h, 0, 0, w, h);
    return { trimmed: true, width: w, height: h, from: { width: W, height: H, left: l, top: t }, data: o.toDataURL('image/png').split(',')[1] };
  }, { src, min: OPAQUE_ALPHA });
  if (res.trimmed) fs.writeFileSync(outFile, Buffer.from(res.data, 'base64'));
  else fs.copyFileSync(file, outFile);
  delete res.data;
  return res;
}

function limitText(tpl) {
  return Object.entries(tpl.fields).map(([name, f]) => {
    if (name === 'items') return `items ${f.minItems}~${f.maxItems}개, 항목마다 ${f.maxCharsPerItem}자·한 줄 ${f.maxCharsPerLine}자·${f.maxLines}줄 이하`;
    return `${name} ${f.maxChars}자·한 줄 ${f.maxCharsPerLine}자·${f.maxLines}줄 이하${f.required ? '' : ' (선택)'}`;
  }).join(' / ');
}

function buildBrief({ id, product, brand, data, templates, colors, images, design }) {
  const lines = [];
  lines.push(`# 카드뉴스 디자인 지침 — ${product}`, '');
  lines.push('이 폴더는 카드뉴스 제작 자동화 프로젝트가 만든 자료예요. 카드 문구는 이미 검증·승인됐어요. 디자인만 새로 해요.', '');
  lines.push('## 결과물', '');
  lines.push(`- 1080×1080px 정사각 카드 ${data.cards.length}장, 아트보드 하나에 카드 한 장. 파일 이름 \`card-01.dc.html\` ~ \`card-${String(data.cards.length).padStart(2, '0')}.dc.html\`, 한 줄로 나란히`);
  lines.push('- 5장이 한 세트로 넘겨 볼 때 리듬이 있게: 표지는 크게, 특징·사용법은 정보가 잘 읽히게, 마무리는 다시 제품으로 돌아오게. 장마다 모양은 다르되 색·글꼴·여백 규칙은 같게');
  lines.push('- 나중에 HTML 템플릿으로 옮겨 다른 제품에도 씀: 문구 칸마다 `data-field="title"`처럼 칸 이름을 달고, 글자가 기준 길이까지 늘어도 넘치지 않게 칸 크기를 잡아 주세요', '');
  lines.push('## 글꼴·색', '');
  lines.push('- 한글·숫자: Pretendard (`fonts/` 400·600·800). 제목 800, 본문 400~600');
  lines.push('- 영문 장식 글자(라벨·큰 단어)는 Google Fonts 세리프·산세리프 한 벌까지 추가 가능');
  lines.push('- 한글 줄바꿈은 단어 단위: `word-break: keep-all`. 문구 안의 줄바꿈(\\n)은 그 자리에서만 바꿈');
  lines.push(`- 색 기준 (${colors.mode}): ${Object.entries(colors.color).map(([k, v]) => `${k} ${v}`).join(', ')}. 제품 패키지 색에 맞춰 바꿔도 되지만 글자 대비 4.5 이상(24px 이상 큰 글자 3.0)`, '');
  lines.push('## 카드별 문구 (그대로 쓰기)', '');
  lines.push('| 장 | 역할 | 템플릿 | 문구 | 사진 |', '|---|---|---|---|---|');
  for (const c of data.cards) {
    const copy = Object.entries(c.copy || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.map((x) => `「${x}」`).join(' ') : `「${String(v).replace(/\n/g, '⏎')}」`}`).join('<br>');
    lines.push(`| ${c.no} | ${ROLE_LABELS[c.role] || c.role} | ${c.template} | ${copy} | ${c.image ? `images/${path.parse(c.image).name}.png` : '없음'} |`);
  }
  lines.push('', '⏎ = 문구 안 줄바꿈.', '');
  lines.push('## 글자 수 기준 (다른 제품도 이 길이까지 들어와요)', '');
  for (const [name, tpl] of Object.entries(templates)) if (!name.startsWith('_') && tpl && tpl.fields && tpl.label) lines.push(`- ${name}(${tpl.label}): ${limitText(tpl)}`);
  lines.push('');
  lines.push('## 지킬 것', '');
  lines.push('- **문구를 새로 쓰거나 늘리지 않아요.** 원문에 없는 효능·수치·성분·인증을 넣으면 안 돼요(화장품 광고 규정). 위 표의 문구만 쓰고, 꾸밈 글자는 패키지에 적힌 영문·브랜드명 정도만');
  lines.push(`- **제품 사진은 \`images/\`의 실제 사진만** 써요. 제품을 그리거나 AI로 만들지 않아요. 사진은 투명 배경이고 바닥 그림자를 잘라 둔 상태 — 그림자는 새로 그릴 때 빛 방향과 맞춰 접지 그림자만 얇게`);
  for (const im of images) lines.push(`  - \`images/${im.name}\`: ${im.width}×${im.height}px${im.trimmed ? ` (원본 ${im.from.width}×${im.from.height}에서 잘라냄)` : ''}. 크게 키우면 흐려지므로 세로 ${Math.round(im.height * 1.6)}px 이하 권장`);
  lines.push('- 사진이 더 필요하면(제형·모델 등) 만들지 말고 빈 자리에 어떤 사진인지 글자로 적어 주세요');
  lines.push('- 피해야 할 것: 둥근 상자 + 왼쪽 색 띠, 이모지, 화면 전체 무지개 그라데이션, 제품 아래 두꺼운 그림자, 장마다 같은 모양 반복');
  lines.push('');
  lines.push('## 참고', '');
  lines.push(`- 제품ID \`${id}\`${brand ? ` · 브랜드 ${brand}` : ''} · 지금 디자인 묶음 ${design.name}`);
  lines.push('- 지금 출력물이 아쉬운 점: 제품이 카드의 3% 정도로 작음, 단색 배경 + 도형 하나라 깊이감이 없음, 설명 카드가 표처럼 보임');
  return lines.join('\n') + '\n';
}

function buildPrompt({ product, cards }) {
  return [
    `이 폴더의 자료로 '${product}' 카드뉴스 ${cards}장(1080×1080)을 디자인해 줘.`,
    '',
    '- brief.md의 지침을 정확히 따르고, 문구는 cards.json(= brief.md 표) 그대로만 써. 새 문구·효능·수치를 만들지 마.',
    '- 제품은 images/의 실제 사진만 쓰고, 사진이 더 필요하면 빈 자리에 어떤 사진인지 글자로 적어.',
    '- 한글은 fonts/의 Pretendard(400·600·800)를 굵기 차이로 위계 있게 써. 영문 장식 글자는 감도 있는 무료 글꼴 하나까지.',
    '- 고급스럽고 감도 높게, 제품이 주인공이 되게(카드 면적 15% 이상). 깊이감은 빛·여백·겹침으로 내고, 제품 아래 두꺼운 그림자는 넣지 마.',
    '- 5장이 넘겨 볼 때 리듬이 있게 장마다 구성을 다르게 하되, 색·글꼴·여백 규칙은 같게.',
    '- 아트보드 이름은 card-01 ~ card-05, 한 줄로 나란히. 문구 칸마다 data-field로 칸 이름을 달아 줘(나중에 템플릿으로 옮김).',
    '',
  ].join('\n');
}

async function main() {
  const { id, out } = parseArgs(process.argv.slice(2));
  const { report: vReport, data } = validate(id);
  if (vReport.errors.length) { console.error('검증 오류가 있어 멈췄어요. npm run validate로 확인해 주세요.'); process.exit(1); }
  if (data.stage === 'plan') { console.error('구성안 단계(stage: plan)는 문구가 없어 디자인 자료를 만들 수 없어요.'); process.exit(1); }

  const input = loadInput(id);
  const { templates, theme } = loadConfig(input, data);
  const design = designRecord({ input, data });
  const product = (input.info['제품명'] || id).split('\n')[0];
  const brand = (input.info['브랜드'] || '').split('\n')[0];
  const outDir = out ? path.resolve(out) : paths.product(id, 'output', 'design-pack');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'images'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'fonts'), { recursive: true });

  // 카드 색: 가장 최근 출력 보고서의 색(제품 색 포함), 없으면 테마 기본 색
  let colors = { mode: colorModeOf(input, data), color: theme.color };
  const reportFile = paths.product(id, 'output', 'render-report.json');
  if (fs.existsSync(reportFile)) {
    const rc = JSON.parse(fs.readFileSync(reportFile, 'utf8')).colors;
    if (rc && rc.color) colors = { mode: rc.mode, color: rc.color };
  }

  const imageDir = paths.product(id, 'images');
  const used = [...new Set(data.cards.map((c) => c.image).filter(Boolean))].filter((f) => fs.existsSync(path.join(imageDir, f)));
  const images = [];
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    for (const f of used) {
      const name = `${path.parse(f).name}.png`;
      const res = await trimProduct(page, path.join(imageDir, f), path.join(outDir, 'images', name));
      images.push({ name, source: f, ...res });
    }
  } finally {
    await browser.close();
  }

  for (const [weight, rel] of Object.entries(theme.font.files || {})) {
    const src = path.join(paths.root, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, 'fonts', `Pretendard-${weight}.woff2`));
  }

  const cardsOut = {
    product_id: id,
    product,
    cards: data.cards.map((c) => ({ no: c.no, role: c.role, template: c.template, image: c.image ? `images/${path.parse(c.image).name}.png` : null, copy: c.copy })),
  };
  fs.writeFileSync(path.join(outDir, 'cards.json'), JSON.stringify(cardsOut, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'brief.md'), buildBrief({ id, product, brand, data, templates, colors, images, design }));
  fs.writeFileSync(path.join(outDir, 'prompt.md'), buildPrompt({ product, cards: data.cards.length }));

  console.log(`Claude 디자인 자료 묶음: ${path.relative(paths.root, outDir) || outDir}`);
  for (const im of images) console.log(`  사진 ${im.name}: ${im.trimmed ? `${im.from.width}×${im.from.height} → ${im.width}×${im.height} (투명 여백·그림자 잘라냄)` : `${im.width}×${im.height} (그대로)`}`);
  console.log(`  글꼴 ${fs.readdirSync(path.join(outDir, 'fonts')).length}개, 카드 ${data.cards.length}장`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { buildBrief, buildPrompt, OPAQUE_ALPHA };
