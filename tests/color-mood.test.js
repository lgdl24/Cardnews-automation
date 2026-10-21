// 카드 색 (#38): 대표 색 뽑기, 색 7개, 글자 대비 검사·자동 조정
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const theme = require('../config/theme.json');
const {
  contrast, rgbToHsl, hslToRgb, rgbToHex, hexToRgb, representativeColor, paletteFromColor, checkContrast, adjustContrast,
  decideColors, colorModeOf, pickProductImage, MIN_CONTRAST, PAIRS,
} = require('../scripts/lib/color-mood');
const { ROOT, SAMPLE_ID } = require('./helpers');

// n개 픽셀 [r,g,b,a] 반복
const fill = (rgba, n) => Array.from({ length: n }, () => rgba).flat();
const hue = (hex) => rgbToHsl(hexToRgb(hex))[0];

test('대비 계산은 WCAG 값과 같다', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.ok(Math.abs(contrast('#767676', '#FFFFFF') - 4.54) < 0.01);
});

test('템플릿에서 글자가 색 위에 놓이는 7곳을 검사한다', () => {
  assert.equal(PAIRS.length, 7);
  for (const p of PAIRS) {
    assert.ok(p.fg in theme.color && p.bg in theme.color, `${p.fg}/${p.bg}가 theme.json에 없어요`);
  }
});

test('기본 테마: 지금 값은 3곳이 4.5 미만이고, 자동 조정하면 7곳 모두 통과한다', () => {
  const bad = checkContrast(theme.color).filter((c) => !c.ok).map((c) => `${c.fg}/${c.bg}`);
  assert.deepEqual(bad.sort(), ['muted/accent', 'on-primary/primary', 'primary/accent']);
  const r = adjustContrast(theme.color);
  assert.equal(r.ok, true, JSON.stringify(r.checks));
  // 배경 색은 그대로, 글자 쪽(보조 글자·주색)만 어두워짐
  assert.deepEqual(r.adjustments.map((a) => a.key).sort(), ['muted', 'primary']);
  for (const a of r.adjustments) assert.ok(a.lightness_to < a.lightness_from);
  for (const k of ['bg', 'surface', 'accent', 'on-primary', 'text']) assert.equal(r.color[k], theme.color[k]);
});

test('대표 색: 투명·흰색·회색은 빼고 가장 많은 색상 구간을 고른다', () => {
  const pixels = [
    ...fill([0, 0, 0, 0], 5000), // 투명 배경
    ...fill([255, 255, 255, 255], 3000), // 흰 배경
    ...fill([128, 128, 128, 255], 1000), // 회색 글자
    ...fill([70, 150, 110, 255], 800), // 초록 몸통
    ...fill([200, 60, 60, 255], 100), // 빨간 로고
  ];
  const r = representativeColor(pixels);
  assert.ok(r.hex);
  assert.ok(Math.abs(hue(r.hex) - 150) < 10, r.hex);
  // 색 있는 픽셀 비율은 불투명 픽셀 기준
  assert.equal(r.colored_ratio, Math.round((900 / 4900) * 1000) / 1000);
});

test('대표 색: 옅은 연보라(채도 0.1 안팎)도 색으로 본다', () => {
  const r = representativeColor([...fill([255, 255, 255, 255], 900), ...fill([0x8c, 0x7e, 0x97, 255], 100)]);
  assert.ok(r.hex);
  assert.ok(Math.abs(hue(r.hex) - 274) < 10, r.hex);
});

test('대표 색: 색 있는 픽셀이 2% 미만이면 없음', () => {
  assert.equal(representativeColor([...fill([255, 255, 255, 255], 990), ...fill([200, 60, 60, 255], 10)]).hex, null);
  assert.equal(representativeColor(fill([0, 0, 0, 0], 100)).hex, null);
  assert.equal(representativeColor([]).hex, null);
});

test('색 7개: 어떤 색상·채도라도 자동 조정 후 7곳 모두 4.5 이상', () => {
  for (let h = 0; h < 360; h += 10) {
    for (const [s, l] of [[0.1, 0.6], [0.4, 0.5], [0.8, 0.5], [1, 0.75], [0.6, 0.3]]) {
      const hex = rgbToHex(hslToRgb([h, s, l]));
      const r = adjustContrast(paletteFromColor(hex));
      assert.equal(r.ok, true, `${hex}: ${JSON.stringify(r.checks.filter((c) => !c.ok))}`);
      assert.ok(r.checks.every((c) => c.ratio >= MIN_CONTRAST));
      assert.equal(r.color.surface, '#FFFFFF');
      assert.equal(r.color['on-primary'], '#FFFFFF');
    }
  }
});

test('색 7개: 대표 색의 색상을 따른다', () => {
  const p = paletteFromColor('#46966E');
  for (const k of ['bg', 'accent', 'primary']) assert.ok(Math.abs(hue(p[k]) - hue('#46966E')) < 3, `${k} ${p[k]}`);
});

test('카드 색 설정: 기본·제품 색만 받고 나머지는 기본', () => {
  assert.equal(colorModeOf({ cond: { '카드 색': '제품 색' } }), '제품 색');
  assert.equal(colorModeOf({ cond: { '카드 색': '기본' } }), '기본');
  assert.equal(colorModeOf({ cond: { '카드 색': '파란색' } }), '기본');
  assert.equal(colorModeOf({ cond: {} }), '기본');
  assert.equal(colorModeOf({}), '기본');
});

test('카드 색 정하기: 제품 색을 못 쓰면 기본 색 + 이유', () => {
  const plain = decideColors({ mode: '기본', baseColor: theme.color });
  assert.equal(plain.source, 'theme');
  assert.equal(plain.note, null);
  assert.equal(plain.ok, true);

  const noImage = decideColors({ mode: '제품 색', baseColor: theme.color });
  assert.equal(noImage.source, 'theme');
  assert.match(noImage.note, /제품 사진이 없어/);

  const white = decideColors({ mode: '제품 색', baseColor: theme.color, pixels: fill([255, 255, 255, 255], 100), image: 'a.png' });
  assert.equal(white.source, 'theme');
  assert.equal(white.image, null);
  assert.match(white.note, /색 있는 부분이 적어/);

  const broken = decideColors({ mode: '제품 색', baseColor: theme.color, image: 'a.png', readError: 'decode 실패' });
  assert.match(broken.note, /읽지 못해/);

  const green = decideColors({ mode: '제품 색', baseColor: theme.color, pixels: fill([70, 150, 110, 255], 100), image: 'a.png' });
  assert.equal(green.source, 'product');
  assert.equal(green.image, 'a.png');
  assert.ok(green.representative);
  assert.equal(green.ok, true);
});

test('대표 색을 읽을 사진: 카드에 쓴 사진 먼저, 사용 불가·없는 파일은 건너뜀', () => {
  const imageDir = path.join(ROOT, 'products', SAMPLE_ID, 'images');
  const input = { images: [{ file: 'main.png', usage: '가능' }] };
  assert.equal(pickProductImage({ data: { cards: [{ image: 'nope.png' }, { image: 'main.png' }] }, input, imageDir }), 'main.png');
  assert.equal(pickProductImage({ data: { cards: [] }, input, imageDir }), 'main.png');
  assert.equal(pickProductImage({ data: { cards: [{ image: 'main.png' }] }, input: { images: [{ file: 'main.png', usage: '불가' }] }, imageDir }), null);
});
