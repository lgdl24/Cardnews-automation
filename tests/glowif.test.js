const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { topics } = require('../config/glowif.json');
const caution = require('../config/caution-expressions.json');
const { scan, candidates } = require('../scripts/glowif');
const { glowifPlan } = require('../scripts/lib/glowif-product');
const { aiTargets, cardKey, appliedNumbers } = require('../scripts/lib/ai-cards');
const { codexImageEnv, buildGlowifPrompt } = require('../scripts/ai-card');
const { publishCheck } = require('../scripts/lib/publish-check');
const { createStudio } = require('../scripts/lib/studio-api');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3d8b1a40000000049454e44ae426082', 'hex');
const bin = process.env.PYTHON_BIN || 'python3';

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-glowif-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fixture(dir, topic = topics[0]) {
  const { input, cards, copy } = glowifPlan(topic);
  const productDir = path.join(dir, cards.product_id);
  fs.mkdirSync(path.join(productDir, 'images'), { recursive: true });
  fs.writeFileSync(path.join(productDir, 'input.md'), input);
  fs.writeFileSync(path.join(productDir, 'images', 'main.png'), PNG);
  fs.writeFileSync(path.join(productDir, 'glowif.json'), JSON.stringify({ source: 'aihub-71603', topic: topic.id, reviews: 8, products: 3, from: '20220101', to: '20220110' }));
  cards.stage = 'copy';
  cards.cards.forEach((card, i) => { card.copy = copy[i]; });
  const file = path.join(productDir, 'cards.json');
  const save = () => fs.writeFileSync(file, JSON.stringify(cards));
  save();
  return { file, productDir, cards, save };
}

test('Glowif ZIP: 부정 스킨케어 리뷰만 집계하며 원문과 상품명은 출력하지 않아요', (t) => {
  const dir = temp(t);
  const zip = path.join(dir, 'sample.zip');
  const row = (n, product, polarity = '-1') => ({
    Index: n, Source: '쇼핑몰', Domain: '화장품', MainCategory: '스킨케어',
    ProductName: product, RawText: `PRIVATE-${n}`, RDate: '20220101',
    Aspects: [{ Aspect: '사용감', SentimentPolarity: polarity, SentimentText: '너무 끈적해요' }],
  });
  const rows = [0, 1, 2, 3, 4].map((n) => row(n, `STORE-${n % 3}`));
  rows.push(row(0, 'OTHER'), { ...row(5, 'STORE-1'), RawText: 'PRIVATE-1' }, row(6, 'STORE-4', '1'));
  const packed = spawnSync(bin, ['-c', 'import sys, zipfile; z=zipfile.ZipFile(sys.argv[1], "w"); z.writestr("Sample/쇼핑몰/스킨케어.json", sys.stdin.read()); z.close()', zip], {
    input: JSON.stringify(rows), encoding: 'utf8',
  });
  assert.equal(packed.status, 0, packed.stderr);
  const stats = scan(zip);
  assert.equal(stats.reviews, 6);
  assert.deepEqual(stats.topics[0], { id: 'sticky-finish', reviews: 5, products: 3 });
  assert.equal(candidates(stats)[0].eligible, true);
  assert.equal(candidates(stats)[1].eligible, false);
  assert.doesNotMatch(JSON.stringify(stats), /PRIVATE|STORE|OTHER/);
});

test('Glowif 문구는 세 주제 모두 검증을 통과하고 부제나 마무리 규칙이 틀리면 막혀요', (t) => {
  const dir = temp(t);
  const validate = (id) => spawnSync(process.execPath, ['scripts/validate.js', id, '--no-log'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, CARDNEWS_PRODUCTS_DIR: dir, CARDNEWS_NO_LOG: '1' },
  });
  for (const topic of topics) {
    const { cards, save } = fixture(dir, topic);
    const good = validate(cards.product_id);
    assert.equal(good.status, 0, good.stdout);
    assert.match(good.stdout, /주의 표현 0건/);
    cards.cards[0].copy.subtitle = topic.name;
    cards.cards[4].copy.title = '써보고 싶나요?';
    save();
    const invalid = validate(cards.product_id);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stdout, /1번 카드.copy.subtitle/);
    assert.match(invalid.stdout, /5번 카드.copy/);
  }
});

test('Glowif 작업실은 자동 생성 제품만 찾고 현재 버전의 GPT 카드 5장 전에는 승인·게시를 막아요', async (t) => {
  const dir = temp(t);
  const { productDir, cards } = fixture(dir);
  const manual = path.join(dir, 'manual');
  fs.mkdirSync(manual);
  fs.writeFileSync(path.join(manual, 'input.md'), '# 제품 정보\n\n## 제품명\n수동 제품');
  const studio = createStudio({ productsDir: dir, aiAuto: false, scheduleEnabled: false });
  const server = http.createServer((req, res) => studio.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/studio/products`;
  const id = cards.product_id;
  const detail = () => fetch(`${base}/${id}`).then((r) => r.json());
  const approve = () => fetch(`${base}/${id}/approve`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-studio': '1' },
    body: JSON.stringify({ stage: 'final' }),
  });
  const list = await fetch(`${base}?source=glowif`).then((r) => r.json());
  assert.deepEqual(list.products.map((p) => p.id), [id]);
  assert.equal(list.products[0].glowif.label, '바른 뒤 끈적임');
  assert.equal((await fetch(base).then((r) => r.json())).products.length, 2);
  assert.deepEqual((await detail()).ai_card.targets, [1, 2, 3, 4, 5]);
  assert.deepEqual(aiTargets(cards.cards, manual), [1, 5]);
  assert.equal((await approve()).status, 409);

  const aiDir = path.join(productDir, 'output', 'ai-card');
  const outDir = path.join(productDir, 'output', 'png');
  fs.mkdirSync(aiDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const aiRecords = cards.cards.map((card) => {
    const file = `card-0${card.no}.png`;
    fs.writeFileSync(path.join(aiDir, file), PNG);
    fs.writeFileSync(path.join(outDir, file), PNG);
    return { no: card.no, file, ok: true, key: cardKey(card, productDir) };
  });
  const reportFile = path.join(aiDir, 'ai-card.json');
  fs.writeFileSync(reportFile, JSON.stringify({ cards: aiRecords.slice(0, 4) }));
  const gate = () => publishCheck({ productDir, data: cards, validation: { errors: [] }, caution }).checks.find((check) => check.id === 'glowif_ai_cards').status;
  assert.equal(gate(), 'fail');
  assert.equal((await approve()).status, 409);
  fs.writeFileSync(reportFile, JSON.stringify({ cards: aiRecords }));
  assert.deepEqual(appliedNumbers(productDir, cards.cards), [1, 2, 3, 4, 5]);
  assert.equal(gate(), 'pass');
  assert.equal((await approve()).status, 200);
  assert.equal((await detail()).stage, 'approved');
  fs.writeFileSync(path.join(productDir, 'images', 'main.png'), Buffer.concat([PNG, Buffer.from('changed')]));
  assert.equal(gate(), 'fail');
});

test('Glowif 디자인에 용기 없는 구도와 승인 문구를 전달하고 인스타 비밀은 넘기지 않아요', () => {
  const { copy } = glowifPlan(topics[0]);
  const prompt = buildGlowifPrompt('glowif-usage', copy[3], topics[0], false);
  assert.match(prompt, /two clearly separate step panels/);
  assert.match(prompt, /Do not render a bottle/);
  assert.match(prompt, /펌프를 눌러 손에 덜어요/);
  assert.deepEqual(codexImageEnv({ HOME: '/home/test', CODEX_BIN: 'codex', IG_ACCESS_TOKEN: 'secret', OPENAI_API_KEY: 'secret' }), { HOME: '/home/test', CODEX_BIN: 'codex' });
});
