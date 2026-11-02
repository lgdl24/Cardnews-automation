// 피그마 내보내기(scripts/figma-export.js): 만든 코드가 문법상 맞고, 코드 길이 제한 안에서 카드를 묶는지
const test = require('node:test');
const assert = require('node:assert');
const { buildCode, buildBatches, compact, CODE_LIMIT } = require('../scripts/figma-export');

const color = { r: 0.1, g: 0.2, b: 0.3, a: 1 };
function card(no, extraText = '') {
  return {
    file: `card-0${no}`, no, page: '테스트 제품 (test-product)', width: 1080, height: 1080,
    layers: [
      { kind: 'rect', id: 'L0', name: 'card', box: { x: 0, y: 0, w: 1080, h: 1080 }, opacity: 1, fill: color, radius: [0, 0, 0, 0], stroke: null },
      { kind: 'raster', id: 'L1', name: 'cover__image (사진)', box: { x: 10.123, y: 20, w: 300, h: 400 }, upload: `test-product__c0${no}__L1` },
      {
        kind: 'text', id: 'L2', name: 'cover__title (글자)', box: { x: 96, y: 600, w: 888, h: 200 }, opacity: 1,
        text: `첫 줄\n"둘째" 줄${extraText}`, align: 'LEFT', family: 'Pretendard', weight: 800, size: 80, lineHeight: 97.6, letterSpacing: -2.4, color,
        runs: [{ start: 0, end: 4, color, weight: 800, size: 80, family: 'Pretendard' }, { start: 5, end: 12, color: { ...color, r: 0.9 }, weight: 800, size: 80, family: 'Pretendard' }],
      },
    ],
  };
}

test('만든 코드는 use_figma가 감싸는 async 함수 본문으로 문법 오류가 없음', () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  assert.doesNotThrow(() => new AsyncFunction('figma', buildCode([card(1), card(2)])));
});

test('카드 값(줄바꿈·따옴표)이 그대로 들어가고, 색이 다른 글자 구간만 runs로 남음', () => {
  const code = buildCode([card(1)]);
  const line = code.split('\n').find((l) => l.startsWith('const cards = '));
  const cards = JSON.parse(line.slice('const cards = '.length, -1));
  const t = cards[0].layers.find((l) => l.kind === 'text');
  assert.strictEqual(t.text, '첫 줄\n"둘째" 줄');
  assert.strictEqual(t.runs.length, 2);
  const same = compact({ ...card(1), layers: [{ ...card(1).layers[2], runs: [{ start: 0, end: 4, color, weight: 800, size: 80, family: 'Pretendard' }] }] });
  assert.deepStrictEqual(same.layers[0].runs, []);
  assert.strictEqual(cards[0].layers.find((l) => l.kind === 'raster').box.x, 10.12);
});

test('코드 길이 제한을 넘으면 카드를 나눠 묶음', () => {
  const big = [1, 2, 3, 4, 5].map((n) => card(n, '가'.repeat(12000)));
  const batches = buildBatches(big);
  assert.ok(batches.length > 1);
  for (const b of batches) assert.ok(b.code.length <= CODE_LIMIT || b.cards.length === 1);
  assert.deepStrictEqual(batches.flatMap((b) => b.cards), big.map((c) => c.file));
  assert.strictEqual(buildBatches([1, 2, 3, 4, 5].map((n) => card(n))).length, 1);
});
