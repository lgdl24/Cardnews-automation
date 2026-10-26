// 새 디자인 묶음(#74 2단계: 타이포·팝·연출) 출력 점검: 모든 칸을 기준 글자 수까지 채워도 넘치거나 사진과 겹치지 않는지
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers');
const { measure } = require('../scripts/calibrate');
const { loadConfig, designCatalog } = require('../scripts/lib/common');

const NEW = ['타이포', '팝', '연출'];

for (const design of NEW) {
  test(`${design}: 모든 칸을 기준까지 채워도 넘침·겹침 없음 (역할·사진 있음·없음, 직접 줄바꿈 포함)`, async () => {
    const res = await measure({ fullOnly: true, design });
    assert.equal(res.fontOk, true);
    assert.ok(res.full.length >= 40, `${design}: 점검 경우 ${res.full.length}개`);
    assert.deepEqual(res.full.filter((x) => !x.ok), []);
  });
}

test('새 묶음: 템플릿 파일·목록 설명·미리보기·쓰기 주의가 있음', () => {
  const catalog = designCatalog();
  for (const design of NEW) {
    const { templates } = loadConfig({ cond: { 무드: design } });
    for (const key of ['cover', 'image', 'description']) {
      assert.ok(fs.existsSync(path.join(ROOT, templates[key].file)), `${design} ${key}`);
      assert.notEqual(templates[key].file, `templates/${key}.html`, `${design} ${key}는 묶음 파일`);
    }
    assert.equal(templates._defaults.colorMode, '제품 색');
    assert.ok(templates._notes.length > 0);
    const meta = catalog.find((d) => d.id === design);
    assert.ok(meta && meta.preview && fs.existsSync(path.join(ROOT, meta.preview)), `${design} preview`);
  }
});
