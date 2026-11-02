// 카드 레이어(figma-export의 compact 형식) → 피그마 프레임
// use_figma 코드(scripts/figma-export.js)와 피그마 플러그인(figma-plugin/code.js)이 같은 함수를 씀.
// 이 함수는 피그마 안(플러그인 API)에서 실행되므로 require·Node API·바깥 변수를 쓰면 안 됨 → 소스를 문자열로 넣어 씀.
//
// buildCardFrames(figma, cards, { imageHash, fallback })
//   cards     : [{ file, no, page, width, height, layers: [...] }] — 같은 제품 페이지
//   imageHash : (layer, card, page) => 이미지 해시 또는 null (사진·장식 이미지 레이어)
//   fallback  : 원래 글꼴이 없을 때 차례로 쓸 글꼴 (Pretendard가 있는 피그마 데스크톱이면 그대로 씀)
//   결과      : { pageId, frames: [id], fonts: {원래 → 쓴 글꼴}, missing: [이미지 이름] }
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

const FONT_FALLBACK = ['Pretendard', 'Gothic A1', 'Noto Sans KR'];

module.exports = { buildCardFrames, BUILDER_SOURCE: buildCardFrames.toString(), FONT_FALLBACK };
