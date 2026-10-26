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

function designOf(input, config = readJson(paths.config('templates.json'))) {
  const { value } = moodInputOf(input);
  return Object.hasOwn(config._designs || {}, value) ? value : '기본';
}

function loadConfig(input = null) {
  const all = readJson(paths.config('templates.json'));
  const overrides = all._designs?.[designOf(input, all)];
  const templates = overrides ? { ...all, ...overrides } : all;
  return {
    templates,
    theme: readJson(paths.config('theme.json')),
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
      const [file, desc, source, usage] = l.split('|').map((s) => (s || '').trim());
      return { file, desc, source, usage };
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
  ROOT, paths, readJson, moodInputOf, designOf, loadConfig, normalize, countChars,
  parseInput, loadInput, createReport, printReport, requireProductId,
};
