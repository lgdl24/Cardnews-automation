// 평가 입력 세트 테스트: eval/inputs/<입력ID>/의 input.md·checklist.json이 서로 맞고, 입력 확인 결과가 기대 동작과 같은지
// 형식은 초안 — docs/eval-spec.md(이용석)가 정해지면 함께 고침
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, withEnv } = require('./helpers');
const { checkInput } = require('../scripts/check-input');
const { loadInput } = require('../scripts/lib/common');

const DIR = path.join(ROOT, 'eval', 'inputs');
const ids = fs.readdirSync(DIR).filter((f) => fs.statSync(path.join(DIR, f)).isDirectory());
const useEval = (fn) => withEnv({ CARDNEWS_PRODUCTS_DIR: DIR, CARDNEWS_NO_LOG: '1' }, fn);
const readChecklist = (id) => JSON.parse(fs.readFileSync(path.join(DIR, id, 'checklist.json'), 'utf8'));

test('평가 입력이 있고, 모두 input.md와 checklist.json을 가진다', () => {
  assert.ok(ids.length >= 4);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9-]+$/, id);
    for (const f of ['input.md', 'checklist.json']) assert.ok(fs.existsSync(path.join(DIR, id, f)), `${id}/${f}`);
    const c = readChecklist(id);
    assert.equal(c.input_id, id);
    assert.ok(['normal', 'boundary'].includes(c.type), `${id} type`);
    assert.ok(c.owner && c.case && c.purpose && c.expected, `${id} 필수 필드`);
  }
});

test('핵심 정보의 인용은 원문(# 제품 정보)에 그대로 있다', () => {
  for (const id of ids) {
    const c = readChecklist(id);
    const input = useEval(() => loadInput(id));
    const seen = new Set();
    for (const k of c.key_info) {
      assert.ok(!seen.has(k.id), `${id} ${k.id} 중복`);
      seen.add(k.id);
      assert.ok(input.productText.includes(k.quote), `${id} ${k.id}: "${k.quote}"가 원문에 없어요`);
    }
    if (c.type === 'normal') assert.ok(c.key_info.length >= 3 && c.key_info.length <= 5, `${id}: 정상 입력은 핵심 정보 3~5개 (노션 평가 설계)`);
  }
});

test('입력 확인 결과가 체크리스트의 기대 동작과 같다', () => {
  for (const id of ids) {
    const { expected } = readChecklist(id);
    const report = useEval(() => checkInput(id));
    const instructionWarnings = report.warnings.filter((w) => w.message.includes('지시문 형태')).length;
    if (expected.check === 'pass') {
      assert.deepEqual(report.errors, [], `${id}: 오류가 없어야 해요`);
      assert.equal(instructionWarnings, expected.instruction_warnings ?? 0, `${id}: 지시문 경고 수`);
      const input = useEval(() => loadInput(id));
      if (expected.card_count) assert.equal(input.cardCount, expected.card_count, `${id}: 카드 수`);
    } else {
      assert.equal(expected.check, 'INPUT_MISSING');
      assert.ok(report.errors.length > 0 && report.errors.every((e) => e.code === 'INPUT_MISSING'), `${id}: INPUT_MISSING만`);
      assert.deepEqual(report.errors.map((e) => e.where).sort(), [...expected.check_errors].sort(), `${id}: 누락 항목`);
    }
  }
});
