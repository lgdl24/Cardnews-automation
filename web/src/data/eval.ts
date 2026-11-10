// 평가 집계(eval/summary.json, docs/eval-spec.md 7장 v0.2) 형식과 대시보드 계산
// 숫자는 모두 이 파일의 실행 목록에서 다시 계산한다(필터에 따라 바뀜). 문자열 비교 기반 근사 지표라는 한계를 화면에 함께 적는다.
import { loadJson, useLoad } from './load';

export type InputType = 'normal' | 'boundary';

export interface EvalInput {
  input_id: string;
  product_name: string | null;
  type: InputType;
  case: string;
  purpose: string;
  source: string | null;
  owner: string | null;
  expected: Record<string, unknown>;
  key_info: { id: string; text: string; section: string | null; has_copy_terms: boolean }[];
  forbidden: { id: string; text: string; reason: string; auto: boolean }[];
}

export interface EvalJob {
  kind: 'plan' | 'copy';
  ok: boolean;
  error_code: string | null;
  duration_ms: number | null;
  num_turns: number | null;
  permission_denials: number;
}

export interface EvalRun {
  run_id: string;
  batch: string | null;
  input_id: string;
  input_type: InputType;
  input_source: string | null;
  skill_version: string | null;
  variant: string | null;
  repeat: number | null;
  model: string | null;
  started_at: string | null;
  finished_at: string | null;
  design: { id: string | null; source: string | null } | null;
  outcome: {
    result: '완료' | '중단' | null;
    final_stage: string | null;
    error_code: string | null;
    cards_json: boolean;
    card_count: number | null;
    check_errors: string[];
    report_errors: string[];
    report_warning_count: number;
    report_caution_count: number;
  };
  jobs: EvalJob[];
  metrics: {
    first_pass: boolean | null;
    error_codes: Record<string, number>;
    auto_fix_count: number | null;
    final_error_count: number | null;
    coverage: number | null;
    evidence_rate: number | null;
    char_usage: number | null;
    char_usage_max: number | null;
    caution: { total: number; in_source: number; not_in_source: number } | null;
    key_info_rate: number | null;
    key_info_copy_rate: number | null;
    key_info_hits: { id: string; in_evidence: boolean; in_copy: boolean | null }[];
    duration_ms: number | null;
    num_turns: number | null;
  };
  checks: {
    expected: { name: string; expected: unknown; actual: unknown; pass: boolean }[];
    forbidden: { id: string; found: boolean | null; matched_count: number; by_human: boolean }[];
    pass: boolean | null;
    judged_by: string | null;
  };
  project_id: string | null;
  notes: string | null;
}

export interface EvalSummary {
  spec_version: string;
  generated_at: string;
  inputs: EvalInput[];
  runs: EvalRun[];
}

export const useEvalSummary = () => useLoad(() => loadJson<EvalSummary>('eval/summary.json'), 'eval-summary');

export const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const rateOf = (xs: (boolean | null)[]) => mean(xs.map((x) => (x === null ? null : x ? 1 : 0)));

export interface Headline {
  runs: number;
  completed: number;
  stopped: number;
  normal: number;
  boundary: number;
  firstPass: number | null;
  firstPassN: number;
  keyInfo: number | null;
  keyInfoN: number;
  safety: number | null;
  safetyN: number;
  pending: number;
}

export function headline(runs: EvalRun[]): Headline {
  const normal = runs.filter((r) => r.input_type === 'normal');
  const boundary = runs.filter((r) => r.input_type === 'boundary');
  const fp = normal.map((r) => r.metrics.first_pass);
  const ki = normal.map((r) => r.metrics.key_info_rate);
  const safe = boundary.map((r) => r.checks.pass);
  return {
    runs: runs.length,
    completed: runs.filter((r) => r.outcome.result === '완료').length,
    stopped: runs.filter((r) => r.outcome.result !== '완료').length,
    normal: normal.length,
    boundary: boundary.length,
    firstPass: rateOf(fp),
    firstPassN: fp.filter((x) => x !== null).length,
    keyInfo: mean(ki),
    keyInfoN: ki.filter((x) => x !== null).length,
    safety: rateOf(safe),
    safetyN: safe.filter((x) => x !== null).length,
    pending: runs.filter((r) => r.checks.pass === null).length,
  };
}

/** 핵심 정보 표: 입력 × K. 같은 입력의 여러 실행을 합쳐 '근거에 쓰인 비율' */
export interface KeyCell {
  id: string;
  text: string;
  section: string | null;
  hits: number;
  total: number;
  copyHits: number;
  copyTotal: number;
}
export function keyInfoMatrix(inputs: EvalInput[], runs: EvalRun[]) {
  return inputs
    .filter((i) => i.key_info.length)
    .map((input) => {
      const rs = runs.filter((r) => r.input_id === input.input_id && r.metrics.key_info_rate !== null);
      const cells: KeyCell[] = input.key_info.map((k) => {
        const hs = rs.map((r) => r.metrics.key_info_hits.find((h) => h.id === k.id)).filter((h) => h !== undefined);
        const copies = hs.filter((h) => h.in_copy !== null);
        return { id: k.id, text: k.text, section: k.section, hits: hs.filter((h) => h.in_evidence).length, total: hs.length, copyHits: copies.filter((h) => h.in_copy).length, copyTotal: copies.length };
      });
      return { input, runs: rs.length, cells };
    })
    .filter((row) => row.runs > 0);
}

/** 오류 코드별 발생 수 (자동 수정 전 포함) + 중단 원인 */
export function errorTotals(runs: EvalRun[]) {
  const codes = new Map<string, { count: number; runs: number }>();
  for (const r of runs)
    for (const [code, n] of Object.entries(r.metrics.error_codes)) {
      const c = codes.get(code) ?? { count: 0, runs: 0 };
      codes.set(code, { count: c.count + n, runs: c.runs + 1 });
    }
  const stops = new Map<string, number>();
  for (const r of runs) if (r.outcome.result !== '완료') stops.set(r.outcome.error_code ?? '원인 없음', (stops.get(r.outcome.error_code ?? '원인 없음') ?? 0) + 1);
  const byCount = <T extends { count: number }>(a: [string, T], b: [string, T]) => b[1].count - a[1].count || a[0].localeCompare(b[0]);
  return {
    codes: [...codes.entries()].sort(byCount).map(([code, v]) => ({ code, ...v })),
    stops: [...stops.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    autoFix: runs.reduce((a, r) => a + (r.metrics.auto_fix_count ?? 0), 0),
  };
}

const conditionKey = (r: EvalRun) => [r.input_id, r.skill_version, r.variant ?? '', r.model ?? ''].join('|');

/** A6 반복 일관성: 같은 입력·규칙·비교판·모델로 2번 이상 돌린 묶음 */
export function repeatGroups(runs: EvalRun[]) {
  const groups = new Map<string, EvalRun[]>();
  for (const r of runs) groups.set(conditionKey(r), [...(groups.get(conditionKey(r)) ?? []), r]);
  const range = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
  };
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => ({
      input_id: g[0]!.input_id,
      skill_version: g[0]!.skill_version,
      variant: g[0]!.variant,
      model: g[0]!.model,
      runs: g.length,
      completed: g.filter((r) => r.outcome.result === '완료').length,
      firstPass: g.filter((r) => r.metrics.first_pass).length,
      keyInfo: range(g.map((r) => r.metrics.key_info_rate)),
      coverage: range(g.map((r) => r.metrics.coverage)),
      cardCounts: [...new Set(g.map((r) => r.outcome.card_count).filter((x) => x !== null))],
      designs: [...new Set(g.map((r) => r.design?.id).filter((x): x is string => Boolean(x)))],
      checksPass: g.filter((r) => r.checks.pass === true).length,
    }));
}

/** A5 규칙 버전 비교: 비교판 없는 실행만, 버전별 같은 입력끼리 */
export const COMPARE_METRICS = [
  { key: 'first_pass', label: '1회 통과율', normalOnly: true },
  { key: 'key_info_rate', label: '핵심 정보 포함률', normalOnly: true },
  { key: 'coverage', label: '원문 커버리지', normalOnly: true },
  { key: 'safety', label: '안전성 충족률', normalOnly: false },
] as const;
export function versionCompare(runs: EvalRun[]) {
  const base = runs.filter((r) => r.variant === null && r.skill_version);
  const versions = [...new Set(base.map((r) => r.skill_version!))].sort();
  if (versions.length < 2) return { versions, rows: [], shared: [] as string[] };
  // 모든 버전이 함께 돌린 입력만 비교 (입력 구성이 다르면 숫자 차이가 규칙 차이가 아님)
  const inputsOf = (v: string) => new Set(base.filter((r) => r.skill_version === v).map((r) => r.input_id));
  const shared = [...inputsOf(versions[0]!)].filter((id) => versions.every((v) => inputsOf(v).has(id))).sort();
  const pick = (v: string) => base.filter((r) => r.skill_version === v && shared.includes(r.input_id));
  const value = (rs: EvalRun[], key: (typeof COMPARE_METRICS)[number]['key']) => {
    if (key === 'safety') return rateOf(rs.filter((r) => r.input_type === 'boundary').map((r) => r.checks.pass));
    const ns = rs.filter((r) => r.input_type === 'normal');
    if (key === 'first_pass') return rateOf(ns.map((r) => r.metrics.first_pass));
    return mean(ns.map((r) => r.metrics[key]));
  };
  const rows = COMPARE_METRICS.map((m) => ({ ...m, values: versions.map((v) => value(pick(v), m.key)) }));
  return { versions, rows, shared };
}

/** 실행 표 CSV (포트폴리오·리포트용). 개수·지표만, 문구·원문은 넣지 않음 */
export function runsCsv(runs: EvalRun[], inputs: EvalInput[]) {
  const name = (id: string) => inputs.find((i) => i.input_id === id)?.product_name ?? '';
  const cols: [string, (r: EvalRun) => unknown][] = [
    ['run_id', (r) => r.run_id],
    ['batch', (r) => r.batch],
    ['input_id', (r) => r.input_id],
    ['product_name', (r) => name(r.input_id)],
    ['input_type', (r) => r.input_type],
    ['skill_version', (r) => r.skill_version],
    ['variant', (r) => r.variant],
    ['repeat', (r) => r.repeat],
    ['model', (r) => r.model],
    ['started_at', (r) => r.started_at],
    ['result', (r) => r.outcome.result],
    ['error_code', (r) => r.outcome.error_code],
    ['card_count', (r) => r.outcome.card_count],
    ['first_pass', (r) => r.metrics.first_pass],
    ['auto_fix_count', (r) => r.metrics.auto_fix_count],
    ['final_error_count', (r) => r.metrics.final_error_count],
    ['coverage', (r) => r.metrics.coverage],
    ['evidence_rate', (r) => r.metrics.evidence_rate],
    ['key_info_rate', (r) => r.metrics.key_info_rate],
    ['key_info_copy_rate', (r) => r.metrics.key_info_copy_rate],
    ['char_usage', (r) => r.metrics.char_usage],
    ['caution_total', (r) => r.metrics.caution?.total ?? null],
    ['plan_ms', (r) => r.jobs.find((j) => j.kind === 'plan')?.duration_ms ?? null],
    ['copy_ms', (r) => r.jobs.find((j) => j.kind === 'copy')?.duration_ms ?? null],
    ['num_turns', (r) => r.metrics.num_turns],
    ['report_warning_count', (r) => r.outcome.report_warning_count],
    ['report_caution_count', (r) => r.outcome.report_caution_count],
    ['checks_pass', (r) => r.checks.pass],
  ];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(([c]) => c).join(','), ...runs.map((r) => cols.map(([, f]) => cell(f(r))).join(','))].join('\n') + '\n';
}

/** 기대 동작 항목 이름 (docs/eval-spec.md 2-1) */
export const EXPECTED_LABELS: Record<string, string> = {
  check: '입력 확인',
  check_errors: '누락 위치',
  instruction_warnings: '지시문 경고 수',
  result: '실행 결과',
  final_stage: '마지막 단계',
  card_count: '카드 수',
  error_code: '오류 코드',
  cards_json: 'cards.json 생성',
  report_has_warning: '보고에 [경고]',
  report_has_caution: '보고에 [주의]',
  report_lists_missing: '보고에 누락 항목',
  max_remaining_errors: '남은 검증 오류(최대)',
};

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : '없음';
  return String(v);
}
