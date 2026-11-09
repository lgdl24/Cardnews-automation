// AI 배경 (무드 '브랜드', A안): GPT 이미지(로컬 Codex CLI)가 카드마다 글자·제품 없는 배경만 만들고, 글자·제품은 출력(render)이 얹음
// 사용법: node scripts/ai-bg.js <제품ID> [--card N] [--stale] [--tries 2] [--no-render]   (npm run ai-bg -- <제품ID>)
//   --stale     : 아직 없거나 무드(brand_mood)·템플릿이 바뀐 카드만 (작업실이 문구·출력 작업 뒤 자동으로 부름)
//   --no-render : 배경만 만들고 카드는 다시 출력하지 않음
// 흐름: cards.json brand_mood(장면·색) + 템플릿별 글자 면 자리 → 요청문(scripts/lib/brand.js bgPrompt) → codex exec → 1080px로 맞춰 저장 → render
// 출력: products/<id>/output/ai-bg/card-NN.png, ai-bg.json(카드별 key·시도), work/(요청문·AI 원본)
// 문구는 요청문에 넣지 않음. 카드 글자는 전부 cards.json에서 코드가 얹어 검증을 그대로 거침
// 환경변수: CODEX_BIN, CHROMIUM_PATH, AI_CARD_TIMEOUT(초, 기본 360)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { paths, readJson, loadInput, requireProductId, designRecord } = require('./lib/common');
const { pad, launchBrowser } = require('./lib/card-html');
const { runCodex, generatedPath } = require('./ai-card');
const { BRAND_DESIGN, aiBgDir, bgPrompt, bgKey, readBgReport, staleBg } = require('./lib/brand');

const FINAL = 1080;

// AI 원본을 1080×1080으로 (가운데 기준 꽉 채우기)
const FIT_FN = `async (src, size) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const k = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  c.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return c.toDataURL('image/png').split(',')[1];
}`;

// ChatGPT 사용량 한도·과부하 안내 (codex 출력). 있으면 다시 시도하지 않음
function usageLimit(out) {
  const s = String(out || '');
  if (/usage limit/i.test(s)) {
    const at = s.match(/try again at ([^.\n]+)/i);
    return `GPT 사용량 한도예요${at ? ` (${at[1].trim()}에 다시)` : ''}`;
  }
  if (/capacity/i.test(s)) return 'GPT가 바빠요 (잠시 뒤 다시)';
  return null;
}

async function makeBg({ page, card, mood, dir, tries, timeoutSec, log }) {
  const prompt = bgPrompt(mood, card.template);
  const record = { no: card.no, template: card.template, key: bgKey(mood, card), ok: false, file: null, tries: [] };
  for (let t = 1; t <= tries; t++) {
    const cwd = path.join(dir, 'work', `card-${pad(card.no)}-try${t}`);
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(path.join(cwd, 'prompt.txt'), prompt);
    log(`  ${card.no}번 배경 ${t}차 생성 중… (보통 1~2분)`);
    const r = await runCodex(cwd, prompt, timeoutSec, { image: null });
    const gen = generatedPath(r.out, cwd);
    const attempt = { try: t, sec: r.sec, exit: r.code };
    if (!gen) {
      const limit = usageLimit(r.out);
      attempt.error = r.code === -1 ? `codex를 실행하지 못했어요: ${r.out}` : limit || '생성된 이미지가 없어요';
      record.tries.push(attempt);
      log(`  ${card.no}번 ${t}차: ${attempt.error}`);
      // 실행 파일이 없거나 사용량 한도면 다시 해도 같음 → 남은 카드도 멈춤
      if (r.code === -1 || limit) { record.stop = attempt.error; break; }
      continue;
    }
    fs.copyFileSync(gen, path.join(cwd, 'gen.png'));
    const src = `data:image/png;base64,${fs.readFileSync(gen).toString('base64')}`;
    const file = `card-${pad(card.no)}.png`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(await page.evaluate(`(${FIT_FN})(${JSON.stringify(src)}, ${FINAL})`), 'base64'));
    record.tries.push(attempt);
    Object.assign(record, { ok: true, file });
    log(`  ${card.no}번 배경 완료`);
    break;
  }
  return record;
}

async function run(id, { only = null, staleOnly = false, tries = 2, render = true, log = console.log } = {}) {
  const pdir = paths.product(id);
  const data = readJson(path.join(pdir, 'cards.json'));
  if (!['copy', 'approved'].includes(data.stage)) throw new Error(`문구 작업 뒤에 쓸 수 있어요 (지금 단계: ${data.stage})`);
  const design = designRecord({ input: loadInput(id), data });
  if (design.id !== BRAND_DESIGN) throw new Error(`무드가 '${BRAND_DESIGN}'일 때만 AI 배경을 만들어요 (지금: ${design.name})`);
  if (!data.brand_mood) throw new Error('cards.json에 brand_mood가 없어요 (구성안 작업에서 정해요)');
  const cards = data.cards || [];
  let list = only ? cards.filter((c) => c.no === only) : cards;
  if (only && !list.length) throw new Error(`${only}번 카드가 없어요`);
  if (staleOnly) { const st = staleBg(pdir, data); list = list.filter((c) => st.includes(c.no)); }
  const dir = aiBgDir(pdir);
  const results = [];
  if (list.length) {
    fs.mkdirSync(dir, { recursive: true });
    const timeoutSec = Number(process.env.AI_CARD_TIMEOUT || 360);
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent('<!doctype html><title>ai-bg</title>');
      for (const card of list) {
        const r = await makeBg({ page, card, mood: data.brand_mood, dir, tries, timeoutSec, log });
        results.push(r);
        if (r.stop) { log(`[중단] ${r.stop} — 남은 카드(${list.slice(list.indexOf(card) + 1).map((c) => c.no).join('·') || '없음'})는 나중에 다시 만들어요`); break; }
      }
    } finally {
      await browser.close();
    }
    const prev = readBgReport(pdir) || { cards: [] };
    const merged = [...prev.cards.filter((c) => !results.some((r) => r.no === c.no) && cards.some((x) => x.no === c.no)), ...results].sort((a, b) => a.no - b.no);
    fs.writeFileSync(path.join(dir, 'ai-bg.json'), `${JSON.stringify({ product_id: id, made_at: new Date().toISOString(), cards: merged }, null, 2)}\n`);
  }
  let rendered = null;
  if (render && results.some((r) => r.ok)) {
    log('배경을 넣어 카드를 다시 출력해요…');
    const r = spawnSync(process.execPath, [path.join(paths.root, 'scripts', 'render.js'), id, '--no-log'], { encoding: 'utf8', env: process.env });
    rendered = { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-4) };
    log(rendered.ok ? '카드 다시 출력 완료' : `[오류] 카드를 다시 출력하지 못했어요: ${rendered.output.slice(-1).join('')}`);
  }
  return { results, rendered };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const id = requireProductId(argv);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  run(id, {
    only: opt('--card') ? Number(opt('--card')) : null,
    staleOnly: argv.includes('--stale'),
    tries: Number(opt('--tries') || 2),
    render: !argv.includes('--no-render'),
  })
    .then(({ results, rendered }) => {
      if (!results.length) console.log('새로 만들 배경이 없어요 (무드·템플릿이 그대로예요).');
      for (const r of results) console.log(`${r.no}번: ${r.ok ? `완료 → output/ai-bg/${r.file}` : '실패'} (시도 ${r.tries.length}번)`);
      if (results.some((r) => r.ok)) console.log('[참고] 배경에 글자·로고가 섞였는지 눈으로 확인해 주세요 (카드 글자는 코드가 얹어요).');
      process.exit(results.every((r) => r.ok) && (!rendered || rendered.ok) ? 0 : 1);
    })
    .catch((e) => { console.error(`[오류] ${e.message}`); process.exit(2); });
}

module.exports = { run, usageLimit };
