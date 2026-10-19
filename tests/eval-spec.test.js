// 평가 결과·체크리스트 규격 테스트: 스키마(schemas/eval/)·예시(docs/examples/eval/)·평가 입력(eval/inputs/)이 서로 맞는지
// 규격 문서: docs/eval-spec.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const { ROOT, withEnv } = require('./helpers');
const { loadInput } = require('../scripts/lib/common');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const EXAMPLE = path.join(ROOT, 'docs', 'examples', 'eval');
const EVAL_INPUTS = path.join(ROOT, 'eval', 'inputs');

const ajv = new Ajv2020({ allErrors: true });
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
const validators = Object.fromEntries(
  ['checklist', 'run-result'].map((name) => [name, ajv.compile(readJson(path.join(ROOT, 'schemas', 'eval', `${name}.schema.json`)))]),
);
const check = (name, data, label) => {
  const validate = validators[name];
  assert.ok(validate(data), `${label}: ${JSON.stringify(validate.errors, null, 2)}`);
};

const dirsIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isDirectory()) : []);

// 체크리스트 하나: 스키마, 폴더 이름, 핵심 정보 인용이 원문에 그대로 있는지
function checkChecklist(inputsDir, id) {
  const c = readJson(path.join(inputsDir, id, 'checklist.json'));
  check('checklist', c, `${id}/checklist.json`);
  assert.equal(c.input_id, id);
  const input = withEnv({ CARDNEWS_PRODUCTS_DIR: inputsDir, CARDNEWS_NO_LOG: '1' }, () => loadInput(id));
  for (const k of c.key_info) assert.ok(input.productText.includes(k.quote), `${id} ${k.id}: "${k.quote}"가 원문에 없어요`);
  for (const list of [c.key_info, c.forbidden]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: id 중복`);
  }
  return c;
}

test('예시 체크리스트는 스키마를 통과하고 인용이 원문에 있다', () => {
  const ids = dirsIn(path.join(EXAMPLE, 'inputs'));
  assert.ok(ids.length > 0);
  for (const id of ids) checkChecklist(path.join(EXAMPLE, 'inputs'), id);
});

test('eval/inputs/의 체크리스트도 스키마를 통과한다 (평가 입력이 있을 때)', () => {
  for (const id of dirsIn(EVAL_INPUTS)) checkChecklist(EVAL_INPUTS, id);
});

test('예시 실행 결과는 스키마를 통과하고 체크리스트와 맞는다', () => {
  const runs = dirsIn(path.join(EXAMPLE, 'runs'));
  assert.ok(runs.length > 0);
  for (const runId of runs) {
    const r = readJson(path.join(EXAMPLE, 'runs', runId, 'result.json'));
    check('run-result', r, `${runId}/result.json`);
    assert.equal(r.run_id, runId);
    assert.ok(runId.startsWith(`${r.input_id}--${r.skill_version}${r.variant ? `-${r.variant}` : ''}--r${r.repeat}`), `${runId}: 실행ID 형식`);

    const c = readJson(path.join(EXAMPLE, 'inputs', r.input_id, 'checklist.json'));
    assert.equal(r.input_type, c.type);
    // 핵심 정보: 체크리스트 항목마다 판정이 하나씩, 포함률 = 포함된 수 ÷ 전체
    assert.deepEqual(r.metrics.key_info_hits.map((h) => h.id), c.key_info.map((k) => k.id));
    const hits = r.metrics.key_info_hits;
    assert.equal(r.metrics.key_info_rate, hits.length ? hits.filter((h) => h.in_evidence).length / hits.length : null);
    for (const h of hits) {
      const k = c.key_info.find((x) => x.id === h.id);
      assert.equal(h.in_copy === null, !k.copy_terms, `${h.id}: copy_terms가 없을 때만 in_copy가 null`);
    }
    // 판정: 체크리스트에 적힌 기대 동작만, 금지 항목은 하나씩
    const judged = Object.keys(c.expected).filter((k) => k !== 'undetected_instructions');
    assert.deepEqual(r.checks.expected.map((e) => e.name).sort(), judged.sort());
    for (const e of r.checks.expected) assert.deepEqual(e.expected, c.expected[e.name], `${e.name} 기대값`);
    assert.deepEqual(r.checks.forbidden.map((f) => f.id), c.forbidden.map((f) => f.id));
    for (const f of r.checks.forbidden) {
      const def = c.forbidden.find((x) => x.id === f.id);
      assert.equal(f.found === null, !def.match, `${f.id}: match가 없을 때만 found가 null`);
    }
    const allPass = r.checks.expected.every((e) => e.pass) && !r.checks.forbidden.some((f) => f.found === true);
    const pending = r.checks.forbidden.some((f) => f.found === null);
    assert.equal(r.checks.pass, allPass ? (pending ? null : true) : false);
    // 작업 시간 합
    assert.equal(r.metrics.duration_ms, r.jobs.reduce((s, j) => s + (j.duration_ms || 0), 0));
  }
});
