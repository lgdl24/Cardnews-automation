// 피그마 출력 시험(scripts/figma-spec.js): 만든 채움 코드가 문법상 맞고, 카드 값이 그대로 들어가는지
const test = require('node:test');
const assert = require('node:assert');
const { FIGMA, fillCode } = require('../scripts/figma-spec');

const entry = {
  no: 1,
  file: 'card-01',
  component: FIGMA.components.기본.cover.set,
  variant: FIGMA.components.기본.cover.variant({ role: 'cover' }),
  props: { title: '첫 줄\n"둘째" 줄', subtitle: '부제', badge: 'SPF50+', page: '1 / 5', product: '제품', showBadge: true, showSubtitle: true },
  image: { upload_name: 'p__main', width: 500, height: 500, bounds: { left: 0.3, top: 0.1, width: 0.4, height: 0.7 } },
  maxHeight: FIGMA.maxHeight,
};

test('채움 코드는 use_figma가 감싸는 async 함수 본문으로 문법 오류가 없음', () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction('figma', fillCode(entry)));
});

test('카드 값(줄바꿈·따옴표 포함)이 JSON 그대로 들어감', () => {
  const code = fillCode(entry);
  const line = code.split('\n').find((l) => l.startsWith('const spec = '));
  const spec = JSON.parse(line.slice('const spec = '.length, -1));
  assert.deepStrictEqual(spec, entry);
});

test('마무리 카드는 closing 변형', () => {
  assert.strictEqual(FIGMA.components.기본.cover.variant({ role: 'closing' }), 'role=closing');
  assert.strictEqual(FIGMA.components.기본.cover.variant({ role: 'cover' }), 'role=cover');
});

test('채움 코드는 use_figma 코드 길이 제한(50,000자) 안', () => {
  assert.ok(fillCode(entry).length < 50000);
});
