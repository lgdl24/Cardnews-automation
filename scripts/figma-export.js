// 출력한 카드 → 피그마에서 직접 고칠 수 있는 레이어로 내보내기
// 사용법: node scripts/figma-export.js <제품ID> [--card N] [--scale 2]
//   먼저 npm run render -- <제품ID> 로 output/html/ 을 만들어 둠
//   결과: products/<제품ID>/output/figma-export/
//     layers.json         카드별 레이어 목록 (글자·도형·이미지, 위에서 아래 순서는 그리는 순서)
//     images/*.png        이미지 레이어 (사진·그라데이션·장식) — 피그마 upload_assets로 올림, 파일 이름 = 레이어 이름
//     build-N.js          use_figma에 넘길 코드: 올린 이미지를 찾아 1080×1080 프레임에 레이어를 쌓음 (코드 길이 제한 안에서 여러 장씩)
//   레이어 나누는 규칙
//     - 글자: 피그마 글자 레이어. 줄바꿈은 브라우저에서 실제로 바뀐 자리 그대로(\n), 글꼴은 Pretendard → 없으면 Gothic A1
//     - 단색 상자(모서리·테두리 포함): 피그마 사각형
//     - 그라데이션·그림자·필터·변형·::before/::after가 있는 상자, <img>: 그 요소만 그린 투명 PNG (자식은 빼고 따로)
//   docs/research/figma-export.md
// 환경변수 CHROMIUM_PATH : 시스템에 설치된 Chromium을 쓸 때 실행 파일 경로
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { paths, loadConfig, loadInput, requireProductId } = require('./lib/common');
const { pad, launchBrowser, waitForFit } = require('./lib/card-html');

const FONT_FALLBACK = ['Pretendard', 'Gothic A1', 'Noto Sans KR'];

function parseArgs(argv) {
  const id = requireProductId(argv);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  return { id, card: get('--card') ? Number(get('--card')) : null, scale: Number(get('--scale') || 2) };
}

// ── 브라우저 안에서 실행: 카드 DOM → 레이어 목록 ──────────────────────────
function extractInPage() {
  const root = document.querySelector('.card') || document.body.firstElementChild;
  const R = root.getBoundingClientRect();
  const INLINE = new Set(['inline', 'contents']);
  const px = (v) => parseFloat(v) || 0;
  const rgba = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 };
  };
  const visible = (el, cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && px(cs.opacity) > 0;
  const hasPseudo = (el) => ['::before', '::after'].some((p) => {
    const c = getComputedStyle(el, p);
    return c.content && c.content !== 'none' && c.content !== 'normal' && c.display !== 'none';
  });
  const directText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const isTextBlock = (el) => {
    if (!el.textContent.trim()) return false;
    for (const d of el.querySelectorAll('*')) {
      const cs = getComputedStyle(d);
      if (d.tagName === 'BR') continue;
      if (!INLINE.has(cs.display) || d.tagName === 'IMG') return false;
    }
    return true;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= px(getComputedStyle(e).opacity) || (getComputedStyle(e).opacity === '0' ? 0 : 1); return o; };
  const zOf = (el) => {
    for (let e = el; e && e !== root.parentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.position !== 'static' && cs.zIndex !== 'auto') return Number(cs.zIndex);
    }
    return 0;
  };
  const box = (r) => ({ x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height });
  const nameOf = (el) => (el.getAttribute('data-field') || (typeof el.className === 'string' && el.className.trim().split(/\s+/)[0]) || el.tagName.toLowerCase());

  // 줄바꿈 자리: 글자 하나씩 위치를 재서 줄이 바뀌면 \n
  function textRuns(el) {
    const runs = [];
    let text = '';
    let lastTop = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.currentNode; n; n = walker.nextNode()) {
      if (n.nodeType === 1) { if (n.tagName === 'BR') { text += '\n'; lastTop = null; } continue; }
      const parent = n.parentElement;
      const cs = getComputedStyle(parent);
      if (!visible(parent, cs)) continue;
      const lh = cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight);
      const s = n.textContent;
      const start = text.length;
      const range = document.createRange();
      for (let i = 0; i < s.length; i++) {
        range.setStart(n, i); range.setEnd(n, i + 1);
        const rects = range.getClientRects();
        const r = rects[0];
        const ch = s[i];
        if (!r || (r.width === 0 && /\s/.test(ch))) continue; // 접힌 공백
        if (ch === '\n') continue;
        if (lastTop !== null && r.top > lastTop + lh * 0.5) { text = text.replace(/[ \t]+$/, ''); text += '\n'; }
        if (lastTop === null || r.top > lastTop + lh * 0.5) lastTop = r.top;
        if (/\s/.test(ch) && (text.endsWith('\n') || text === '')) continue;
        text += /\s/.test(ch) ? ' ' : (cs.textTransform === 'uppercase' ? ch.toUpperCase() : ch);
      }
      if (text.length > start) {
        runs.push({ start, end: text.length, color: rgba(cs.color), weight: Number(cs.fontWeight) || 400, size: px(cs.fontSize), family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim() });
      }
    }
    return { text: text.replace(/[ \t]+$/g, ''), runs };
  }

  const layers = [];
  let order = 0;
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) { continue; }
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5 && !hasPseudo(el)) continue;
    const z = zOf(el);
    const op = opacityOf(el);
    const name = nameOf(el);
    const bg = rgba(cs.backgroundColor);
    const paintsBg = bg && bg.a > 0;
    const bgImage = cs.backgroundImage && cs.backgroundImage !== 'none';
    const borderW = ['Top', 'Right', 'Bottom', 'Left'].map((s) => (cs[`border${s}Style`] !== 'none' ? px(cs[`border${s}Width`]) : 0));
    const hasBorder = borderW.some((w) => w > 0);
    const uniformBorder = hasBorder && borderW.every((w) => w === borderW[0]) && ['Top', 'Right', 'Bottom', 'Left'].every((s) => cs[`border${s}Color`] === cs.borderTopColor);
    const fancy = bgImage || (cs.boxShadow && cs.boxShadow !== 'none') || cs.filter !== 'none' || (cs.transform && cs.transform !== 'none')
      || cs.clipPath !== 'none' || (cs.maskImage && cs.maskImage !== 'none') || cs.mixBlendMode !== 'normal' || hasPseudo(el) || (hasBorder && !uniformBorder);
    const isImg = el.tagName === 'IMG' || el.tagName === 'svg' || el.tagName === 'CANVAS' || el.tagName === 'VIDEO';
    if (isImg) {
      if (el.tagName === 'IMG' && (!el.currentSrc || !el.complete || !el.naturalWidth)) continue;
      layers.push({ kind: 'raster', id: `L${order}`, order: order++, z, name: `${name} (사진)`, box: box(r), sel: el });
    } else if (fancy) {
      layers.push({ kind: 'raster', id: `L${order}`, order: order++, z, name, box: box(r), sel: el, hideOwnText: directText(el) });
    } else if (paintsBg || hasBorder) {
      layers.push({
        kind: 'rect', id: `L${order}`, order: order++, z, name, box: box(r), opacity: op,
        fill: paintsBg ? bg : null,
        radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => Math.min(px(v), Math.min(r.width, r.height) / 2)),
        stroke: hasBorder ? { color: rgba(cs.borderTopColor), weight: borderW[0] } : null,
      });
    }
    if (!isImg && isTextBlock(el) && !el.parentElement.closest('[data-fx-textblock]')) {
      el.setAttribute('data-fx-textblock', '');
      const { text, runs } = textRuns(el);
      if (!text.trim()) continue;
      const cb = {
        x: r.left - R.left + px(cs.paddingLeft) + px(cs.borderLeftWidth),
        y: r.top - R.top + px(cs.paddingTop) + px(cs.borderTopWidth),
        w: r.width - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderLeftWidth) - px(cs.borderRightWidth),
      };
      // 실제 글자 줄 폭(가장 긴 줄)
      const range = document.createRange(); range.selectNodeContents(el);
      const lineRects = [...range.getClientRects()];
      const inkW = lineRects.reduce((m, q) => Math.max(m, q.width), 0);
      const lh = cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight);
      // 한 줄 박스(뱃지 등)에서 줄 높이가 칸보다 크면 위치가 어긋나므로 칸 높이 기준 가운데
      layers.push({
        kind: 'text', id: `L${order}`, order: order++, z, name: `${name} (글자)`, opacity: op, text,
        box: { ...cb, h: r.height - px(cs.paddingTop) - px(cs.paddingBottom) },
        inkW,
        align: ({ center: 'CENTER', right: 'RIGHT', end: 'RIGHT', justify: 'JUSTIFIED' })[cs.textAlign] || 'LEFT',
        family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        weight: Number(cs.fontWeight) || 400,
        size: px(cs.fontSize),
        lineHeight: lh,
        letterSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing),
        color: rgba(cs.color),
        runs,
      });
    }
  }
  // 그리는 순서: 쌓임(z) → 문서 순서
  layers.sort((a, b) => a.z - b.z || a.order - b.order);
  layers.forEach((l, i) => { if (l.sel) { l.sel.setAttribute('data-fx-id', l.id); delete l.sel; } l.index = i; });
  return { width: R.width, height: R.height, layers };
}

// 요소 하나만 그린 투명 PNG (자식·형제 숨김, 자기 ::before/::after는 남음) → 투명 여백 잘라 반환
async function rasterize(page, id, { hideOwnText }, scale) {
  await page.evaluate(({ id, hideOwnText }) => {
    const st = document.createElement('style');
    st.id = '__fx';
    st.textContent = `html,body{background:transparent!important}
      *{visibility:hidden!important}
      [data-fx-id="${id}"]{visibility:visible!important${hideOwnText ? ';color:transparent!important;text-shadow:none!important' : ''}}
      [data-fx-id="${id}"] *{visibility:hidden!important}`;
    document.head.appendChild(st);
  }, { id, hideOwnText });
  const shot = await page.screenshot({ omitBackground: true, type: 'png' });
  await page.evaluate(() => document.getElementById('__fx').remove());
  return page.evaluate(async ({ b64, scale }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let l = c.width, t = c.height, r = -1, b = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] === 0) continue;
      if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    }
    if (r < l) return null;
    const w = r - l + 1, h = b - t + 1;
    const o = document.createElement('canvas');
    o.width = w; o.height = h;
    o.getContext('2d').drawImage(c, l, t, w, h, 0, 0, w, h);
    return { data: o.toDataURL('image/png').split(',')[1], box: { x: l / scale, y: t / scale, w: w / scale, h: h / scale } };
  }, { b64: shot.toString('base64'), scale });
}

// 피그마에 넘길 데이터만 남김 (코드 길이 제한 50,000자 안에 여러 장을 넣으려고)
const r2 = (v) => Math.round(v * 100) / 100;
const c3 = (c) => c && { r: Math.round(c.r * 1000) / 1000, g: Math.round(c.g * 1000) / 1000, b: Math.round(c.b * 1000) / 1000, a: Math.round(c.a * 1000) / 1000 };
function compact(card) {
  return {
    file: card.file, no: card.no, page: card.page, width: card.width, height: card.height,
    layers: card.layers.map((l) => {
      const box = { x: r2(l.box.x), y: r2(l.box.y), w: r2(l.box.w), h: r2(l.box.h) };
      if (l.kind === 'raster') return { kind: l.kind, id: l.id, name: l.name, box, upload: l.upload };
      if (l.kind === 'rect') return { kind: l.kind, name: l.name, box, opacity: l.opacity, fill: c3(l.fill), radius: l.radius.map(r2), stroke: l.stroke && { color: c3(l.stroke.color), weight: l.stroke.weight } };
      const same = (r) => r.weight === l.weight && r.size === l.size && r.family === l.family && JSON.stringify(c3(r.color)) === JSON.stringify(c3(l.color));
      const runs = l.runs.every(same) ? [] : l.runs.map((r) => ({ start: r.start, end: r.end, color: c3(r.color), weight: r.weight, size: r.size, family: r.family }));
      return { kind: l.kind, name: l.name, box, opacity: l.opacity, text: l.text, align: l.align, family: l.family, weight: l.weight, size: l.size, lineHeight: r2(l.lineHeight), letterSpacing: r2(l.letterSpacing), color: c3(l.color), runs };
    }),
  };
}

// cards: 한 번에 만들 카드들 (같은 제품 페이지). use_figma 코드 한 번에 실행
function buildCode(cards) {
  const list = (Array.isArray(cards) ? cards : [cards]).map(compact);
  return `// ${list.map((c) => c.file).join(', ')}: 카드 레이어를 피그마 프레임으로 (scripts/figma-export.js가 만듦)
const cards = ${JSON.stringify(list)};
const FALLBACK = ${JSON.stringify(FONT_FALLBACK)};
const STYLE = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const ALT = { SemiBold: ['Semi Bold', 'Medium', 'Bold'], ExtraBold: ['Extra Bold', 'Bold', 'Black'], Medium: ['Regular'], Black: ['ExtraBold', 'Extra Bold', 'Bold'], Thin: ['ExtraLight', 'Light'], ExtraLight: ['Light', 'Regular'], Light: ['Regular'], Bold: ['ExtraBold', 'SemiBold'] };
const available = await figma.listAvailableFontsAsync();
const has = new Set(available.map(f => f.fontName.family + '|' + f.fontName.style));
const fontUsed = {};
function pickFont(family, weight) {
  const want = STYLE[Math.round(weight / 100) * 100] || 'Regular';
  for (const fam of [family, ...FALLBACK]) for (const st of [want, ...(ALT[want] || []), 'Regular']) {
    if (has.has(fam + '|' + st)) { fontUsed[family + ' ' + weight] = fam + ' ' + st; return { family: fam, style: st }; }
  }
  return { family: 'Inter', style: 'Regular' };
}
const pageName = cards[0].page;
const page = figma.root.children.find(p => p.name === pageName) || figma.createPage();
if (page.name !== pageName) page.name = pageName;
await figma.setCurrentPageAsync(page);
const box = page.findOne(n => n.type === 'FRAME' && n.name === '_uploads') || (() => { const f = figma.createFrame(); f.name = '_uploads'; f.visible = false; f.resize(10, 10); f.x = -4000; page.appendChild(f); return f; })();
const fonts = new Map();
for (const card of cards) for (const l of card.layers.filter(l => l.kind === 'text')) {
  for (const r of [l, ...l.runs]) { const f = pickFont(r.family, r.weight); fonts.set(f.family + '|' + f.style, f); }
}
await Promise.all([...fonts.values()].map(f => figma.loadFontAsync(f)));
const solid = (c) => ({ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a });
const frames = [];
const missing = [];
for (const card of cards) {
  // 올린 이미지 찾기 (upload_assets가 파일 이름으로 만든 프레임) → '_uploads'로 옮겨 숨김
  const hashes = {};
  for (const l of card.layers.filter(l => l.kind === 'raster')) {
    const n = page.findOne(n => n.name === l.upload && 'fills' in n && Array.isArray(n.fills) && n.fills.some(f => f.type === 'IMAGE'));
    if (!n) { missing.push(l.upload); continue; }
    hashes[l.id] = n.fills.find(f => f.type === 'IMAGE').imageHash;
    if (n.parent !== box) box.appendChild(n);
  }
  if (missing.length) continue;
  // 같은 이름 프레임은 지우고 다시 만듦 (카드 1장만 다시 내보내기 가능)
  for (const old of page.findAll(n => n.type === 'FRAME' && n.name === card.file && n.parent === page)) old.remove();
  const frame = figma.createFrame();
  frame.name = card.file; frame.resize(card.width, card.height); frame.clipsContent = true; frame.fills = [];
  frame.x = (card.no - 1) * (card.width + 80); frame.y = 0;
  page.appendChild(frame);
  for (const l of card.layers) {
    let n;
    if (l.kind === 'rect') {
      n = figma.createRectangle();
      n.resize(Math.max(0.01, l.box.w), Math.max(0.01, l.box.h));
      n.fills = l.fill ? [solid(l.fill)] : [];
      [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius] = l.radius;
      if (l.stroke) { n.strokes = [solid(l.stroke.color)]; n.strokeWeight = l.stroke.weight; n.strokeAlign = 'INSIDE'; }
      n.opacity = l.opacity;
    } else if (l.kind === 'raster') {
      n = figma.createRectangle();
      n.resize(Math.max(0.01, l.box.w), Math.max(0.01, l.box.h));
      n.fills = [{ type: 'IMAGE', imageHash: hashes[l.id], scaleMode: 'FILL' }];
    } else {
      n = figma.createText();
      const f = pickFont(l.family, l.weight);
      n.fontName = f; n.fontSize = l.size;
      n.lineHeight = { unit: 'PIXELS', value: l.lineHeight };
      n.letterSpacing = { unit: 'PIXELS', value: l.letterSpacing };
      n.characters = l.text;
      n.fills = [solid(l.color)];
      for (const r of l.runs) {
        if (r.end <= r.start) continue;
        const rf = pickFont(r.family, r.weight);
        if (rf.family !== f.family || rf.style !== f.style) n.setRangeFontName(r.start, r.end, rf);
        if (r.size !== l.size) n.setRangeFontSize(r.start, r.end, r.size);
        n.setRangeFills(r.start, r.end, [solid(r.color)]);
      }
      n.textAlignHorizontal = l.align;
      // 줄은 이미 나눠 둠 → 글꼴 폭이 달라도 다시 줄바꿈되지 않게 폭을 넉넉히(가운데·오른쪽 정렬은 기준점 유지)
      n.textAutoResize = 'WIDTH_AND_HEIGHT';
      const w = Math.max(l.box.w, n.width + 2);
      n.textAutoResize = 'HEIGHT'; n.resize(w, n.height);
      n.opacity = l.opacity;
      l.dx = l.align === 'CENTER' ? (w - l.box.w) / 2 : l.align === 'RIGHT' ? (w - l.box.w) : 0;
    }
    n.name = l.name;
    frame.appendChild(n);
    n.x = l.box.x - (l.dx || 0); n.y = l.box.y;
  }
  frames.push(frame.id);
}
if (missing.length) throw new Error('올린 이미지가 없어요(upload_assets 먼저): ' + missing.join(', '));
return { createdNodeIds: frames, fonts: fontUsed };
`;
}

const CODE_LIMIT = 48000;
// 코드 길이 제한 안에서 카드를 묶음 (보통 5장이 한 번에)
function buildBatches(cards) {
  const batches = [];
  let cur = [];
  for (const c of cards) {
    if (cur.length && buildCode([...cur, c]).length > CODE_LIMIT) { batches.push(cur); cur = []; }
    cur.push(c);
  }
  if (cur.length) batches.push(cur);
  return batches.map((b) => ({ cards: b.map((c) => c.file), code: buildCode(b) }));
}

async function main() {
  const { id, card: onlyCard, scale } = parseArgs(process.argv.slice(2));
  const input = loadInput(id);
  const product = (input.info['제품명'] || id).split('\n')[0];
  loadConfig(input, JSON.parse(fs.readFileSync(paths.product(id, 'cards.json'), 'utf8')));
  const htmlDir = paths.product(id, 'output', 'html');
  if (!fs.existsSync(htmlDir)) { console.error(`출력 HTML이 없어요. 먼저 npm run render -- ${id}`); process.exit(1); }
  const files = fs.readdirSync(htmlDir).filter((f) => /^card-\d+\.html$/.test(f)).sort()
    .filter((f) => onlyCard === null || f === `card-${pad(onlyCard)}.html`);
  if (!files.length) { console.error('내보낼 카드가 없어요.'); process.exit(2); }

  const outDir = paths.product(id, 'output', 'figma-export');
  const imgDir = path.join(outDir, 'images');
  if (onlyCard === null) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(imgDir, { recursive: true });

  const browser = await launchBrowser();
  const cards = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: scale });
    for (const f of files) {
      const no = Number(f.match(/\d+/)[0]);
      await page.goto(pathToFileURL(path.join(htmlDir, f)).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await waitForFit(page);
      const res = await page.evaluate(extractInPage);
      const layers = [];
      for (const l of res.layers) {
        if (l.kind === 'raster') {
          const img = await rasterize(page, l.id, l, scale);
          if (!img) continue;
          const upload = `${id}__c${pad(no)}__${l.id}`;
          fs.writeFileSync(path.join(imgDir, `${upload}.png`), Buffer.from(img.data, 'base64'));
          layers.push({ kind: 'raster', id: l.id, name: l.name, box: img.box, upload });
        } else {
          layers.push(l);
        }
      }
      cards.push({ file: `card-${pad(no)}`, no, page: `${product} (${id})`, width: res.width, height: res.height, layers });
    }
  } finally {
    await browser.close();
  }
  for (const f of fs.readdirSync(outDir)) if (/^build-.*\.js$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  const batches = buildBatches(cards);
  batches.forEach((b, i) => fs.writeFileSync(path.join(outDir, `build-${i + 1}.js`), b.code));
  fs.writeFileSync(path.join(outDir, 'layers.json'), JSON.stringify({ product_id: id, product, scale, cards }, null, 2) + '\n');
  const count = (k) => cards.reduce((s, c) => s + c.layers.filter((l) => l.kind === k).length, 0);
  console.log(`피그마 내보내기: ${path.relative(paths.root, outDir)} — 카드 ${cards.length}장, 글자 ${count('text')} · 도형 ${count('rect')} · 이미지 ${count('raster')}`);
  console.log(`  1) images/ ${count('raster')}개를 upload_assets로 올림 (파일 이름 = 레이어 이름)  2) use_figma에 build-*.js ${batches.length}개 (${batches.map((b) => b.cards.join('·')).join(' / ')})`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { extractInPage, buildCode, buildBatches, compact, FONT_FALLBACK, CODE_LIMIT };
