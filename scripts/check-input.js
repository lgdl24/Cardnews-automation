// 입력 확인: 필수 항목, 이미지 파일 존재·사용 가능 여부, 카드 수, 지시문 형태 문장
// 사용법: node scripts/check-input.js <제품ID>
// 항목 정의는 config/input-form.json, 지시문 패턴은 config/input-safety.json
const fs = require('fs');
const path = require('path');
const { paths, loadInput, createReport, printReport, requireProductId, designOf, loadConfig } = require('./lib/common');
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

  const moodRule = findField(form, '무드');
  const moodRaw = ((input.cond && input.cond['무드']) || '').split('\n')[0].trim();
  if (moodRule && moodRaw && !moodRule.options.includes(moodRaw)) {
    report.warn('## 무드', `"${moodRaw}"는 고를 수 없는 값이에요. ${moodRule.options.join(' 또는 ')} 중 하나로 써주세요 (지금은 기본으로 만들어요)`);
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

// 기본이 아닌 무드면 글자 수 기준이 config/templates.json _designs.<무드>로 바뀜.
// 문구를 쓰기 전(1단계)에 보는 출력이라 여기서 템플릿별 기준을 같이 보여줌
function moodLimitLines(input) {
  const mood = designOf(input);
  if (mood === '기본') return [];
  const { templates } = loadConfig(input);
  const lines = [`무드: ${mood} — 글자 수 기준은 config/templates.json _designs.${mood} (기본 템플릿 기준과 다름)`];
  for (const [key, tpl] of Object.entries(templates)) {
    if (key.startsWith('_')) continue;
    const fields = Object.entries(tpl.fields).map(([field, r]) => {
      const parts = field === 'items'
        ? [`최대 ${r.maxItems}개`, `항목당 ${r.maxCharsPerItem}자`]
        : [`${r.maxChars}자`];
      if (r.maxCharsPerLine) parts.push(`한 줄 ${r.maxCharsPerLine}자`);
      if (r.maxLines) parts.push(`${r.maxLines}줄`);
      return `${field} ${parts.join('·')}`;
    });
    lines.push(`  ${key}(${tpl.label}): ${fields.join(' / ')}`);
  }
  return lines;
}

if (require.main === module) {
  const id = requireProductId(process.argv.slice(2));
  const report = checkInput(id);
  printReport(`입력 확인: ${id}`, report);
  const input = loadInput(id);
  if (input) {
    const lines = moodLimitLines(input);
    if (lines.length) console.log(`\n${lines.join('\n')}`);
  }
  process.exit(report.errors.length ? 1 : 0);
}

module.exports = { checkInput, moodLimitLines };
