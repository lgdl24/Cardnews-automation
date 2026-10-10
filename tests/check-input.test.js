// 입력 확인(check-input) 테스트: 입력 누락을 INPUT_MISSING으로 잡는지
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { checkInput } = require('../scripts/check-input');
const { makeWorkspace, removeSection, replaceSection, codes } = require('./helpers');

// 각 경우: 예시 제품을 복사해 edit로 고친 뒤 checkInput 결과를 확인
const cases = [
  {
    name: '예시 제품은 오류가 없다',
    edit: () => {},
    expect: [],
  },
  {
    name: '필수 항목(사용 방법)이 없으면 INPUT_MISSING',
    edit: (ws) => ws.editInput((t) => removeSection(t, '사용 방법')),
    expect: ['INPUT_MISSING'],
    where: '## 사용 방법',
  },
  {
    name: '필수 항목 내용이 비어 있으면 INPUT_MISSING',
    edit: (ws) => ws.editInput((t) => replaceSection(t, '제품 설명', '')),
    expect: ['INPUT_MISSING'],
    where: '## 제품 설명',
  },
  {
    name: '양식 안내 문구만 남아 있으면 비어 있는 것으로 본다',
    edit: (ws) => ws.editInput((t) => replaceSection(t, '콘텐츠 목적', '(필수) 예: 신제품 소개')),
    expect: ['INPUT_MISSING'],
    where: '## 콘텐츠 목적',
  },
  {
    name: '카드 수가 숫자가 아니면 INPUT_MISSING',
    edit: (ws) => ws.editInput((t) => replaceSection(t, '카드 수', '다섯 장')),
    expect: ['INPUT_MISSING'],
    where: '## 카드 수',
  },
  {
    name: '목록에 적은 이미지 파일이 없으면 INPUT_MISSING',
    edit: (ws) => fs.rmSync(ws.file('images', 'main.png')),
    expect: ['INPUT_MISSING'],
    where: '이미지 main.png',
  },
  {
    name: '사용 불가 이미지는 INPUT_MISSING',
    edit: (ws) => ws.editInput((t) => t.replace('| 직접 제작 | 가능', '| 직접 제작 | 불가')),
    expect: ['INPUT_MISSING'],
    where: '이미지 main.png',
  },
  {
    name: '이미지 출처가 비어 있으면 INPUT_MISSING',
    edit: (ws) => ws.editInput((t) => t.replace('| 직접 제작 | 가능', '|  | 가능')),
    expect: ['INPUT_MISSING'],
    where: '이미지 main.png',
  },
  {
    name: 'input.md가 없으면 INPUT_MISSING',
    edit: (ws) => fs.rmSync(ws.file('input.md')),
    expect: ['INPUT_MISSING'],
    where: 'input.md',
  },
];

for (const c of cases) {
  test(c.name, () => {
    const ws = makeWorkspace();
    try {
      c.edit(ws);
      const report = ws.use(checkInput);
      assert.deepEqual(codes(report), c.expect, JSON.stringify(report.errors, null, 2));
      if (c.where) assert.ok(report.errors.some((e) => e.where === c.where), `오류 위치에 "${c.where}"가 없어요: ${JSON.stringify(report.errors)}`);
    } finally {
      ws.cleanup();
    }
  });
}

test('사용 가능 여부가 "확인 필요"면 오류가 아니라 경고', () => {
  const ws = makeWorkspace();
  try {
    ws.editInput((t) => t.replace('| 직접 제작 | 가능', '| 직접 제작 | 확인 필요'));
    const report = ws.use(checkInput);
    assert.equal(report.errors.length, 0);
    assert.ok(report.warnings.some((w) => w.where === '이미지 main.png'));
  } finally {
    ws.cleanup();
  }
});
