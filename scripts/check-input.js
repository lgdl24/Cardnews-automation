// 입력 확인: 필수 항목, 이미지 파일 존재·사용 가능 여부, 카드 수, 지시문 형태 문장
// 사용법: node scripts/check-input.js <제품ID>
// 항목 정의는 config/input-form.json, 지시문 패턴은 config/input-safety.json
const fs = require('fs');
const path = require('path');
const { paths, loadInput, createReport, printReport, requireProductId } = require('./lib/common');
const { loadForm, requiredFields, findField, findInstructionLike } = require('./lib/input-form');

function checkInput(productId) {
  const report = createReport();
  const input = loadInput(productId);
  if (!input) {
    report.error('INPUT_MISSING', 'input.md', `products/${productId}/input.md 파일이 없어요`);
    return report;
  }
  const form = loadForm();

  for (const [group, keys] of Object.entries(requiredFields(form))) {
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

  const colorRule = findField(form, '카드 색');
  const colorRaw = ((input.cond && input.cond['카드 색']) || '').split('\n')[0].trim();
  if (colorRule && colorRaw && !colorRule.options.includes(colorRaw)) {
    report.warn('## 카드 색', `"${colorRaw}"는 고를 수 없는 값이에요. ${colorRule.options.join(' 또는 ')} 중 하나로 써주세요 (지금은 기본 색으로 만들어요)`);
  }

  const designRule = findField(form, '디자인');
  const designRaw = (input.cond['디자인'] || '').split('\n')[0].trim();
  if (designRule && designRaw && !designRule.options.includes(designRaw)) report.warn('## 디자인', `${designRule.options.join(' 또는 ')} 중 하나로 써주세요 (지금은 기본 묶음으로 만들어요)`);

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
  process.exit(report.errors.length ? 1 : 0);
}

module.exports = { checkInput };
