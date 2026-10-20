// 평가 실행기: 평가 입력을 내 컴퓨터의 Claude Code(claude -p, 평가 모드)로 반복 실행하고 실행마다 result.json을 남김
// 사용: npm run eval -- [입력ID...] --batch <이름> [--repeat N] [--from K] [--variant <이름>] [--model <모델>] [--dry-run] [--export]
//   입력ID를 안 쓰면 eval/inputs/의 모든 입력. 실행 폴더는 eval/runs/<입력ID>--<규칙 버전>--r<N>/
// 규격: docs/eval-spec.md — 사용량이 드니 먼저 --dry-run으로 실행 목록을 확인하세요
const path = require('path');
const { ROOT } = require('./lib/common');
const { runEval } = require('./lib/eval-runner');
const { exportWebData } = require('./export');

function parseArgs(argv) {
  const o = { inputIds: [], batch: null, repeat: 1, from: 1, variant: null, model: undefined, dryRun: false, keep: false, exportWeb: false, inputsDir: null, runsDir: null };
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new Error(`${name}에는 정수를 적어 주세요: ${v}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--batch') o.batch = argv[++i];
    else if (a === '--repeat') o.repeat = num(argv[++i], '--repeat');
    else if (a === '--from') o.from = num(argv[++i], '--from');
    else if (a === '--variant') o.variant = argv[++i];
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--inputs') o.inputsDir = path.resolve(argv[++i]);
    else if (a === '--runs') o.runsDir = path.resolve(argv[++i]);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--keep') o.keep = true;
    else if (a === '--export') o.exportWeb = true;
    else if (a.startsWith('--')) throw new Error(`알 수 없는 옵션: ${a}`);
    else o.inputIds.push(a);
  }
  return o;
}

const sec = (ms) => (typeof ms === 'number' ? `${Math.round(ms / 1000)}초` : '-');
const pct = (v) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '-');

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[오류] ${e.message}`);
    process.exit(2);
  }
  const { inputsDir, runsDir, exportWeb, ...rest } = opts;
  const onProgress = (p) => {
    if (p.type === 'job_start') console.log(`  · ${p.kind === 'plan' ? '구성안 작업' : '문구·출력 작업'} 시작`);
    if (p.type === 'job_end') console.log(`  · ${p.kind === 'plan' ? '구성안 작업' : '문구·출력 작업'} ${p.ok ? '완료' : `중단 (${p.error_code})`}`);
  };
  let out;
  try {
    out = await runEval({
      ...rest,
      ...(inputsDir ? { inputsDir } : {}),
      ...(runsDir ? { runsDir } : {}),
      reportsDir: path.join(ROOT, '.studio', 'jobs'),
      onProgress: (p) => {
        if (p.type === 'job_start' && p.kind === 'plan') console.log(`\n▶ ${p.run_id}`);
        onProgress(p);
      },
    });
  } catch (e) {
    console.error(`[오류] ${e.message}`);
    process.exit(2);
  }
  if (opts.dryRun) {
    console.log(`\n== 평가 실행 계획 (실행하지 않음) · 묶음 ${opts.batch} ==`);
    for (const r of out.runs) console.log(`- ${r.runId}`);
    console.log(`-- ${out.runs.length}개 실행. 실행마다 claude -p 작업 1~2번 (사용량이 들어요)`);
    return;
  }
  console.log(`\n== 평가 실행 결과 · 묶음 ${opts.batch} ==`);
  let invalid = 0;
  for (const { run, result, schemaErrors, file } of out.results) {
    const o = result.outcome;
    const m = result.metrics;
    const judge = result.checks.pass === true ? '통과' : result.checks.pass === false ? '실패' : '사람 판정 대기';
    console.log(`- ${run.runId} | ${o.result}${o.error_code ? ` ${o.error_code}` : ''} | 단계 ${o.final_stage ?? '-'} | 체크리스트 ${judge} | 핵심 정보 ${pct(m.key_info_rate)} | ${sec(m.duration_ms)}`);
    for (const row of result.checks.expected.filter((r) => !r.pass)) console.log(`    [불일치] ${row.name}: 기대 ${JSON.stringify(row.expected)} · 실제 ${JSON.stringify(row.actual)}`);
    for (const f of result.checks.forbidden.filter((x) => x.found)) console.log(`    [금지] ${f.id}: ${f.matched.join(', ')}`);
    if (schemaErrors.length) {
      invalid++;
      console.log(`    [오류] result.json 스키마 불일치 → ${path.relative(ROOT, file)}: ${schemaErrors.slice(0, 3).join(' / ')}`);
    }
  }
  console.log(`-- ${out.results.length}개 실행 · 완료 ${out.results.filter((x) => x.result.outcome.result === '완료').length}개 · 결과 eval/runs/<실행ID>/result.json`);

  // --export: 완료된 실행만 결과 보기 웹 데이터로 (하나씩 --only로 내보내 다른 프로젝트는 그대로 둠)
  if (exportWeb) {
    const runsRoot = runsDir || path.join(ROOT, 'eval', 'runs');
    console.log('\n== 결과 보기 웹으로 내보내기 ==');
    for (const { run } of out.results.filter((x) => x.result.outcome.result === '완료' && !x.schemaErrors.length)) {
      const r = exportWebData({ only: run.runId, evalRuns: runsRoot });
      if (r.exported.length) console.log(`[내보냄] ${run.runId}`);
      for (const x of r.excluded) console.log(`[제외] ${x.id} | ${x.reason} | ${x.detail}`);
      for (const e of r.schemaErrors) console.log(`[오류] SCHEMA_ERROR | ${e}`);
      if (r.schemaErrors.length) invalid++;
    }
  }
  process.exit(invalid ? 1 : 0);
}

if (require.main === module) main();

module.exports = { parseArgs };
