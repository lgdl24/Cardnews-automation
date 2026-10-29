// 피그마 출력 시험(대안 2): cards.json → 피그마 채움 명세 + use_figma에 넘길 코드
// 사용법: node scripts/figma-spec.js <제품ID> [--card N]
//   결과: products/<제품ID>/output/figma/
//     spec.json          카드별 채울 값(컴포넌트·변형·문구·사진 자리)과 올릴 사진 목록
//     fill-card-NN.js    카드 하나를 피그마에 만드는 코드 (컴포넌트 인스턴스 → 문구·사진 채움 → 넘침 점검 결과 반환)
//   순서·도구는 docs/research/figma-render-test.md '실행 순서'.
//   사진은 원본 그대로 피그마에 올리고(upload_assets, 올릴 파일 이름 = upload_name + 확장자 → 레이어 이름 = upload_name),
//   투명 여백은 HTML 출력과 같은 범위로 피그마 이미지 자르기(CROP)로 처리한다.
//   지금은 시험 범위만: 디자인 '기본'의 표지형(cover) 카드. 다른 템플릿·디자인은 건너뛰고 목록에 남김.
// 환경변수 CHROMIUM_PATH : 시스템에 설치된 Chromium을 쓸 때 실행 파일 경로 (사진 여백 계산에 브라우저 사용)
const fs = require('fs');
const path = require('path');
const { paths, loadConfig, loadInput, requireProductId, designRecord } = require('./lib/common');
const { validate } = require('./validate');
const { pad, launchBrowser } = require('./lib/card-html');
const { colorModeOf, readPixels } = require('./lib/color-mood');

// 피그마 시험 파일의 구성 (docs/research/figma-render-test.md)
const FIGMA = {
  templatePage: '템플릿',
  page: '출력',
  uploadsFrame: '_uploads',
  components: {
    기본: { cover: { set: 'cover (기본)', variant: (card) => (card.role === 'closing' ? 'role=closing' : 'role=cover') } },
  },
  // HTML 템플릿과 같은 글자 칸 높이(templates/cover.html max-height). 넘으면 OVERFLOW
  maxHeight: { title: 196, subtitle: 105 },
};

function parseArgs(argv) {
  const id = requireProductId(argv);
  const i = argv.indexOf('--card');
  return { id, card: i >= 0 ? Number(argv[i + 1]) : null };
}

// 사진 투명 여백 범위: render.js와 같은 readPixels 경계(비율)
async function imageBounds(page, file) {
  const { bounds } = await readPixels(page, file, { withBounds: true });
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const size = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  }, `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`);
  return { bounds: bounds || { left: 0, top: 0, width: 1, height: 1 }, ...size };
}

function fillCode(entry) {
  return `// ${entry.file}: ${entry.component} / ${entry.variant}
const spec = ${JSON.stringify(entry)};
const page = figma.root.children.find(p => p.name === ${JSON.stringify(FIGMA.page)});
await figma.setCurrentPageAsync(page);
const tplPage = figma.root.children.find(p => p.name === ${JSON.stringify(FIGMA.templatePage)});
await tplPage.loadAsync();
const set = tplPage.findOne(n => n.type === 'COMPONENT_SET' && n.name === spec.component);
if (!set) throw new Error('컴포넌트 없음: ' + spec.component);
const variant = set.children.find(c => c.name === spec.variant);
if (!variant) throw new Error('변형 없음: ' + spec.variant);
const props = set.componentPropertyDefinitions;
const keyOf = (n) => Object.keys(props).find(k => k.split('#')[0] === n);

// 사진: upload_assets로 올린 레이어(이름 = upload_name)의 이미지를 찾고, 정리용 '_uploads' 틀로 옮겨 숨김
let imageHash = null;
if (spec.image) {
  let box = page.findOne(n => n.type === 'FRAME' && n.name === ${JSON.stringify(FIGMA.uploadsFrame)});
  if (!box) { box = figma.createFrame(); box.name = ${JSON.stringify(FIGMA.uploadsFrame)}; box.resize(10, 10); box.x = -4000; box.visible = false; page.appendChild(box); }
  const asset = page.findOne(n => n.name === spec.image.upload_name && 'fills' in n && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE'));
  if (!asset) throw new Error('올린 사진이 없어요: ' + spec.image.upload_name + ' (upload_assets 먼저)');
  imageHash = asset.fills.find(f => f.type === 'IMAGE').imageHash;
  if (asset.parent !== box) box.appendChild(asset);
}

// 같은 카드 이름의 이전 출력은 지우고 다시 만듦 (요청 카드만 재출력)
for (const old of page.findAll(n => n.type === 'INSTANCE' && n.name === spec.file)) old.remove();
const inst = variant.createInstance();
inst.name = spec.file;
inst.x = (spec.no - 1) * 1160; inst.y = 0;
page.appendChild(inst);
await Promise.all(inst.findAll(n => n.type === 'TEXT').flatMap(t => t.getRangeAllFontNames(0, Math.max(1, t.characters.length))).map(f => figma.loadFontAsync(f)));
const values = {};
for (const [k, v] of Object.entries(spec.props)) { const key = keyOf(k); if (key) values[key] = v; }
inst.setProperties(values);

// 사진: 'image' 레이어는 사진 칸(420×(무대 높이-80))을 꽉 채움. 인스턴스에서는 레이어 크기·위치를 바꿀 수 없어서
// 크기 대신 '사진의 어느 범위를 보여줄지'(CROP 창)를 계산해 HTML의 object-fit: contain + object-position: center bottom을 흉내 냄.
// 제품 둘레의 투명 여백이 빈 공간 역할을 함. 창이 사진 밖으로 나가야 하면 사진 안으로 붙이고 clamped로 알림
const imgNode = inst.findOne(n => n.name === 'image');
let clamped = false;
if (spec.image) {
  const b = spec.image.bounds, W = spec.image.width, H = spec.image.height;
  const px = { l: b.left * W, t: b.top * H, w: b.width * W, h: b.height * H };  // 제품 범위(px)
  const ar = imgNode.width / imgNode.height;                                    // 칸 비율
  let rw, rh;                                                                    // 보여줄 창(px)
  if (px.w / px.h > ar) { rw = px.w; rh = px.w / ar; } else { rh = px.h; rw = px.h * ar; }
  let rx = px.l + px.w / 2 - rw / 2, ry = px.t + px.h - rh;                     // 가운데·아래 맞춤
  if (rw > W) { rw = W; clamped = true; } if (rh > H) { rh = H; clamped = true; }
  if (rx < 0) { rx = 0; clamped = true; } if (rx + rw > W) { rx = W - rw; clamped = true; }
  if (ry < 0) { ry = 0; clamped = true; } if (ry + rh > H) { ry = H - rh; clamped = true; }
  imgNode.fills = [{ type: 'IMAGE', imageHash, scaleMode: 'CROP', imageTransform: [[rw / W, 0, rx / W], [0, rh / H, ry / H]] }];
} else {
  imgNode.visible = false;
  for (const n of inst.findAll(n => n.name === 'floor-shadow')) n.visible = false;
}

// 넘침 점검: HTML 템플릿의 글자 칸 높이와 같은 기준
const issues = [];
for (const [name, max] of Object.entries(spec.maxHeight)) {
  const t = inst.findOne(n => n.type === 'TEXT' && n.name === name);
  if (t && t.visible && t.height > max + 1) issues.push({ code: 'OVERFLOW', field: name, height: Math.round(t.height), max });
}
const stage = inst.findOne(n => n.name === 'stage');
if (clamped) issues.push({ code: 'IMAGE_FIT', note: '사진 여백이 모자라 제품 위치가 HTML과 다를 수 있음' });
return { createdNodeIds: [inst.id], instanceId: inst.id, file: spec.file, imageHash, stageHeight: Math.round(stage.height), issues };
`;
}

async function main() {
  const { id, card: onlyCard } = parseArgs(process.argv.slice(2));
  const { report: vReport, data } = validate(id);
  if (vReport.errors.length) { console.error('검증 오류가 있어 멈췄어요. npm run validate로 확인해 주세요.'); process.exit(1); }
  if (data.stage === 'plan') { console.error('구성안 단계(stage: plan)는 문구가 없어 만들 수 없어요.'); process.exit(1); }

  const input = loadInput(id);
  loadConfig(input, data);
  const design = designRecord({ input, data });
  const product = (input.info['제품명'] || id).split('\n')[0];
  const mode = colorModeOf(input, data);
  const comps = FIGMA.components[design.name];
  if (!comps) { console.error(`디자인 '${design.name}'은 아직 피그마 템플릿이 없어요. (시험 범위: 기본)`); process.exit(1); }
  if (mode !== '기본') console.warn(`[경고] 카드 색이 '${mode}'이지만 시험 템플릿은 기본 색만 써요.`);
  if (onlyCard !== null && !data.cards.some((c) => c.no === onlyCard)) { console.error(`${onlyCard}번 카드가 없어요.`); process.exit(2); }

  const outDir = paths.product(id, 'output', 'figma');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^fill-card-.*\.js$/.test(f) && (onlyCard === null || f === `fill-card-${pad(onlyCard)}.js`)) fs.unlinkSync(path.join(outDir, f));
  const imageDir = paths.product(id, 'images');
  const targets = data.cards.filter((c) => onlyCard === null || c.no === onlyCard);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const images = new Map();
  const cards = [];
  const skipped = [];
  try {
    for (const card of targets) {
      const comp = comps[card.template];
      if (!comp) { skipped.push({ no: card.no, template: card.template }); continue; }
      let image = null;
      if (card.image && fs.existsSync(path.join(imageDir, card.image))) {
        if (!images.has(card.image)) {
          const res = await imageBounds(page, path.join(imageDir, card.image));
          images.set(card.image, {
            file: path.relative(paths.root, path.join(imageDir, card.image)).split(path.sep).join('/'),
            upload_name: `${id}__${path.parse(card.image).name}`,  // 피그마가 확장자를 떼고 레이어 이름으로 씀
            width: res.width,
            height: res.height,
            bounds: res.bounds,
          });
        }
        const im = images.get(card.image);
        image = { upload_name: im.upload_name, width: im.width, height: im.height, bounds: im.bounds };
      }
      const copy = card.copy || {};
      const entry = {
        no: card.no,
        file: `card-${pad(card.no)}`,
        component: comp.set,
        variant: comp.variant(card),
        props: {
          title: copy.title || '',
          subtitle: copy.subtitle || '',
          badge: copy.badge || '',
          page: `${card.no} / ${data.cards.length}`,
          product,
          showBadge: Boolean(copy.badge),
          showSubtitle: Boolean(copy.subtitle),
        },
        image,
        maxHeight: FIGMA.maxHeight,
      };
      cards.push(entry);
      fs.writeFileSync(path.join(outDir, `fill-${entry.file}.js`), fillCode(entry));
    }
  } finally {
    await browser.close();
  }

  const spec = { product_id: id, design: design.name, color_mode: mode, figma: { template_page: FIGMA.templatePage, page: FIGMA.page, uploads: FIGMA.uploadsFrame }, images: [...images.values()], cards, skipped };
  fs.writeFileSync(path.join(outDir, 'spec.json'), JSON.stringify(spec, null, 2) + '\n');
  console.log(`피그마 채움 명세: ${path.relative(paths.root, outDir)} — 카드 ${cards.length}장, 사진 ${images.size}장`);
  for (const im of images.values()) console.log(`  올릴 사진: ${im.file} → 레이어 이름 ${im.upload_name}`);
  if (skipped.length) console.log(`  건너뜀(시험 범위 밖): ${skipped.map((s) => `${s.no}번(${s.template})`).join(', ')}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { FIGMA, fillCode, imageBounds };
