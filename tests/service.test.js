// 서비스 모드 작업 실행기 테스트 (API 호출 없음: query()를 가짜로 바꿔 흐름만 확인)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const job = require('../scripts/service/job');
const { ROOT, SAMPLE_ID } = require('./helpers');

function tempEnv() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cardnews-svc-'));
  const projectDir = path.join(base, 'projects', 'svc-test');
  job.seedProject({ fromProductDir: path.join(ROOT, 'products', SAMPLE_ID), projectDir });
  return {
    base,
    projectDir,
    jobsDir: path.join(base, 'jobs'),
    reportsDir: path.join(base, 'reports'),
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

// 예시 구성안(stage plan)을 프로젝트 ID에 맞게 바꿔 작업 폴더에 쓰는 가짜 Claude
function planCards(pid) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'products', SAMPLE_ID, 'cards.json'), 'utf8'));
  d.product_id = pid;
  d.stage = 'plan';
  for (const c of d.cards) delete c.copy;
  return d;
}

function fakeQuery({ write, resultMsg }) {
  return async function* query({ prompt, options }) {
    yield { type: 'system', subtype: 'init', model: 'fake', cwd: options.cwd, tools: options.tools, skills: options.skills, permissionMode: options.permissionMode, apiKeySource: 'ANTHROPIC_API_KEY', claude_code_version: 'test' };
    yield { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'cardnews-content' } }, { type: 'tool_use', name: 'Bash', input: { command: 'npm run check -- svc-test' } }] } };
    if (write) write(options, prompt);
    yield {
      type: 'result',
      subtype: 'success',
      is_error: false,
      num_turns: 4,
      duration_ms: 1000,
      total_cost_usd: 0.12,
      modelUsage: { fake: { inputTokens: 1000, outputTokens: 200, cacheReadInputTokens: 50, cacheCreationInputTokens: 0 } },
      permission_denials: [],
      result: '결과: 완료\n단계: plan\n오류: 없음\n알림: 없음',
      ...resultMsg,
    };
  };
}

const writeCards = (cards) => (options) => {
  const file = path.join(options.cwd, 'products', 'svc-test', 'cards.json');
  fs.writeFileSync(file, JSON.stringify(cards, null, 2));
};

test('작업 폴더: 규칙 한 벌만 복사하고 개발 문서·서버 코드·기록·출력은 뺀다', () => {
  const t = tempEnv();
  try {
    fs.writeFileSync(path.join(t.projectDir, 'log.jsonl'), '{}\n');
    fs.mkdirSync(path.join(t.projectDir, 'output'));
    const ws = job.createJobWorkspace({ jobId: 'job-test', projectId: 'svc-test', projectDir: t.projectDir, jobsDir: t.jobsDir });
    const has = (p) => fs.existsSync(path.join(ws.jobDir, p));
    for (const p of ['CLAUDE.md', '.claude/skills/cardnews-content/SKILL.md', 'config/templates.json', 'scripts/validate.js', 'templates/cover.html', 'products/svc-test/input.md', 'products/svc-test/images/main.png']) {
      assert.ok(has(p), `${p}가 있어야 해요`);
    }
    for (const p of ['AGENTS.md', 'docs/project-context.md', 'docs/handoff.md', 'scripts/service', 'prompts', 'products/svc-test/log.jsonl', 'products/svc-test/output', '.env', 'data']) {
      assert.ok(!has(p), `${p}는 없어야 해요`);
    }
    assert.ok(has('docs/card-data-spec.md'), '제작 규격 문서는 복사');
    assert.ok(fs.existsSync(ws.homeDir) && ws.homeDir !== path.join(ws.jobDir, '.claude'));
  } finally {
    t.cleanup();
  }
});

test('지시문: 값을 채우고, 빠진 값이 있으면 실행하지 않는다', () => {
  const p = job.fillPrompt('plan', { product_id: 'svc-test' });
  assert.ok(p.startsWith('[서비스 모드]'));
  assert.ok(p.includes('products/svc-test/input.md'));
  assert.throws(() => job.fillPrompt('revise', { product_id: 'svc-test' }), /채우지 않은 값/);
  assert.throws(() => job.fillPrompt('deploy', {}), /작업 종류/);
});

test('SDK 옵션: 쓰기·명령은 그 프로젝트만, 환경변수는 필요한 것만 넘긴다', () => {
  const opts = job.buildQueryOptions({
    jobDir: '/j', homeDir: '/j/.home', projectId: 'svc-test', jobId: 'job-1', kind: 'plan',
    baseEnv: { PATH: '/bin', HOME: '/Users/x', ANTHROPIC_API_KEY: 'sk-test', ADMIN_PASSWORD_HASH: 'h', SESSION_SECRET: 's', AGENT_MAX_TURNS: '12' },
  });
  assert.equal(opts.permissionMode, 'dontAsk');
  assert.deepEqual(opts.settingSources, ['project']);
  assert.deepEqual(opts.skills, ['cardnews-content', 'cardnews-render']);
  assert.equal(opts.maxTurns, 12);
  assert.equal(opts.maxBudgetUsd, 1);
  const writes = opts.allowedTools.filter((t) => /^(Edit|Write|Bash)/.test(t));
  assert.ok(writes.every((t) => t.includes('svc-test')), writes.join(', '));
  assert.ok(!opts.allowedTools.includes('Bash') && !opts.allowedTools.includes('Write'));
  assert.equal(opts.env.HOME, '/j/.home');
  assert.equal(opts.env.CARDNEWS_MODE, 'service');
  assert.ok(!('ADMIN_PASSWORD_HASH' in opts.env) && !('SESSION_SECRET' in opts.env));
});

test('결과 보고 형식 읽기', () => {
  const r = job.parseResultReport('```\n결과: 중단\n단계: plan\n오류: INPUT_MISSING - ## 제품 설명\nINPUT_MISSING - ## 카드 수\n알림: [경고] 입력 자료에 지시문 형태의 문장이 있어 무시했어요\n```');
  assert.equal(r.결과, '중단');
  assert.equal(r.단계, 'plan');
  assert.equal(r.오류.length, 2);
  assert.match(r.알림[0], /경고/);
  assert.deepEqual(job.parseResultReport('결과: 완료\n오류: 없음\n알림: 없음').오류, []);
});

test('비밀 값 가리기', () => {
  const out = job.redact({ a: 'key=sk-ant-123456789', b: ['sk-ant-123456789'] }, ['sk-ant-123456789', undefined]);
  assert.equal(out.a, 'key=[REDACTED]');
  assert.equal(out.b[0], '[REDACTED]');
});

test('성공한 작업: 재검증 통과 → cards.json 반영, 기록에 토큰·비용, 작업 폴더 정리', async () => {
  const t = tempEnv();
  try {
    const r = await job.runJob({
      kind: 'plan', projectId: 'svc-test', projectDir: t.projectDir, jobsDir: t.jobsDir, reportsDir: t.reportsDir,
      env: { PATH: process.env.PATH, HOME: os.tmpdir(), ANTHROPIC_API_KEY: 'sk-test-0000000000' },
      queryFn: fakeQuery({ write: writeCards(planCards('svc-test')) }),
    });
    assert.equal(r.ok, true, JSON.stringify(r.verify));
    assert.deepEqual(r.applied, ['cards.json', 'output/']); // output/quality.json: 서버 재검증이 만든 품질 지표
    assert.ok(fs.existsSync(path.join(t.projectDir, 'output', 'quality.json')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(t.projectDir, 'cards.json'), 'utf8')).stage, 'plan');
    const events = fs.readFileSync(path.join(t.projectDir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(events.map((e) => e.event), ['job_started', 'job_finished']);
    assert.equal(events[1].ok, true);
    assert.equal(events[1].input_tokens, 1050);
    assert.equal(events[1].output_tokens, 200);
    assert.equal(events[1].cost_usd, 0.12);
    assert.equal(events[0].job_id, r.job_id);
    assert.ok(fs.existsSync(path.join(t.reportsDir, `${r.job_id}.json`)));
    assert.ok(!fs.existsSync(path.join(t.jobsDir, r.job_id)), '작업 폴더는 지워야 해요');
    assert.ok(r.tool_uses.some((u) => u.name === 'Skill'));
  } finally {
    t.cleanup();
  }
});

test('Claude가 완료라고 해도 재검증에 실패하면 반영하지 않는다', async () => {
  const t = tempEnv();
  try {
    const bad = planCards('svc-test');
    bad.sources[0].quote = '원문에 없는 효능 문장';
    const r = await job.runJob({
      kind: 'plan', projectId: 'svc-test', projectDir: t.projectDir, jobsDir: t.jobsDir, reportsDir: t.reportsDir,
      env: { PATH: process.env.PATH }, queryFn: fakeQuery({ write: writeCards(bad) }),
    });
    assert.equal(r.ok, false);
    assert.ok(r.verify.reasons.includes('재검증 오류'));
    assert.deepEqual(r.applied, []);
    assert.ok(!fs.existsSync(path.join(t.projectDir, 'cards.json')));
  } finally {
    t.cleanup();
  }
});

test('비용 상한 등으로 SDK가 실패하면 반영하지 않고 실패로 기록한다', async () => {
  const t = tempEnv();
  try {
    const r = await job.runJob({
      kind: 'plan', projectId: 'svc-test', projectDir: t.projectDir, jobsDir: t.jobsDir, reportsDir: t.reportsDir,
      env: { PATH: process.env.PATH },
      queryFn: fakeQuery({ resultMsg: { subtype: 'error_max_budget_usd', is_error: true, result: undefined } }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.error_code, 'error_max_budget_usd');
    const finished = fs.readFileSync(path.join(t.projectDir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).pop();
    assert.equal(finished.event, 'job_finished');
    assert.equal(finished.ok, false);
  } finally {
    t.cleanup();
  }
});

test('결과에 섞인 API 키는 보고서에서 가려진다', async () => {
  const t = tempEnv();
  try {
    const key = 'sk-ant-api-should-never-appear-123';
    const r = await job.runJob({
      kind: 'plan', projectId: 'svc-test', projectDir: t.projectDir, jobsDir: t.jobsDir, reportsDir: t.reportsDir,
      env: { PATH: process.env.PATH, ANTHROPIC_API_KEY: key },
      queryFn: fakeQuery({ resultMsg: { result: `결과: 중단\n알림: ${key}` } }),
    });
    const saved = fs.readFileSync(path.join(t.reportsDir, `${r.job_id}.json`), 'utf8');
    assert.ok(!saved.includes(key));
    assert.ok(saved.includes('[REDACTED]'));
  } finally {
    t.cleanup();
  }
});

test('API 오류(크레딧 부족 등)로 끝나면 성공으로 보지 않고 원인 코드를 남긴다', async () => {
  const t = tempEnv();
  try {
    async function* creditError({ options }) {
      yield { type: 'system', subtype: 'init', model: 'fake', cwd: options.cwd, tools: [], skills: options.skills };
      yield { type: 'result', subtype: 'success', is_error: true, num_turns: 1, total_cost_usd: 0, modelUsage: {}, permission_denials: [], result: 'Credit balance is too low' };
      throw new Error('Claude Code returned an error result: Credit balance is too low');
    }
    const r = await job.runJob({
      kind: 'plan', projectId: 'svc-test', projectDir: t.projectDir, jobsDir: t.jobsDir, reportsDir: t.reportsDir,
      env: { PATH: process.env.PATH }, queryFn: creditError,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error_code, 'API_CREDIT');
  } finally {
    t.cleanup();
  }
});

// ── API 키 없이: Claude Code 대화가 작업 폴더에서 직접 작업 (executor 'manual')
test('manual 작업: 준비 → 작업 폴더에서 작업 → 같은 재검증·반영·기록으로 마무리', () => {
  const t = tempEnv();
  try {
    const meta = job.startJob({ kind: 'plan', projectId: 'svc-test', projectDir: t.projectDir, executor: 'manual', jobsDir: t.jobsDir });
    assert.ok(meta.prompt.startsWith('[서비스 모드]'));
    assert.ok(fs.existsSync(path.join(meta.jobDir, 'CLAUDE.md')));
    assert.ok(!fs.existsSync(path.join(meta.jobDir, 'docs', 'handoff.md')));
    assert.equal(job.loadJob(meta.job_id, t.jobsDir).executor, 'manual');
    fs.writeFileSync(path.join(meta.productDir, 'cards.json'), JSON.stringify(planCards('svc-test'), null, 2));
    const r = job.finishJob({ meta: job.loadJob(meta.job_id, t.jobsDir), reportText: '결과: 완료\n단계: plan\n오류: 없음\n알림: 없음', jobsDir: t.jobsDir, reportsDir: t.reportsDir });
    assert.equal(r.ok, true, JSON.stringify(r.verify));
    assert.equal(r.executor, 'manual');
    assert.ok(r.applied.includes('cards.json'));
    const events = fs.readFileSync(path.join(t.projectDir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(events.map((e) => [e.event, e.executor]), [['job_started', 'manual'], ['job_finished', 'manual']]);
    assert.equal(events[1].cost_usd, null);
    assert.ok(!fs.existsSync(meta.jobDir), '작업 폴더는 지워야 해요');
    assert.throws(() => job.loadJob(meta.job_id, t.jobsDir), /진행 중인 작업이 없어요/);
  } finally {
    t.cleanup();
  }
});

test('manual 작업: 결과 보고가 없거나 중단이면 재검증을 통과해도 반영하지 않는다', () => {
  const t = tempEnv();
  try {
    for (const [reportText, code] of [['', 'NO_REPORT'], ['결과: 중단\n단계: plan\n오류: 없음\n알림: 없음', 'STOPPED']]) {
      const meta = job.startJob({ kind: 'plan', projectId: 'svc-test', projectDir: t.projectDir, executor: 'manual', jobsDir: t.jobsDir });
      fs.writeFileSync(path.join(meta.productDir, 'cards.json'), JSON.stringify(planCards('svc-test'), null, 2));
      const r = job.finishJob({ meta, reportText, jobsDir: t.jobsDir, reportsDir: t.reportsDir });
      assert.equal(r.verify.ok, true);
      assert.equal(r.ok, false);
      assert.equal(r.error_code, code);
      assert.ok(!fs.existsSync(path.join(t.projectDir, 'cards.json')));
    }
    assert.throws(() => job.startJob({ kind: 'plan', projectId: 'svc-test', projectDir: t.projectDir, executor: 'robot', jobsDir: t.jobsDir }), /executor/);
  } finally {
    t.cleanup();
  }
});
