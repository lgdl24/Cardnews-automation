// Claude 디자인 자료 묶음(scripts/design-pack.js): 지침에 승인된 문구·글자 수 기준·내용 규칙이 그대로 들어가는지
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { buildBrief, buildPrompt, OPAQUE_ALPHA } = require('../scripts/design-pack');

const templates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'templates.json'), 'utf8'));
const data = {
  cards: [
    { no: 1, role: 'cover', template: 'cover', image: 'main.png', copy: { title: '첫 줄\n둘째 줄', subtitle: '부제', badge: 'SPF50+' } },
    { no: 2, role: 'usage', template: 'description', copy: { title: '사용법', items: ['하나', '둘'] } },
  ],
};
const brief = buildBrief({
  id: 'test-product', product: '테스트 제품', brand: '브랜드', data, templates,
  colors: { mode: '기본', color: { bg: '#FBF6F1', text: '#2B2420' } },
  images: [{ name: 'main.png', width: 157, height: 351, trimmed: true, from: { width: 500, height: 500 } }],
  design: { name: '기본' },
});

test('지침에 카드 문구가 그대로 들어감 (줄바꿈은 ⏎)', () => {
  assert.match(brief, /title: 「첫 줄⏎둘째 줄」/);
  assert.match(brief, /items: 「하나」 「둘」/);
  assert.match(brief, /badge: 「SPF50\+」/);
});

test('글자 수 기준은 템플릿 3종만, 내부 항목(_로 시작) 없음', () => {
  const lines = brief.split('\n').filter((l) => /^- \S+\(.+\): /.test(l));
  assert.deepStrictEqual(lines.map((l) => l.slice(2, l.indexOf('('))), ['cover', 'image', 'description']);
  assert.doesNotMatch(brief, /undefined/);
  assert.match(brief, new RegExp(`title ${templates.cover.fields.title.maxChars}자`));
});

test('내용 규칙·사진 규칙이 지침에 있음', () => {
  assert.match(brief, /원문에 없는 효능·수치·성분·인증/);
  assert.match(brief, /제품을 그리거나 AI로 만들지 않아요/);
  assert.match(brief, /157×351px \(원본 500×500에서 잘라냄\)/);
});

test('요청문은 카드 수와 제품명을 담고, 새 문구를 만들지 말라고 함', () => {
  const p = buildPrompt({ product: '테스트 제품', cards: 5 });
  assert.match(p, /'테스트 제품' 카드뉴스 5장/);
  assert.match(p, /새 문구·효능·수치를 만들지 마/);
});

test('사진 자르기 기준은 반투명 그림자를 빼는 값', () => {
  assert.ok(OPAQUE_ALPHA > 126 && OPAQUE_ALPHA < 255);
});
