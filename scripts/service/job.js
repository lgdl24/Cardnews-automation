// 서비스 모드 작업 실행기 (웹 서버가 쓸 부분의 PoC). 규격: docs/service-mode.md
//   작업 하나 = 작업 폴더 만들기 → 지시문 채우기 → Agent SDK query() 한 번 → 서버 재검증 → 성공할 때만 프로젝트에 반영
// 이 파일은 API 키·환경변수 값을 출력하거나 기록하지 않는다. 결과에 섞여 들어온 비밀 값은 redact()로 가린다.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJson } = require('../lib/common');

const ROOT = path.resolve(__dirname, '..', '..');
const JOB_KINDS = ['plan', 'copy', 'revise'];

// 작업 폴더에 복사할 규칙 한 벌 (서비스가 실제로 쓰는 것만)
const RULE_ENTRIES = ['CLAUDE.md', '.claude', 'config', 'docs', 'templates', 'scripts', 'schemas', 'package.json'];
// 규칙 한 벌 중 빼는 것: 프로젝트 개발용 문서와 서버 코드 (CLAUDE.md '요청 종류', docs/service-mode.md)
const EXCLUDE = new Set([
  'docs/project-context.md',
  'docs/handoff.md',
  'scripts/service',
  '.claude/settings.local.json',
]);
// 제품 폴더를 작업 폴더로 복사할 때 빼는 것: 기록은 서버(DB)가, 출력은 작업 결과만 반영
const PRODUCT_EXCLUDE = new Set(['log.jsonl', '.job.json', 'output']);

const dataDir = () => path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));

function newJobId(now = new Date()) {
  const d = now.toISOString().replace(/\D/g, '');
  return `job-${d.slice(0, 8)}-${d.slice(8, 14)}-${Math.random().toString(36).slice(2, 5)}`;
}

// ── 작업 폴더
// exclude: root 기준 상대 경로 집합 (예: 'docs/handoff.md', 'output')
function copyFiltered(src, dst, { root, exclude }) {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => !exclude.has(path.relative(root, p).split(path.sep).join('/')),
  });
}

function createJobWorkspace({ jobId, projectId, projectDir, jobsDir = path.join(dataDir(), 'jobs'), root = ROOT }) {
  if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error(`프로젝트 ID 형식이 아니에요: ${projectId}`);
  if (!fs.existsSync(path.join(projectDir, 'input.md'))) throw new Error(`input.md가 없어요: ${projectDir}`);
  const jobDir = path.join(jobsDir, jobId);
  if (fs.existsSync(jobDir)) throw new Error(`작업 폴더가 이미 있어요: ${jobDir}`);
  fs.mkdirSync(jobDir, { recursive: true });

  for (const entry of RULE_ENTRIES) {
    const src = path.join(root, entry);
    if (!fs.existsSync(src)) continue;
    copyFiltered(src, path.join(jobDir, entry), { root, exclude: EXCLUDE });
  }
  // node_modules는 앱 폴더로 링크 (Playwright·Pretendard)
  if (fs.existsSync(path.join(root, 'node_modules'))) {
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(jobDir, 'node_modules'), 'dir');
  }
  const productDir = path.join(jobDir, 'products', projectId);
  copyFiltered(projectDir, productDir, { root: projectDir, exclude: PRODUCT_EXCLUDE });
  // 작업마다 따로 쓰는 HOME (사용자 설정·메모리가 섞이지 않게). 프로젝트 .claude와 겹치지 않게 별도 폴더
  const homeDir = path.join(jobDir, '.home');
  fs.mkdirSync(homeDir);
  return { jobDir, productDir, homeDir };
}

// ── 지시문
function fillPrompt(kind, vars, root = ROOT) {
  if (!JOB_KINDS.includes(kind)) throw new Error(`작업 종류는 ${JOB_KINDS.join(' / ')} 중 하나예요: ${kind}`);
  const template = fs.readFileSync(path.join(root, 'prompts', `${kind}.md`), 'utf8');
  const out = template.replace(/\{\{(\w+)\}\}/g, (m, key) => (vars[key] === undefined ? m : String(vars[key])));
  const left = out.match(/\{\{\w+\}\}/g);
  if (left) throw new Error(`지시문에 채우지 않은 값이 있어요: ${[...new Set(left)].join(', ')}`);
  return out;
}

// ── Agent SDK 옵션 (docs/service-mode.md 'Agent SDK 실행 옵션')
function allowedToolsFor(projectId) {
  const pid = projectId;
  return [
    'Read(./**)', 'Glob', 'Grep',
    `Edit(./products/${pid}/cards.json)`, `Write(./products/${pid}/cards.json)`,
    `Bash(npm run check -- ${pid})`,
    `Bash(npm run validate -- ${pid})`,
    `Bash(npm run render -- ${pid})`,
    `Bash(npm run render -- ${pid}:*)`,
  ];
}

function buildQueryOptions({ jobDir, homeDir, projectId, jobId, kind, maxTurns, maxBudgetUsd, model, baseEnv = process.env }) {
  const env = {
    PATH: baseEnv.PATH,
    HOME: homeDir,
    ANTHROPIC_API_KEY: baseEnv.ANTHROPIC_API_KEY,
    CARDNEWS_MODE: 'service',
    CARDNEWS_JOB_ID: jobId,
    CARDNEWS_JOB_KIND: kind,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'cardnews-automation/poc',
  };
  if (baseEnv.CHROMIUM_PATH) env.CHROMIUM_PATH = baseEnv.CHROMIUM_PATH;
  // HOME을 바꾸면 Playwright 기본 브라우저 위치(~/Library/Caches/ms-playwright 등)를 못 찾으므로 원래 위치를 넘김
  env.PLAYWRIGHT_BROWSERS_PATH = baseEnv.PLAYWRIGHT_BROWSERS_PATH || defaultPlaywrightPath(baseEnv.HOME);
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];

  const options = {
    cwd: jobDir,
    settingSources: ['project'],
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    skills: ['cardnews-content', 'cardnews-render'],
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    allowedTools: allowedToolsFor(projectId),
    permissionMode: 'dontAsk',
    maxTurns: maxTurns ?? Number(baseEnv.AGENT_MAX_TURNS || 30),
    maxBudgetUsd: maxBudgetUsd ?? Number(baseEnv.AGENT_MAX_BUDGET_USD || 1),
    env,
  };
  if (model || baseEnv.AGENT_MODEL) options.model = model || baseEnv.AGENT_MODEL;
  return options;
}

function defaultPlaywrightPath(home) {
  if (!home) return undefined;
  const candidates = [
    path.join(home, 'Library', 'Caches', 'ms-playwright'), // macOS
    path.join(home, '.cache', 'ms-playwright'), // Linux
  ];
  return candidates.find((p) => fs.existsSync(p));
}

// ── 결과
// 'CLAUDE.md 서비스 모드 결과 보고' 형식(결과/단계/오류/알림) 읽기. 서버는 이 답변만 믿지 않고 재검증한다.
function parseResultReport(text = '') {
  const out = { 결과: null, 단계: null, 오류: [], 알림: [] };
  let current = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/^[`>\s*-]+|[`\s*]+$/g, '');
    const m = line.match(/^(결과|단계|오류|알림)\s*[:：]\s*(.*)$/);
    if (m) {
      current = m[1];
      if (current === '결과' || current === '단계') out[current] = m[2].trim();
      else if (m[2].trim() && m[2].trim() !== '없음') out[current].push(m[2].trim());
      continue;
    }
    if (current && (current === '오류' || current === '알림') && line.trim()) out[current].push(line.trim());
  }
  return out;
}

// 비밀 값 가리기: 환경변수의 키 값이 결과 텍스트에 섞였을 때를 대비
function redact(value, secrets) {
  const list = secrets.filter((s) => typeof s === 'string' && s.length >= 8);
  const walk = (v) => {
    if (typeof v === 'string') return list.reduce((acc, s) => acc.split(s).join('[REDACTED]'), v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

const truncate = (s, n = 300) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…` : s);

// query() 메시지에서 기록할 것만 모음
function createCollector() {
  const c = { init: null, toolUses: [], result: null, assistantTurns: 0 };
  c.push = (msg) => {
    if (msg.type === 'system' && msg.subtype === 'init') {
      c.init = {
        model: msg.model, cwd: msg.cwd, tools: msg.tools, skills: msg.skills,
        permissionMode: msg.permissionMode, apiKeySource: msg.apiKeySource, claude_code_version: msg.claude_code_version,
        plugins: (msg.plugins || []).map((p) => p.name), mcp_servers: (msg.mcp_servers || []).map((m) => m.name),
      };
    } else if (msg.type === 'assistant') {
      c.assistantTurns += 1;
      for (const block of (msg.message && msg.message.content) || []) {
        if (block.type === 'tool_use') {
          const input = block.input || {};
          c.toolUses.push({ name: block.name, input: truncate(input.command || input.file_path || input.pattern || input.skill || JSON.stringify(input)) });
        }
      }
    } else if (msg.type === 'result') {
      const usage = Object.values(msg.modelUsage || {}).reduce((acc, u) => ({
        input_tokens: acc.input_tokens + (u.inputTokens || 0) + (u.cacheReadInputTokens || 0) + (u.cacheCreationInputTokens || 0),
        output_tokens: acc.output_tokens + (u.outputTokens || 0),
      }), { input_tokens: 0, output_tokens: 0 });
      c.result = {
        subtype: msg.subtype,
        is_error: msg.is_error,
        num_turns: msg.num_turns,
        duration_ms: msg.duration_ms,
        cost_usd: msg.total_cost_usd,
        ...usage,
        models: Object.keys(msg.modelUsage || {}),
        permission_denials: (msg.permission_denials || []).map((d) => ({ tool: d.tool_name, input: truncate(JSON.stringify(d.tool_input)) })),
        text: msg.subtype === 'success' ? msg.result : null,
      };
    }
  };
  return c;
}

// ── 서버 재검증 (Claude의 답변만 믿지 않음)
function runScript(jobDir, script, args) {
  const r = spawnSync(process.execPath, [path.join(jobDir, 'scripts', script), ...args], {
    cwd: jobDir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, CARDNEWS_NO_LOG: '1', CARDNEWS_MODE: 'service' },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function verifyJob({ jobDir, productDir, projectId, kind }) {
  const cardsFile = path.join(productDir, 'cards.json');
  const out = { ok: false, reasons: [] };
  if (!fs.existsSync(cardsFile)) {
    out.reasons.push('cards.json이 없어요');
    return out;
  }
  let stage = null;
  try {
    stage = JSON.parse(fs.readFileSync(cardsFile, 'utf8')).stage;
  } catch {
    out.reasons.push('cards.json을 읽을 수 없어요');
    return out;
  }
  out.stage = stage;
  const v = runScript(jobDir, 'validate.js', [projectId, '--no-log']);
  out.validate = { status: v.status, summary: (v.stdout.match(/-- 오류 \d+개.*$/m) || [''])[0] };
  if (v.status !== 0) out.reasons.push('재검증 오류');
  if (kind === 'plan' && stage !== 'plan') out.reasons.push(`구성안 작업인데 stage가 ${stage}예요`);
  if (kind === 'copy' && stage !== 'copy') out.reasons.push(`문구 작업인데 stage가 ${stage}예요`);
  if (kind === 'copy') {
    const report = path.join(productDir, 'output', 'render-report.json');
    if (!fs.existsSync(report)) out.reasons.push('출력 결과(render-report.json)가 없어요');
    else if (readJson(report).results.some((r) => r.issues.length)) out.reasons.push('레이아웃 점검 오류');
  }
  out.ok = out.reasons.length === 0;
  return out;
}

// ── 반영: 성공한 작업의 cards.json·출력만 프로젝트로. 기록은 성공·실패 모두 옮김
function appendLines(file, lines) {
  if (lines.length) fs.appendFileSync(file, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
}

function serverEvent(projectId, jobId, event, fields = {}) {
  let version = null;
  try { version = readJson(path.join(ROOT, 'config', 'skill-version.json')).version; } catch { /* 없음 */ }
  return { ts: new Date().toISOString(), event, project_id: projectId, job_id: jobId, skill_version: version, ...fields };
}

function mergeJob({ productDir, projectDir, ok }) {
  const applied = [];
  // 작업 중 스크립트가 남긴 validate_result 기록은 성공·실패와 관계없이 옮김 (DB EVENT에 해당)
  const jobLog = path.join(productDir, 'log.jsonl');
  if (fs.existsSync(jobLog)) {
    appendLines(path.join(projectDir, 'log.jsonl'), fs.readFileSync(jobLog, 'utf8').split('\n').filter(Boolean));
  }
  if (!ok) return applied;
  fs.copyFileSync(path.join(productDir, 'cards.json'), path.join(projectDir, 'cards.json'));
  applied.push('cards.json');
  const outDir = path.join(productDir, 'output');
  if (fs.existsSync(outDir)) {
    fs.cpSync(outDir, path.join(projectDir, 'output'), { recursive: true });
    applied.push('output/');
  }
  return applied;
}

// 실패 원인 코드: Claude 결과 보고의 오류 코드 > API·실행 오류 > SDK 종료 사유 > 서버 재검증 실패
function errorCodeOf({ report, sdk, crash, verify }) {
  const fromReport = report.오류.map((e) => (e.match(/\b[A-Z][A-Z_]{4,}\b/) || [])[0]).find(Boolean);
  if (fromReport) return fromReport;
  if (crash) return /credit balance/i.test(crash) ? 'API_CREDIT' : 'error_during_execution';
  if (sdk && sdk.subtype !== 'success') return sdk.subtype;
  if (sdk && sdk.is_error) return 'error_during_execution';
  if (!verify.ok) return 'VERIFY_FAILED';
  return 'error_during_execution';
}

// ── 작업 하나 실행
async function runJob({
  kind, projectId, projectDir, vars = {}, queryFn, keep = false,
  maxTurns, maxBudgetUsd, model, promptOverride, env = process.env, jobsDir, reportsDir,
  inspect, // (ws) => 객체. 작업 폴더를 지우기 전에 확인할 것 (PoC용)
}) {
  const jobId = newJobId();
  const started = new Date();
  const ws = createJobWorkspace({ jobId, projectId, projectDir, jobsDir });
  const prompt = promptOverride || fillPrompt(kind, { product_id: projectId, ...vars });
  const options = buildQueryOptions({ ...ws, projectId, jobId, kind, maxTurns, maxBudgetUsd, model, baseEnv: env });
  appendLines(path.join(projectDir, 'log.jsonl'), [serverEvent(projectId, jobId, 'job_started', { kind })]);

  const collector = createCollector();
  let crash = null;
  try {
    const q = queryFn || (await import('@anthropic-ai/claude-agent-sdk')).query;
    for await (const msg of q({ prompt, options })) collector.push(msg);
  } catch (e) {
    crash = e.message;
  }

  const verify = verifyJob({ ...ws, projectId, kind });
  const inspected = inspect ? inspect(ws) : undefined;
  const sdkOk = Boolean(collector.result && collector.result.subtype === 'success' && !collector.result.is_error && !crash);
  const ok = sdkOk && verify.ok;
  const applied = mergeJob({ productDir: ws.productDir, projectDir, ok });
  const report = parseResultReport(collector.result && collector.result.text);
  const errorCode = ok ? null : errorCodeOf({ report, sdk: collector.result, crash, verify });
  appendLines(path.join(projectDir, 'log.jsonl'), [serverEvent(projectId, jobId, 'job_finished', {
    kind,
    ok,
    error_code: errorCode,
    input_tokens: collector.result ? collector.result.input_tokens : null,
    output_tokens: collector.result ? collector.result.output_tokens : null,
    cost_usd: collector.result ? collector.result.cost_usd : null,
  })]);

  const result = redact({
    job_id: jobId,
    kind,
    project_id: projectId,
    started_at: started.toISOString(),
    finished_at: new Date().toISOString(),
    ok,
    error_code: errorCode,
    crash,
    sdk: collector.result,
    init: collector.init,
    tool_uses: collector.toolUses,
    report,
    verify,
    applied,
    inspect: inspected,
    job_dir: keep ? ws.jobDir : null,
  }, [env.ANTHROPIC_API_KEY, env.CLAUDE_CODE_OAUTH_TOKEN]);

  const dir = reportsDir || path.join(dataDir(), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${jobId}.json`), JSON.stringify(result, null, 2));
  if (!keep) fs.rmSync(ws.jobDir, { recursive: true, force: true });
  return result;
}

// 프로젝트 저장소(data/projects/<id>)를 예시 제품에서 처음 만들 때: 입력·이미지만 복사
function seedProject({ fromProductDir, projectDir }) {
  if (fs.existsSync(projectDir)) return false;
  fs.mkdirSync(projectDir, { recursive: true });
  fs.copyFileSync(path.join(fromProductDir, 'input.md'), path.join(projectDir, 'input.md'));
  if (fs.existsSync(path.join(fromProductDir, 'images'))) {
    fs.cpSync(path.join(fromProductDir, 'images'), path.join(projectDir, 'images'), { recursive: true });
  }
  return true;
}

module.exports = {
  ROOT, RULE_ENTRIES, EXCLUDE, PRODUCT_EXCLUDE, dataDir, newJobId,
  createJobWorkspace, fillPrompt, allowedToolsFor, buildQueryOptions, parseResultReport, redact,
  createCollector, verifyJob, mergeJob, runJob, seedProject,
};
