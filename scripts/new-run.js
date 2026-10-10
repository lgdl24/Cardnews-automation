// 실험용 제작 폴더 만들기: 같은 입력(input.md, images/)을 새 제품ID 폴더로 복사
// 사용법: node scripts/new-run.js <원본 제품ID> <새 제품ID>
//   예) Skill v2 비교: toneup-sunscreen → toneup-sunscreen-v2
//       반복 실행:      toneup-sunscreen → toneup-sunscreen-r1, -r2, -r3
const fs = require('fs');
const { paths } = require('./lib/common');

const [from, to] = process.argv.slice(2);
const valid = (s) => typeof s === 'string' && /^[a-z0-9-]+$/.test(s);
if (!valid(from) || !valid(to)) {
  console.error('사용법: node scripts/new-run.js <원본 제품ID> <새 제품ID>  (영문 소문자·숫자·하이픈)');
  process.exit(2);
}
if (!fs.existsSync(paths.product(from, 'input.md'))) {
  console.error(`products/${from}/input.md가 없어요`);
  process.exit(1);
}
if (fs.existsSync(paths.product(to))) {
  console.error(`products/${to} 폴더가 이미 있어요`);
  process.exit(1);
}
fs.mkdirSync(paths.product(to), { recursive: true });
fs.copyFileSync(paths.product(from, 'input.md'), paths.product(to, 'input.md'));
if (fs.existsSync(paths.product(from, 'images'))) {
  fs.cpSync(paths.product(from, 'images'), paths.product(to, 'images'), { recursive: true });
}
console.log(`products/${to} 생성: input.md, images/ 복사 (cards.json·기록은 새로 시작)`);
