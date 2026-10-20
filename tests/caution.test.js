// 주의 표현 목록 테스트: config/caution-expressions.json의 형식, 대표 표현을 잡는지, 정상 문구를 잘못 잡지 않는지
// 판단 기준: docs/style-guide.md '주의 표현 판단 기준'
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, makeWorkspace } = require('./helpers');
const { findCautions } = require('../scripts/lib/metrics');
const { validate } = require('../scripts/validate');

const caution = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'caution-expressions.json'), 'utf8'));
const allTerms = caution.groups.flatMap((g) => g.terms.map((term) => ({ term, category: g.category })));
// 문구 한 줄로 카드 1장을 만들어 찾기
const find = (text, source = '') => findCautions({ cards: [{ no: 1, copy: { title: text } }] }, source, caution);

test('목록 형식: 분류마다 이름·표현·설명·근거가 있고, 표현이 겹치지 않는다', () => {
  assert.ok(Array.isArray(caution.references) && caution.references.length > 0, 'references');
  const categories = caution.groups.map((g) => g.category);
  assert.equal(new Set(categories).size, categories.length, '분류 이름 중복');
  for (const g of caution.groups) {
    assert.ok(g.category && g.note && g.basis, `${g.category}: category·note·basis`);
    assert.ok(Array.isArray(g.terms) && g.terms.length > 0, `${g.category}: terms`);
    for (const t of g.terms) assert.ok(typeof t === 'string' && t.trim() === t && t.length > 0, `${g.category}: "${t}"`);
    // extended(근거 문서에 글자 그대로 없는 표현)는 terms 안에 있어야 함
    assert.ok(Array.isArray(g.extended), `${g.category}: extended`);
    for (const t of g.extended) assert.ok(g.terms.includes(t), `${g.category}: extended "${t}"가 terms에 없음`);
  }
  const terms = allTerms.map((x) => x.term);
  assert.equal(new Set(terms).size, terms.length, '같은 표현이 두 번 있음');
  // 한 표현이 다른 표현을 포함하면 같은 글자가 두 번 잡힘 (예: "피부노화"와 "노화")
  for (const a of terms) for (const b of terms) if (a !== b) assert.ok(!a.includes(b), `"${a}"가 "${b}"를 포함`);
});

test('분류마다 대표 표현을 잡고, 원문에 있는지 구분한다', () => {
  const samples = [
    ['여드름 피부를 치료해요', '의약품 오인 우려', ['치료', '여드름']],
    ['피부 재생을 도와요', '의약품 오인 우려', ['재생']],
    ['화이트닝 효과', '기능성 표방', ['화이트닝']],
    ['안티에이징 케어', '피부·신체 변화 단정', ['안티에이징']],
    ['바르는 보톡스', '인체 유래·시술 오인', ['보톡스']],
    ['피부과 전용 크림', '특정인·기관 공인', ['피부과']],
    ['비건 인증 포뮬러', '인증·성분 사실 오인', ['비건']],
    ['최고의 밀착력', '절대·최상급 표현', ['최고']],
    ['부작용 없는 순한 크림', '부작용·안전성 단정', ['부작용 없']],
    ['바르면 즉시 촉촉해요', '즉각·확정 효과', ['즉시']],
  ];
  for (const [text, category, terms] of samples) {
    const found = find(text);
    assert.deepEqual(found.map((f) => f.term).sort(), [...terms].sort(), text);
    assert.ok(found.some((f) => f.category === category), `${text} → ${category}`);
    assert.ok(found.every((f) => f.in_source === false), `${text}: 원문에 없음`);
  }
  assert.equal(find('최고의 밀착력', '최고의 밀착력을 경험하세요')[0].in_source, true);
});

test('정상 문구·표준 주의사항·예시 제품 문구는 잡지 않는다', () => {
  const normal = [
    '화장품 사용 시 또는 사용 후 직사광선에 의하여 사용 부위가 붉은 반점, 부어오름 또는 가려움증 등의 이상 증상이나 부작용이 있는 경우 전문의 등과 상담할 것',
    '사용 시 주의사항을 꼭 확인해요',
    '완충 시 최대 8시간 연속 사용',
    '가볍게 펴 발리는 톤업 선크림이에요',
    '끈적임 없이 산뜻하게 마무리돼요',
  ];
  for (const text of normal) assert.deepEqual(find(text), [], text);
  // 결과 보기 웹 예시 데이터(docs/examples/web-data)가 이 목록으로 바뀌지 않아야 함
  for (const id of ['toneup-sunscreen', 'toneup-sunscreen-r1']) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'products', id, 'cards.json'), 'utf8'));
    assert.deepEqual(findCautions(data, '', caution), [], id);
  }
});

test('검증(validate)은 새 분류도 오류가 아니라 [주의]로 표시한다', () => {
  const ws = makeWorkspace();
  try {
    ws.editCards((d) => { d.cards[0].copy.badge = '피부과 전용'; });
    const { report } = ws.use(validate);
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
    const c = report.cautions.find((x) => x.where === '1번 카드');
    assert.ok(c && c.message.includes('"피부과"') && c.message.includes('특정인·기관 공인') && c.message.includes('원문에 없음'), JSON.stringify(report.cautions));
  } finally {
    ws.cleanup();
  }
});
