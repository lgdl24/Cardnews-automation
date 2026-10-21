// 평가 실행기: 평가 입력(eval/inputs/<입력ID>/)을 작업 실행기(job-runner, 평가 모드)로 한 번 실행하고 result.json을 남긴다
// 규격: docs/eval-spec.md v0.1 — 실행 하나 = 제작 폴더 하나 eval/runs/<실행ID>/ (제품ID = 실행ID)
//
//   1) 준비: 입력 폴더의 input.md·images/를 실행 폴더로 복사 (입력 폴더는 고치지 않음). 같은 실행ID가 있으면 멈춤
//   2) 실행: 구성안 작업 → 평가 승인(plan_approved, approved_by: eval) → 문구·출력 작업. 작업이 실패하면 거기서 멈춤
//   3) 결과: jobs·outcome·metrics(핵심 정보 포함률)·checks(체크리스트 판정)를 계산해 스키마 검사 후 result.json에 씀
//
// 사람 승인이 없는 평가용 실행이라 최종 승인(final_approved)은 남기지 않는다.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Ajv2020 = require('ajv/dist/2020');
const { readJson, normalize } = require('./common');
const jobRunner = require('./job-runner');
const { summarize } = require('./analysis');

const ROOT = jobRunner.ROOT;
const SPEC_VERSION = '0.1';
const INPUT_ID_RE = /^eval-[a-z0-9-]+$/;
const NAME_RE = /^[a-z0-9-]+$/;
// 비교판(A8)이 바꿀 수 있는 파일: Claude가 따르는 규칙 문서와 평가 지시문만.
// 검증·출력 스크립트와 config/는 바꾸지 않음 → 결과를 같은 기준으로 잴 수 있게
const VARIANT_FILE_RE = /^(CLAUDE\.md|\.claude\/skills\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.md|prompts\/eval\/(plan|copy)\.md)$/;

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

/**
 * 비교판 읽기: eval/variants/<이름>/variant.json + files/(바꿀 파일, 저장소와 같은 경로)
 * variant.json: { "description": "무엇을 뺐는지 한 줄", "changes": ["파일별 바꾼 점", ...] }
 */
function loadVariant(variantsDir, name) {
  const dir = path.join(variantsDir, name);
  const metaFile = path.join(dir, 'variant.json');
  if (!fs.existsSync(metaFile)) throw new Error(`비교판 정의가 없어요: ${metaFile} (eval/variants/<이름>/variant.json + files/)`);
  const meta = readJson(metaFile);
  if (typeof meta.description !== 'string' || !meta.description.trim()) throw new Error(`비교판 ${name}: variant.json에 description(무엇을 뺐는지)이 필요해요`);
  const filesDir = path.join(dir, 'files');
  const files = listFiles(filesDir);
  if (!files.length) throw new Error(`비교판 ${name}: files/에 바꿀 파일이 없어요`);
  const bad = files.filter((f) => !VARIANT_FILE_RE.test(f));
  if (bad.length) throw new Error(`비교판 ${name}: 바꿀 수 없는 파일이에요 (CLAUDE.md·.claude/skills/*/*.md·prompts/eval/plan|copy.md만): ${bad.join(', ')}`);
  return { name, description: meta.description.trim(), changes: Array.isArray(meta.changes) ? meta.changes : [], filesDir, files };
}

// ── 실행ID: <입력ID>--<규칙 버전>[-<비교판>]--r<반복 번호>
function runIdOf({ inputId, skillVersion, variant = null, repeat }) {
  return `${inputId}--${skillVersion}${variant ? `-${variant}` : ''}--r${repeat}`;
}

function skillVersionOf(root = ROOT) {
  return readJson(path.join(root, 'config', 'skill-version.json')).version;
}

function listInputs(inputsDir) {
  if (!fs.existsSync(inputsDir)) return [];
  return fs.readdirSync(inputsDir)
    .filter((d) => INPUT_ID_RE.test(d) && fs.existsSync(path.join(inputsDir, d, 'checklist.json')))
    .sort();
}

// 실행 계획: 입력 × 반복. 잘못된 이름·없는 입력·이미 있는 실행ID는 아무것도 하기 전에 오류
function planRuns({ inputIds, batch, repeat = 1, from = 1, variant = null, inputsDir, runsDir, root = ROOT, variantsDir = path.join(root, 'eval', 'variants') }) {
  if (!NAME_RE.test(batch || '')) throw new Error('--batch에 실행 묶음 이름을 적어 주세요 (영문 소문자·숫자·하이픈. 예: v1-base)');
  if (variant !== null && !NAME_RE.test(variant)) throw new Error(`비교판 이름 형식이 아니에요: ${variant}`);
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error('--repeat는 1 이상의 정수예요');
  if (!Number.isInteger(from) || from < 1) throw new Error('--from은 1 이상의 정수예요');
  const variantInfo = variant === null ? null : loadVariant(variantsDir, variant);
  const all = listInputs(inputsDir);
  const ids = inputIds && inputIds.length ? inputIds : all;
  if (!ids.length) throw new Error(`평가 입력이 없어요: ${inputsDir}`);
  for (const id of ids) {
    if (!INPUT_ID_RE.test(id)) throw new Error(`입력ID는 eval-로 시작하고 영문 소문자·숫자·하이픈만 써요: ${id}`);
    if (!all.includes(id)) throw new Error(`평가 입력이 없거나 checklist.json이 없어요: ${path.join(inputsDir, id)}`);
  }
  const skillVersion = skillVersionOf(root);
  const runs = [];
  for (const inputId of ids) {
    for (let r = from; r < from + repeat; r++) {
      const runId = runIdOf({ inputId, skillVersion, variant, repeat: r });
      runs.push({ inputId, runId, repeat: r, batch, variant, variantInfo, skillVersion, runDir: path.join(runsDir, runId) });
    }
  }
  const exists = runs.filter((r) => fs.existsSync(r.runDir)).map((r) => r.runId);
  if (exists.length) {
    throw new Error(`이미 있는 실행이에요 (덮어쓰지 않아요). 반복 번호를 올려 주세요(--from): ${exists.join(', ')}`);
  }
  return runs;
}

// ── 1) 준비
function prepareRunDir({ inputDir, runDir }) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.copyFileSync(path.join(inputDir, 'input.md'), path.join(runDir, 'input.md'));
  const images = path.join(inputDir, 'images');
  if (fs.existsSync(images)) fs.cpSync(images, path.join(runDir, 'images'), { recursive: true });
}

function appendEvent(runDir, runId, name, fields, skillVersion) {
  const entry = { ts: new Date().toISOString(), event: name, project_id: runId, job_id: null, skill_version: skillVersion, ...fields };
  fs.appendFileSync(path.join(runDir, 'log.jsonl'), JSON.stringify(entry) + '\n');
}

function readEvents(runDir) {
  const file = path.join(runDir, 'log.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a.ts.localeCompare(b.ts));
}

// 입력 확인은 실행 폴더를 대상으로 같은 프로세스에서 (기록 없이)
function runCheck(runsDir, runId) {
  const before = { dir: process.env.CARDNEWS_PRODUCTS_DIR, nolog: process.env.CARDNEWS_NO_LOG };
  process.env.CARDNEWS_PRODUCTS_DIR = runsDir;
  process.env.CARDNEWS_NO_LOG = '1';
  try {
    // check-input은 경로를 호출할 때 읽으므로 환경변수를 바꾼 뒤 불러도 됨
    const { checkInput } = require('../check-input');
    const r = checkInput(runId);
    return { errors: r.errors, warnings: r.warnings };
  } finally {
    if (before.dir === undefined) delete process.env.CARDNEWS_PRODUCTS_DIR;
    else process.env.CARDNEWS_PRODUCTS_DIR = before.dir;
    if (before.nolog === undefined) delete process.env.CARDNEWS_NO_LOG;
    else process.env.CARDNEWS_NO_LOG = before.nolog;
  }
}

function claudeVersion(bin) {
  const r = spawnSync(...jobRunner.claudeCommand(bin, ['-v']), { encoding: 'utf8', timeout: 10000 });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').trim().split(/\s/)[0] || null;
}

// ── 3) 결과 계산
const readJsonIf = (file) => (fs.existsSync(file) ? readJson(file) : null);

function copyText(card) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(card.copy);
  return out.join('\n');
}

// docs/eval-spec.md 4-1
function keyInfoMetrics(cards, keyInfo) {
  if (!keyInfo.length) return { key_info_rate: null, key_info_hits: [], key_info_copy_rate: null };
  const quotes = new Map((cards && cards.sources ? cards.sources : []).map((s) => [s.id, normalize(s.quote)]));
  const used = new Set();
  for (const c of cards ? cards.cards : []) for (const id of c.evidence || []) if (quotes.has(id)) used.add(quotes.get(id));
  const hasCopy = Boolean(cards && cards.cards.some((c) => c.copy));
  const allCopy = hasCopy ? cards.cards.map(copyText).join('\n') : '';
  const hits = keyInfo.map((k) => {
    const kq = normalize(k.quote);
    const inEvidence = [...used].some((q) => q.includes(kq) || (kq.includes(q) && q.length >= kq.length / 2));
    const inCopy = !hasCopy || !k.copy_terms || !k.copy_terms.length ? null : k.copy_terms.every((t) => allCopy.includes(t));
    return { id: k.id, in_evidence: inEvidence, in_copy: inCopy };
  });
  const withTerms = hits.filter((h) => h.in_copy !== null);
  return {
    key_info_rate: round(hits.filter((h) => h.in_evidence).length / hits.length),
    key_info_hits: hits,
    key_info_copy_rate: withTerms.length ? round(withTerms.filter((h) => h.in_copy).length / withTerms.length) : null,
  };
}

const round = (n) => (n === null ? null : Math.round(n * 1000) / 1000);
const sumOrNull = (vals) => {
  const nums = vals.filter((v) => typeof v === 'number');
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
};

function processMetrics(events) {
  const results = events.filter((e) => e.event === 'validate_result');
  const errorCodes = {};
  for (const r of results) for (const code of r.error_codes || []) errorCodes[code] = (errorCodes[code] || 0) + 1;
  const last = (check) => [...results].reverse().find((r) => r.check === check);
  const finals = [last('data'), last('layout')].filter(Boolean);
  const s = summarize(events);
  return {
    first_pass: s.first_pass,
    error_codes: errorCodes,
    auto_fix_count: s.auto_fix_total,
    final_error_count: finals.length ? finals.reduce((a, r) => a + (r.error_count ?? (r.ok ? 0 : 1)), 0) : null,
  };
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const stripHeading = (s) => String(s).replace(/^#+\s*/, '').trim();

// docs/eval-spec.md 5장: 체크리스트에 적힌 기대 동작만 판정
function judgeExpected(expected, { outcome, check, metrics }) {
  const rows = [];
  const add = (name, actual, pass) => rows.push({ name, expected: expected[name], actual, pass });
  const checkActual = check.errors.length ? (check.errors.every((e) => e.code === 'INPUT_MISSING') ? 'INPUT_MISSING' : check.errors[0].code) : 'pass';
  if ('check' in expected) add('check', checkActual, checkActual === expected.check);
  if ('check_errors' in expected) add('check_errors', outcome.check_errors, sameSet(outcome.check_errors, expected.check_errors));
  if ('instruction_warnings' in expected) add('instruction_warnings', outcome.check_instruction_warnings, outcome.check_instruction_warnings === expected.instruction_warnings);
  for (const name of ['result', 'final_stage', 'card_count', 'error_code', 'cards_json']) {
    if (name in expected) add(name, outcome[name], outcome[name] === expected[name]);
  }
  if ('report_has_warning' in expected) {
    const a = outcome.report_warning_count > 0;
    add('report_has_warning', a, a === expected.report_has_warning);
  }
  if ('report_has_caution' in expected) {
    const a = outcome.report_caution_count > 0;
    add('report_has_caution', a, a === expected.report_has_caution);
  }
  if ('report_lists_missing' in expected) {
    // 결과 보고 '오류'에 입력 확인에서 빠진 항목 이름이 모두 나오는지
    const text = outcome.report_errors.join('\n');
    const names = (expected.check_errors || outcome.check_errors).map(stripHeading);
    const a = outcome.report_errors.length > 0 && names.every((n) => text.includes(n));
    add('report_lists_missing', a, a === expected.report_lists_missing);
  }
  if ('max_remaining_errors' in expected) {
    const a = metrics.final_error_count;
    add('max_remaining_errors', a, a !== null && a <= expected.max_remaining_errors);
  }
  return rows;
}

function judgeForbidden(forbidden, cards) {
  const text = cards ? cards.cards.map(copyText).join('\n') : '';
  return forbidden.map((f) => {
    if (!f.match || !f.match.length) return { id: f.id, found: null, matched: [] };
    const matched = f.match.filter((m) => text.includes(m));
    return { id: f.id, found: matched.length > 0, matched };
  });
}

function overallPass(expectedRows, forbiddenRows) {
  if (expectedRows.some((r) => !r.pass) || forbiddenRows.some((f) => f.found === true)) return false;
  if (forbiddenRows.some((f) => f.found === null)) return null;
  return true;
}

function buildResult({ run, checklist, jobs, check, startedAt, finishedAt, model, claudeCodeVersion }) {
  const cards = readJsonIf(path.join(run.runDir, 'cards.json'));
  const quality = readJsonIf(path.join(run.runDir, 'output', 'quality.json'));
  const events = readEvents(run.runDir);
  const reports = jobs.map((j) => j.report);
  const alerts = reports.flatMap((r) => r.알림);
  const failed = jobs.find((j) => !j.ok);

  const outcome = {
    result: jobs.length && !failed ? '완료' : '중단',
    final_stage: cards ? cards.stage : null,
    error_code: failed ? failed.error_code : null,
    cards_json: Boolean(cards),
    card_count: cards ? cards.cards.length : null,
    check_errors: check.errors.map((e) => e.where),
    check_instruction_warnings: check.warnings.filter((w) => /지시문 형태/.test(w.message)).length,
    report_errors: reports.flatMap((r) => r.오류),
    report_warning_count: alerts.filter((a) => a.includes('[경고]')).length,
    report_caution_count: alerts.filter((a) => a.includes('[주의]')).length,
  };
  const metrics = {
    ...processMetrics(events),
    coverage: quality ? quality.coverage : null,
    evidence_rate: quality ? quality.evidence_rate : null,
    char_usage: quality ? quality.char_usage : null,
    char_usage_max: quality ? quality.char_usage_max : null,
    caution: quality ? quality.caution : null,
    ...keyInfoMetrics(cards, checklist.key_info || []),
    duration_ms: sumOrNull(jobs.map((j) => j.duration_ms)),
    num_turns: sumOrNull(jobs.map((j) => j.num_turns)),
  };
  const expectedRows = judgeExpected(checklist.expected || {}, { outcome, check, metrics });
  const forbiddenRows = judgeForbidden(checklist.forbidden || [], cards);

  return {
    spec_version: SPEC_VERSION,
    run_id: run.runId,
    batch: run.batch,
    input_id: run.inputId,
    input_type: checklist.type,
    input_source: checklist.source ?? null,
    skill_version: run.skillVersion,
    variant: run.variant,
    repeat: run.repeat,
    model,
    claude_code_version: claudeCodeVersion,
    started_at: startedAt,
    finished_at: finishedAt,
    jobs,
    outcome,
    metrics,
    checks: { expected: expectedRows, forbidden: forbiddenRows, pass: overallPass(expectedRows, forbiddenRows) },
    ...(run.variantInfo ? { notes: `비교판 ${run.variant}: ${run.variantInfo.description} (바꾼 파일: ${run.variantInfo.files.join(', ')})` } : {}),
  };
}

// runJob 반환값 → result.json의 jobs[] 한 줄
function jobRow(summary) {
  const r = summary.result || {};
  const denials = r.permission_denials;
  return {
    kind: summary.kind,
    job_id: summary.job_id,
    ok: summary.ok,
    error_code: summary.error_code,
    duration_ms: Number.isInteger(r.duration_ms) ? r.duration_ms : Date.parse(summary.finished_at) - Date.parse(summary.started_at),
    num_turns: Number.isInteger(r.num_turns) ? r.num_turns : null,
    permission_denials: Array.isArray(denials) ? denials.length : Number.isInteger(denials) ? denials : 0,
    report: summary.report,
  };
}

let validator = null;
function checkResultSchema(result, root = ROOT) {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true });
    ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
    validator = ajv.compile(readJson(path.join(root, 'schemas', 'eval', 'run-result.schema.json')));
  }
  if (validator(result)) return [];
  return validator.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
}

/**
 * 실행 하나: 준비 → 구성안 → 평가 승인 → 문구·출력 → result.json
 * @returns {Promise<{ result, schemaErrors, file }>}
 */
async function runOne(run, {
  inputsDir, runsDir, root = ROOT, bin = process.env.CARDNEWS_CLAUDE_BIN || 'claude', model, maxTurns, timeoutMs,
  jobsDir, reportsDir, keep = false, claudeCodeVersion, onProgress = () => {},
}) {
  const inputDir = path.join(inputsDir, run.inputId);
  const checklist = readJson(path.join(inputDir, 'checklist.json'));
  const startedAt = new Date().toISOString();
  prepareRunDir({ inputDir, runDir: run.runDir });
  appendEvent(run.runDir, run.runId, 'input_submitted', { executor: 'eval', batch: run.batch, input_id: run.inputId }, run.skillVersion);
  const check = runCheck(runsDir, run.runId);

  const jobs = [];
  let usedModel = model || null;
  const job = async (kind) => {
    onProgress({ run_id: run.runId, type: 'job_start', kind });
    const s = await jobRunner.runJob({
      kind, productId: run.runId, productDir: run.runDir, mode: 'eval',
      bin, model, maxTurns, timeoutMs, root, jobsDir, reportsDir, keep,
      overlayDir: run.variantInfo ? run.variantInfo.filesDir : null,
      onProgress: (p) => onProgress({ run_id: run.runId, type: 'progress', kind, progress: p }),
    });
    const init = (s.progress || []).find((p) => p.type === 'init' && p.model);
    if (init && !usedModel) usedModel = init.model;
    jobs.push(jobRow(s));
    onProgress({ run_id: run.runId, type: 'job_end', kind, ok: s.ok, error_code: s.error_code });
    return s;
  };

  const plan = await job('plan');
  if (plan.ok) {
    appendEvent(run.runDir, run.runId, 'plan_approved', { approved_by: 'eval' }, run.skillVersion);
    await job('copy');
  }

  const result = buildResult({
    run, checklist, jobs, check, startedAt, finishedAt: new Date().toISOString(), model: usedModel, claudeCodeVersion,
  });
  const schemaErrors = checkResultSchema(result, root);
  const file = path.join(run.runDir, schemaErrors.length ? 'result.invalid.json' : 'result.json');
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  return { result, schemaErrors, file };
}

async function runEval({
  inputIds = [], batch, repeat = 1, from = 1, variant = null, model, maxTurns, timeoutMs,
  root = ROOT, inputsDir = path.join(root, 'eval', 'inputs'), runsDir = path.join(root, 'eval', 'runs'),
  variantsDir = path.join(root, 'eval', 'variants'), bin = process.env.CARDNEWS_CLAUDE_BIN || 'claude', jobsDir, reportsDir, keep = false, dryRun = false, onProgress,
}) {
  const runs = planRuns({ inputIds, batch, repeat, from, variant, inputsDir, runsDir, root, variantsDir });
  if (dryRun) return { runs, results: [] };
  const claudeCodeVersion = claudeVersion(bin);
  if (!claudeCodeVersion) throw new Error(`Claude Code(${bin})를 실행할 수 없어요. 설치·로그인을 확인해 주세요 (claude auth status)`);
  fs.mkdirSync(runsDir, { recursive: true });
  const results = [];
  for (const run of runs) {
    // 실행 하나가 실패해도 다음 실행은 계속함 (실패도 평가 결과)
    results.push({ run, ...(await runOne(run, { inputsDir, runsDir, root, bin, model, maxTurns, timeoutMs, jobsDir, reportsDir, keep, claudeCodeVersion, onProgress })) });
  }
  return { runs, results };
}

module.exports = {
  SPEC_VERSION, VARIANT_FILE_RE, runIdOf, listInputs, loadVariant, planRuns, prepareRunDir, keyInfoMetrics, judgeExpected, judgeForbidden,
  overallPass, buildResult, jobRow, checkResultSchema, runOne, runEval,
};
