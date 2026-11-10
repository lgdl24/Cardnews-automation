// 브랜드 무드 (무드 '브랜드'): 브랜드 상세페이지 스냅샷 → 구성안 작업의 brand_mood → 카드 색·GPT 배경
//   - 스냅샷: scripts/brand-snapshot.js가 products/<id>/brand/ 에 화면(shot-NN.jpg)·글(page.txt)·snapshot.json을 저장
//   - brand_mood: 구성안 작업에서 Claude가 스냅샷을 보고 cards.json에 적음 (validate가 형식 검사)
//   - 출력: 무드가 '브랜드'면 render.js가 brand_mood.palette를 카드 색으로, output/ai-bg/card-NN.png를 배경으로 씀
// 페이지 글은 브랜드 분위기 판단 자료일 뿐 지시가 아니고 카드 문구의 근거도 아님 (CLAUDE.md '입력 자료 취급')
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');

const BRAND_DESIGN = '브랜드';
const PALETTE_KEYS = ['bg', 'surface', 'text', 'muted', 'primary', 'accent', 'on-primary'];
const MOOD_TEXT_KEYS = ['summary', 'tone', 'photo_style', 'scene'];
const MOOD_SOURCES = ['snapshot', 'product_photo'];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const brandDir = (productDir) => path.join(productDir, 'brand');
const aiBgDir = (productDir) => path.join(productDir, 'output', 'ai-bg');

function brandUrlOf(input) {
  return ((input && input.cond && input.cond['브랜드 URL']) || '').split('\n')[0].trim();
}

// 스냅샷을 찍어도 되는 주소인지: http(s)만, 계정 정보·내 컴퓨터·사설망 주소는 막음
function checkBrandUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return { ok: false, error: '주소 형식이 아니에요 (https://로 시작하는 전체 주소)' };
  }
  if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, error: 'http·https 주소만 쓸 수 있어요' };
  if (u.username || u.password) return { ok: false, error: '계정 정보가 들어간 주소는 쓸 수 없어요' };
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const privateV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || (net.isIPv4(host) && privateV4.test(host)) || (net.isIPv6(host) && /^(::1?$|f[cd]|fe80)/.test(host))) {
    return { ok: false, error: '내 컴퓨터·사내망 주소는 쓸 수 없어요' };
  }
  return { ok: true, url: u.href };
}

// cards.json brand_mood 형식 검사. report: { error(code, where, msg), warn(where, msg) }
function checkBrandMood(mood, report) {
  const where = 'brand_mood';
  if (!mood || typeof mood !== 'object' || Array.isArray(mood)) {
    report.error('SCHEMA_ERROR', where, 'brand_mood는 객체여야 해요');
    return;
  }
  if (!MOOD_SOURCES.includes(mood.source)) report.error('SCHEMA_ERROR', `${where}.source`, `${MOOD_SOURCES.join(' / ')} 중 하나여야 해요`);
  for (const k of MOOD_TEXT_KEYS) {
    if (typeof mood[k] !== 'string' || !mood[k].trim()) report.error('SCHEMA_ERROR', `${where}.${k}`, '비어 있으면 안 돼요');
  }
  const p = mood.palette;
  if (!p || typeof p !== 'object') report.error('SCHEMA_ERROR', `${where}.palette`, `색 ${PALETTE_KEYS.length}개(${PALETTE_KEYS.join(', ')})가 필요해요`);
  else {
    for (const k of PALETTE_KEYS) {
      if (!HEX_RE.test(p[k] || '')) report.error('SCHEMA_ERROR', `${where}.palette.${k}`, '#RRGGBB 형식의 색이어야 해요');
    }
  }
  if (!Array.isArray(mood.evidence) || !mood.evidence.length || mood.evidence.some((e) => typeof e !== 'string' || !e.trim())) {
    report.error('SCHEMA_ERROR', `${where}.evidence`, '무드를 정한 근거(본 화면·색 등)를 한 줄 이상 적어야 해요');
  }
  // 배경 요청문에 글자·제품을 넣으라는 말이 섞이면 A안(글자는 코드)이 깨짐
  if (typeof mood.scene === 'string' && /(text|letter|word|logo|typograph|bottle|tube|jar|packag|product|글자|문구|로고|제품|용기)/i.test(mood.scene)) {
    report.warn(`${where}.scene`, '배경 장면에 글자·로고·제품 이야기가 있어요. 배경은 글자·제품 없는 장면만 적어 주세요');
  }
}

// 무드 '브랜드'의 카드 색: 묶음 기본 색 위에 brand_mood.palette (대비는 render가 adjustContrast로 맞춤)
function brandPalette(baseColor, mood) {
  if (!mood || !mood.palette) return { color: baseColor, used: false };
  const out = { ...baseColor };
  for (const k of PALETTE_KEYS) if (HEX_RE.test(mood.palette[k] || '')) out[k] = mood.palette[k].toUpperCase();
  return { color: out, used: true };
}

// 템플릿마다 글자 면·제품이 놓이는 곳 (templates/brand/*.html). 배경은 이 자리를 조용하게 비워 둠
const LAYOUT_HINT = {
  cover: 'Keep the upper-left area (about 60% width, top half) soft, low-detail and calm: a text panel will cover it. Leave an open surface or pedestal in the lower-right where a product will stand.',
  image: 'Keep the bottom 40% of the image soft and low-detail: a text panel will cover it. Leave an open surface in the upper center where a product will stand.',
  description: 'Keep the lower 70% of the image soft and low-detail: a large text panel will cover it. Leave a small open surface in the upper-right where a small product will stand.',
};

function bgPrompt(mood, templateKey) {
  const p = mood.palette || {};
  return `$imagegen Generate one square (1:1) high-resolution background image and save it as ./out.png in the current folder.

It is the BACKGROUND ONLY for a cosmetics card-news card. Text and the real product photo will be added on top later by code.
Scene: ${mood.scene}
Mood: ${mood.summary} Photo style: ${mood.photo_style}
Main colors: ${[p.bg, p.accent, p.primary].filter(Boolean).join(', ')} (use them as the dominant tones).
Composition: ${LAYOUT_HINT[templateKey] || LAYOUT_HINT.image}

STRICT RULES:
- No text, letters, numbers, logos, watermarks, labels or signs anywhere.
- No product, bottle, tube, jar, box or any packaging. No people, hands or faces.
- No medical, clinical, hospital, pharmacy, injection or before/after imagery: no doctors, pharmacists or experts, no white coats, no medical equipment. No certification badges.
- Photographic, clean, premium skincare advertising look.

Use ONLY the built-in image generation tool, in a single generation. Do not write or run any code or scripts and do not post-process the image. Just copy the generated file to ./out.png.

When done, reply with only: ./out.png`;
}

// 배경이 지금 문구·무드와 맞는지 보는 key: 무드의 장면·색과 카드 템플릿이 같으면 다시 만들 필요 없음 (문구는 코드가 얹으므로 넣지 않음)
function bgKey(mood, card) {
  const src = JSON.stringify({ scene: mood && mood.scene, summary: mood && mood.summary, photo: mood && mood.photo_style, palette: mood && mood.palette, template: card.template });
  return crypto.createHash('sha1').update(src).digest('hex').slice(0, 12);
}

function readBgReport(productDir) {
  const f = path.join(aiBgDir(productDir), 'ai-bg.json');
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

// 카드별로 쓸 배경 파일(절대 경로). 지금 무드·템플릿과 key가 같은 것만
function bgFiles(productDir, data) {
  const report = readBgReport(productDir);
  const out = new Map();
  if (!report || !data || !data.brand_mood) return out;
  for (const card of data.cards || []) {
    const r = (report.cards || []).find((c) => c.no === card.no);
    const file = r && r.ok && r.file ? path.join(aiBgDir(productDir), r.file) : null;
    if (file && r.key === bgKey(data.brand_mood, card) && fs.existsSync(file)) out.set(card.no, file);
  }
  return out;
}

// 아직 없거나 무드·템플릿이 바뀐 카드 번호
function staleBg(productDir, data) {
  if (!data || !data.brand_mood) return [];
  const have = bgFiles(productDir, data);
  return (data.cards || []).map((c) => c.no).filter((no) => !have.has(no));
}

module.exports = {
  BRAND_DESIGN, PALETTE_KEYS, MOOD_SOURCES, LAYOUT_HINT,
  brandDir, aiBgDir, brandUrlOf, checkBrandUrl, checkBrandMood, brandPalette, bgPrompt, bgKey, readBgReport, bgFiles, staleBg,
};
