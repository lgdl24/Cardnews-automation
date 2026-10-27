// 공통 유틸: 경로, 설정 로드, 입력 양식 파싱, 결과 출력
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// 제품 폴더 위치. 테스트는 CARDNEWS_PRODUCTS_DIR로 임시 폴더를 지정해 실제 products/를 건드리지 않음
const productsDir = () => process.env.CARDNEWS_PRODUCTS_DIR || path.join(ROOT, 'products');

const paths = {
  root: ROOT,
  config: (name) => path.join(ROOT, 'config', name),
  products: productsDir,
  product: (id, ...rest) => path.join(productsDir(), id, ...rest),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// 새 칸이 있으면 빈 값도 그대로 사용. '무드'가 없는 예전 입력만 '디자인'으로 읽음.
function moodInputOf(input) {
  const cond = input?.cond || {};
  const key = Object.hasOwn(cond, '무드') ? '무드' : '디자인';
  return { key, value: (cond[key] || '').split('\n')[0].trim() };
}

// 디자인 묶음 정하기 (#74). 앞에서부터 처음 맞는 것을 씀
//   ① 입력 '무드'(예전 '디자인')에 목록에 있는 묶음을 직접 적음 → 사람이 고른 것
//   ② cards.json의 design.id → 구성안 작업에서 고른 묶음 (자동 추천, #74 3단계)
//   ③ 기본
// 목록에 없는 값·빈 값은 건너뜀. 반환 source: 'input' | 'cards' | 'default'
function resolveDesign({ input = null, data = null, config = readJson(paths.config('templates.json')) } = {}) {
  const known = (v) => typeof v === 'string' && (v === '기본' || Object.hasOwn(config._designs || {}, v));
  const { value } = moodInputOf(input);
  if (value && known(value)) return { id: value, source: 'input' };
  const picked = data && data.design && data.design.id;
  if (known(picked)) return { id: picked, source: 'cards' };
  return { id: '기본', source: 'default' };
}

function designOf(input, config = readJson(paths.config('templates.json')), data = null) {
  return resolveDesign({ input, data, config }).id;
}

// 디자인 묶음 목록 (config/templates.json _catalog): 이름·설명·어울리는 제품·필요한 사진·버전
function designCatalog(config = readJson(paths.config('templates.json'))) {
  const catalog = config._catalog || {};
  return Object.entries(catalog)
    .filter(([id]) => !id.startsWith('_'))
    .map(([id, meta]) => ({ id, ...meta, colorMode: (id === '기본' ? null : config._designs?.[id]?._defaults?.colorMode) || '기본' }));
}

// 출력·웹 데이터·평가 결과에 남기는 묶음 기록 (#74 4단계): 이름·버전·정한 곳, 구성안에서 골랐으면 고른 사람·이유
function designRecord({ input = null, data = null, config = readJson(paths.config('templates.json')) } = {}) {
  const used = resolveDesign({ input, data, config });
  const meta = (config._catalog || {})[used.id] || {};
  const picked = used.source === 'cards' ? data.design : null;
  return {
    id: used.id,
    name: meta.name || used.id,
    version: meta.version != null ? String(meta.version) : null,
    source: used.source,
    selected_by: picked ? picked.selected_by : null,
    reason: picked ? picked.reason : null,
  };
}

// data(cards.json)를 넘기면 구성안에서 고른 묶음도 봄
function loadConfig(input = null, data = null) {
  const all = readJson(paths.config('templates.json'));
  const overrides = all._designs?.[designOf(input, all, data)];
  const templates = overrides ? { ...all, ...overrides } : all;
  // 묶음 고유 팔레트·글꼴 굵기 (_designs.<묶음>._theme, #74): 카드 색 '기본'일 때 이 색을 씀. 추가 색(accent-2 등)은 장식용
  const theme = readJson(paths.config('theme.json'));
  const own = overrides && overrides._theme;
  if (own) {
    if (own.color) theme.color = { ...theme.color, ...own.color };
    if (own.font && own.font.files) theme.font = { ...theme.font, files: { ...theme.font.files, ...own.font.files } };
    if (own.contrast) theme.contrast = { ...own.contrast };
  }
  return {
    templates,
    theme,
    caution: readJson(paths.config('caution-expressions.json')),
  };
}

// 공백·줄바꿈 차이를 무시하고 비교하기 위한 정규화
function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

// 글자 수: 줄바꿈(\n)은 세지 않고, 공백은 셈. 이모지·한글 모두 1자로 계산
function countChars(text) {
  return [...String(text).replace(/\n/g, '')].length;
}

// 입력 양식(input.md) 파싱
// 반환: { groups: { '제품 정보': { '제품명': '...' }, '제작 조건': {...} }, productText, images, cardCount }
function parseInput(markdown) {
  const groups = {};
  let h1 = null;
  let h2 = null;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const m1 = line.match(/^#\s+(.+)$/);
    const m2 = line.match(/^##\s+(.+)$/);
    if (m1) { h1 = m1[1].trim(); h2 = null; groups[h1] = groups[h1] || {}; continue; }
    if (m2 && h1) { h2 = m2[1].trim(); groups[h1][h2] = ''; continue; }
    if (!h1 || !h2) continue;
    // 양식 안내 문구 "(필수) ..." "(선택) ..." 줄은 내용으로 보지 않음
    if (/^\((필수|선택)\)/.test(line.trim())) continue;
    groups[h1][h2] += line + '\n';
  }
  for (const g of Object.values(groups)) {
    for (const k of Object.keys(g)) g[k] = g[k].trim();
  }

  const info = groups['제품 정보'] || {};
  const cond = groups['제작 조건'] || {};

  // 원문 = 제품 정보 중 이미지 목록을 제외한 모든 항목
  const productText = Object.entries(info)
    .filter(([k]) => k !== '이미지')
    .map(([k, v]) => `${k}\n${v}`)
    .join('\n');

  const images = (info['이미지'] || '')
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const [file, desc, source, usage, kind] = l.split('|').map((s) => (s || '').trim());
      // 용도(#74): 제품(누끼, 카드의 image) · 제형(크림 자국·젤 등 질감 사진) · 배경(연출 장면). 비우면 제품
      return { file, desc, source, usage, kind: kind || '제품' };
    });

  const cardCountRaw = (cond['카드 수'] || '').trim();
  const cardCount = /^\d+$/.test(cardCountRaw) ? Number(cardCountRaw) : null;

  return { groups, info, cond, productText, images, cardCount, cardCountRaw };
}

function loadInput(productId) {
  const file = paths.product(productId, 'input.md');
  if (!fs.existsSync(file)) return null;
  return parseInput(fs.readFileSync(file, 'utf8'));
}

// 결과 모음: errors / warnings / cautions
function createReport() {
  const report = { errors: [], warnings: [], cautions: [] };
  report.error = (code, where, message) => report.errors.push({ code, where, message });
  report.warn = (where, message) => report.warnings.push({ where, message });
  report.caution = (where, message) => report.cautions.push({ where, message });
  return report;
}

function printReport(title, report) {
  console.log(`\n== ${title} ==`);
  for (const e of report.errors) console.log(`[오류] ${e.code} | ${e.where} | ${e.message}`);
  for (const w of report.warnings) console.log(`[경고] ${w.where} | ${w.message}`);
  for (const c of report.cautions) console.log(`[주의] ${c.where} | ${c.message}`);
  console.log(`-- 오류 ${report.errors.length}개, 경고 ${report.warnings.length}개, 주의 ${report.cautions.length}개`);
}

function requireProductId(argv) {
  const id = argv.find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('사용법: node <스크립트> <제품ID>');
    process.exit(2);
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    console.error(`제품ID는 영문 소문자·숫자·하이픈만 쓸 수 있어요: ${id}`);
    process.exit(2);
  }
  return id;
}

module.exports = {
  ROOT, paths, readJson, moodInputOf, resolveDesign, designOf, designCatalog, designRecord, loadConfig, normalize, countChars,
  parseInput, loadInput, createReport, printReport, requireProductId,
};
