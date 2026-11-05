// AI 배경 (무드 '브랜드', A안): GPT 이미지(로컬 Codex CLI, 또는 배포용 OpenAI 이미지 API)가 카드마다 글자·제품 없는 배경만 만들고, 글자·제품은 출력(render)이 얹음
// 사용법: node scripts/ai-bg.js <제품ID> [--card N] [--stale] [--tries 2] [--no-render]   (npm run ai-bg -- <제품ID>)
//   --stale     : 아직 없거나 무드(brand_mood)·템플릿이 바뀐 카드만 (작업실이 문구·출력 작업 뒤 자동으로 부름)
//   --no-render : 배경만 만들고 카드는 다시 출력하지 않음
//   --prompts   : 자동 생성 대신 ChatGPT 채팅창에 붙여 넣을 카드별 요청문만 출력 (Codex 사용량 한도일 때)
//   --import N <파일> : ChatGPT 채팅에서 받은 이미지를 N번 배경으로 넣고 다시 출력
// 흐름: cards.json brand_mood(장면·색) + 템플릿별 글자 면 자리 → 요청문(scripts/lib/brand.js bgPrompt) → codex exec → 1080px로 맞춰 저장 → render
// 출력: products/<id>/output/ai-bg/card-NN.png, ai-bg.json(카드별 key·시도), work/(요청문·AI 원본)
// 문구는 요청문에 넣지 않음. 카드 글자는 전부 cards.json에서 코드가 얹어 검증을 그대로 거침
// 환경변수: CARDNEWS_IMAGE_BACKEND(codex 기본 | openai), OPENAI_API_KEY·OPENAI_IMAGE_MODEL(openai일 때, 기본 gpt-image-1), CODEX_BIN, CHROMIUM_PATH, AI_CARD_TIMEOUT(초, 기본 360)
// ChatGPT 채팅창을 프로그램이 조작하는 방식은 쓰지 않음(OpenAI 이용 약관). 한도일 때 채팅은 사람이 직접(--prompts·--import)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { paths, readJson, loadInput, requireProductId, designRecord } = require('./lib/common');
const { pad, launchBrowser } = require('./lib/card-html');
const { runCodex, generatedPath } = require('./ai-card');
const { BRAND_DESIGN, aiBgDir, bgPrompt, chatPrompt, bgKey, readBgReport, staleBg } = require('./lib/brand');

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

// 이미지 만드는 곳: codex(기본, 로컬 Codex CLI — ChatGPT 요금제 사용량, API 요금 없음) | openai(배포·기업용 OpenAI 이미지 API, 장당 요금)
// CARDNEWS_IMAGE_BACKEND=openai 이면 OPENAI_API_KEY가 필요 (값은 출력·기록하지 않음)
function imageBackend(env = process.env) {
  return env.CARDNEWS_IMAGE_BACKEND === 'openai' ? 'openai' : 'codex';
}

// OpenAI 이미지 API로 한 장 만들어 cwd/gen.png에 저장. runCodex와 같은 모양({ code, out, sec })을 돌려줌
async function runOpenAI(cwd, prompt, timeoutSec, { env = process.env, fetchFn = fetch } = {}) {
  const started = Date.now();
  const sec = () => Math.round((Date.now() - started) / 1000);
  if (!env.OPENAI_API_KEY) return { code: -1, out: 'OPENAI_API_KEY가 없어요 (CARDNEWS_IMAGE_BACKEND=openai)', sec: 0 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutSec * 1000);
  try {
    const res = await fetchFn('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024', n: 1 }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body.error && body.error.message) || `HTTP ${res.status}`;
      return { code: res.status, out: res.status === 429 ? `usage limit: ${msg}` : msg, sec: sec() };
    }
    const b64 = body.data && body.data[0] && body.data[0].b64_json;
    if (!b64) return { code: 1, out: '응답에 이미지가 없어요', sec: sec() };
    fs.writeFileSync(path.join(cwd, 'gen.png'), Buffer.from(b64, 'base64'));
    return { code: 0, out: './gen.png', sec: sec() };
  } catch (e) {
    return { code: 1, out: e.name === 'AbortError' ? '시간 초과' : String(e.message || e), sec: sec() };
  } finally {
    clearTimeout(timer);
  }
}

async function makeBg({ page, card, mood, dir, tries, timeoutSec, log, backend = imageBackend() }) {
  const prompt = backend === 'openai' ? chatPrompt(mood, card.template) : bgPrompt(mood, card.template);
  const record = { no: card.no, template: card.template, key: bgKey(mood, card), ok: false, file: null, source: backend, tries: [] };
  for (let t = 1; t <= tries; t++) {
    const cwd = path.join(dir, 'work', `card-${pad(card.no)}-try${t}`);
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(path.join(cwd, 'prompt.txt'), prompt);
    log(`  ${card.no}번 배경 ${t}차 생성 중… (보통 1~2분)`);
    const r = backend === 'openai' ? await runOpenAI(cwd, prompt, timeoutSec) : await runCodex(cwd, prompt, timeoutSec, { image: null });
    const gen = backend === 'openai' ? (r.code === 0 ? path.join(cwd, 'gen.png') : null) : generatedPath(r.out, cwd);
    const attempt = { try: t, sec: r.sec, exit: r.code };
    if (!gen) {
      const limit = usageLimit(r.out);
      const name = backend === 'openai' ? 'OpenAI 이미지 API' : 'codex';
      attempt.error = r.code === -1 ? `${name}를 실행하지 못했어요: ${r.out}` : limit || (backend === 'openai' ? `생성하지 못했어요: ${r.out}` : '생성된 이미지가 없어요');
      record.tries.push(attempt);
      log(`  ${card.no}번 ${t}차: ${attempt.error}`);
      // 실행 파일이 없거나 사용량 한도면 다시 해도 같음 → 남은 카드도 멈춤
      if (r.code === -1 || limit) { record.stop = attempt.error; break; }
      continue;
    }
    if (path.resolve(gen) !== path.resolve(cwd, 'gen.png')) fs.copyFileSync(gen, path.join(cwd, 'gen.png'));
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
  const { pdir, data } = loadBrandData(id);
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
    saveReport(id, pdir, cards, results);
  }
  const rendered = render && results.some((r) => r.ok) ? rerender(id, log) : null;
  return { results, rendered };
}

function loadBrandData(id) {
  const pdir = paths.product(id);
  const data = readJson(path.join(pdir, 'cards.json'));
  if (!['copy', 'approved'].includes(data.stage)) throw new Error(`문구 작업 뒤에 쓸 수 있어요 (지금 단계: ${data.stage})`);
  const design = designRecord({ input: loadInput(id), data });
  if (design.id !== BRAND_DESIGN) throw new Error(`무드가 '${BRAND_DESIGN}'일 때만 AI 배경을 만들어요 (지금: ${design.name})`);
  if (!data.brand_mood) throw new Error('cards.json에 brand_mood가 없어요 (구성안 작업에서 정해요)');
  return { pdir, data };
}

function saveReport(id, pdir, cards, results) {
  const prev = readBgReport(pdir) || { cards: [] };
  const merged = [...prev.cards.filter((c) => !results.some((r) => r.no === c.no) && cards.some((x) => x.no === c.no)), ...results].sort((a, b) => a.no - b.no);
  fs.writeFileSync(path.join(aiBgDir(pdir), 'ai-bg.json'), `${JSON.stringify({ product_id: id, made_at: new Date().toISOString(), cards: merged }, null, 2)}\n`);
}

function rerender(id, log) {
  log('배경을 넣어 카드를 다시 출력해요…');
  const r = spawnSync(process.execPath, [path.join(paths.root, 'scripts', 'render.js'), id, '--no-log'], { encoding: 'utf8', env: process.env });
  const rendered = { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-4) };
  log(rendered.ok ? '카드 다시 출력 완료' : `[오류] 카드를 다시 출력하지 못했어요: ${rendered.output.slice(-1).join('')}`);
  return rendered;
}

// ChatGPT 채팅창용 요청문 (카드별). 사람이 채팅에 붙여 넣고 받은 이미지를 --import로 넣음
function chatPrompts(id) {
  const { data } = loadBrandData(id);
  return (data.cards || []).map((c) => ({ no: c.no, template: c.template, prompt: chatPrompt(data.brand_mood, c.template) }));
}

// 사람이 ChatGPT 채팅에서 만든 이미지(PNG·JPG)를 N번 카드 배경으로 넣음 → 1080px로 맞춰 저장 → 다시 출력
async function importBg(id, no, file, { render = true, log = console.log } = {}) {
  const { pdir, data } = loadBrandData(id);
  const card = (data.cards || []).find((c) => c.no === no);
  if (!card) throw new Error(`${no}번 카드가 없어요`);
  const buf = fs.readFileSync(file);
  const isPng = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  if (!isPng && !isJpg && !isWebp) throw new Error('PNG·JPG·WEBP 이미지만 넣을 수 있어요');
  const dir = aiBgDir(pdir);
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  fs.copyFileSync(file, path.join(dir, 'work', `card-${pad(no)}-chat${isPng ? '.png' : isJpg ? '.jpg' : '.webp'}`));
  const mime = isPng ? 'image/png' : isJpg ? 'image/jpeg' : 'image/webp';
  const browser = await launchBrowser();
  const out = `card-${pad(no)}.png`;
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>ai-bg</title>');
    const src = `data:${mime};base64,${buf.toString('base64')}`;
    fs.writeFileSync(path.join(dir, out), Buffer.from(await page.evaluate(`(${FIT_FN})(${JSON.stringify(src)}, ${FINAL})`), 'base64'));
  } finally {
    await browser.close();
  }
  const record = { no, template: card.template, key: bgKey(data.brand_mood, card), ok: true, file: out, source: 'chat', tries: [{ try: 1, sec: 0, source: 'chat', imported_at: new Date().toISOString() }] };
  saveReport(id, pdir, data.cards || [], [record]);
  log(`${no}번 배경을 넣었어요 (ChatGPT 채팅에서 만든 이미지)`);
  const rendered = render ? rerender(id, log) : null;
  return { results: [record], rendered };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const id = requireProductId(argv);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--prompts')) {
    try {
      for (const p of chatPrompts(id)) console.log(`\n===== ${p.no}번 (${p.template}) — ChatGPT 채팅에 붙여 넣기 =====\n${p.prompt}`);
      console.log(`\n받은 이미지는: npm run ai-bg -- ${id} --import <카드 번호> <이미지 파일>`);
      process.exit(0);
    } catch (e) { console.error(`[오류] ${e.message}`); process.exit(2); }
  }
  if (argv.includes('--import')) {
    const i = argv.indexOf('--import');
    importBg(id, Number(argv[i + 1]), argv[i + 2], { render: !argv.includes('--no-render') })
      .then(({ rendered }) => process.exit(!rendered || rendered.ok ? 0 : 1))
      .catch((e) => { console.error(`[오류] ${e.message}`); process.exit(2); });
    return;
  }
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

module.exports = { run, importBg, chatPrompts, usageLimit, imageBackend, runOpenAI };
