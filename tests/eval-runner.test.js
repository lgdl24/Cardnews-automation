// 평가 실행기 테스트: 가짜 Claude로 평가 입력을 실행해 result.json이 규격(docs/eval-spec.md)대로 나오는지
// 실제 eval/inputs·eval/runs는 건드리지 않고 임시 폴더에서 실행
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT } = require('./helpers');
const { runEval, planRuns, loadVariant, keyInfoMetrics, judgeForbidden, overallPass } = require('../scripts/lib/eval-runner');
const { fillPrompt } = require('../scripts/lib/job-runner');
const { parseArgs } = require('../scripts/eval');

const FAKE = path.join(__dirname, 'fixtures', 'fake-claude.js');
const SRC = 'toneup-sunscreen-r1';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-eval-'));
  const inputsDir = path.join(dir, 'inputs');
  const runsDir = path.join(dir, 'runs');
  // 정상 입력: 규격 예시(가상 톤업 선크림) + 이미지
  const normal = path.join(inputsDir, 'eval-toneup-sunscreen');
  fs.cpSync(path.join(ROOT, 'docs', 'examples', 'eval', 'inputs', 'eval-toneup-sunscreen'), normal, { recursive: true });
  fs.mkdirSync(path.join(normal, 'images'));
  fs.copyFileSync(path.join(ROOT, 'products', SRC, 'images', 'main.png'), path.join(normal, 'images', 'main.png'));
  // 경계 입력: 입력 누락
  fs.cpSync(path.join(ROOT, 'eval', 'inputs', 'eval-input-missing'), path.join(inputsDir, 'eval-input-missing'), { recursive: true });
  process.env.FAKE_CLAUDE_SOURCE = path.join(ROOT, 'products', SRC, 'cards.json');
  process.env.FAKE_CLAUDE_PNG_DIR = path.join(ROOT, 'docs', 'examples', 'web-data', 'projects', SRC, 'png');
  // 비교판(A8) 예시: 원문 인용 규칙 문단을 뺀 CLAUDE.md + 바꾼 문구 지시문
  const variantsDir = path.join(dir, 'variants');
  const vdir = path.join(variantsDir, 'no-quote-rule');
  fs.mkdirSync(path.join(vdir, 'files', 'prompts', 'eval'), { recursive: true });
  fs.writeFileSync(path.join(vdir, 'variant.json'), JSON.stringify({ description: '원문 인용 규칙을 뺀 판 (테스트)', changes: ['CLAUDE.md: 내용 규칙 둘째 줄 삭제'] }));
  const rules = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  fs.writeFileSync(path.join(vdir, 'files', 'CLAUDE.md'), rules.replace(/^- 모든 특징·사용법 문구는 `sources`.*\n/m, '') + '\n<!-- variant: no-quote-rule -->\n');
  fs.writeFileSync(path.join(vdir, 'files', 'prompts', 'eval', 'copy.md'), fs.readFileSync(path.join(ROOT, 'prompts', 'eval', 'copy.md'), 'utf8') + '\n(비교판 지시문)\n');
  const opts = { inputsDir, runsDir, variantsDir, bin: FAKE, jobsDir: path.join(dir, 'jobs') };
  return { dir, inputsDir, runsDir, variantsDir, opts, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const readLog = (runDir) => fs.readFileSync(path.join(runDir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('인자: 입력ID·묶음·반복·비교판·dry-run', () => {
  const o = parseArgs(['eval-a', 'eval-b', '--batch', 'v1-repeat', '--repeat', '3', '--from', '2', '--variant', 'no-quote-rule', '--dry-run']);
  assert.deepEqual(o.inputIds, ['eval-a', 'eval-b']);
  assert.equal(o.batch, 'v1-repeat');
  assert.equal(o.repeat, 3);
  assert.equal(o.from, 2);
  assert.equal(o.variant, 'no-quote-rule');
  assert.equal(o.dryRun, true);
  assert.throws(() => parseArgs(['--bogus']), /알 수 없는 옵션/);
  assert.throws(() => parseArgs(['--repeat', 'x']), /정수/);
});

test('실행 계획: 실행ID 규칙, 묶음 이름 필수, 없는 입력·이미 있는 실행은 시작 전에 멈춤', () => {
  const s = setup();
  try {
    const runs = planRuns({ inputIds: [], batch: 'v1-base', repeat: 2, from: 1, inputsDir: s.inputsDir, runsDir: s.runsDir });
    assert.deepEqual(runs.map((r) => r.runId), [
      'eval-input-missing--v1--r1', 'eval-input-missing--v1--r2',
      'eval-toneup-sunscreen--v1--r1', 'eval-toneup-sunscreen--v1--r2',
    ]);
    const v = planRuns({ inputIds: ['eval-toneup-sunscreen'], batch: 'a8', variant: 'no-quote-rule', from: 3, inputsDir: s.inputsDir, runsDir: s.runsDir, variantsDir: s.variantsDir });
    assert.equal(v[0].runId, 'eval-toneup-sunscreen--v1-no-quote-rule--r3');
    // 정의가 없는 비교판은 규칙이 그대로라 이름만 다른 결과가 되므로 시작 전에 멈춤
    assert.throws(() => planRuns({ inputIds: ['eval-toneup-sunscreen'], batch: 'a8', variant: 'no-such', inputsDir: s.inputsDir, runsDir: s.runsDir, variantsDir: s.variantsDir }), /비교판 정의가 없어요/);
    assert.throws(() => planRuns({ inputIds: [], batch: '', inputsDir: s.inputsDir, runsDir: s.runsDir }), /--batch/);
    assert.throws(() => planRuns({ inputIds: ['eval-nothing'], batch: 'x', inputsDir: s.inputsDir, runsDir: s.runsDir }), /평가 입력이 없거나/);
    assert.throws(() => planRuns({ inputIds: ['toneup'], batch: 'x', inputsDir: s.inputsDir, runsDir: s.runsDir }), /eval-로 시작/);
    fs.mkdirSync(path.join(s.runsDir, 'eval-toneup-sunscreen--v1--r1'), { recursive: true });
    assert.throws(() => planRuns({ inputIds: ['eval-toneup-sunscreen'], batch: 'x', inputsDir: s.inputsDir, runsDir: s.runsDir }), /이미 있는 실행/);
  } finally {
    s.cleanup();
  }
});

test('비교판 정의: description·files 필수, 규칙 문서와 평가 지시문만 바꿀 수 있음', () => {
  const s = setup();
  try {
    const v = loadVariant(s.variantsDir, 'no-quote-rule');
    assert.deepEqual(v.files.sort(), ['CLAUDE.md', 'prompts/eval/copy.md']);
    const bad = path.join(s.variantsDir, 'bad');
    fs.mkdirSync(path.join(bad, 'files', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(bad, 'variant.json'), JSON.stringify({ description: '검증 스크립트를 바꾸려는 판' }));
    fs.writeFileSync(path.join(bad, 'files', 'scripts', 'validate.js'), '');
    assert.throws(() => loadVariant(s.variantsDir, 'bad'), /바꿀 수 없는 파일/);
    const empty = path.join(s.variantsDir, 'empty');
    fs.mkdirSync(empty);
    fs.writeFileSync(path.join(empty, 'variant.json'), JSON.stringify({ description: '빈 판' }));
    assert.throws(() => loadVariant(s.variantsDir, 'empty'), /바꿀 파일이 없어요/);
    fs.writeFileSync(path.join(empty, 'variant.json'), JSON.stringify({}));
    assert.throws(() => loadVariant(s.variantsDir, 'empty'), /description/);
    // 지시문: 비교판에 있으면 그것을, 없으면 원래 지시문을 씀
    const vars = { product_id: 'eval-x--v1--r1' };
    assert.match(fillPrompt({ mode: 'eval', kind: 'copy', vars, overlayDir: v.filesDir }), /\(비교판 지시문\)/);
    assert.doesNotMatch(fillPrompt({ mode: 'eval', kind: 'plan', vars, overlayDir: v.filesDir }), /비교판/);
  } finally {
    s.cleanup();
  }
});

test('비교판 실행: 작업 폴더의 CLAUDE.md가 바뀌고 저장소 규칙은 그대로, result.json에 비교판 기록', async () => {
  const s = setup();
  try {
    const before = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    const { results } = await runEval({ ...s.opts, inputIds: ['eval-toneup-sunscreen'], batch: 'a8', variant: 'no-quote-rule', keep: true });
    const { result: r, schemaErrors } = results[0];
    assert.deepEqual(schemaErrors, []);
    assert.equal(r.run_id, 'eval-toneup-sunscreen--v1-no-quote-rule--r1');
    assert.equal(r.variant, 'no-quote-rule');
    assert.match(r.notes, /비교판 no-quote-rule: 원문 인용 규칙을 뺀 판/);
    assert.equal(r.outcome.result, '완료');
    for (const job of r.jobs) {
      const ws = path.join(s.opts.jobsDir, job.job_id);
      const rules = fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8');
      assert.match(rules, /variant: no-quote-rule/);
      assert.doesNotMatch(rules, /모든 특징·사용법 문구는 `sources`/);
      assert.ok(!fs.existsSync(path.join(ws, 'prompts')), '지시문 폴더는 작업 폴더에 복사하지 않음');
      // 검증 스크립트·설정은 원래 것
      assert.equal(fs.readFileSync(path.join(ws, 'scripts', 'validate.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'scripts', 'validate.js'), 'utf8'));
    }
    assert.equal(fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'), before);
  } finally {
    s.cleanup();
  }
});

test('dry-run은 아무 폴더도 만들지 않음', async () => {
  const s = setup();
  try {
    const out = await runEval({ ...s.opts, batch: 'v1-base', dryRun: true });
    assert.equal(out.runs.length, 2);
    assert.equal(out.results.length, 0);
    assert.equal(fs.existsSync(s.runsDir), false);
  } finally {
    s.cleanup();
  }
});

test('정상 입력: 구성안 → 평가 승인 → 문구·출력, result.json이 규격을 통과하고 체크리스트 통과', async () => {
  const s = setup();
  try {
    const { results } = await runEval({ ...s.opts, inputIds: ['eval-toneup-sunscreen'], batch: 'v1-base' });
    assert.equal(results.length, 1);
    const { result: r, schemaErrors, file } = results[0];
    assert.deepEqual(schemaErrors, []);
    assert.equal(path.basename(file), 'result.json');
    assert.ok(fs.existsSync(file));
    assert.equal(r.run_id, 'eval-toneup-sunscreen--v1--r1');
    assert.equal(r.batch, 'v1-base');
    assert.equal(r.input_source, '가상');
    assert.equal(r.model, 'fake-model');
    assert.equal(r.claude_code_version, '9.9.9');
    assert.deepEqual(r.jobs.map((j) => [j.kind, j.ok]), [['plan', true], ['copy', true]]);
    assert.equal(r.jobs[0].num_turns, 4);
    assert.equal(r.jobs[0].permission_denials, 0);
    assert.deepEqual(r.outcome, {
      result: '완료', final_stage: 'copy', error_code: null, cards_json: true, card_count: 5,
      check_errors: [], check_instruction_warnings: 0, report_errors: [], report_warning_count: 0, report_caution_count: 0,
    });
    assert.equal(r.metrics.first_pass, true);
    assert.equal(r.metrics.final_error_count, 0);
    assert.equal(r.metrics.key_info_rate, 1);
    assert.equal(r.metrics.key_info_hits.length, 5);
    assert.equal(r.metrics.coverage, 1);
    assert.equal(typeof r.metrics.duration_ms, 'number');
    assert.ok(r.checks.expected.length >= 5 && r.checks.expected.every((x) => x.pass), JSON.stringify(r.checks.expected));
    assert.equal(r.checks.pass, true);
    // 기록: 평가 승인은 approved_by eval, 최종 승인 없음
    const log = readLog(path.join(s.runsDir, r.run_id));
    const names = log.map((e) => e.event);
    assert.equal(names[0], 'input_submitted');
    assert.deepEqual(log.filter((e) => e.event === 'plan_approved').map((e) => e.approved_by), ['eval']);
    assert.ok(!names.includes('final_approved'));
    assert.equal(log.filter((e) => e.event === 'job_finished').length, 2);
    // 입력 폴더는 그대로
    assert.ok(!fs.existsSync(path.join(s.inputsDir, 'eval-toneup-sunscreen', 'cards.json')));
    // 같은 실행ID는 다시 돌리지 않음
    await assert.rejects(runEval({ ...s.opts, inputIds: ['eval-toneup-sunscreen'], batch: 'v1-base' }), /이미 있는 실행/);
  } finally {
    s.cleanup();
  }
});

test('입력 누락 입력: 구성안 작업에서 중단, 문구 작업 없음, 입력 확인 오류 기록', async () => {
  const s = setup();
  process.env.FAKE_CLAUDE_SCENARIO = 'stopped';
  try {
    const { results } = await runEval({ ...s.opts, inputIds: ['eval-input-missing'], batch: 'v1-base' });
    const { result: r, schemaErrors } = results[0];
    assert.deepEqual(schemaErrors, []);
    assert.equal(r.jobs.length, 1);
    assert.equal(r.outcome.result, '중단');
    assert.equal(r.outcome.error_code, 'INPUT_MISSING');
    assert.equal(r.outcome.cards_json, false);
    assert.equal(r.outcome.final_stage, null);
    assert.ok(r.outcome.check_errors.includes('## 제품 설명'), JSON.stringify(r.outcome.check_errors));
    const row = (name) => r.checks.expected.find((x) => x.name === name);
    for (const name of ['check', 'check_errors', 'result', 'error_code', 'cards_json']) assert.equal(row(name).pass, true, name);
    // 가짜 Claude 보고는 누락 항목을 하나만 적으므로 '누락 항목을 모두 적었는가'는 실패로 판정돼야 함
    assert.equal(row('report_lists_missing').pass, false);
    assert.equal(r.checks.pass, false);
    assert.equal(r.metrics.key_info_rate, null);
    const log = readLog(path.join(s.runsDir, r.run_id));
    assert.ok(!log.some((e) => e.event === 'plan_approved'));
  } finally {
    delete process.env.FAKE_CLAUDE_SCENARIO;
    s.cleanup();
  }
});

test('핵심 정보 포함률·금지 표현 판정 (docs/eval-spec.md 4-1·5장)', () => {
  const cards = {
    stage: 'copy',
    sources: [
      { id: 'S1', quote: 'SPF50+ PA++++ 자외선 차단' },
      { id: 'S2', quote: '50ml' },
      { id: 'S3', quote: '외출 30분 전에 바르고, 땀을 흘린 뒤에는 덧발라 줍니다.' },
    ],
    cards: [
      { no: 1, evidence: ['S1', 'S2'], copy: { title: 'SPF50+ PA++++', subtitle: '가볍게 미백까지' } },
      { no: 2, evidence: ['S3'], copy: { items: ['외출 30분 전에 발라요'] } },
    ],
  };
  const m = keyInfoMetrics(cards, [
    { id: 'K1', quote: 'SPF50+ PA++++ 자외선 차단', copy_terms: ['SPF50+', 'PA++++'] },
    { id: 'K2', quote: '50ml 휴대용 튜브' }, // 짧은 인용(50ml)은 길이 절반 조건으로 포함 안 됨
    { id: 'K3', quote: '땀을 흘린 뒤에는 덧발라' },
    { id: 'K4', quote: '외출 30분 전에 바르고', copy_terms: ['30분', '1시간'] },
  ]);
  assert.deepEqual(m.key_info_hits, [
    { id: 'K1', in_evidence: true, in_copy: true },
    { id: 'K2', in_evidence: false, in_copy: null },
    { id: 'K3', in_evidence: true, in_copy: null },
    { id: 'K4', in_evidence: true, in_copy: false },
  ]);
  assert.equal(m.key_info_rate, 0.75);
  assert.equal(m.key_info_copy_rate, 0.5);
  // 구성안 단계(문구 없음)면 in_copy는 null
  const plan = keyInfoMetrics({ ...cards, stage: 'plan', cards: cards.cards.map(({ copy, ...c }) => c) }, [{ id: 'K1', quote: 'SPF50+ PA++++ 자외선 차단', copy_terms: ['SPF50+'] }]);
  assert.equal(plan.key_info_hits[0].in_copy, null);
  assert.equal(plan.key_info_copy_rate, null);

  const f = judgeForbidden([
    { id: 'F1', match: ['미백', '화이트닝'] },
    { id: 'F2', match: ['최고'] },
    { id: 'F3' },
  ], cards);
  assert.deepEqual(f, [
    { id: 'F1', found: true, matched: ['미백'] },
    { id: 'F2', found: false, matched: [] },
    { id: 'F3', found: null, matched: [] },
  ]);
  assert.equal(overallPass([{ pass: true }], f), false);
  assert.equal(overallPass([{ pass: true }], f.slice(1)), null);
  assert.equal(overallPass([{ pass: true }], [f[1]]), true);
});

test('완료된 평가 실행은 웹 데이터로 kind: eval 프로젝트가 되고, 중단된 실행은 빠진다', async () => {
  const s = setup();
  const { exportWebData, evalTargets } = require('../scripts/export');
  try {
    await runEval({ ...s.opts, inputIds: ['eval-toneup-sunscreen'], batch: 'v1-base' });
    process.env.FAKE_CLAUDE_SCENARIO = 'stopped';
    await runEval({ ...s.opts, inputIds: ['eval-input-missing'], batch: 'v1-base' });
    delete process.env.FAKE_CLAUDE_SCENARIO;

    const targets = evalTargets(s.runsDir);
    assert.deepEqual(targets.map((t) => t.id), ['eval-toneup-sunscreen--v1--r1']);

    const out = path.join(s.dir, 'web');
    const config = path.join(s.dir, 'export.json');
    fs.writeFileSync(config, JSON.stringify({ out_dir: out, projects: [] }));
    const r = exportWebData({ config, evalRuns: s.runsDir, exportedAt: '2026-10-20T00:00:00.000Z' });
    assert.deepEqual(r.schemaErrors, []);
    assert.deepEqual(r.excluded, []);
    assert.deepEqual(r.exported, ['eval-toneup-sunscreen--v1--r1']);
    const index = JSON.parse(fs.readFileSync(path.join(out, 'index.json'), 'utf8'));
    const p = index.projects[0];
    assert.equal(p.kind, 'eval');
    assert.equal(p.stage, 'copy');
    assert.equal(p.label, '평가 · v1-base');
    assert.deepEqual(p.eval, { input_id: 'eval-toneup-sunscreen', run_id: 'eval-toneup-sunscreen--v1--r1', repeat: 1, variant: null });
    assert.ok(fs.existsSync(path.join(out, 'projects', p.id, 'png', 'card-01.png')));
    // 제품 폴더 위치는 원래대로
    assert.equal(process.env.CARDNEWS_PRODUCTS_DIR, undefined);
    // --only로 평가 실행 하나만 다시 내보낼 수 있음
    const again = exportWebData({ config, evalRuns: s.runsDir, only: p.id });
    assert.deepEqual(again.exported, [p.id]);
  } finally {
    delete process.env.FAKE_CLAUDE_SCENARIO;
    s.cleanup();
  }
});
