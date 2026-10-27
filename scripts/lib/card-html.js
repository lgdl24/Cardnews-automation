// 카드 HTML 만들기와 렌더링 화면 점검 (render.js, calibrate.js가 함께 씀)
const fs = require('fs');
const path = require('path');
const { paths } = require('./common');

const pad = (n) => String(n).padStart(2, '0');

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const toHtmlText = (s) => escapeHtml(s).replace(/\n/g, '<br>');

function buildThemeCss(theme, htmlDir) {
  const faces = Object.entries(theme.font.files).map(([weight, rel]) => {
    const url = path.relative(htmlDir, path.join(paths.root, rel)).split(path.sep).join('/');
    return `@font-face { font-family: '${theme.font.family}'; font-weight: ${weight}; font-display: block; src: url('${url}') format('woff2'); }`;
  });
  const vars = Object.entries(theme.color).map(([k, v]) => `--color-${k}: ${v};`).join(' ');
  return `${faces.join('\n')}\n:root { ${vars} --font-family: '${theme.font.family}'; }`;
}

// extraImages: 입력에서 용도가 제형·배경인 사진 파일명 { texture, scene } (#74). 묶음 템플릿이 {{texture}}·{{scene}} 자리에 넣고, 없으면 대체 모양
function buildCardHtml({ card, cards = [], total, product, tpl, theme, htmlDir, imageDir, imageCrop = null, extraImages = {} }) {
  const template = fs.readFileSync(path.join(paths.root, tpl.file), 'utf8');
  const baseCss = fs.readFileSync(path.join(paths.root, 'templates', 'base.css'), 'utf8');
  const copy = card.copy || {};
  const useImage = tpl.image !== 'none' && card.image;
  const imageSrc = useImage
    ? path.relative(htmlDir, path.join(imageDir, card.image)).split(path.sep).join('/')
    : '';

  const values = {
    sectionLabel: card.role === 'usage' ? 'How to' : `Point ${Math.max(1, cards.filter((c) => ['feature', 'detail'].includes(c.role) && c.no <= card.no).length)}`,
    photoSide: card.no % 2 === 0 ? 'left' : 'right',
    role: escapeHtml(card.role || (card.template === 'cover' ? 'cover' : 'feature')),
    imageCrop: tpl.trimImage && imageCrop && Object.values(imageCrop).every(Number.isFinite)
      && imageCrop.width > 0 && imageCrop.height > 0
      ? `object-view-box: inset(${imageCrop.top * 100}% ${(1-imageCrop.left-imageCrop.width)*100}% ${(1-imageCrop.top-imageCrop.height)*100}% ${imageCrop.left*100}%);` : '',
    page: String(card.no),
    total: String(total),
    product: escapeHtml(product),
    image: escapeHtml(imageSrc),
    imageClass: useImage ? 'has-image' : 'no-image',
    texture: extraImages.texture ? escapeHtml(path.relative(htmlDir, path.join(imageDir, extraImages.texture)).split(path.sep).join('/')) : '',
    scene: extraImages.scene ? escapeHtml(path.relative(htmlDir, path.join(imageDir, extraImages.scene)).split(path.sep).join('/')) : '',
    textureClass: extraImages.texture ? 'has-texture' : 'no-texture',
    sceneClass: extraImages.scene ? 'has-scene' : 'no-scene',
    items: (copy.items || [])
      .map((t) => `<li class="desc__item"><span class="desc__text" data-fit>${toHtmlText(t)}</span></li>`)
      .join(''),
  };
  for (const field of Object.keys(tpl.fields)) {
    if (field !== 'items') values[field] = toHtmlText(copy[field] || '');
  }

  const body = template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in values ? values[key] : ''));
  // 줄마다 크기 맞추기 (data-fit-lines="최대px,최소px", 큰 타이포 묶음 #74): 직접 줄바꿈한 줄을 하나씩 칸 폭에 맞춰 키우거나 줄임.
  // 줄에 쓸 굵기의 글꼴을 먼저 읽은 뒤 잼(늦게 읽히면 다른 글꼴 폭으로 재게 됨). 끝나면 body[data-fit-done] → 출력·점검은 이걸 기다림(waitForFit)
  // 최소 크기로도 넘치면 출력 점검이 OVERFLOW로 잡음
  const fitScript = body.includes('data-fit-lines') ? `<script>
(function () {
  var targets = document.querySelectorAll('[data-fit-lines]');
  var loads = [document.fonts.ready];
  targets.forEach(function (el) {
    var cs = getComputedStyle(el);
    loads.push(document.fonts.load('900 100px ' + cs.fontFamily, el.textContent), document.fonts.load('800 100px ' + cs.fontFamily, el.textContent));
  });
  return Promise.all(loads);
})().catch(function () {}).then(function () {
  document.querySelectorAll('[data-fit-lines]').forEach(function (el) {
    var lim = el.getAttribute('data-fit-lines').split(',').map(Number);
    var parts = el.innerHTML.split(/<br\\s*\\/?>/i).filter(function (p) { return p.trim(); });
    if (!parts.length) return;
    el.innerHTML = parts.map(function (p) { return '<span class="fit-line">' + p + '</span>'; }).join('');
    var W = el.clientWidth;
    // data-fit-lines="첫 줄 최대,최소[,둘째 줄부터 최대]" — 셋째 값이 있으면 첫 줄만 크게(제품명 등)
    el.querySelectorAll('.fit-line').forEach(function (s, i) {
      var max = i > 0 && lim[2] ? lim[2] : lim[0];
      s.style.fontSize = '100px';
      var w = s.getBoundingClientRect().width;
      s.style.fontSize = Math.max(lim[1], Math.min(max, Math.floor(97 * W / w))) + 'px';
      // 최소 크기로도 한 줄에 안 들어가는 줄(줄바꿈 없이 긴 제목)은 최소 크기에서 단어 단위로 자연스럽게 줄바꿈
      if (s.getBoundingClientRect().width > W + 1) { s.style.whiteSpace = 'normal'; s.style.display = 'block'; s.style.wordBreak = 'keep-all'; }
    });
    // 줄을 다 키운 뒤 칸 높이(max-height)를 넘으면 모든 줄을 같은 비율로 줄임 (최소 크기까지)
    var lines = el.querySelectorAll('.fit-line');
    for (var guard = 0; guard < 40 && el.scrollHeight > el.clientHeight + 1; guard++) {
      var shrunk = false;
      lines.forEach(function (s) {
        var px = parseFloat(s.style.fontSize);
        if (px > lim[1]) { s.style.fontSize = Math.max(lim[1], Math.floor(px * 0.97)) + 'px'; shrunk = true; }
      });
      if (!shrunk) break;
    }
  });
  document.body.setAttribute('data-fit-done', '1');
});
</script>` : '';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(product)} - ${pad(card.no)}</title>
<style>
${buildThemeCss(theme, htmlDir)}
${baseCss}
</style>
</head>
<body>
${body}
${fitScript}
</body>
</html>
`;
}

function buildIndexHtml(product, cards) {
  const frames = cards.map((c) => `
    <figure>
      <div class="frame"><iframe src="card-${pad(c.no)}.html" width="1080" height="1080" scrolling="no"></iframe></div>
      <figcaption>${pad(c.no)} · ${escapeHtml(c.role)} · ${escapeHtml(c.template)}</figcaption>
    </figure>`).join('');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(product)} 미리보기</title>
<style>
  body { margin: 0; padding: 32px; background: #eceae7; font-family: sans-serif; }
  h1 { font-size: 20px; margin: 0 0 24px; }
  .grid { display: flex; flex-wrap: wrap; gap: 24px; }
  figure { margin: 0; }
  .frame { width: 360px; height: 360px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
  iframe { border: 0; transform: scale(0.3333); transform-origin: 0 0; }
  figcaption { font-size: 13px; color: #555; margin-top: 8px; }
</style></head>
<body><h1>${escapeHtml(product)} — 카드 ${cards.length}장 미리보기</h1><div class="grid">${frames}</div></body></html>
`;
}

// 렌더링 화면에서 글자 넘침·이미지 로드 실패 점검
// 줄마다 크기 맞추기(data-fit-lines)가 끝날 때까지 기다림. 없는 카드는 바로 지나감
async function waitForFit(page) {
  await page.waitForFunction(() => !document.querySelector('[data-fit-lines]') || document.body.getAttribute('data-fit-done') === '1', null, { timeout: 10000 });
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const issues = [];
    const label = (el) => el.className || el.tagName.toLowerCase();
    document.querySelectorAll('[data-fit]').forEach((el) => {
      if (!el.textContent.trim()) return;
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
        issues.push({ code: 'OVERFLOW', target: label(el), text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 30) });
      }
    });
    const card = document.querySelector('.card');
    if (card && card.scrollHeight > card.clientHeight + 1) {
      issues.push({ code: 'OVERFLOW', target: 'card', text: '카드 전체 높이 초과' });
    }
    document.querySelectorAll('img').forEach((img) => {
      if (img.offsetParent === null) return; // 숨김 처리된 이미지는 제외
      if (!img.complete || img.naturalWidth === 0) {
        issues.push({ code: 'IMAGE_ERROR', target: 'img', text: img.getAttribute('src') });
      }
    });
    // 글자가 제품 이미지와 겹치는지 (표지형처럼 이미지 옆·아래에 글자가 놓이는 템플릿. 이미지 강조형 틀 안 이미지는 제외)
    const overlaps = [];
    const img = [...document.querySelectorAll('img')].find((i) => i.offsetParent !== null && !i.closest('.image__frame'));
    if (img) {
      const r = img.getBoundingClientRect();
      document.querySelectorAll('[data-fit]').forEach((el) => {
        if (!el.textContent.trim()) return;
        // 상자 전체가 아니라 실제 글자가 놓인 줄 상자마다 비교 — 폭을 넓게 잡은 제목 상자나 짧은 줄 옆 빈칸이 오탐하지 않게
        const range = document.createRange();
        range.selectNodeContents(el);
        let px = 0;
        for (const t of range.getClientRects()) {
          const ox = Math.min(r.right, t.right) - Math.max(r.left, t.left);
          const oy = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top);
          if (ox > 0 && oy > 0) px = Math.max(px, oy);
        }
        if (px > 0) overlaps.push({ target: label(el), px: Math.round(px) });
      });
    }
    // 글자 칸끼리 겹치는지 (줄 상자 기준, 6px 이하는 줄 간격 여유로 봄) — 큰 제목이 아래 설명을 덮는 경우 (#74)
    const textOverlaps = [];
    const blocks = [...document.querySelectorAll('[data-fit]')].filter((el) => el.textContent.trim() && el.offsetParent !== null)
      .map((el) => { const rg = document.createRange(); rg.selectNodeContents(el); return { el, rects: [...rg.getClientRects()] }; });
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[i].el.contains(blocks[j].el) || blocks[j].el.contains(blocks[i].el)) continue;
        let px = 0;
        for (const a of blocks[i].rects) {
          for (const b of blocks[j].rects) {
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 0 && oy > 0) px = Math.max(px, oy);
          }
        }
        if (px > 6) textOverlaps.push({ target: `${label(blocks[i].el)} / ${label(blocks[j].el)}`, px: Math.round(px) });
      }
    }
    // 페이지에서 실제로 쓰인 굵기만 로드되므로, 로드 실패가 없고 1개 이상 로드됐는지로 판단
    const faces = [...document.fonts];
    const fontOk = faces.some((f) => f.status === 'loaded') && !faces.some((f) => f.status === 'error');
    return { issues, overlaps, textOverlaps, fontOk };
  });
}

// Playwright Chromium 실행. CHROMIUM_PATH가 있으면 그 브라우저를 씀
async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    const e = new Error('playwright가 설치되어 있지 않아요. npm install 후 npx playwright install chromium 을 실행해 주세요.');
    e.code = 'NO_PLAYWRIGHT';
    throw e;
  }
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

module.exports = { pad, escapeHtml, toHtmlText, buildThemeCss, buildCardHtml, buildIndexHtml, inspectPage, waitForFit, launchBrowser };
