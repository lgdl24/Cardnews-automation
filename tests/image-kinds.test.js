// 입력 이미지 용도(제품·제형·배경, #74): 읽기·입력 확인·카드 색 사진 고르기·템플릿 자리
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorkspace } = require('./helpers');
const { loadInput, loadConfig } = require('../scripts/lib/common');
const { pickProductImage } = require('../scripts/lib/color-mood');
const { buildCardHtml } = require('../scripts/lib/card-html');

const addImages = (text, lines) => text.replace(/(## 이미지\n(?:- [^\n]*\n)+)/, (m) => m + lines.join('\n') + '\n');

test('용도 칸: 비우면 제품, 제형·배경은 그대로 읽음', () => {
  const ws = makeWorkspace();
  try {
    ws.editInput((t) => addImages(t, ['- texture.png | 크림 자국 | 직접 촬영 | 가능 | 제형', '- scene.png | 물결 장면 | 직접 촬영 | 가능 | 배경']));
    const input = ws.use((id) => loadInput(id));
    assert.equal(input.images[0].kind, '제품');
    assert.deepEqual(input.images.slice(-2).map((i) => i.kind), ['제형', '배경']);
  } finally { ws.cleanup(); }
});

test('입력 확인: 모르는 용도는 경고 (제품으로 봄)', () => {
  const ws = makeWorkspace();
  try {
    fs.copyFileSync(ws.file('images', 'main.png'), ws.file('images', 'logo.png'));
    ws.editInput((t) => addImages(t, ['- logo.png | 로고 | 직접 제작 | 가능 | 로고']));
    const r = ws.run('check-input.js');
    assert.match(r.stdout, /용도 "로고"는 고를 수 없는 값이에요/);
  } finally { ws.cleanup(); }
});

test('카드 색 사진: 제형·배경 사진은 대표 색을 읽는 데 쓰지 않음', () => {
  const ws = makeWorkspace();
  try {
    fs.copyFileSync(ws.file('images', 'main.png'), ws.file('images', 'texture.png'));
    const input = { images: [{ file: 'texture.png', usage: '가능', kind: '제형' }, { file: 'main.png', usage: '가능', kind: '제품' }] };
    assert.equal(pickProductImage({ data: { cards: [] }, input, imageDir: ws.file('images') }), 'main.png');
  } finally { ws.cleanup(); }
});

test('템플릿 자리: 제형·배경 사진이 있으면 has-texture·has-scene과 경로, 없으면 no-*', () => {
  const { templates, theme } = loadConfig({ cond: { 무드: '연출' } });
  const card = { no: 2, role: 'feature', template: 'image', image: 'main.png', copy: { title: '제목' } };
  const dir = path.join(__dirname, '..', 'products', 'toneup-sunscreen');
  const args = { card, cards: [card], total: 5, product: '제품', tpl: templates.image, theme, htmlDir: path.join(dir, 'output', 'html'), imageDir: path.join(dir, 'images') };
  const withPhotos = buildCardHtml({ ...args, extraImages: { texture: 'texture.png', scene: 'scene.png' } });
  assert.match(withPhotos, /has-scene/);
  assert.match(withPhotos, /has-texture/);
  assert.match(withPhotos, /src="\.\.\/\.\.\/images\/scene\.png"/);
  const without = buildCardHtml(args);
  assert.match(without, /no-scene/);
  assert.match(without, /no-texture/);
});
