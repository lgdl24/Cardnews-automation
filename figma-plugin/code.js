// 자동 생성 파일 — 고치지 말고 figma-plugin/main.src.js·scripts/lib/figma-builder.js를 고친 뒤 npm run figma-plugin
const FONT_FALLBACK = ["Pretendard","Gothic A1","Noto Sans KR"];
async function buildCardFrames(figma, cards, opts) {
  const FALLBACK = opts.fallback || ['Pretendard', 'Gothic A1', 'Noto Sans KR'];
  const STYLE = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
  const ALT = { SemiBold: ['Semi Bold', 'Medium', 'Bold'], ExtraBold: ['Extra Bold', 'Bold', 'Black'], Medium: ['Regular'], Black: ['ExtraBold', 'Extra Bold', 'Bold'], Thin: ['ExtraLight', 'Light'], ExtraLight: ['Light', 'Regular'], Light: ['Regular'], Bold: ['ExtraBold', 'SemiBold'] };
  const available = await figma.listAvailableFontsAsync();
  const has = new Set(available.map((f) => f.fontName.family + '|' + f.fontName.style));
  const fontUsed = {};
  const pickFont = (family, weight) => {
    const want = STYLE[Math.round(weight / 100) * 100] || 'Regular';
    for (const fam of [family, ...FALLBACK]) {
      for (const st of [want, ...(ALT[want] || []), 'Regular']) {
        if (has.has(fam + '|' + st)) { fontUsed[family + ' ' + weight] = fam + ' ' + st; return { family: fam, style: st }; }
      }
    }
    return { family: 'Inter', style: 'Regular' };
  };

  const pageName = cards[0].page;
  let page = figma.root.children.find((p) => p.name === pageName);
  if (!page) { page = figma.createPage(); page.name = pageName; }
  await figma.setCurrentPageAsync(page);

  const fonts = new Map();
  for (const card of cards) {
    for (const l of card.layers.filter((x) => x.kind === 'text')) {
      for (const r of [l, ...(l.runs || [])]) { const f = pickFont(r.family, r.weight); fonts.set(f.family + '|' + f.style, f); }
    }
  }
  await Promise.all([...fonts.values()].map((f) => figma.loadFontAsync(f)));
  const solid = (c) => ({ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a });

  const frames = [];
  const missing = [];
  for (const card of cards) {
    const hashes = {};
    let cardMissing = false;
    for (const l of card.layers.filter((x) => x.kind === 'raster')) {
      const h = await opts.imageHash(l, card, page);
      if (!h) { missing.push(l.upload); cardMissing = true; continue; }
      hashes[l.id] = h;
    }
    if (cardMissing) continue;
    // 같은 이름 프레임은 지우고 다시 만듦 (카드 1장만 다시 가져오기 가능)
    for (const old of page.children.filter((n) => n.type === 'FRAME' && n.name === card.file)) old.remove();
    const frame = figma.createFrame();
    frame.name = card.file; frame.resize(card.width, card.height); frame.clipsContent = true; frame.fills = [];
    frame.x = (card.no - 1) * (card.width + 80); frame.y = 0;
    page.appendChild(frame);
    for (const l of card.layers) {
      let n;
      let dx = 0;
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
        for (const r of l.runs || []) {
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
        dx = l.align === 'CENTER' ? (w - l.box.w) / 2 : l.align === 'RIGHT' ? (w - l.box.w) : 0;
      }
      n.name = l.name;
      frame.appendChild(n);
      n.x = l.box.x - dx; n.y = l.box.y;
    }
    frames.push(frame.id);
  }
  return { pageId: page.id, frames, fonts: fontUsed, missing };
}
// 피그마 플러그인 본체 (피그마 안에서 실행). 이 파일과 scripts/lib/figma-builder.js를 합쳐 code.js를 만듦:
//   node scripts/build-figma-plugin.js   (npm run figma-plugin)
// 화면(ui.html)이 작업실과 통신하고, 여기서는 피그마 문서만 다룸
//   build   : 받은 카드 레이어·이미지로 제품 페이지에 card-01~ 프레임을 만듦 (같은 이름은 다시 만듦)
//   collect : 제품 페이지의 card-NN 프레임을 1080px PNG + 글자 레이어 내용으로 모아 화면에 넘김 → 작업실로 보냄

/* global figma, __html__, buildCardFrames, FONT_FALLBACK */
figma.showUI(__html__, { width: 360, height: 520, themeColors: true });

const STORE_KEY = 'cardnews-studio';
(async () => {
  const saved = (await figma.clientStorage.getAsync(STORE_KEY)) || {};
  figma.ui.postMessage({ type: 'init', saved, currentPage: figma.currentPage.name });
})();

const productPage = (id) => figma.root.children.find((p) => p.name.endsWith(`(${id})`));

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'save') {
      await figma.clientStorage.setAsync(STORE_KEY, msg.data);
      return;
    }
    if (msg.type === 'build') {
      const hashes = {};
      for (const [name, bytes] of Object.entries(msg.images)) hashes[name] = figma.createImage(new Uint8Array(bytes)).hash;
      const r = await buildCardFrames(figma, msg.cards, { imageHash: (l) => hashes[l.upload] || null, fallback: FONT_FALLBACK });
      const frames = figma.currentPage.children.filter((n) => r.frames.includes(n.id));
      figma.currentPage.selection = frames;
      if (frames.length) figma.viewport.scrollAndZoomIntoView(frames);
      figma.ui.postMessage({ type: 'built', frames: frames.length, fonts: r.fonts, missing: r.missing });
      return;
    }
    if (msg.type === 'collect') {
      const page = productPage(msg.id);
      if (!page) throw new Error('이 제품 페이지가 없어요. 먼저 "피그마로 가져오기"를 해 주세요.');
      await page.loadAsync();
      const frames = page.children.filter((n) => n.type === 'FRAME' && /^card-\d{2}$/.test(n.name)).sort((a, b) => a.name.localeCompare(b.name));
      if (!frames.length) throw new Error('보낼 카드 프레임(card-01 ~)이 없어요.');
      const cards = [];
      for (const f of frames) {
        const scale = f.width ? 1080 / f.width : 1;
        const png = await f.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
        const texts = f.findAll((n) => n.type === 'TEXT' && n.visible).map((t) => ({ name: t.name, text: t.characters }));
        cards.push({ file: f.name, png, texts });
      }
      figma.ui.postMessage({ type: 'collected', id: msg.id, cards });
      return;
    }
    if (msg.type === 'close') figma.closePlugin();
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: String((e && e.message) || e) });
  }
};

