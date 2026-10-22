// 카드 색: 제품 사진 대표 색으로 카드 색 7개 만들기 + 글자 대비 검사·자동 조정 (#38, 제안 이용석 · 구현 이규동)
//
//   1) 대표 색: 사진에서 투명·흰색·회색 픽셀을 빼고, 색상(hue) 10° 구간마다 채도로 가중해 모은 뒤 가장 큰 구간의 평균 색
//      색 있는 픽셀이 2% 미만이면(흰 배경 제품 등) 대표 색 없음 → 기본 테마
//   2) 색 7개: 대표 색의 색상으로 bg·accent·primary·text·muted를 만들고 surface·on-primary는 흰색
//   3) 대비 검사: 템플릿에서 글자가 색 위에 놓이는 7곳을 WCAG 대비 4.5 이상으로.
//      카드는 휴대폰 피드에서 1/3 크기로 보이므로 큰 글자 기준(3.0)이 아니라 일반 글자 기준(4.5)을 씀
//      미달이면 글자 쪽 색(primary·muted·text)을 1%씩 어둡게 해서 맞추고, 그래도 안 되면 경고
//
// 픽셀 읽기만 Playwright 페이지(canvas)에서 하고 나머지는 이 파일의 순수 함수 → 테스트하기 쉬움
const fs = require('fs');
const path = require('path');

const MIN_CONTRAST = 4.5;
const MIN_COLORED_RATIO = 0.02;
const MIN_SATURATION = 0.08; // 이보다 낮으면 회색으로 봄 (연보라 캡 같은 옅은 색은 남김)

// 글자색 / 배경색 — 템플릿에서 실제로 겹치는 곳 (templates/*.html, base.css)
const PAIRS = [
  { fg: 'text', bg: 'bg', where: '본문 글자 / 기본 배경' },
  { fg: 'text', bg: 'accent', where: '표지 제목 / 표지 배경' },
  { fg: 'text', bg: 'surface', where: '설명형 항목 글자 / 흰 상자' },
  { fg: 'muted', bg: 'bg', where: '페이지 번호·제품명 / 기본 배경' },
  { fg: 'muted', bg: 'accent', where: '페이지 번호·제품명 / 표지 배경' },
  { fg: 'on-primary', bg: 'primary', where: '뱃지 글자 / 뱃지 배경' },
  { fg: 'primary', bg: 'accent', where: '설명형 번호 / 번호 배경' },
];
// 대비가 모자라면 어둡게 할 수 있는 글자 색 (배경 쪽은 그대로 둠). 뱃지는 배경(primary)을 어둡게 함
const ADJUSTABLE = { text: 'text', muted: 'muted', primary: 'primary', 'on-primary': 'primary' };

// ── 색 변환
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const hsl = (h, s, l) => rgbToHex(hslToRgb([h, s, l]));

// WCAG 2.x 상대 휘도·대비
function luminance(hex) {
  const lin = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// ── 1) 대표 색. pixels: [r,g,b,a, r,g,b,a, …] (canvas getImageData 그대로)
function representativeColor(pixels) {
  const bins = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let opaque = 0;
  let colored = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 128) continue; // 투명 (누끼컷 배경)
    opaque++;
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (l > 0.92 || l < 0.08 || s < MIN_SATURATION) continue; // 흰색·검정·회색
    colored++;
    const bin = bins[Math.floor(h / 10) % 36];
    bin.w += s;
    bin.r += rgb[0] * s;
    bin.g += rgb[1] * s;
    bin.b += rgb[2] * s;
  }
  const ratio = opaque ? colored / opaque : 0;
  if (!opaque || ratio < MIN_COLORED_RATIO) return { hex: null, colored_ratio: round(ratio, 3) };
  const best = bins.reduce((m, b) => (b.w > m.w ? b : m));
  return { hex: rgbToHex([best.r / best.w, best.g / best.w, best.b / best.w]), colored_ratio: round(ratio, 3) };
}

// ── 2) 색 7개 (조정 전). 배경 쪽(bg·accent)은 채도를 고정해 옅은 제품 색도 분위기가 나게 함
function paletteFromColor(hex) {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  return {
    bg: hsl(h, 0.25, 0.97),
    surface: '#FFFFFF',
    text: hsl(h, 0.2, 0.15),
    muted: hsl(h, 0.1, 0.4),
    primary: hsl(h, clamp(s, 0.35, 0.55), 0.5),
    accent: hsl(h, 0.25, 0.9),
    'on-primary': '#FFFFFF',
  };
}

// ── 3) 대비 검사 · 자동 조정
function checkContrast(color, min = MIN_CONTRAST) {
  return PAIRS.map((p) => {
    const ratio = contrast(color[p.fg], color[p.bg]);
    return { fg: p.fg, bg: p.bg, where: p.where, ratio: round(ratio), ok: ratio >= min };
  });
}

// 모자란 곳의 글자 색(뱃지는 배경)을 HSL 밝기 1%씩 낮춤. 반환: { color, adjustments: [{ key, from, to }], checks, ok }
function adjustContrast(input, min = MIN_CONTRAST) {
  const color = { ...input };
  const original = { ...input };
  for (let guard = 0; guard < 200; guard++) {
    const bad = checkContrast(color, min).find((c) => !c.ok);
    if (!bad) break;
    const key = ADJUSTABLE[bad.fg];
    const [h, s, l] = rgbToHsl(hexToRgb(color[key]));
    if (l <= 0.12) break; // 더 어둡게 할 수 없음 → 경고로 남김
    color[key] = hsl(h, s, l - 0.01);
  }
  const adjustments = Object.keys(color)
    .filter((k) => color[k] !== original[k])
    .map((k) => ({ key: k, from: original[k], to: color[k], lightness_from: round(rgbToHsl(hexToRgb(original[k]))[2]), lightness_to: round(rgbToHsl(hexToRgb(color[k]))[2]) }));
  const checks = checkContrast(color, min);
  return { color, adjustments, checks, ok: checks.every((c) => c.ok) };
}

/**
 * 카드 색 정하기
 * @param {object} o
 * @param {'기본'|'제품 색'} o.mode
 * @param {object} o.baseColor   config/theme.json의 color
 * @param {number[]|null} o.pixels  제품 사진 픽셀 (제품 색일 때)
 * @param {string|null} o.image  픽셀을 읽은 이미지 파일명 (기록용)
 * @param {string|null} o.readError  사진을 읽다 난 오류 (기본 색으로 대신함)
 * @returns {{ mode, source, image, representative, colored_ratio, color, adjustments, checks, ok, note }}
 */
function decideColors({ mode = '기본', baseColor, pixels = null, image = null, readError = null }) {
  let source = 'theme';
  let representative = null;
  let coloredRatio = null;
  let base = baseColor;
  let note = null;
  if (mode === '제품 색') {
    if (readError) note = `제품 사진(${image})을 읽지 못해 기본 색을 썼어요: ${readError}`;
    else if (!pixels) note = '카드에 쓸 수 있는 제품 사진이 없어 기본 색을 썼어요';
    else {
      const rep = representativeColor(pixels);
      coloredRatio = rep.colored_ratio;
      if (!rep.hex) note = `제품 사진에 색 있는 부분이 적어(${Math.round(rep.colored_ratio * 100)}%) 기본 색을 썼어요`;
      else {
        source = 'product';
        representative = rep.hex;
        base = { ...baseColor, ...paletteFromColor(rep.hex) };
      }
    }
  }
  const adjusted = adjustContrast(base);
  return {
    mode,
    source,
    image: source === 'product' ? image : null,
    representative,
    colored_ratio: coloredRatio,
    ...adjusted,
    note,
  };
}

// 카드 색 설정값 읽기 (입력 양식 '제작 조건 > 카드 색')
const COLOR_MODES = ['기본', '제품 색'];
function colorModeOf(input) {
  const v = ((input && input.cond && input.cond['카드 색']) || '').split('\n')[0].trim();
  if (v) return COLOR_MODES.includes(v) ? v : '기본';
  // 비우면 무드의 기본 색(_designs.<무드>._defaults.colorMode). common.js를 위에서 불러오면 순환 참조가 생길 수 있어 여기서 불러옴
  const { loadConfig } = require('./common');
  return loadConfig(input).templates._defaults?.colorMode || '기본';
}

// 대표 색을 읽을 사진: 카드에 쓰인 첫 이미지 → 없으면 입력의 첫 이미지 (사용 가능 여부 '불가'는 제외)
function pickProductImage({ data, input, imageDir }) {
  const blocked = new Set((input.images || []).filter((i) => i.usage === '불가').map((i) => i.file));
  const candidates = [
    ...(data.cards || []).map((c) => c.image).filter(Boolean),
    ...(input.images || []).map((i) => i.file).filter(Boolean),
  ];
  return candidates.find((f) => !blocked.has(f) && fs.existsSync(path.join(imageDir, f))) || null;
}

// Playwright 페이지에서 이미지 픽셀 읽기 (최대 200px로 줄여서)
// file:// 이미지는 빈 페이지에서 막히므로 data URL로 넘김
async function readPixels(page, file, { withBounds = false } = {}) {
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const src = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  return page.evaluate(async ({ src, withBounds }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const pixels = Array.from(ctx.getImageData(0, 0, w, h).data);
    if (!withBounds) return pixels;
    // 투명하지 않은(알파 8 초과) 픽셀이 있는 범위. 전부 투명하면 null (자르지 않음)
    let left = w;
    let top = h;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (pixels[(y * w + x) * 4 + 3] <= 8) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    const bounds = right < left ? null : { left: left / w, top: top / h, width: (right - left + 1) / w, height: (bottom - top + 1) / h };
    return { pixels, bounds };
  }, { src, withBounds });
}

module.exports = {
  MIN_CONTRAST, PAIRS, COLOR_MODES,
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb, luminance, contrast,
  representativeColor, paletteFromColor, checkContrast, adjustContrast, decideColors, colorModeOf, pickProductImage, readPixels,
};
