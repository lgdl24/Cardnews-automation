// AI 디자인 카드 (1번 표지·마지막 마무리 카드): GPT 이미지(Codex CLI)가 배경·문구를 만들고, 제품은 원본 사진을 잠금
// 사용법: node scripts/ai-card.js <제품ID> [--card N] [--stale] [--tries 3]   (npm run ai-card -- <제품ID>)
//   --stale : 아직 없거나 문구가 바뀐 카드만 (작업실이 문구·출력 작업 뒤 자동으로 부름)
//
// 흐름 (카드마다)
//   1. 제품 사진 누끼(투명 PNG면 알파, 아니면 테두리 단색 배경 제거)를 정해진 자리에 놓은 바탕(base.png)과 요청문을 만듦
//   2. 로컬 Codex CLI로 이미지 편집: `codex exec -i base.png` ($imagegen, ChatGPT 로그인 사용량 — API 키 불필요)
//   3. 제품 잠금 검사: AI 결과의 제품 자리를 원본과 비교 (색 차이·이동량). 어긋나면 다시 생성 (--tries까지)
//   4. 원본 제품 픽셀을 같은 자리에 다시 덮어 1080px PNG 저장 → 최종본의 제품은 항상 원본 사진
// 출력: products/<id>/output/ai-card/card-NN.png, ai-card.json(카드별 시도·점수·문구 key), work/(바탕·요청문·AI 원본)
//       성공한 카드는 output/png/card-NN.png(최종 카드)에 넣고, 템플릿 출력은 ai-card/template-card-NN.png로 보관
// 문구는 cards.json의 승인 문구만 넣음. AI가 그린 글자가 정확한지는 사람(또는 다음 단계 검사)이 확인해야 함 → text_checked=false
// 환경변수: CODEX_BIN(기본 codex), CHROMIUM_PATH, AI_CARD_TIMEOUT(초, 기본 360)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { paths, readJson, requireProductId } = require('./lib/common');
const { pad, launchBrowser } = require('./lib/card-html');
const { cardKey, staleTargets, applyAiCards, aiTargets } = require('./lib/ai-cards');

const BASE = 1024; // AI에 주는 바탕 크기
const FINAL = 1080;
// 판정 기준: 제품 안쪽 평균 색 차이 ≤ 18, 이동 ≤ 4px (시험 12장: 4~13점·최대 2px, 어긋난 경우 28점·24px)
const LOCK = { maxDiff: 18, maxShift: 4, search: 24, step: 2 };
const LAYOUT = {
  cover: { h: 0.5, cx: 0.5, bottom: 0.92, maxw: 0.52, text: 'top 38% of the image, centered', role: 'card-news cover' },
  closing: { h: 0.56, cx: 0.7, bottom: 0.9, maxw: 0.42, text: 'left 50% of the image, left-aligned, vertically centered', role: 'closing card of a card-news set' },
};

function textLines(copy) {
  const out = [];
  if (copy.badge) out.push(`- small rounded badge: ${copy.badge}`);
  const t = String(copy.title || '').split('\n').filter(Boolean);
  if (t.length) out.push(`- headline (${t.length} line${t.length > 1 ? 's' : ''}):\n${t.map((x) => `    ${x}`).join('\n')}`);
  if (copy.subtitle) out.push(`- subtitle: ${copy.subtitle.replace(/\n/g, ' ')}`);
  return out.join('\n');
}

function buildPrompt(kind, copy) {
  const L = LAYOUT[kind];
  return `$imagegen Edit the attached image and save the result as ./out.png in the current folder (square, 1:1).

THE PRODUCT IS LOCKED. The attached image already contains the real product photo. Keep it EXACTLY as it is:
same position, same size, same angle, same shape, same colors, same label and printed text.
Do NOT redraw, retouch, recolor, relight, rotate, scale, move, crop or duplicate the product.
Do NOT place any text, objects, hands, liquid, flowers or effects in front of or overlapping the product.
Only change what is around it.

Replace the plain gray background with a premium skincare ad scene (${L.role}) whose colors harmonize with the product's own packaging colors.
Add a soft natural contact shadow under the product so it sits on a surface. The scene must not contain any other product, bottle, tube or packaging.

Add this Korean text EXACTLY, spelled exactly as written, nothing more, in the ${L.text}:
${textLines(copy)}
Typography: clean modern Korean sans-serif, bold headline, high contrast and easy to read. The text must not touch the product.
Do not add any other words, numbers, claims, logos, watermarks or people.
Nothing medical: no doctors, pharmacists or experts, no white coats, clinics, hospitals, pharmacies or medical equipment.

Use ONLY the built-in image generation tool, in a single generation. Do not write or run any code or scripts, do not draw text or composite images yourself, and do not post-process the generated image. Just copy the generated file to ./out.png.

When done, reply with only: ./out.png`;
}

// 제품 상자(바탕 기준): 높이 비율로 맞추고 넓으면 폭 기준으로 줄임
function productBox(kind, w, h, size = BASE) {
  const L = LAYOUT[kind];
  let ph = Math.round(size * L.h);
  let pw = Math.round((w * ph) / h);
  if (pw > size * L.maxw) { pw = Math.round(size * L.maxw); ph = Math.round((h * pw) / w); }
  return { x: Math.round(size * L.cx - pw / 2), y: Math.round(size * L.bottom - ph), w: pw, h: ph };
}

// 제품 잠금 점수: ai·orig는 같은 크기(w×h) RGBA, mask는 w×h (1=제품 안쪽). ai는 상자 주변 pad만큼 넓게(aw×ah) 받음
function lockScore({ ai, aw, orig, mask, w, h, pad: P }) {
  let best = null;
  const at = (dx, dy) => {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        const o = (y * w + x) * 4;
        const a = ((y + P + dy) * aw + (x + P + dx)) * 4;
        sum += Math.abs(ai[a] - orig[o]) + Math.abs(ai[a + 1] - orig[o + 1]) + Math.abs(ai[a + 2] - orig[o + 2]);
        n += 3;
      }
    }
    return n ? sum / n : 255;
  };
  for (let dy = -P; dy <= P; dy += LOCK.step) {
    for (let dx = -P; dx <= P; dx += LOCK.step) {
      const d = at(dx, dy);
      if (!best || d < best.diff) best = { diff: d, dx, dy };
    }
  }
  const diff = Math.round(best.diff * 10) / 10;
  const ok = diff <= LOCK.maxDiff && Math.abs(best.dx) <= LOCK.maxShift && Math.abs(best.dy) <= LOCK.maxShift;
  return { ok, diff, shift: [best.dx, best.dy] };
}

// codex 출력에서 생성된 이미지 경로 (Codex가 결과를 따로 손대도 AI 원본으로 검사)
function generatedPath(output, cwd) {
  // Windows 경로(C:\...\generated_images\...)도 찾음
  const m = String(output).match(/(?:[A-Za-z]:)?[\\/][^\s"'`]*generated_images[\\/][^\s"'`]*\.png/);
  if (m && fs.existsSync(m[0])) return m[0];
  const out = path.join(cwd, 'out.png');
  return fs.existsSync(out) ? out : null;
}

// 기본 codex 실행 파일: CODEX_BIN → (Windows) npm 설치 위치의 codex.js → 'codex'
// Windows는 npm 설치가 codex.cmd라 spawn이 'codex'를 못 찾음(ENOENT)
function defaultCodexBin(env = process.env, platform = process.platform, exists = fs.existsSync) {
  if (env.CODEX_BIN) return env.CODEX_BIN;
  if (platform === 'win32' && env.APPDATA) {
    const js = path.win32.join(env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (exists(js)) return js;
  }
  return 'codex';
}

// image: 함께 넘길 바탕 그림(작업 폴더 기준). null이면 그림 없이 새로 만듦 (ai-bg.js 배경)
function runCodex(cwd, prompt, timeoutSec, { image = 'base.png' } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const bin = defaultCodexBin();
    const args = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', ...(image ? ['-i', image] : [])];
    // .js면 node로 실행 (Windows는 .js를 직접 실행하지 못함)
    const [cmd, cmdArgs] = /\.[cm]?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
    const child = spawn(cmd, cmdArgs, { cwd, env: process.env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutSec * 1000);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out: String(e.message), sec: 0 }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(cwd, 'codex.log'), out);
      resolve({ code, out, sec: Math.round((Date.now() - started) / 1000) });
    });
    child.stdin.end(prompt);
  });
}

// 브라우저 안 그림 작업 (누끼·바탕·잠금 검사용 픽셀·최종 합성)
const PAGE_FNS = `
window.loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('이미지를 못 읽었어요')); i.src = src; });
window.canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
window.toB64 = (c) => c.toDataURL('image/png').split(',')[1];
window.cutout = async (src) => {
  const img = await loadImg(src);
  const c = canvasOf(img.naturalWidth, img.naturalHeight); const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height); const p = d.data; const W = c.width, H = c.height;
  let transparent = false;
  for (let i = 3; i < p.length; i += 4) if (p[i] < 250) { transparent = true; break; }
  if (transparent) { for (let i = 3; i < p.length; i += 4) p[i] = p[i] >= 200 ? 255 : 0; }
  else {
    // 테두리에서 시작해 배경색과 비슷한 픽셀만 지움 (흰·단색 배경 제품 사진)
    const bg = [p[0], p[1], p[2]]; const seen = new Uint8Array(W * H); const st = [];
    const near = (k) => Math.abs(p[k*4]-bg[0]) + Math.abs(p[k*4+1]-bg[1]) + Math.abs(p[k*4+2]-bg[2]) < 36;
    for (let x = 0; x < W; x++) { st.push(x, (H-1)*W + x); } for (let y = 0; y < H; y++) { st.push(y*W, y*W + W-1); }
    while (st.length) { const k = st.pop(); if (seen[k] || !near(k)) continue; seen[k] = 1; p[k*4+3] = 0;
      const x = k % W, y = (k / W) | 0; if (x > 0) st.push(k-1); if (x < W-1) st.push(k+1); if (y > 0) st.push(k-W); if (y < H-1) st.push(k+W); }
  }
  g.putImageData(d, 0, 0);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p[(y*W+x)*4+3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('제품 사진에서 제품을 찾지 못했어요');
  const o = canvasOf(x1-x0+1, y1-y0+1); o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return { b64: toB64(o), w: o.width, h: o.height };
};
window.makeBase = async (cut, box, size) => {
  const c = canvasOf(size, size); const g = c.getContext('2d'); g.fillStyle = 'rgb(226,226,230)'; g.fillRect(0, 0, size, size);
  g.drawImage(await loadImg('data:image/png;base64,' + cut), box.x, box.y, box.w, box.h); return toB64(c);
};
window.lockData = async (cut, gen, box, pad) => {
  const F = ${FINAL};
  const ai = canvasOf(F, F); ai.getContext('2d').drawImage(await loadImg(gen), 0, 0, F, F);
  const prod = canvasOf(box.w, box.h); const pg = prod.getContext('2d'); pg.drawImage(await loadImg('data:image/png;base64,' + cut), 0, 0, box.w, box.h);
  const pd = pg.getImageData(0, 0, box.w, box.h).data;
  // 가장자리를 4px 깎은 제품 안쪽만 비교
  const m = new Uint8Array(box.w * box.h); const A = (x, y) => x >= 0 && y >= 0 && x < box.w && y < box.h && pd[(y*box.w+x)*4+3] > 200;
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) m[y*box.w+x] = A(x,y) && A(x-4,y) && A(x+4,y) && A(x,y-4) && A(x,y+4) ? 1 : 0;
  const region = ai.getContext('2d').getImageData(box.x - pad, box.y - pad, box.w + 2*pad, box.h + 2*pad).data;
  const enc = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  return { ai: enc(new Uint8Array(region.buffer)), orig: enc(new Uint8Array(pd.buffer)), mask: enc(m) };
};
window.finalize = async (cut, gen, box) => {
  const F = ${FINAL}; const c = canvasOf(F, F); const g = c.getContext('2d');
  g.drawImage(await loadImg(gen), 0, 0, F, F); g.drawImage(await loadImg('data:image/png;base64,' + cut), box.x, box.y, box.w, box.h);
  return toB64(c);
};`;

function scaleBox(b, k) {
  return { x: Math.round(b.x * k), y: Math.round(b.y * k), w: Math.round(b.w * k), h: Math.round(b.h * k) };
}

async function makeCard({ page, id, card, kind, cut, dir, tries, timeoutSec, log }) {
  const box = productBox(kind, cut.w, cut.h);
  const finalBox = scaleBox(box, FINAL / BASE);
  const prompt = buildPrompt(kind, card.copy || {});
  const record = { no: card.no, kind, key: cardKey(card), ok: false, file: null, text_checked: false, tries: [] };
  for (let t = 1; t <= tries; t++) {
    const cwd = path.join(dir, 'work', `card-${pad(card.no)}-try${t}`);
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(path.join(cwd, 'base.png'), Buffer.from(await page.evaluate(([c, b, s]) => window.makeBase(c, b, s), [cut.b64, box, BASE]), 'base64'));
    fs.writeFileSync(path.join(cwd, 'prompt.txt'), prompt);
    log(`  ${card.no}번 ${t}차 생성 중… (보통 1~2분)`);
    const r = await runCodex(cwd, prompt, timeoutSec);
    const gen = generatedPath(r.out, cwd);
    const attempt = { try: t, sec: r.sec, exit: r.code };
    if (!gen) {
      attempt.error = /capacity/i.test(r.out) ? 'AI 사용량 초과(잠시 뒤 다시)' : r.code === -1 ? `codex를 실행하지 못했어요: ${r.out}` : '생성된 이미지가 없어요';
      record.tries.push(attempt);
      log(`  ${card.no}번 ${t}차: ${attempt.error}`);
      if (r.code === -1) break;
      continue;
    }
    fs.copyFileSync(gen, path.join(cwd, 'gen.png'));
    const src = 'data:image/png;base64,' + fs.readFileSync(gen).toString('base64');
    const P = LOCK.search;
    const d = await page.evaluate(([c, g, b, p]) => window.lockData(c, g, b, p), [cut.b64, src, finalBox, P]);
    const score = lockScore({
      ai: Buffer.from(d.ai, 'base64'), aw: finalBox.w + 2 * P, orig: Buffer.from(d.orig, 'base64'),
      mask: Buffer.from(d.mask, 'base64'), w: finalBox.w, h: finalBox.h, pad: P,
    });
    Object.assign(attempt, score);
    record.tries.push(attempt);
    log(`  ${card.no}번 ${t}차: 제품 ${score.ok ? '유지' : '어긋남'} (차이 ${score.diff}, 이동 ${score.shift.join(',')})`);
    if (!score.ok) continue;
    const file = `card-${pad(card.no)}.png`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(await page.evaluate(([c, g, b]) => window.finalize(c, g, b), [cut.b64, src, finalBox]), 'base64'));
    Object.assign(record, { ok: true, file });
    break;
  }
  return record;
}

async function run(id, { only = null, staleOnly = false, tries = 3, log = console.log } = {}) {
  const pdir = paths.product(id);
  const data = readJson(path.join(pdir, 'cards.json'));
  if (!['copy', 'approved'].includes(data.stage)) throw new Error(`문구 작업 뒤에 쓸 수 있어요 (지금 단계: ${data.stage})`);
  const cards = data.cards || [];
  const nos = aiTargets(cards);
  const targets = nos.map((no, i) => [cards.find((c) => c.no === no), i === 0 ? 'cover' : 'closing']);
  let list = only ? targets.filter(([c]) => c.no === only) : targets;
  if (staleOnly) { const st = staleTargets(pdir, cards); list = list.filter(([c]) => st.includes(c.no)); }
  if (!list.length && staleOnly) return { report: null, results: [], applied: applyAiCards(pdir, cards) };
  if (!list.length) throw new Error(only ? `${only}번은 AI 카드 대상(첫·마지막 카드)이 아니에요` : '카드가 없어요');
  const dir = path.join(pdir, 'output', 'ai-card');
  fs.mkdirSync(dir, { recursive: true });
  const reportFile = path.join(dir, 'ai-card.json');
  const prev = fs.existsSync(reportFile) ? readJson(reportFile) : { cards: [] };
  const timeoutSec = Number(process.env.AI_CARD_TIMEOUT || 360);
  const browser = await launchBrowser();
  const results = [];
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>ai-card</title>');
    await page.addScriptTag({ content: PAGE_FNS });
    for (const [card, kind] of list) {
      const imgName = card.image || (cards.find((c) => c.image) || {}).image;
      if (!imgName) throw new Error(`${card.no}번 카드에 제품 사진이 없어요`);
      const imgFile = path.join(pdir, 'images', imgName);
      const mime = /\.png$/i.test(imgName) ? 'image/png' : 'image/jpeg';
      const cut = await page.evaluate((s) => window.cutout(s), `data:${mime};base64,${fs.readFileSync(imgFile).toString('base64')}`);
      results.push(await makeCard({ page, id, card, kind, cut, dir, tries, timeoutSec, log }));
    }
  } finally {
    await browser.close();
  }
  const merged = [...prev.cards.filter((c) => !results.some((r) => r.no === c.no)), ...results].sort((a, b) => a.no - b.no);
  const report = { product_id: id, made_at: new Date().toISOString(), lock: LOCK, cards: merged };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  // 최종 카드(output/png)에 바로 넣음. 템플릿 출력은 output/ai-card/template-card-NN.png로 보관
  const applied = applyAiCards(pdir, cards);
  return { report, results, applied };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const id = requireProductId(argv);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  run(id, { only: opt('--card') ? Number(opt('--card')) : null, staleOnly: argv.includes('--stale'), tries: Number(opt('--tries') || 3) })
    .then(({ results, applied }) => {
      if (!results.length) console.log('새로 만들 AI 카드가 없어요 (문구가 그대로예요).');
      if (applied && applied.applied.length) console.log(`최종 카드에 넣음: ${applied.applied.join('·')}번 (output/png)`);
      for (const r of results) console.log(`${r.no}번: ${r.ok ? `완료 → output/ai-card/${r.file}` : '실패'} (시도 ${r.tries.length}번)`);
      if (results.length) console.log('[주의] AI가 그린 문구가 cards.json과 같은지 확인해 주세요.');
      process.exit(results.every((r) => r.ok) ? 0 : 1);
    })
    .catch((e) => { console.error(`[오류] ${e.message}`); process.exit(2); });
}

module.exports = { buildPrompt, textLines, defaultCodexBin, runCodex, productBox, lockScore, generatedPath, LAYOUT, LOCK, run };
