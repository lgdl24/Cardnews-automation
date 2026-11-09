// 평가 집계 (docs/eval-spec.md 7장 v0.2): eval/runs/*/result.json + eval/inputs/*/checklist.json → 웹 데이터 eval/summary.json
// 중단된 실행도 모두 넣는다(대시보드가 실패·경계 입력을 보여야 함). 공개하지 않는 것은 빼고 개수만 남긴다:
// - 결과 보고 '알림' 원문(지시문 일부가 인용될 수 있음) → [경고]·[주의] 줄 수만
// - 금지 표현 match 목록·찾은 글자 → 찾은 개수만
// 사람 판정(eval/judgments.json)이 있으면 자동 판정이 비어 있는(null) 금지 항목에만 채우고 전체 판정을 다시 계산한다.
const fs = require('fs');
const path = require('path');
const { parseInput } = require('./common');

const SPEC_VERSION = '0.2';
const MAX_TEXT = 160;

const readJsonIf = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const clip = (s) => (typeof s === 'string' && s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// 체크리스트 → 화면에 필요한 것만 (match 목록·quote 원문은 빼고, 자동 판정 여부만)
function inputRow(c, productName = null) {
  return {
    input_id: c.input_id,
    product_name: productName,
    type: c.type,
    case: c.case,
    purpose: c.purpose,
    source: c.source ?? null,
    owner: c.owner ?? null,
    expected: c.expected || {},
    key_info: (c.key_info || []).map((k) => ({ id: k.id, text: k.text, section: k.section ?? null, has_copy_terms: Boolean(k.copy_terms && k.copy_terms.length) })),
    forbidden: (c.forbidden || []).map((f) => ({ id: f.id, text: f.text, reason: f.reason, auto: Boolean(f.match && f.match.length) })),
  };
}

// 화면에 보일 이름: 입력 양식의 '제품명'만 (input.md 전체는 공개하지 않음). 비어 있으면 null
function productNameOf(file) {
  try {
    const name = parseInput(fs.readFileSync(file, 'utf8')).groups?.['제품 정보']?.['제품명'];
    return typeof name === 'string' && name.trim() ? clip(name.trim()) : null;
  } catch {
    return null;
  }
}

function loadInputs(inputsDir) {
  if (!inputsDir || !fs.existsSync(inputsDir)) return [];
  return fs
    .readdirSync(inputsDir)
    .sort()
    .map((id) => ({ c: readJsonIf(path.join(inputsDir, id, 'checklist.json')), name: productNameOf(path.join(inputsDir, id, 'input.md')) }))
    .filter(({ c }) => c && c.input_id)
    .map(({ c, name }) => inputRow(c, name));
}

// 사람 판정 파일: { "<실행ID>": { "forbidden": { "F3": false }, "by": "이규동", "at": "2026-11-09", "note": "…" } }
function loadJudgments(file) {
  const j = file ? readJsonIf(file) : null;
  return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
}

function overallPass(expected, forbidden) {
  if (expected.some((r) => !r.pass) || forbidden.some((f) => f.found === true)) return false;
  if (forbidden.some((f) => f.found === null)) return null;
  return true;
}

function checksRow(checks = {}, judgment = null) {
  const decided = (judgment && judgment.forbidden) || {};
  const expected = (checks.expected || []).map((r) => ({ name: r.name, expected: r.expected, actual: r.actual, pass: Boolean(r.pass) }));
  const forbidden = (checks.forbidden || []).map((f) => {
    const human = f.found === null && typeof decided[f.id] === 'boolean';
    return { id: f.id, found: human ? decided[f.id] : f.found, matched_count: (f.matched || []).length, by_human: human };
  });
  const byHuman = forbidden.some((f) => f.by_human);
  return {
    expected,
    forbidden,
    pass: byHuman ? overallPass(expected, forbidden) : checks.pass ?? null,
    judged_by: byHuman ? judgment.by ?? null : null,
    judged_at: byHuman ? judgment.at ?? null : null,
    judgment_note: byHuman ? clip(judgment.note ?? null) : null,
  };
}

function jobSummary(j) {
  const report = j.report || {};
  const alerts = report.알림 || [];
  return {
    kind: j.kind,
    ok: Boolean(j.ok),
    error_code: j.error_code ?? null,
    duration_ms: num(j.duration_ms),
    num_turns: num(j.num_turns),
    permission_denials: num(j.permission_denials) ?? 0,
    report_warning_count: alerts.filter((a) => a.includes('[경고]')).length,
    report_caution_count: alerts.filter((a) => a.includes('[주의]')).length,
  };
}

function runRow(r, { exportedIds = new Set(), judgment = null } = {}) {
  const o = r.outcome || {};
  const m = r.metrics || {};
  return {
    run_id: r.run_id,
    batch: r.batch ?? null,
    input_id: r.input_id,
    input_type: r.input_type,
    input_source: r.input_source ?? null,
    skill_version: r.skill_version ?? null,
    variant: r.variant ?? null,
    repeat: r.repeat ?? null,
    model: r.model ?? null,
    claude_code_version: r.claude_code_version ?? null,
    started_at: r.started_at ?? null,
    finished_at: r.finished_at ?? null,
    design: r.design ? { id: r.design.id ?? null, source: r.design.source ?? null } : null,
    outcome: {
      result: o.result ?? null,
      final_stage: o.final_stage ?? null,
      error_code: o.error_code ?? null,
      cards_json: Boolean(o.cards_json),
      card_count: num(o.card_count),
      check_errors: (o.check_errors || []).map(clip),
      check_instruction_warnings: num(o.check_instruction_warnings) ?? 0,
      report_errors: (o.report_errors || []).map(clip),
      report_warning_count: num(o.report_warning_count) ?? 0,
      report_caution_count: num(o.report_caution_count) ?? 0,
    },
    jobs: (r.jobs || []).map(jobSummary),
    metrics: {
      first_pass: typeof m.first_pass === 'boolean' ? m.first_pass : null,
      error_codes: m.error_codes || {},
      auto_fix_count: num(m.auto_fix_count),
      final_error_count: num(m.final_error_count),
      coverage: num(m.coverage),
      evidence_rate: num(m.evidence_rate),
      char_usage: num(m.char_usage),
      char_usage_max: num(m.char_usage_max),
      caution: m.caution ? { total: num(m.caution.total) ?? 0, in_source: num(m.caution.in_source) ?? 0, not_in_source: num(m.caution.not_in_source) ?? 0 } : null,
      key_info_rate: num(m.key_info_rate),
      key_info_copy_rate: num(m.key_info_copy_rate),
      key_info_hits: (m.key_info_hits || []).map((h) => ({ id: h.id, in_evidence: Boolean(h.in_evidence), in_copy: typeof h.in_copy === 'boolean' ? h.in_copy : null })),
      duration_ms: num(m.duration_ms),
      num_turns: num(m.num_turns),
    },
    checks: checksRow(r.checks, judgment),
    project_id: exportedIds.has(r.run_id) ? r.run_id : null,
    notes: clip(r.notes ?? null),
  };
}

function loadRuns(runsDir) {
  if (!runsDir || !fs.existsSync(runsDir)) return [];
  return fs
    .readdirSync(runsDir)
    .sort()
    .map((id) => {
      const r = readJsonIf(path.join(runsDir, id, 'result.json'));
      return r && r.run_id === id ? r : null;
    })
    .filter(Boolean);
}

// runsDir: eval/runs · inputsDir: eval/inputs · judgmentsFile: eval/judgments.json · exportedIds: 웹 프로젝트로 내보낸 실행ID
function buildEvalSummary({ runsDir, inputsDir, judgmentsFile = null, exportedIds = [], generatedAt = new Date().toISOString() }) {
  const judgments = loadJudgments(judgmentsFile);
  const ids = new Set(exportedIds);
  const runs = loadRuns(runsDir)
    .map((r) => runRow(r, { exportedIds: ids, judgment: judgments[r.run_id] || null }))
    .sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)) || a.run_id.localeCompare(b.run_id));
  return { spec_version: SPEC_VERSION, generated_at: generatedAt, inputs: loadInputs(inputsDir), runs };
}

// 콘솔·테스트용 요약 숫자 4개 (docs/eval-spec.md 7장): 화면은 필터에 따라 같은 계산을 다시 함
function headline(runs) {
  const normal = runs.filter((r) => r.input_type === 'normal');
  const boundary = runs.filter((r) => r.input_type === 'boundary');
  const rate = (xs, f) => {
    const vals = xs.map(f).filter((v) => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null;
  };
  return {
    runs: runs.length,
    completed: runs.filter((r) => r.outcome.result === '완료').length,
    first_pass_rate: rate(normal, (r) => (r.metrics.first_pass === null ? null : r.metrics.first_pass ? 1 : 0)),
    key_info_rate: rate(normal, (r) => r.metrics.key_info_rate),
    safety_rate: rate(boundary, (r) => (r.checks.pass === null ? null : r.checks.pass ? 1 : 0)),
    pending: runs.filter((r) => r.checks.pass === null).length,
  };
}

module.exports = { SPEC_VERSION, buildEvalSummary, headline, runRow, checksRow, inputRow, loadJudgments };
