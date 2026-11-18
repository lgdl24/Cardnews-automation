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
  if (mood.layout !== undefined && !BRAND_LAYOUTS[mood.layout]) report.error('SCHEMA_ERROR', `${where}.layout`, `${Object.keys(BRAND_LAYOUTS).join(' / ')} 중 하나여야 해요`);
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

// 카드 배치(brand_mood.layout). 레퍼런스(config/mood-references.json)의 layout_id로 고름. 없으면 panel
//   dir: 템플릿 폴더, frames: 제품 사진 자리(1080 기준, 템플릿의 .brand__photo와 같게), hints: GPT 배경 구도
const BRAND_LAYOUTS = {
  panel: { dir: 'templates/brand', frames: null, hints: LAYOUT_HINT },
  // 면 없이 글자를 장면 위에 바로: 큰 영문 세리프 단어가 제품 뒤에 깔리고, 가는 선·작은 캡션으로 정돈 (에디토리얼 레퍼런스)
  editorial: {
    dir: 'templates/brand/editorial',
    frames: {
      cover: { x: 560, y: 300, w: 460, h: 720 },
      image: { x: 300, y: 150, w: 480, h: 520 },
      description: { x: 780, y: 70, w: 230, h: 300 },
    },
    hints: {
      cover: 'Keep the left half bright, plain and low-detail: text will be placed directly on it without any panel. Leave an open surface in the lower-right where a tall product will stand.',
      image: 'Keep the bottom 35% bright, plain and low-detail: text will be placed directly on it. Leave an open surface in the center where a product will stand.',
      description: 'Keep the lower 65% very bright, plain and low-detail: text will cover it. The upper 35% can show the scene. Leave a small open surface in the upper-right where a small product will stand.',
    },
  },
  // 어두운 장면 위 가운데 정렬: 큰 이탤릭 단어 한 개가 주인공, 흰 글자 (몰입형 레퍼런스)
  immersive: {
    dir: 'templates/brand/immersive',
    frames: {
      cover: { x: 400, y: 720, w: 280, h: 300 },
      image: { x: 290, y: 90, w: 500, h: 520 },
      description: { x: 800, y: 60, w: 200, h: 240 },
    },
    hints: {
      cover: 'A dark, moody, low-key scene. Keep the upper 65% soft, dark and low-detail: light text will be placed on it. Leave a small open surface at the bottom center where a small product will stand.',
      image: 'A dark, moody, low-key scene. Keep the bottom 35% dark and low-detail: light text will be placed on it. Leave an open surface in the upper center where a product will stand.',
      description: 'A dark, moody, low-key scene, very soft and low-detail almost everywhere: light text will cover most of it. Leave a small open surface in the upper-right where a small product will stand.',
    },
  },
};
// 문제 제시 표지형(템플릿 question, 규칙 v2 질문 제목): 배치가 dialogue·chat·notice면 그 모양, 그 밖의 배치는 검색창(dialogue)
const QUESTION = {
  frame: { x: 600, y: 380, w: 420, h: 640 },
  hint: 'Keep the left 55% bright, plain and low-detail: a white rounded box and text will be placed directly on it. Leave an open surface in the lower-right where a product will stand.',
};
for (const l of Object.values(BRAND_LAYOUTS)) {
  if (l.frames) l.frames.question = QUESTION.frame;
  l.hints = { ...l.hints, question: QUESTION.hint };
}
// 표지형 셋은 템플릿 question만 따로, 나머지 카드(마무리 표지 포함)는 editorial (fallback)
BRAND_LAYOUTS.dialogue = {
  dir: 'templates/brand/dialogue',
  fallback: 'editorial',
  frames: { ...BRAND_LAYOUTS.editorial.frames, question: QUESTION.frame },
  hints: { ...BRAND_LAYOUTS.editorial.hints, question: QUESTION.hint },
};
// 채팅형·알림형 문제→해결 표지: dialogue와 같이 표지만 따로, 나머지는 editorial
const qaLayout = (dir, question, hint) => ({ dir, fallback: 'editorial', frames: { ...BRAND_LAYOUTS.editorial.frames, question }, hints: { ...BRAND_LAYOUTS.editorial.hints, question: hint } });
BRAND_LAYOUTS.chat = qaLayout('templates/brand/chat', { x: 610, y: 420, w: 410, h: 600 },
  'Keep the left 55% bright, plain and low-detail: chat-bubble shaped boxes and text will be placed directly on it. Leave an open surface in the lower-right where a product will stand.');
BRAND_LAYOUTS.notice = qaLayout('templates/brand/notice', { x: 620, y: 400, w: 400, h: 620 },
  'Keep the left 55% bright, plain and low-detail: a white notification card and text will be placed directly on it. Leave an open surface in the lower-right where a product will stand.');
const layoutOf = (mood) => (mood && BRAND_LAYOUTS[mood.layout] ? mood.layout : 'panel');
const hintFor = (mood, templateKey) => {
  const h = BRAND_LAYOUTS[layoutOf(mood)].hints;
  return h[templateKey] || h.image;
};
// 카드 템플릿 파일: 배치 폴더에 그 템플릿이 있으면 그 파일, 없으면 기본(panel)
function brandTemplate(tpl, mood, templateKey, root) {
  const layout = layoutOf(mood);
  if (layout === 'panel' || !tpl) return tpl;
  // 배치 폴더에 없으면 fallback 배치(dialogue → editorial), 그래도 없으면 기본
  for (let l = layout; l && l !== 'panel'; l = BRAND_LAYOUTS[l].fallback) {
    const file = `${BRAND_LAYOUTS[l].dir}/${templateKey}.html`;
    if (fs.existsSync(path.join(root, file))) return { ...tpl, file };
  }
  return tpl;
}

// 배경 내용 (Codex·ChatGPT 채팅 공통): 장면·분위기·색·글자 면 자리·금지 사항
function bgBody(mood, templateKey, productHex = null) {
  const p = mood.palette || {};
  const harmony = productHex ? `
The product that will be shown has the main color ${productHex}: choose scene tones that harmonize with it (no clashing hues).` : '';
  return `It is the BACKGROUND ONLY for a cosmetics card-news card. Text and the real product photo will be added on top later by code.
Scene: ${mood.scene}
Mood: ${mood.summary} Photo style: ${mood.photo_style}
Main colors: ${[p.bg, p.accent, p.primary].filter(Boolean).join(', ')} (use them as the dominant tones).
Composition: ${hintFor(mood, templateKey)}${harmony}

STRICT RULES:
- No text, letters, numbers, logos, watermarks, labels or signs anywhere.
- No product, bottle, tube, jar, box or any packaging. No people, hands or faces.
- No medical, clinical, hospital, injection or before/after imagery. No certification badges.
- Photographic, clean, premium skincare advertising look.`;
}

// 로컬 Codex CLI용 (ai-bg.js 자동 생성)
function bgPrompt(mood, templateKey, productHex = null) {
  return `$imagegen Generate one square (1:1) high-resolution background image and save it as ./out.png in the current folder.

${bgBody(mood, templateKey, productHex)}

Use ONLY the built-in image generation tool, in a single generation. Do not write or run any code or scripts and do not post-process the image. Just copy the generated file to ./out.png.

When done, reply with only: ./out.png`;
}

// ChatGPT 채팅창에 붙여 넣는 요청문 (사람이 만든 이미지를 받아 작업실에 올림)
function chatPrompt(mood, templateKey, productHex = null) {
  return `Create one square (1:1) high-resolution image.

${bgBody(mood, templateKey, productHex)}

Reply with the image only.`;
}

// 제품 사진 자리 (1080 기준, templates/brand/*.html의 .brand__photo). object-fit: contain + 아래 가운데 정렬과 같은 계산
const PRODUCT_FRAME = {
  cover: { x: 560, y: 420, w: 460, h: 600 },
  image: { x: 290, y: 70, w: 500, h: 500 },
  description: { x: 740, y: 96, w: 260, h: 250 },
};
// layout: brand_mood.layout (없으면 panel)
const frameFor = (templateKey, layout = 'panel') => ((BRAND_LAYOUTS[layout] && BRAND_LAYOUTS[layout].frames) || { ...PRODUCT_FRAME, question: QUESTION.frame })[templateKey] || null;
function productBoxFor(templateKey, w, h, size = 1080, layout = 'panel') {
  const fr = frameFor(templateKey, layout);
  if (!fr) return null;
  const k = Math.min(fr.w / w, fr.h / h);
  const pw = Math.round(w * k);
  const ph = Math.round(h * k);
  const r = size / 1080;
  return { x: Math.round((fr.x + (fr.w - pw) / 2) * r), y: Math.round((fr.y + fr.h - ph) * r), w: Math.round(pw * r), h: Math.round(ph * r) };
}

// 제품을 넣은 바탕을 주고 주변 장면·그림자·반사만 그리게 함 (제품은 잠금: 끝나면 원본 사진으로 다시 덮음). 글자는 넣지 않음
function compositePrompt(mood, templateKey, productHex = null) {
  const p = mood.palette || {};
  return `$imagegen Edit the attached image and save the result as ./out.png in the current folder (square, 1:1).

THE PRODUCT IS LOCKED. The attached image already contains the real product photo. Keep it EXACTLY as it is:
same position, same size, same angle, same shape, same colors, same label and printed text.
Do NOT redraw, retouch, recolor, relight, rotate, scale, move, crop or duplicate the product.
Do NOT place anything in front of or overlapping the product.

Replace the plain gray background with a cosmetics advertising scene in which the product naturally stands:
Scene: ${mood.scene}
Mood: ${mood.summary} Photo style: ${mood.photo_style}
Main colors: ${[p.bg, p.accent, p.primary].filter(Boolean).join(', ')}${productHex ? `, harmonized with the product's own color ${productHex}` : ''}.
Make the product sit ON a real surface in the scene: matching perspective and horizon, a soft natural contact shadow under it,
and subtle reflections/caustics around it that match the scene lighting.
Composition: ${hintFor(mood, templateKey)}

STRICT RULES:
- No text, letters, numbers, logos, watermarks or signs anywhere (other than the product's own label, unchanged).
- No other product, bottle, tube, jar or packaging. No people, hands or faces.
- No medical, clinical, hospital, injection or before/after imagery. No certification badges.

Use ONLY the built-in image generation tool, in a single generation. Do not write or run any code or scripts and do not post-process the image. Just copy the generated file to ./out.png.

When done, reply with only: ./out.png`;
}

// 배경이 지금 문구·무드와 맞는지 보는 key: 무드의 장면·색과 카드 템플릿이 같으면 다시 만들 필요 없음 (문구는 코드가 얹으므로 넣지 않음)
// 제품 사진이 바뀌면(제품을 넣어 합성하므로) 다시 만듦. v2: 제품 잠금 합성
function bgKey(mood, card) {
  // 배치가 panel이 아니면 key에 넣음 (제품 자리·글자 자리가 달라 배경을 다시 만들어야 함). panel은 예전 key 그대로
  const src = JSON.stringify({ v: 2, ...(layoutOf(mood) !== 'panel' ? { layout: layoutOf(mood) } : {}), scene: mood && mood.scene, summary: mood && mood.summary, photo: mood && mood.photo_style, palette: mood && mood.palette, template: card.template, image: card.image || null });
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

// 카드별로 쓸 배경: { file(절대 경로), baked(제품이 이미 합성됨 → 출력이 제품 사진을 다시 얹지 않음) }. 지금 무드·템플릿·사진과 key가 같은 것만
function bgEntries(productDir, data) {
  const report = readBgReport(productDir);
  const out = new Map();
  if (!report || !data || !data.brand_mood) return out;
  for (const card of data.cards || []) {
    const r = (report.cards || []).find((c) => c.no === card.no);
    const file = r && r.ok && r.file ? path.join(aiBgDir(productDir), r.file) : null;
    if (file && r.key === bgKey(data.brand_mood, card) && fs.existsSync(file)) out.set(card.no, { file, baked: Boolean(r.baked) });
  }
  return out;
}
function bgFiles(productDir, data) {
  return new Map([...bgEntries(productDir, data)].map(([no, e]) => [no, e.file]));
}

// 아직 없거나 무드·템플릿이 바뀐 카드 번호
function staleBg(productDir, data) {
  if (!data || !data.brand_mood) return [];
  const have = bgFiles(productDir, data);
  return (data.cards || []).map((c) => c.no).filter((no) => !have.has(no));
}

module.exports = {
  BRAND_DESIGN, PALETTE_KEYS, MOOD_SOURCES, LAYOUT_HINT, BRAND_LAYOUTS, layoutOf, brandTemplate, frameFor,
  brandDir, aiBgDir, brandUrlOf, checkBrandUrl, checkBrandMood, brandPalette, bgPrompt, chatPrompt, compositePrompt, PRODUCT_FRAME, productBoxFor, bgKey, readBgReport, bgEntries, bgFiles, staleBg,
};
