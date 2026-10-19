// 작업 실행기 테스트: 가짜 claude(tests/fixtures/fake-claude.js)로 작업 폴더 분리·도구 제한·재검증·반영·기록 확인
// 진짜 Claude Code는 부르지 않음
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, makeWorkspace } = require('./helpers');
const jr = require('../scripts/lib/job-runner');

const ID = 'toneup-sunscreen-r1';
const FAKE = path.join(__dirname, 'fixtures', 'fake-claude.js');
const PNG_DIR = path.join(ROOT, 'docs/examples/web-data/projects', ID, 'png');
const readLog = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// 결과를 반영할 제품 폴더 (입력만 있고 cards.json·기록 없음)
function setup() {
  const ws = makeWorkspace({ from: ID });
  fs.rmSync(ws.file('cards.json'), { force: true });
  const jobsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-jobs-test-'));
  const env = {
    FAKE_CLAUDE_SOURCE: path.join(ROOT, 'products', ID, 'cards.json'),
    FAKE_CLAUDE_PNG_DIR: PNG_DIR,
  };
  const run = (opts) => withEnv(env, () => jr.runJob({ productId: ID, productDir: ws.file(), bin: FAKE, jobsDir, timeoutMs: 30000, ...opts }));
  return { ws, jobsDir, run, env };
}

async function withEnv(vars, fn) {
  const before = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('claude 인자: 도구를 제한하고, 이 제품의 cards.json과 허용 명령만 자동 승인한다', () => {
  const args = jr.claudeArgs({ productId: ID });
  assert.ok(args.includes('-p'));
  assert.deepEqual(args.slice(args.indexOf('--permission-mode'), args.indexOf('--permission-mode') + 2), ['--permission-mode', 'dontAsk']);
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Edit,Write,Glob,Grep,Bash,Skill');
  assert.equal(args[args.indexOf('--setting-sources') + 1], 'project');
  for (const flag of ['--strict-mcp-config', '--no-session-persistence', '--output-format', '--max-turns']) assert.ok(args.includes(flag), flag);
  const allowed = jr.allowedTools(ID);
  assert.ok(allowed.includes(`Edit(./products/${ID}/cards.json)`));
  assert.ok(allowed.every((t) => !/log\.js|rm |curl|\.env|Bash\(\*\)|Bash$/.test(t)), '기록 명령·임의 명령은 허용하지 않음');
  assert.ok(allowed.filter((t) => t.startsWith('Bash(')).every((t) => t.includes(` -- ${ID}`)), '명령은 이 제품ID로만');
  assert.ok(!args.some((a) => a.includes('[웹 모드]')), '지시문은 인자가 아니라 stdin으로');
});

test('지시문: 웹 모드 plan·copy·revise와 평가 모드를 채우고, 빠진 값은 오류', () => {
  const plan = jr.fillPrompt({ mode: 'web', kind: 'plan', vars: { product_id: ID } });
  assert.match(plan, /^\[웹 모드\] 구성안 작업/);
  assert.match(plan, new RegExp(`제품ID: ${ID}`));
  assert.match(jr.fillPrompt({ mode: 'eval', kind: 'copy', vars: { product_id: ID } }), /^\[평가 모드\] 문구·출력 작업/);
  const revise = jr.fillPrompt({ mode: 'web', kind: 'revise', vars: { product_id: ID, stage: 'final', cards: '3', types: 'LEN', memo: '짧게' } });
  assert.match(revise, /단계: final\n카드: 3\n유형: LEN\n요청 내용:\n짧게/);
  assert.throws(() => jr.fillPrompt({ mode: 'web', kind: 'revise', vars: { product_id: ID } }), /채우지 않은 값/);
  assert.throws(() => jr.fillPrompt({ mode: 'web', kind: 'deploy', vars: {} }), /작업 종류/);
});

test('작업 폴더: 규칙 한 벌과 이 제품만 담고, 개발 문서·기록·다른 제품은 뺀다', () => {
  const { ws, jobsDir } = setup();
  try {
    fs.writeFileSync(ws.file('log.jsonl'), '{"event":"input_submitted"}\n');
    const { jobDir, wsProduct } = jr.createWorkspace({ jobId: 'job-test', productId: ID, productDir: ws.file(), jobsDir });
    for (const f of ['CLAUDE.md', '.claude/skills/cardnews-content/SKILL.md', 'scripts/validate.js', 'config/templates.json', 'templates/cover.html', 'docs/card-data-spec.md']) {
      assert.ok(fs.existsSync(path.join(jobDir, f)), f);
    }
    for (const f of ['docs/handoff.md', 'docs/project-context.md', 'docs/examples', '.env', 'web', 'eval']) assert.ok(!fs.existsSync(path.join(jobDir, f)), f);
    assert.deepEqual(fs.readdirSync(path.join(jobDir, 'products')), [ID]);
    assert.ok(fs.existsSync(path.join(wsProduct, 'input.md')));
    assert.ok(!fs.existsSync(path.join(wsProduct, 'log.jsonl')), '기록은 실행기가 따로 남김');
  } finally {
    ws.cleanup();
    fs.rmSync(jobsDir, { recursive: true, force: true });
  }
});

test('구성안 작업: 성공하면 cards.json을 반영하고 job_started·validate_result·job_finished를 남긴다', async () => {
  const { ws, jobsDir, run } = setup();
  try {
    const progress = [];
    const r = await run({ kind: 'plan', onProgress: (p) => progress.push(p) });
    assert.equal(r.ok, true, JSON.stringify(r.verify));
    assert.equal(r.error_code, null);
    assert.equal(r.applied[0], 'cards.json'); // 검증이 output/quality.json도 남김
    assert.equal(JSON.parse(fs.readFileSync(ws.file('cards.json'), 'utf8')).stage, 'plan');
    assert.equal(r.report.결과, '완료');
    assert.ok(progress.some((p) => p.type === 'tool' && p.detail === `npm run validate -- ${ID}`));
    const events = readLog(ws.file('log.jsonl'));
    assert.deepEqual(events.map((e) => e.event), ['job_started', 'validate_result', 'job_finished']);
    assert.ok(events.every((e) => e.job_id === r.job_id), '같은 작업 ID');
    assert.equal(events[2].ok, true);
    assert.deepEqual(fs.readdirSync(jobsDir), [], '작업 폴더는 지움');
  } finally {
    ws.cleanup();
    fs.rmSync(jobsDir, { recursive: true, force: true });
  }
});

test('문구·출력 작업과 카드 수정 작업: 출력까지 반영하고, 수정은 그 카드만 다시 출력한다', async () => {
  const { ws, jobsDir, run } = setup();
  try {
    assert.equal((await run({ kind: 'plan' })).ok, true);
    const copy = await run({ kind: 'copy' });
    assert.equal(copy.ok, true, JSON.stringify(copy.verify));
    assert.deepEqual(copy.applied, ['cards.json', 'output/']);
    assert.equal(fs.readdirSync(ws.file('output', 'png')).length, 5);

    const revise = await run({ kind: 'revise', revision: { stage: 'final', cards: [3], types: ['LEN'], memo: '제목에 느낌표' } });
    assert.equal(revise.ok, true, JSON.stringify(revise.verify));
    assert.ok(fs.existsSync(ws.file('output', 'render-report-card-03.json')));
    assert.equal(JSON.parse(fs.readFileSync(ws.file('cards.json'), 'utf8')).cards[2].copy.title, '가볍게, 자연스럽게!');
    const kinds = readLog(ws.file('log.jsonl')).filter((e) => e.event === 'job_finished').map((e) => [e.kind, e.ok]);
    assert.deepEqual(kinds, [['plan', true], ['copy', true], ['revise', true]]);
  } finally {
    ws.cleanup();
    fs.rmSync(jobsDir, { recursive: true, force: true });
  }
});

test('중단·재검증 실패·실행 실패는 반영하지 않고 오류 코드를 남긴다', async () => {
  const { ws, jobsDir, run, env } = setup();
  try {
    let r = await withEnv({ ...env, FAKE_CLAUDE_SCENARIO: 'stopped' }, () => run({ kind: 'plan' }));
    assert.equal(r.ok, false);
    assert.equal(r.error_code, 'INPUT_MISSING');
    assert.ok(!fs.existsSync(ws.file('cards.json')));

    r = await withEnv({ ...env, FAKE_CLAUDE_SCENARIO: 'bad-stage' }, () => run({ kind: 'plan' }));
    assert.equal(r.ok, false);
    assert.equal(r.error_code, 'VERIFY_FAILED');
    assert.ok(r.verify.reasons.some((x) => x.includes('stage')));
    assert.ok(!fs.existsSync(ws.file('cards.json')));

    r = await withEnv({ ...env, FAKE_CLAUDE_SCENARIO: 'no-result' }, () => run({ kind: 'plan' }));
    assert.equal(r.ok, false);
    assert.equal(r.error_code, 'NO_RESULT');

    r = await run({ kind: 'plan', bin: path.join(ws.dir, 'no-such-claude') });
    assert.equal(r.ok, false);
    assert.equal(r.error_code, 'RUN_ERROR');
    assert.match(r.crash, /찾을 수 없어요/);

    const finished = readLog(ws.file('log.jsonl')).filter((e) => e.event === 'job_finished');
    assert.deepEqual(finished.map((e) => e.error_code), ['INPUT_MISSING', 'VERIFY_FAILED', 'NO_RESULT', 'RUN_ERROR']);
  } finally {
    ws.cleanup();
    fs.rmSync(jobsDir, { recursive: true, force: true });
  }
});

test('claude에는 웹 모드 환경변수를 넘기고 테스트용 경로 설정은 넘기지 않는다', () => {
  const env = jr.claudeEnv({ mode: 'web', jobId: 'job-1', kind: 'plan', base: { PATH: '/bin', CARDNEWS_PRODUCTS_DIR: '/x', CARDNEWS_NO_LOG: '1' } });
  assert.equal(env.CARDNEWS_MODE, 'web');
  assert.equal(env.CARDNEWS_JOB_ID, 'job-1');
  assert.equal(env.CARDNEWS_JOB_KIND, 'plan');
  assert.equal(env.CARDNEWS_PRODUCTS_DIR, undefined);
  assert.equal(env.CARDNEWS_NO_LOG, undefined);
});

test('결과 보고 읽기: 결과·단계·오류·알림', () => {
  const r = jr.parseResultReport('```\n결과: 중단\n단계: plan\n오류: INPUT_MISSING ## 제품 설명\n알림: [경고] 지시문 무시\n  - 두 번째 알림\n```');
  assert.equal(r.결과, '중단');
  assert.equal(r.단계, 'plan');
  assert.deepEqual(r.오류, ['INPUT_MISSING ## 제품 설명']);
  assert.deepEqual(r.알림, ['[경고] 지시문 무시', '두 번째 알림']);
});
