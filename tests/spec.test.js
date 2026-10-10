// 규격 일치 테스트: 규격 파일(schemas/, config/)·검사 코드·문서가 서로 같은 내용을 말하는지
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const { ROOT, SAMPLE_ID, makeWorkspace } = require('./helpers');
const { STAGES, ROLES, EVIDENCE_REQUIRED_ROLES } = require('../scripts/validate');
const { checkInput } = require('../scripts/check-input');
const { parseInput } = require('../scripts/lib/common');
const { loadForm, renderInputMd, findInstructionLike } = require('../scripts/lib/input-form');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const schema = readJson('schemas/cards.schema.json');
const templates = readJson('config/templates.json');
const templateKeys = Object.keys(templates).filter((k) => !k.startsWith('_'));
const ajv = new Ajv2020({ allErrors: true });
const validateSchema = ajv.compile(schema);
const sampleCards = () => readJson(`products/${SAMPLE_ID}/cards.json`);

// 템플릿별 copy 규칙을 스키마에서 꺼냄
function schemaCopyRule(key) {
  const branch = schema.$defs.card.allOf.find((b) => b.if.properties.template && b.if.properties.template.const === key);
  return branch.then.properties.copy;
}

// ── 카드 데이터 JSON 스키마
test('예시 cards.json은 JSON 스키마를 통과한다', () => {
  assert.ok(validateSchema(sampleCards()), JSON.stringify(validateSchema.errors, null, 2));
});

test('스키마의 stage·role 값은 검증 코드와 같다', () => {
  assert.deepEqual(schema.properties.stage.enum, STAGES);
  assert.deepEqual(schema.$defs.card.properties.role.enum, ROLES);
  const evidenceBranch = schema.$defs.card.allOf.find((b) => b.if.properties.role);
  assert.deepEqual(evidenceBranch.if.properties.role.enum, EVIDENCE_REQUIRED_ROLES);
});

test('스키마의 템플릿 목록·필드·필수 여부·항목 수는 config/templates.json과 같다', () => {
  assert.deepEqual(schema.$defs.card.properties.template.enum, templateKeys);
  for (const key of templateKeys) {
    const fields = templates[key].fields;
    const rule = schemaCopyRule(key);
    assert.deepEqual(Object.keys(rule.properties).sort(), Object.keys(fields).sort(), `${key} 필드`);
    const required = Object.entries(fields).filter(([, r]) => r.required).map(([f]) => f).sort();
    assert.deepEqual([...rule.required].sort(), required, `${key} 필수 필드`);
    if (fields.items) {
      assert.equal(rule.properties.items.maxItems, fields.items.maxItems);
      assert.equal(rule.properties.items.minItems, fields.items.minItems);
    }
    // 이미지 필수 템플릿
    const branch = schema.$defs.card.allOf.find((b) => b.if.properties.template && b.if.properties.template.const === key);
    assert.equal((branch.then.required || []).includes('image'), templates[key].image === 'required', `${key} 이미지 필수 여부`);
  }
});

const schemaCases = [
  ['stage 값이 규격 밖', (d) => { d.stage = 'draft'; }],
  ['특징 카드에 근거 없음', (d) => { d.cards[2].evidence = []; }],
  ['문구 단계인데 copy 없음', (d) => { delete d.cards[0].copy; }],
  ['필수 문구(title) 없음', (d) => { delete d.cards[0].copy.title; }],
  ['템플릿에 없는 copy 필드', (d) => { d.cards[0].copy.subTitle = '오타 필드'; }],
  ['이미지 파일명에 경로', (d) => { d.cards[1].image = '../secret.png'; }],
  ['설명형 항목 4개', (d) => { d.cards[2].copy.items.push('네 번째'); }],
  ['근거 ID 형식 오류', (d) => { d.sources[0].id = 'source-1'; }],
];
for (const [name, edit] of schemaCases) {
  test(`스키마도 거부한다: ${name}`, () => {
    const d = sampleCards();
    edit(d);
    assert.equal(validateSchema(d), false);
  });
}

test('구성안 단계(plan)는 copy 없이 스키마를 통과한다', () => {
  const d = sampleCards();
  d.stage = 'plan';
  for (const c of d.cards) delete c.copy;
  assert.ok(validateSchema(d), JSON.stringify(validateSchema.errors));
});

// ── 문서와 규격 파일
test('docs/card-data-spec.md의 글자 수 표는 config/templates.json과 같다', () => {
  const doc = read('docs/card-data-spec.md');
  for (const key of templateKeys) {
    for (const [field, r] of Object.entries(templates[key].fields)) {
      const total = field === 'items' ? r.maxCharsPerItem : r.maxChars;
      const row = new RegExp(`\\|\\s*\`${key}\`\\s*\\|\\s*\`${field}\`\\s*\\|[^|]*\\|\\s*${total}\\s*\\|\\s*${r.maxCharsPerLine}\\s*\\|\\s*${r.maxLines}\\s*\\|`);
      assert.match(doc, row, `${key}.${field} 행 (전체 ${total} / 한 줄 ${r.maxCharsPerLine} / ${r.maxLines}줄)`);
    }
  }
});

test('docs/input-form.md의 양식은 config/input-form.json으로 만든 빈 양식과 같다', () => {
  const doc = read('docs/input-form.md');
  const block = doc.match(/```markdown\n([\s\S]*?)```/);
  assert.ok(block, 'docs/input-form.md에 ```markdown 양식 블록이 없어요');
  assert.equal(block[1], renderInputMd(), '양식 블록을 npm run new-product로 만든 input.md와 같게 맞춰 주세요');
});

// ── 입력 양식
test('빈 양식은 필수 항목이 모두 INPUT_MISSING으로 잡힌다 (안내 문구를 내용으로 보지 않음)', () => {
  const ws = makeWorkspace();
  try {
    ws.writeInput(renderInputMd());
    const report = ws.use(checkInput);
    const missing = report.errors.filter((e) => e.code === 'INPUT_MISSING').map((e) => e.where.replace(/^## /, ''));
    const required = loadForm().groups.flatMap((g) => g.fields.filter((f) => f.required).map((f) => f.key));
    assert.deepEqual(missing.sort(), required.sort());
  } finally {
    ws.cleanup();
  }
});

test('값을 채워 만든 양식은 다시 읽었을 때 같은 값이 나온다', () => {
  const values = {
    제품명: '테스트 크림',
    '제품 설명': '촉촉한 크림이에요.',
    '주요 특징': ['특징 하나', '특징 둘'],
    '사용 방법': '세안 후 바릅니다.',
    이미지: [{ file: 'main.png', desc: '단독 컷', source: '직접 촬영', usage: '가능' }],
    '콘텐츠 목적': '신제품 소개',
    '카드 수': 5,
  };
  const parsed = parseInput(renderInputMd(values));
  assert.equal(parsed.info['제품명'], '테스트 크림');
  assert.equal(parsed.info['주요 특징'], '- 특징 하나\n- 특징 둘');
  assert.equal(parsed.info['브랜드'], '');
  assert.deepEqual(parsed.images, [{ file: 'main.png', desc: '단독 컷', source: '직접 촬영', usage: '가능' }]);
  assert.equal(parsed.cardCount, 5);
});

test('예시 제품 입력에는 지시문 형태 문장이 없다 (오탐 확인)', () => {
  assert.deepEqual(findInstructionLike(read(`products/${SAMPLE_ID}/input.md`)), []);
});

// ── 디자인 토큰: 템플릿은 색을 직접 쓰지 않고 theme.json(= Figma color/* 변수)의 토큰만 씀
test('템플릿이 쓰는 색 변수는 모두 theme.json에 있고, 색 값을 직접 쓰지 않는다', () => {
  const theme = readJson('config/theme.json');
  const files = ['templates/base.css', ...templateKeys.map((k) => templates[k].file)];
  for (const f of files) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const [, name] of css.matchAll(/var\(--color-([\w-]+)\)/g)) {
      assert.ok(name in theme.color, `${f}: --color-${name}이 theme.json에 없어요`);
    }
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.deepEqual(hex, [], `${f}: 색 값을 직접 썼어요. theme.json 토큰(var(--color-*))을 써 주세요`);
  }
});
