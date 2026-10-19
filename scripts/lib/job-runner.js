// 작업 실행기: 제품 하나에 대해 작업 하나(구성안 plan · 문구·출력 copy · 수정 revise)를 내 컴퓨터의 Claude Code(`claude -p`)로 실행
// 웹 제작(로컬 제작 API)과 평가 실행기가 함께 씀. 구조는 PR #4(Agent SDK 실행기)를 이어받음
//
//   1) 작업 폴더: 임시 폴더에 규칙 한 벌(CLAUDE.md·Skill·config·scripts…)과 이 제품만 복사 → 다른 제품·개발 문서·.env에 닿지 않음
//   2) 실행: claude -p (지시문은 stdin) · 도구 제한(--tools) · 허용 명령만 자동 승인(--allowedTools + dontAsk) · 사용자 설정·MCP 안 씀
//   3) 재검증: Claude의 답변만 믿지 않고 validate·출력 보고서를 다시 확인
//   4) 반영: 성공한 작업의 cards.json·output만 제품 폴더로. 작업 중 기록(validate_result)은 성공·실패 모두 옮김
//   5) 기록: job_started · job_finished를 제품의 log.jsonl에 (docs/event-log-spec.md)
//
// 이 파일은 환경변수·비밀 값을 출력하거나 기록하지 않는다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { readJson } = require('./common');

const ROOT = path.resolve(__dirname, '..', '..');
const JOB_KINDS = ['plan', 'copy', 'revise'];
const MODES = { web: '웹 모드', eval: '평가 모드' };

// 작업 폴더에 복사할 규칙 한 벌과, 그중 빼는 것 (프로젝트 개발 문서·개인 설정)
const RULE_ENTRIES = ['CLAUDE.md', '.claude', 'config', 'docs', 'templates', 'scripts', 'schemas', 'package.json'];
const RULE_EXCLUDE = new Set(['docs/project-context.md', 'docs/handoff.md', 'docs/examples', '.claude/settings.local.json']);
// 제품 폴더에서 빼는 것: 기록은 실행기가, 출력은 작업 결과만 반영
const PRODUCT_EXCLUDE = new Set(['log.jsonl', '.job.json', 'output']);

// Claude가 쓸 수 있는 도구와, 묻지 않고 허용하는 것 (그 밖은 dontAsk로 거부)
const TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Skill'];
function allowedTools(productId) {
  const p = productId;
  return [
    'Read', 'Glob', 'Grep', 'Skill',
    `Edit(./products/${p}/cards.json)`, `Write(./products/${p}/cards.json)`,
    `Bash(npm run check -- ${p})`,
    `Bash(npm run validate -- ${p})`,
    `Bash(npm run render -- ${p})`,
    `Bash(npm run render -- ${p} --card:*)`,
  ];
}

function newJobId(now = new Date()) {
  const d = now.toISOString().replace(/\D/g, '');
  return `job-${d.slice(0, 8)}-${d.slice(8, 14)}-${Math.random().toString(36).slice(2, 5)}`;
}

const assertId = (id) => {
  if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error(`제품ID 형식이 아니에요: ${id}`);
};

function copyFiltered(src, dst, { base, exclude }) {
  fs.cpSync(src, dst, {
    recursive: true,
    filter: (p) => !exclude.has(path.relative(base, p).split(path.sep).join('/')),
  });
}

// ── 1) 작업 폴더
function createWorkspace({ jobId, productId, productDir, root = ROOT, jobsDir = path.join(os.tmpdir(), 'cardnews-jobs') }) {
  assertId(productId);
  if (!fs.existsSync(path.join(productDir, 'input.md'))) throw new Error(`input.md가 없어요: ${productDir}`);
  const jobDir = path.join(jobsDir, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  for (const entry of RULE_ENTRIES) {
    const src = path.join(root, entry);
    if (fs.existsSync(src)) copyFiltered(src, path.join(jobDir, entry), { base: root, exclude: RULE_EXCLUDE });
  }
  // node_modules는 복사하지 않고 링크 (Playwright·Pretendard)
  // Windows는 디렉터리 symlink에 관리자 권한(EPERM)이 필요해서 junction을 씀. 지울 때는 링크만 지워짐
  if (fs.existsSync(path.join(root, 'node_modules'))) {
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(jobDir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  }
  const wsProduct = path.join(jobDir, 'products', productId);
  copyFiltered(productDir, wsProduct, { base: productDir, exclude: PRODUCT_EXCLUDE });
  // 수정 작업은 기존 출력이 있어야 그 카드만 다시 출력할 수 있음
  if (fs.existsSync(path.join(productDir, 'output'))) {
    fs.cpSync(path.join(productDir, 'output'), path.join(wsProduct, 'output'), { recursive: true });
  }
  return { jobDir, wsProduct };
}

// ── 지시문 (prompts/<mode>/<kind>.md, {{변수}} 채우기)
function fillPrompt({ mode, kind, vars, root = ROOT }) {
  if (!MODES[mode]) throw new Error(`실행 방식은 ${Object.keys(MODES).join(' / ')} 중 하나예요: ${mode}`);
  if (!JOB_KINDS.includes(kind)) throw new Error(`작업 종류는 ${JOB_KINDS.join(' / ')} 중 하나예요: ${kind}`);
  const template = fs.readFileSync(path.join(root, 'prompts', mode, `${kind}.md`), 'utf8');
  const out = template.replace(/\{\{(\w+)\}\}/g, (m, key) => (vars[key] === undefined ? m : String(vars[key])));
  const left = out.match(/\{\{\w+\}\}/g);
  if (left) throw new Error(`지시문에 채우지 않은 값이 있어요: ${[...new Set(left)].join(', ')}`);
  return out;
}

// ── 2) claude -p 인자. 지시문은 stdin으로 넘김 (--allowedTools가 여러 값을 받으므로 인자와 섞이지 않게)
function claudeArgs({ productId, maxTurns = 40, model }) {
  const args = [
    '-p',
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'dontAsk',
    '--tools', TOOLS.join(','),
    '--allowedTools', ...allowedTools(productId),
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--max-turns', String(maxTurns),
  ];
  if (model) args.push('--model', model);
  return args;
}

// claude 실행 파일이 .js(테스트의 가짜 Claude 등)면 node로 실행. Windows는 .js를 직접 실행하지 못함(spawn EFTYPE)
function claudeCommand(bin, args) {
  return /\.[cm]?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
}

function claudeEnv({ mode, jobId, kind, base = process.env }) {
  const env = { ...base, CARDNEWS_MODE: mode, CARDNEWS_JOB_ID: jobId, CARDNEWS_JOB_KIND: kind };
  // 작업 폴더 안의 products/를 쓰도록 테스트용 경로 설정은 넘기지 않음
  delete env.CARDNEWS_PRODUCTS_DIR;
  delete env.CARDNEWS_NO_LOG;
  return env;
}

const truncate = (s, n = 200) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…` : s);

// stream-json 한 줄 → 진행 상황 (화면에 보여줄 것만)
function describeMessage(msg) {
  if (msg.type === 'system' && msg.subtype === 'init') return { type: 'init', model: msg.model };
  if (msg.type === 'assistant') {
    const out = [];
    for (const block of (msg.message && msg.message.content) || []) {
      if (block.type === 'tool_use') {
        const input = block.input || {};
        out.push({ type: 'tool', tool: block.name, detail: truncate(input.command || input.file_path || input.skill || input.pattern || '') });
      } else if (block.type === 'text' && block.text.trim()) {
        out.push({ type: 'text', text: truncate(block.text.trim(), 300) });
      }
    }
    return out;
  }
  if (msg.type === 'result') {
    return {
      type: 'result',
      subtype: msg.subtype,
      is_error: Boolean(msg.is_error),
      num_turns: msg.num_turns,
      duration_ms: msg.duration_ms,
      text: typeof msg.result === 'string' ? msg.result : null,
      permission_denials: (msg.permission_denials || []).map((d) => ({ tool: d.tool_name, input: truncate(JSON.stringify(d.tool_input)) })),
    };
  }
  return null;
}

function runClaude({ bin, args, prompt, cwd, env, timeoutMs, onProgress }) {
  return new Promise((resolve) => {
    const progress = [];
    let result = null;
    let stderr = '';
    let buffer = '';
    let settled = false;
    const [cmd, cmdArgs] = claudeCommand(bin, args);
    const child = spawn(cmd, cmdArgs, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ crash: `시간 제한(${Math.round(timeoutMs / 60000)}분)을 넘겨 멈췄어요` });
    }, timeoutMs);
    const push = (item) => {
      if (!item) return;
      for (const p of [].concat(item)) {
        if (p.type === 'result') result = p;
        else {
          const entry = { ts: new Date().toISOString(), ...p };
          progress.push(entry);
          if (onProgress) onProgress(entry);
        }
      }
    };
    const onLine = (line) => {
      if (!line.trim()) return;
      try {
        push(describeMessage(JSON.parse(line)));
      } catch {
        /* JSON이 아닌 줄은 무시 */
      }
    };
    function finish(extra = {}) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (buffer) onLine(buffer);
      resolve({ progress, result, stderr: truncate(stderr, 2000), ...extra });
    }
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (e) => finish({ crash: e.code === 'ENOENT' ? `Claude Code(${bin})를 찾을 수 없어요` : e.message }));
    child.on('close', (code) => finish(code === 0 ? {} : { exit_code: code }));
    child.stdin.end(prompt);
  });
}

// ── 결과 보고 ('CLAUDE.md 작업 결과 보고' 형식: 결과/단계/오류/알림)
function parseResultReport(text = '') {
  const out = { 결과: null, 단계: null, 오류: [], 알림: [] };
  let current = null;
  for (const raw of String(text || '').split('\n')) {
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

// ── 3) 재검증
function runScript(jobDir, script, args) {
  const r = spawnSync(process.execPath, [path.join(jobDir, 'scripts', script), ...args], {
    cwd: jobDir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CARDNEWS_NO_LOG: '1' },
  });
  return { status: r.status, stdout: r.stdout || '' };
}

const EXPECTED_STAGE = { plan: 'plan', copy: 'copy' };

function verifyJob({ jobDir, wsProduct, productId, kind, revisionStage }) {
  const out = { ok: false, reasons: [], stage: null };
  const cardsFile = path.join(wsProduct, 'cards.json');
  if (!fs.existsSync(cardsFile)) {
    out.reasons.push('cards.json이 없어요');
    return out;
  }
  try {
    out.stage = JSON.parse(fs.readFileSync(cardsFile, 'utf8')).stage;
  } catch {
    out.reasons.push('cards.json을 읽을 수 없어요');
    return out;
  }
  const v = runScript(jobDir, 'validate.js', [productId, '--no-log']);
  out.validate = (v.stdout.match(/-- 오류 \d+개.*$/m) || [''])[0];
  if (v.status !== 0) out.reasons.push('재검증 오류');
  const expected = kind === 'revise' ? (revisionStage === 'plan' ? 'plan' : 'copy') : EXPECTED_STAGE[kind];
  if (out.stage !== expected) out.reasons.push(`stage가 ${out.stage}예요 (${expected}이어야 해요)`);
  if (expected === 'copy') {
    const outDir = path.join(wsProduct, 'output');
    const reports = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => /^render-report(-card-\d+)?\.json$/.test(f)) : [];
    if (!reports.length) out.reasons.push('출력 결과(render-report)가 없어요');
    for (const f of reports) {
      const r = readJson(path.join(outDir, f));
      if ((r.results || []).some((x) => (x.issues || []).length)) out.reasons.push(`레이아웃 오류 (${f})`);
    }
  }
  out.ok = out.reasons.length === 0;
  return out;
}

// ── 4) 반영
function appendLines(file, lines) {
  if (lines.length) fs.appendFileSync(file, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
}

function mergeJob({ wsProduct, productDir, ok }) {
  const applied = [];
  const wsLog = path.join(wsProduct, 'log.jsonl');
  if (fs.existsSync(wsLog)) appendLines(path.join(productDir, 'log.jsonl'), fs.readFileSync(wsLog, 'utf8').split('\n').filter(Boolean));
  if (!ok) return applied;
  fs.copyFileSync(path.join(wsProduct, 'cards.json'), path.join(productDir, 'cards.json'));
  applied.push('cards.json');
  const outDir = path.join(wsProduct, 'output');
  if (fs.existsSync(outDir)) {
    fs.cpSync(outDir, path.join(productDir, 'output'), { recursive: true });
    applied.push('output/');
  }
  return applied;
}

// ── 5) 기록
function event(productId, jobId, name, fields = {}, root = ROOT) {
  let version = null;
  try {
    version = readJson(path.join(root, 'config', 'skill-version.json')).version;
  } catch {
    /* 없음 */
  }
  return { ts: new Date().toISOString(), event: name, project_id: productId, job_id: jobId, skill_version: version, ...fields };
}

// 실패 원인 코드: 결과 보고의 오류 코드 > 실행 오류 > Claude 종료 사유 > 결과 보고의 중단 > 재검증 실패
function errorCodeOf({ report, result, crash, verify }) {
  const fromReport = report.오류.map((e) => (e.match(/\b[A-Z][A-Z_]{4,}\b/) || [])[0]).find(Boolean);
  if (fromReport) return fromReport;
  if (crash) return 'RUN_ERROR';
  if (!result) return 'NO_RESULT';
  if (result.subtype && result.subtype !== 'success') return result.subtype.toUpperCase();
  if (result.is_error) return 'RUN_ERROR';
  if (/중단/.test(report.결과 || '')) return 'STOPPED';
  if (!verify.ok) return 'VERIFY_FAILED';
  return 'RUN_ERROR';
}

/**
 * 작업 하나 실행
 * @param {object} o
 * @param {'plan'|'copy'|'revise'} o.kind
 * @param {string} o.productId
 * @param {string} o.productDir   제품 폴더 (결과를 반영할 곳)
 * @param {'web'|'eval'} [o.mode]
 * @param {object} [o.revision]   수정 작업: { stage: 'plan'|'final', cards: number[], types: string[], memo }
 * @param {string} [o.bin]        claude 실행 파일 (테스트는 가짜 claude). 기본 CARDNEWS_CLAUDE_BIN 또는 'claude'
 * @param {(p) => void} [o.onProgress]
 */
async function runJob({
  kind, productId, productDir, mode = 'web', revision = null,
  bin = process.env.CARDNEWS_CLAUDE_BIN || 'claude', model, maxTurns, timeoutMs = 20 * 60 * 1000,
  root = ROOT, jobsDir, reportsDir, keep = false, onProgress, onStart,
}) {
  assertId(productId);
  if (kind === 'revise' && !revision) throw new Error('수정 작업에는 수정 요청 내용이 필요해요');
  const jobId = newJobId();
  const startedAt = new Date().toISOString();
  const vars = { product_id: productId };
  if (kind === 'revise') {
    Object.assign(vars, {
      stage: revision.stage,
      cards: revision.cards && revision.cards.length ? revision.cards.join(', ') : '전체',
      types: (revision.types || []).join(', ') || 'ETC',
      memo: revision.memo || '(메모 없음)',
    });
  }
  const prompt = fillPrompt({ mode, kind, vars, root });
  const ws = createWorkspace({ jobId, productId, productDir, root, jobsDir });
  appendLines(path.join(productDir, 'log.jsonl'), [event(productId, jobId, 'job_started', { kind, executor: 'claude-cli' }, root)]);
  if (onStart) onStart({ job_id: jobId, kind, started_at: startedAt });

  const run = await runClaude({
    bin,
    args: claudeArgs({ productId, maxTurns, model }),
    prompt,
    cwd: ws.jobDir,
    env: claudeEnv({ mode, jobId, kind }),
    timeoutMs,
    onProgress,
  });

  const verify = verifyJob({ ...ws, productId, kind, revisionStage: revision && revision.stage });
  const report = parseResultReport(run.result && run.result.text);
  const runOk = Boolean(run.result && run.result.subtype === 'success' && !run.result.is_error && !run.crash);
  const ok = runOk && !/중단/.test(report.결과 || '') && verify.ok;
  const applied = mergeJob({ wsProduct: ws.wsProduct, productDir, ok });
  const errorCode = ok ? null : errorCodeOf({ report, result: run.result, crash: run.crash, verify });
  appendLines(path.join(productDir, 'log.jsonl'), [event(productId, jobId, 'job_finished', { kind, ok, error_code: errorCode }, root)]);

  const summary = {
    job_id: jobId,
    kind,
    mode,
    product_id: productId,
    revision,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok,
    error_code: errorCode,
    crash: run.crash || null,
    exit_code: run.exit_code ?? 0,
    result: run.result ? { subtype: run.result.subtype, num_turns: run.result.num_turns, duration_ms: run.result.duration_ms, permission_denials: run.result.permission_denials } : null,
    report,
    verify,
    applied,
    progress: run.progress,
    stderr: run.stderr || null,
  };
  if (reportsDir) {
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, `${jobId}.json`), JSON.stringify(summary, null, 2));
  }
  if (!keep) fs.rmSync(ws.jobDir, { recursive: true, force: true });
  return summary;
}

module.exports = {
  ROOT, JOB_KINDS, MODES, TOOLS, RULE_ENTRIES, RULE_EXCLUDE,
  allowedTools, newJobId, createWorkspace, fillPrompt, claudeArgs, claudeCommand, claudeEnv,
  describeMessage, parseResultReport, verifyJob, mergeJob, errorCodeOf, runJob,
};
