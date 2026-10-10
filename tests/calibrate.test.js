// 글자 수 기준 회귀 테스트: 모든 칸을 config/templates.json 기준까지 채워도 넘치거나 이미지와 겹치지 않는지
// 템플릿 CSS·글자 수 기준을 바꾸면 이 테스트가 확인해요. 브라우저가 필요해서 npm run test:render에 포함.
const test = require('node:test');
const assert = require('node:assert/strict');
const { measure } = require('../scripts/calibrate');

test('모든 템플릿 · 측정 문장 유형 · 이미지 유무에서 기준 글자 수를 꽉 채워도 넘치지 않는다', async (t) => {
  let res;
  try {
    res = await measure({ fullOnly: true });
  } catch (e) {
    if (/Executable doesn't exist|playwright가 설치|browserType\.launch/.test(e.message)) {
      t.skip('Chromium이 없어 건너뜀 (npx playwright install chromium)');
      return;
    }
    throw e;
  }
  assert.ok(res.fontOk, '웹폰트를 불러오지 못하면 측정이 의미 없어요 (npm install 확인)');
  const failed = res.full.filter((c) => !c.ok);
  assert.deepEqual(failed, [], JSON.stringify(failed, null, 2));
});
