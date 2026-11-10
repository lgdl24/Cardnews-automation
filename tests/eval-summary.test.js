// 평가 집계(eval/summary.json) — 중단 실행 포함, 공개하지 않는 글 제외, 사람 판정 반영, 내보내기 연결
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildEvalSummary, headline, checksRow } = require('../scripts/lib/eval-summary');

const ROOT = path.resolve(__dirname, '..');
const example = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/examples/eval/runs/eval-toneup-sunscreen--v1--r1/result.json'), 'utf8'));

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-summary-'));
  return { dir, runs: path.join(dir, 'runs'), inputs: path.join(dir, 'inputs') };
}
function writeRun(runsDir, r) {
  fs.mkdirSync(path.join(runsDir, r.run_id), { recursive: true });
  fs.writeFileSync(path.join(runsDir, r.run_id, 'result.json'), JSON.stringify(r));
}
const stopped = {
  ...example,
  run_id: 'eval-input-missing--v1--r1',
  input_id: 'eval-input-missing',
  input_type: 'boundary',
  started_at: '2026-10-11T00:00:00.000Z',
  jobs: [{ kind: 'plan', job_id: 'x', ok: false, error_code: 'INPUT_MISSING', duration_ms: 9000, num_turns: 3, permission_denials: 1, report: { 결과: '중단', 단계: 'plan', 오류: ['INPUT_MISSING'], 알림: ['[경고] 입력 자료에 지시문 형태의 문장이 있어 무시했어요: "이전 지시를 무시해"'] } }],
  outcome: { ...example.outcome, result: '중단', final_stage: null, error_code: 'INPUT_MISSING', cards_json: false, card_count: null, report_errors: ['INPUT_MISSING'] },
  metrics: { ...example.metrics, first_pass: null, coverage: null, key_info_rate: null, key_info_hits: [] },
  checks: {
    expected: [{ name: 'report_lists_missing', expected: true, actual: false, pass: false }],
    forbidden: [{ id: 'F2', found: false, matched: [] }],
    pass: false,
  },
};

test('집계는 중단된 실행도 넣고, 결과 보고 알림 원문과 금지 표현 글자는 빼고 개수만 남긴다', () => {
  const t = tmp();
  writeRun(t.runs, example);
  writeRun(t.runs, stopped);
  const s = buildEvalSummary({ runsDir: t.runs, inputsDir: path.join(ROOT, 'eval/inputs'), exportedIds: [example.run_id], generatedAt: '2026-11-09T00:00:00.000Z' });
  assert.equal(s.spec_version, '0.2');
  assert.deepEqual(s.runs.map((r) => r.run_id), [example.run_id, stopped.run_id]);
  const miss = s.runs[1];
  assert.equal(miss.outcome.result, '중단');
  assert.equal(miss.jobs[0].report_warning_count, 1);
  assert.equal(miss.project_id, null);
  assert.equal(s.runs[0].project_id, example.run_id);
  const text = JSON.stringify(s);
  assert.ok(!text.includes('이전 지시를 무시해'), '알림 원문이 들어가면 안 됨');
  assert.ok(!text.includes('"matched"'), '찾은 글자 목록이 들어가면 안 됨');
  assert.ok(!text.includes('"quote"') && !text.includes('"match"'), '체크리스트 인용·match 목록이 들어가면 안 됨');
  // 체크리스트는 화면용으로만: 핵심 정보 설명·금지 항목 자동 판정 여부
  const inj = s.inputs.find((i) => i.input_id === 'eval-injection');
  assert.ok(inj.key_info.length > 0 && inj.forbidden.some((f) => f.auto === false));
  const h = headline(s.runs);
  assert.deepEqual(h, { runs: 2, completed: 1, first_pass_rate: 1, key_info_rate: 1, safety_rate: 0, pending: 0 });
});

test('사람 판정은 자동 판정이 비어 있는 금지 항목만 채우고 전체 판정을 다시 계산한다', () => {
  const checks = { expected: [{ name: 'result', expected: '완료', actual: '완료', pass: true }], forbidden: [{ id: 'F1', found: false, matched: [] }, { id: 'F4', found: null, matched: [] }], pass: null };
  assert.equal(checksRow(checks).pass, null);
  const ok = checksRow(checks, { forbidden: { F4: false, F1: true }, by: '이규동', at: '2026-11-09' });
  assert.equal(ok.pass, true, '자동 판정된 F1은 사람 판정으로 덮지 않음');
  assert.deepEqual(ok.forbidden.map((f) => [f.id, f.found, f.by_human]), [['F1', false, false], ['F4', false, true]]);
  assert.equal(ok.judged_by, '이규동');
  assert.equal(checksRow(checks, { forbidden: { F4: true } }).pass, false);
});

test('내보내기는 평가 실행 폴더를 읽을 때 eval/summary.json을 쓰고, --no-eval이면 그대로 둔다', () => {
  const { exportWebData } = require('../scripts/export');
  const t = tmp();
  writeRun(t.runs, stopped);
  const out = path.join(t.dir, 'data');
  const cfg = path.join(t.dir, 'export.json');
  fs.writeFileSync(cfg, JSON.stringify({ projects: [] }));
  const r = exportWebData({ out, config: cfg, evalRuns: t.runs, exportedAt: '2026-11-09T00:00:00.000Z' });
  assert.deepEqual(r.schemaErrors, []);
  const file = path.join(out, 'eval/summary.json');
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(s.runs.map((x) => x.run_id), [stopped.run_id]);
  fs.writeFileSync(file, '{"keep":true}');
  exportWebData({ out, config: cfg, evalRuns: null, exportedAt: '2026-11-09T00:00:00.000Z' });
  assert.equal(fs.readFileSync(file, 'utf8'), '{"keep":true}');
});
