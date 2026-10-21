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

function buildCardHtml({ card, cards = [], total, product, tpl, theme, htmlDir, imageDir, imageCrop = null }) {
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
    items: (copy.items || [])
      .map((t) => `<li class="desc__item"><span class="desc__text" data-fit>${toHtmlText(t)}</span></li>`)
      .join(''),
  };
  for (const field of Object.keys(tpl.fields)) {
    if (field !== 'items') values[field] = toHtmlText(copy[field] || '');
  }

  const body = template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in values ? values[key] : ''));
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
        const t = el.getBoundingClientRect();
        const ox = Math.min(r.right, t.right) - Math.max(r.left, t.left);
        const oy = Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top);
        if (ox > 0 && oy > 0) overlaps.push({ target: label(el), px: Math.round(oy) });
      });
    }
    // 페이지에서 실제로 쓰인 굵기만 로드되므로, 로드 실패가 없고 1개 이상 로드됐는지로 판단
    const faces = [...document.fonts];
    const fontOk = faces.some((f) => f.status === 'loaded') && !faces.some((f) => f.status === 'error');
    return { issues, overlaps, fontOk };
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

module.exports = { pad, escapeHtml, toHtmlText, buildThemeCss, buildCardHtml, buildIndexHtml, inspectPage, launchBrowser };
