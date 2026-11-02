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
