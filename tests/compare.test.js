// 제작 결과 비교(npm run compare): 제작 폴더 비교(A5)와 평가 실행 반복 일관성(A6, --eval)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT } = require('./helpers');
const { runEval } = require('../scripts/lib/eval-runner');
const { parseArgs } = require('../scripts/compare');
const { compareProducts, evalConsistency, consistencyOf, seqMatch, jaccard, stdev } = require('../scripts/lib/compare');

const FAKE = path.join(__dirname, 'fixtures', 'fake-claude.js');
const SRC = 'toneup-sunscreen-r1';

test('인자: 제품ID 비교와 --eval', () => {
  assert.deepEqual(parseArgs(['a', 'b']).ids, ['a', 'b']);
  const o = parseArgs(['--eval', '--batch', 'v1-repeat', '--runs', 'x', '--json']);
  assert.equal(o.eval, true);
  assert.equal(o.batch, 'v1-repeat');
  assert.equal(o.runs, path.resolve('x'));
  assert.equal(o.json, true);
  assert.throws(() => parseArgs(['a']), /2개 이상/);
  assert.throws(() => parseArgs(['--eval', 'a']), /제품ID를 함께/);
  assert.throws(() => parseArgs(['--what']), /모르는 옵션/);
});

test('계산: 순서 일치율·겹침·편차', () => {
  assert.equal(seqMatch(['a', 'b', 'c'], ['a', 'x', 'c']), 2 / 3);
  assert.equal(seqMatch(['a', 'b'], ['a', 'b', 'c']), 2 / 3);
  assert.equal(jaccard(new Set([1, 2]), new Set([2, 3])), 1 / 3);
  assert.equal(jaccard(new Set(), new Set()), 1);
  assert.equal(stdev([1]), null);
  assert.equal(stdev([1, 3]), 1);
  // 결과가 1개면 쌍이 없어 순서·겹침은 null
  const one = consistencyOf([{ roles: ['a'], templates: ['t'], evidence: new Set(), quality: { coverage: 1, char_usage: 1 } }]);
  assert.equal(one.role_order_match, null);
  assert.equal(one.coverage_stdev, null);
});

test('제작 폴더 비교: 예시 제품 두 개는 입력이 같고 카드 구성이 같다', () => {
  const res = compareProducts(['toneup-sunscreen', SRC]);
  assert.deepEqual(res.missing, []);
  assert.equal(res.same_input, true);
  assert.equal(res.runs.length, 2);
  assert.equal(res.consistency.role_order_match, 1);
  assert.ok(res.consistency.evidence_overlap > 0 && res.consistency.evidence_overlap <= 1);
  assert.deepEqual(compareProducts(['toneup-sunscreen', 'no-such-product']).missing, ['no-such-product']);
});

test('반복 일관성(--eval): 입력 × 규칙 버전으로 묶고, 완료된 반복끼리 비교, 중단은 오류 코드로 센다', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-compare-'));
  try {
    const inputsDir = path.join(dir, 'inputs');
    const runsDir = path.join(dir, 'runs');
    const normal = path.join(inputsDir, 'eval-toneup-sunscreen');
    fs.cpSync(path.join(ROOT, 'docs', 'examples', 'eval', 'inputs', 'eval-toneup-sunscreen'), normal, { recursive: true });
    fs.mkdirSync(path.join(normal, 'images'));
    fs.copyFileSync(path.join(ROOT, 'products', SRC, 'images', 'main.png'), path.join(normal, 'images', 'main.png'));
    fs.cpSync(path.join(ROOT, 'eval', 'inputs', 'eval-input-missing'), path.join(inputsDir, 'eval-input-missing'), { recursive: true });
    process.env.FAKE_CLAUDE_SOURCE = path.join(ROOT, 'products', SRC, 'cards.json');
    process.env.FAKE_CLAUDE_PNG_DIR = path.join(ROOT, 'docs', 'examples', 'web-data', 'projects', SRC, 'png');
    const opts = { inputsDir, runsDir, bin: FAKE, jobsDir: path.join(dir, 'jobs') };

    await runEval({ ...opts, inputIds: ['eval-toneup-sunscreen'], batch: 'v1-repeat', repeat: 2 });
    process.env.FAKE_CLAUDE_SCENARIO = 'stopped';
    await runEval({ ...opts, inputIds: ['eval-input-missing'], batch: 'v1-repeat', repeat: 2 });
    // 다른 묶음은 --batch로 걸러짐
    await runEval({ ...opts, inputIds: ['eval-input-missing'], batch: 'other', repeat: 1, from: 3 });
    delete process.env.FAKE_CLAUDE_SCENARIO;

    const res = evalConsistency(runsDir, { batch: 'v1-repeat' });
    assert.deepEqual(res.groups.map((g) => g.group), ['eval-input-missing--v1', 'eval-toneup-sunscreen--v1']);

    const missing = res.groups[0];
    assert.equal(missing.run_count, 2);
    assert.equal(missing.completed, 0);
    assert.deepEqual(missing.stopped_error_codes, { INPUT_MISSING: 2 });
    // 가짜 Claude 보고는 누락 항목을 하나만 적어 체크리스트는 실패 (eval-runner 테스트와 같음)
    assert.equal(missing.checks_passed, 0);
    assert.equal(missing.outcome_same, true);
    assert.equal(missing.consistency, null);

    const normalGroup = res.groups[1];
    assert.equal(normalGroup.run_count, 2);
    assert.equal(normalGroup.completed, 2);
    assert.equal(normalGroup.checks_passed, 2);
    assert.deepEqual(normalGroup.runs, ['eval-toneup-sunscreen--v1--r1', 'eval-toneup-sunscreen--v1--r2']);
    // 가짜 Claude는 매번 같은 카드를 내므로 완전히 일치
    assert.deepEqual(normalGroup.consistency, {
      role_order_match: 1, template_order_match: 1, evidence_overlap: 1, coverage_stdev: 0, char_usage_stdev: 0,
    });
    assert.equal(normalGroup.key_info_rate_stdev, 0);
    assert.equal(typeof normalGroup.duration_ms_mean, 'number');

    // 묶음을 안 고르면 다른 묶음의 반복도 같은 그룹에 들어감
    const all = evalConsistency(runsDir);
    assert.equal(all.groups.find((g) => g.input_id === 'eval-input-missing').run_count, 3);

    // CLI
    const cli = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'compare.js'), '--eval', '--runs', runsDir, '--batch', 'v1-repeat'], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /eval-toneup-sunscreen--v1 \(실행 2개: r1, r2\)/);
    assert.match(cli.stdout, /완료 0\/2 \(중단: INPUT_MISSING 2\)/);
    assert.match(cli.stdout, /카드 역할 순서 일치율 100%/);
    const json = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'compare.js'), '--eval', '--runs', runsDir, '--json'], { encoding: 'utf8' });
    assert.equal(JSON.parse(json.stdout).groups.length, 2);
  } finally {
    delete process.env.FAKE_CLAUDE_SCENARIO;
    delete process.env.FAKE_CLAUDE_SOURCE;
    delete process.env.FAKE_CLAUDE_PNG_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('반복 일관성(--eval): 평가 실행 폴더가 없으면 빈 결과', () => {
  assert.deepEqual(evalConsistency(path.join(os.tmpdir(), 'no-such-runs-dir')).groups, []);
});

test('제작 폴더 비교: 제품이 고른 디자인(프리미엄) 글자 수 기준으로 계산', () => {
  const { makeWorkspace } = require('./helpers');
  const { loadConfig, loadInput, readJson, paths } = require('../scripts/lib/common');
  const { computeQuality } = require('../scripts/lib/metrics');
  const ws = makeWorkspace();
  try {
    ws.writeInput(`${ws.readInput()}\n## 디자인\n프리미엄\n`);
    ws.editCards((d) => { d.cards.find((c) => c.template === 'image').copy.caption = '가'.repeat(60); });
    ws.use((id) => {
      const input = loadInput(id);
      const data = readJson(paths.product(id, 'cards.json'));
      const premium = computeQuality({ data, input, ...loadConfig(input) });
      const base = computeQuality({ data, input, ...loadConfig() });
      assert.notEqual(premium.char_usage, base.char_usage);
      assert.equal(compareProducts([id, id]).runs[0].char_usage, premium.char_usage);
    });
  } finally {
    ws.cleanup();
  }
});
