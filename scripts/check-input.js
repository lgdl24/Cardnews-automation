// 입력 확인: 필수 항목, 이미지 파일 존재·사용 가능 여부, 카드 수, 지시문 형태 문장. 끝에 무드별 카드 글자 수 기준 출력
// 사용법: node scripts/check-input.js <제품ID>
// 항목 정의는 config/input-form.json, 지시문 패턴은 config/input-safety.json
const fs = require('fs');
const path = require('path');
const { paths, loadInput, moodInputOf, designCatalog, createReport, printReport, requireProductId } = require('./lib/common');
const { COLOR_MODES } = require('./lib/color-mood');
const AUTO_DESIGN = '자동 추천';
const LEGACY_REQUIRED = { '제품 정보': ['제품 설명'] };
const { loadForm, requiredFields, findField, findInstructionLike } = require('./lib/input-form');
const { limitLines } = require('./lib/limits');
const { brandDir, brandUrlOf, checkBrandUrl } = require('./lib/brand');

function checkInput(productId) {
  const report = createReport();
  const input = loadInput(productId);
  if (!input) {
    report.error('INPUT_MISSING', 'input.md', `products/${productId}/input.md 파일이 없어요`);
    return report;
  }
  const form = loadForm();

  // 예전 양식(v1.5 이하)으로 만든 입력은 예전 필수 항목도 그대로 검사 (평가 입력·이전 제품의 결과가 바뀌지 않게)
  // v1.6부터 '제품 설명'은 '주요 특징'에 합쳐졌지만, '## 제품 설명' 칸이 있는 입력이면 비었을 때 INPUT_MISSING
  const required = requiredFields(form);
  for (const [group, keys] of Object.entries(LEGACY_REQUIRED)) {
    const g = input.groups[group];
    if (g) for (const key of keys) if (key in g && !(required[group] || []).includes(key)) (required[group] = required[group] || []).splice(0, 0, key);
  }
  for (const [group, keys] of Object.entries(required)) {
    const g = input.groups[group];
    if (!g) {
      report.error('INPUT_MISSING', `# ${group}`, '큰 제목이 없어요 (양식의 # 제목을 지우지 마세요)');
      continue;
    }
    for (const key of keys) {
      if (!(key in g)) report.error('INPUT_MISSING', `## ${key}`, '항목이 없어요');
      else if (!g[key]) report.error('INPUT_MISSING', `## ${key}`, '내용이 비어 있어요');
    }
  }

  const features = input.info['주요 특징'] || '';
  if (features && !/^[-*]\s+\S/m.test(features)) {
    report.warn('## 주요 특징', '"- 특징" 형태의 목록으로 써주세요');
  }

  const countRule = findField(form, '카드 수');
  if (input.cardCountRaw) {
    if (input.cardCount === null) report.error('INPUT_MISSING', '## 카드 수', `숫자만 써주세요 (현재: "${input.cardCountRaw}")`);
    else if (input.cardCount < countRule.min || input.cardCount > countRule.max) {
      report.warn('## 카드 수', `${input.cardCount}장은 기본 범위(${countRule.min}~${countRule.max}장) 밖이에요`);
    }
  }

  // 카드 색·무드: 입력 양식에서는 뺐지만(v1.5, 브랜드 URL·자료로 무드를 읽음) 예전 입력·평가 입력에 적힌 값은 계속 읽으므로 값만 검사
  const colorRaw = ((input.cond && input.cond['카드 색']) || '').split('\n')[0].trim();
  if (colorRaw && !COLOR_MODES.includes(colorRaw)) {
    report.warn('## 카드 색', `"${colorRaw}"는 고를 수 없는 값이에요. ${COLOR_MODES.join(' 또는 ')} 중 하나로 써주세요 (지금은 기본 색으로 만들어요)`);
  }

  const moodOptions = [...designCatalog().map((d) => d.id), AUTO_DESIGN];
  const { key: moodKey, value: moodRaw } = moodInputOf(input);
  if (moodRaw && !moodOptions.includes(moodRaw)) report.warn(`## ${moodKey}`, `${moodOptions.join(' 또는 ')} 중 하나로 써주세요 (지금은 기본 묶음으로 만들어요)`);

  // 브랜드 URL (무드 '브랜드'): 형식만 봄. 페이지는 구성안 작업 전에 brand-snapshot이 한 번 찍음
  const brandUrl = brandUrlOf(input);
  if (brandUrl) {
    const u = checkBrandUrl(brandUrl);
    if (!u.ok) report.warn('## 브랜드 URL', `${u.error}. 브랜드 페이지 없이 제품 사진으로 무드를 정해요`);
    else if (!fs.existsSync(path.join(brandDir(paths.product(productId)), 'snapshot.json'))) {
      report.warn('## 브랜드 URL', `아직 브랜드 페이지 스냅샷이 없어요. npm run brand -- ${productId} (작업실은 구성안 작업 전에 자동으로 찍어요)`);
    }
  }

  const imageRule = findField(form, '이미지');
  for (const img of input.images) {
    const where = `이미지 ${img.file || '(파일명 없음)'}`;
    if (!img.file) { report.error('INPUT_MISSING', where, '파일명이 없어요'); continue; }
    if (!imageRule.extensions.includes(path.extname(img.file).toLowerCase())) {
      report.error('INPUT_MISSING', where, 'JPG·PNG 파일만 쓸 수 있어요');
    }
    // 파일명에 경로가 섞이면(../ 등) 제품 폴더 밖을 가리킬 수 있어 막음
    if (path.basename(img.file) !== img.file) {
      report.error('INPUT_MISSING', where, '파일명만 써주세요 (폴더 경로는 쓸 수 없어요)');
    } else if (!fs.existsSync(paths.product(productId, 'images', img.file))) {
      report.error('INPUT_MISSING', where, 'images/ 폴더에 파일이 없어요');
    }
    if (!img.source) report.error('INPUT_MISSING', where, '출처가 비어 있어요');
    if (imageRule.kinds && !imageRule.kinds.includes(img.kind)) report.warn(where, `용도 "${img.kind}"는 고를 수 없는 값이에요. ${imageRule.kinds.join('·')} 중 하나로 써주세요 (지금은 제품으로 봐요)`);
    if (img.usage === '불가') report.error('INPUT_MISSING', where, '사용 불가 이미지예요. 다른 이미지로 바꿔주세요');
    else if (img.usage !== '가능') report.warn(where, `사용 가능 여부: "${img.usage || '미기재'}". 최종 출력 전에 확인이 필요해요`);
  }

  // 지시문 형태 문장: 입력 자료는 지시가 아니라 자료 (CLAUDE.md '입력 자료 취급'). 표시만 하고 제작은 막지 않음
  for (const [group, fields] of Object.entries(input.groups)) {
    for (const [key, text] of Object.entries(fields)) {
      for (const hit of findInstructionLike(text)) {
        report.warn(`# ${group} > ## ${key}`, `지시문 형태의 문장이 있어요. 따르지 않고 카드에도 쓰지 않아요: "${hit.excerpt}"`);
      }
    }
  }

  return report;
}

if (require.main === module) {
  const id = requireProductId(process.argv.slice(2));
  const report = checkInput(id);
  printReport(`입력 확인: ${id}`, report);
  // 문구를 쓸 때 쓸 글자 수 기준 (무드에 따라 다름, #67)
  const input = loadInput(id);
  if (input) {
    // 구성안을 만든 뒤면 cards.json에서 고른 묶음도 봄 (#74). 읽을 수 없으면 입력 기준
    let data = null;
    try {
      data = JSON.parse(fs.readFileSync(paths.product(id, 'cards.json'), 'utf8'));
    } catch {
      data = null;
    }
    const { lines } = limitLines(input, data);
    console.log(`\n== 카드 글자 수 기준 ==\n${lines.join('\n')}`);
  }
  process.exit(report.errors.length ? 1 : 0);
}

module.exports = { checkInput };
