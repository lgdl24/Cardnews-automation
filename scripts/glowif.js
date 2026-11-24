// 권한 있는 로컬 AI-Hub ZIP → 제품 누끼와 검토 대기 구성안. 게시나 예약은 호출하지 않아요.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { topics } = require('../config/glowif.json');
const { MARKER, glowifInfo, glowifPlan } = require('./lib/glowif-product');
const { paths, printReport } = require('./lib/common');
const { appendEvent } = require('./lib/events');
const { checkInput } = require('./check-input');
const { validate } = require('./validate');
const { launchBrowser } = require('./lib/card-html');
const { runCodex, generatedPath, codexImageEnv } = require('./ai-card');

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function scan(file) {
  const run = spawnSync(process.env.PYTHON_BIN || 'python3', [path.join(__dirname, 'glowif-scan.py'), path.resolve(file)], {
    encoding: 'utf8', timeout: 60_000,
  });
  if (run.error || run.status !== 0) {
    throw new Error('리뷰 ZIP을 읽지 못했어요. AI-Hub 스킨케어 라벨링 ZIP과 Python 3.11 이상을 확인해 주세요.');
  }
  return JSON.parse(run.stdout);
}

function candidates(stats) {
  return stats.topics.map((hit) => ({
    ...hit, topic: topics.find((topic) => topic.id === hit.id),
    eligible: hit.reviews >= 5 && hit.products >= 3,
  })).filter((hit) => hit.topic).sort((a, b) => b.products - a.products || b.reviews - a.reviews || a.id.localeCompare(b.id));
}

function cutoutPrompt(topic) {
  return `$imagegen Create one fictional GLOWIF Korean skincare product image. Packaging brief: ${topic.imageBrief}
Save a square PNG at ./out.png with a genuine transparent background. One complete product, centered, with room around all sides. Contemporary skincare photography, crisp Korean beauty brand design. The package is a new fictional design. Do not add another product, people, hands, scenes, cast shadows, ingredient or performance claims, or certification badges. Use the image generation tool, with transparency enabled. Reply with only ./out.png.`;
}

async function checkCutout(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG) || bytes.length > 12 * 1024 * 1024) {
    throw new Error('12MB 이하의 투명 제품 PNG를 사용해 주세요.');
  }
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const ok = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      if (image.width < 256 || image.height < 256 || image.width > 4096 || image.height > 4096) return false;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, 128, 128);
      const { data } = ctx.getImageData(0, 0, 128, 128);
      let empty = 0;
      let opaque = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) empty++;
        if (data[i] >= 240) opaque++;
      }
      return empty >= 164 && opaque >= 164 && [3, 511, 65027, 65535].every((i) => data[i] === 0);
    }, `data:image/png;base64,${bytes.toString('base64')}`).catch(() => false);
    if (!ok) throw new Error('제품과 투명 배경이 모두 있는 256~4096px PNG가 필요해요.');
  } finally {
    await browser.close();
  }
}

async function createDraft(stats, candidate, { image, productsDir = path.dirname(paths.product(candidate.topic.slug)) } = {}) {
  const { topic, reviews, products } = candidate;
  const plan = glowifPlan(topic);
  const id = plan.cards.product_id;
  const target = path.join(productsDir, id);
  if (fs.existsSync(target)) {
    if (!glowifInfo(target)) throw new Error(`${id} 이름을 다른 제품이 이미 쓰고 있어요.`);
    return { id, status: 'existing' };
  }
  fs.mkdirSync(productsDir, { recursive: true });
  const lock = path.join(productsDir, `.${id}.lock`);
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('같은 Glowif 초안을 준비하는 작업이 있어요.');
    throw error;
  }
  try {
    if (fs.existsSync(target)) {
      if (!glowifInfo(target)) throw new Error(`${id} 이름을 다른 제품이 이미 쓰고 있어요.`);
      return { id, status: 'existing' };
    }
    const staged = path.join(lock, id);
    const images = path.join(staged, 'images');
    fs.mkdirSync(images, { recursive: true });
    let file = image;
    if (!file) {
      const generation = await runCodex(lock, cutoutPrompt(topic), 360, { image: null, env: codexImageEnv() });
      file = generatedPath(generation.out, lock);
      if (!file) throw new Error('GPT 제품 누끼를 만들지 못했어요. Codex 로그인과 이미지 생성 사용량을 확인해 주세요.');
    }
    await checkCutout(file);
    fs.copyFileSync(file, path.join(images, 'main.png'));
    fs.writeFileSync(path.join(staged, 'input.md'), plan.input);
    fs.writeFileSync(path.join(staged, 'cards.json'), JSON.stringify(plan.cards, null, 2) + '\n');
    fs.writeFileSync(path.join(staged, MARKER), JSON.stringify({ source: stats.source, topic: topic.id, reviews, products, from: stats.from, to: stats.to }, null, 2) + '\n');
    const previous = process.env.CARDNEWS_PRODUCTS_DIR;
    process.env.CARDNEWS_PRODUCTS_DIR = lock;
    try {
      const inputReport = checkInput(id);
      const { report } = validate(id);
      if (inputReport.errors.length || report.errors.length) {
        printReport('제품 입력 확인', inputReport);
        printReport('구성안 검증', report);
        throw new Error('기존 프로젝트 검사에서 오류가 있어 초안을 저장하지 않았어요.');
      }
      appendEvent(id, 'input_submitted', { source: 'glowif' });
    } finally {
      if (previous === undefined) delete process.env.CARDNEWS_PRODUCTS_DIR;
      else process.env.CARDNEWS_PRODUCTS_DIR = previous;
    }
    fs.renameSync(staged, target);
    return { id, status: 'created' };
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { scan: { type: 'boolean' }, topic: { type: 'string' }, image: { type: 'string' } },
  });
  if (positionals.length !== 1) throw new Error('사용법: npm run glowif -- <AI-Hub ZIP> [--scan] [--topic 주제] [--image 투명PNG]');
  const stats = scan(positionals[0]);
  const ranked = candidates(stats);
  console.log(`AI-Hub 리뷰 ${stats.reviews}건 · ${stats.from ?? '?'}~${stats.to ?? '?'}`);
  for (const hit of ranked) {
    console.log(`- ${hit.topic.label} (${hit.id}): 리뷰 ${hit.reviews}건 / 상품명 ${hit.products}개 → ${hit.topic.name}${hit.eligible ? '' : ' (근거 부족)'}`);
  }
  if (values.scan) return;
  const selected = values.topic ? ranked.find((hit) => hit.id === values.topic) : ranked.find((hit) => hit.eligible);
  if (!selected && values.topic) throw new Error('목록에 있는 주제 ID를 입력해 주세요.');
  if (!selected?.eligible) {
    console.log('반복 근거가 충분한 주제가 없어 새 초안을 만들지 않았어요.');
    return;
  }
  const result = await createDraft(stats, selected, { image: values.image && path.resolve(values.image) });
  console.log(result.status === 'created'
    ? `구성안 검토 대기: /studio/${result.id}`
    : `이미 만든 주제예요: /studio/${result.id}`);
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });

module.exports = { scan, candidates, createDraft, cutoutPrompt };
