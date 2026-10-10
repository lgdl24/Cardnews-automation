// 입력 확인: 필수 항목, 이미지 파일 존재·사용 가능 여부, 카드 수
// 사용법: node scripts/check-input.js <제품ID>
const fs = require('fs');
const path = require('path');
const { paths, loadInput, createReport, printReport, requireProductId } = require('./lib/common');

const REQUIRED = {
  '제품 정보': ['제품명', '제품 설명', '주요 특징', '사용 방법', '이미지'],
  '제작 조건': ['콘텐츠 목적', '카드 수'],
};
const IMAGE_EXT = ['.jpg', '.jpeg', '.png'];

function checkInput(productId) {
  const report = createReport();
  const input = loadInput(productId);
  if (!input) {
    report.error('INPUT_MISSING', 'input.md', `products/${productId}/input.md 파일이 없어요`);
    return report;
  }

  for (const [group, keys] of Object.entries(REQUIRED)) {
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

  if (input.cardCountRaw) {
    if (input.cardCount === null) report.error('INPUT_MISSING', '## 카드 수', `숫자만 써주세요 (현재: "${input.cardCountRaw}")`);
    else if (input.cardCount < 3 || input.cardCount > 8) report.warn('## 카드 수', `${input.cardCount}장은 기본 범위(3~8장) 밖이에요`);
  }

  for (const img of input.images) {
    const where = `이미지 ${img.file || '(파일명 없음)'}`;
    if (!img.file) { report.error('INPUT_MISSING', where, '파일명이 없어요'); continue; }
    if (!IMAGE_EXT.includes(path.extname(img.file).toLowerCase())) {
      report.error('INPUT_MISSING', where, 'JPG·PNG 파일만 쓸 수 있어요');
    }
    if (!fs.existsSync(paths.product(productId, 'images', img.file))) {
      report.error('INPUT_MISSING', where, `images/ 폴더에 파일이 없어요`);
    }
    if (!img.source) report.error('INPUT_MISSING', where, '출처가 비어 있어요');
    if (img.usage === '불가') report.error('INPUT_MISSING', where, '사용 불가 이미지예요. 다른 이미지로 바꿔주세요');
    else if (img.usage !== '가능') report.warn(where, `사용 가능 여부가 "${img.usage || '미기재'}"예요. 최종 출력 전에 확인이 필요해요`);
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
