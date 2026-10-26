// 디자인 묶음 정하기·목록 (#74 1단계): 입력 무드 → cards.json design → 기본 순서, 목록(_catalog)과 묶음(_designs) 일치
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers');
const { resolveDesign, designOf, designCatalog, loadConfig, loadInput, readJson, paths } = require('../scripts/lib/common');
const { colorModeOf } = require('../scripts/lib/color-mood');
const { limitLines } = require('../scripts/lib/limits');

const config = require('../config/templates.json');
const premium = { design: { id: '프리미엄' } };

test('묶음 정하기: 입력 무드(직접 지정) → cards.json design → 기본', () => {
  const cases = [
    // [입력 cond, cards.json, 기대 id, 기대 source]
    [{}, null, '기본', 'default'],
    [{ 무드: '프리미엄' }, null, '프리미엄', 'input'],
    [{ 디자인: '프리미엄' }, null, '프리미엄', 'input'], // 예전 칸 이름 (#69)
    [{}, premium, '프리미엄', 'cards'],
    [{ 무드: '' }, premium, '프리미엄', 'cards'], // 빈 무드는 구성안에서 고른 것
    [{ 무드: '없는 묶음' }, premium, '프리미엄', 'cards'], // 목록에 없는 값은 건너뜀
    [{ 무드: '기본' }, premium, '기본', 'input'], // 사람이 직접 고른 기본이 우선
    [{}, { design: { id: '없는 묶음' } }, '기본', 'default'],
    [{}, { design: null }, '기본', 'default'],
  ];
  for (const [cond, data, id, source] of cases) {
    const got = resolveDesign({ input: { cond }, data, config });
    assert.deepEqual(got, { id, source }, JSON.stringify({ cond, data }));
    assert.equal(designOf({ cond }, config, data), id);
  }
  assert.deepEqual(resolveDesign(), { id: '기본', source: 'default' });
});

test('cards.json에서 고른 묶음이 설정·카드 색·글자 수 안내에 반영됨', () => {
  const { templates } = loadConfig(null, premium);
  assert.equal(templates.cover.file, 'templates/premium/cover.html');
  assert.equal(loadConfig(null, null).templates.cover.file, 'templates/cover.html');
  assert.equal(colorModeOf(null, premium), '제품 색');
  assert.equal(colorModeOf({ cond: { '카드 색': '기본' } }, premium), '기본'); // 직접 적은 카드 색이 우선
  const { design, lines } = limitLines({ cond: {} }, premium);
  assert.equal(design, '프리미엄');
  assert.match(lines[0], /^무드: 프리미엄/);
});

test('묶음 목록: 기본 + _designs의 모든 묶음, 필수 설명 칸', () => {
  const catalog = designCatalog(config);
  const ids = catalog.map((d) => d.id).sort();
  assert.deepEqual(ids, ['기본', ...Object.keys(config._designs)].sort());
  const NEEDS = ['required', 'optional', 'none'];
  for (const d of catalog) {
    assert.ok(d.name && d.summary, `${d.id}: name·summary`);
    assert.ok(Array.isArray(d.fits) && d.fits.length > 0, `${d.id}: fits`);
    assert.ok(Array.isArray(d.avoid), `${d.id}: avoid`);
    assert.ok(NEEDS.includes(d.needs?.product) && NEEDS.includes(d.needs?.background), `${d.id}: needs`);
    assert.match(String(d.version), /^\d+$/, `${d.id}: version`);
    if (d.preview !== null) assert.ok(fs.existsSync(path.join(ROOT, d.preview)), `${d.id}: preview ${d.preview}`);
  }
  assert.equal(catalog.find((d) => d.id === '프리미엄').colorMode, '제품 색');
  assert.equal(catalog.find((d) => d.id === '기본').colorMode, '기본');
});

test('지금 있는 제품은 묶음이 그대로 (cards.json에 design 없음 → 출력 변화 없음)', () => {
  const ids = fs.readdirSync(paths.products()).filter((id) => fs.existsSync(paths.product(id, 'cards.json')));
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const input = loadInput(id);
    if (!input) continue;
    const data = readJson(paths.product(id, 'cards.json'));
    assert.equal(data.design, undefined, `${id}: cards.json design`);
    assert.equal(designOf(input, config, data), designOf(input, config), id);
  }
});
