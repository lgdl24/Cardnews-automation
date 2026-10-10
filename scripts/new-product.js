// 새 제품 폴더와 빈 입력 양식 만들기 (config/input-form.json 기준)
// 사용법: node scripts/new-product.js <제품ID>
//   products/<제품ID>/input.md (빈 양식), products/<제품ID>/images/ 를 만듭니다.
const fs = require('fs');
const { paths, requireProductId } = require('./lib/common');
const { renderInputMd } = require('./lib/input-form');

const id = requireProductId(process.argv.slice(2));
const dir = paths.product(id);
if (fs.existsSync(dir)) {
  console.error(`products/${id} 폴더가 이미 있어요. 다른 제품ID를 써 주세요.`);
  process.exit(1);
}
fs.mkdirSync(paths.product(id, 'images'), { recursive: true });
fs.writeFileSync(paths.product(id, 'input.md'), renderInputMd());
console.log(`만들었어요: products/${id}/input.md, products/${id}/images/`);
console.log('양식을 채우고 이미지를 넣은 뒤 npm run check -- ' + id + ' 로 확인하세요.');
