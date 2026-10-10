// 서비스 모드 작업 하나 실행 (웹 서버 대신 터미널에서)
// 사용법 (Agent SDK, API 키 필요):
//   node scripts/service/run-job.js plan <프로젝트ID> [--from <예시 제품ID>] [--keep] [--budget 1] [--max-turns 30] [--model sonnet]
//   node scripts/service/run-job.js copy <프로젝트ID>
//   node scripts/service/run-job.js revise <프로젝트ID> --stage final --cards 3 --types LEN --memo "제목 더 짧게"
// 사용법 (API 키 없이: Claude Code 대화가 직접 작업. docs/service-mode.md '키 없이 실행해 보기'):
//   node scripts/service/run-job.js plan <프로젝트ID> --executor manual   → 작업 폴더·지시문만 준비하고 끝남
//   (Claude Code가 작업 폴더에서 지시문대로 작업하고, 마지막 결과 보고를 파일로 저장)
//   node scripts/service/run-job.js finish <작업ID> --report <결과 보고 파일> [--keep]   → 서버 재검증·반영·기록
// 프로젝트 저장소: $DATA_DIR/projects/<프로젝트ID> (기본 data/, .gitignore). --from이면 products/<예시 제품ID>의 입력·이미지로 처음 만듦
// API 키: 저장소 루트 .env의 ANTHROPIC_API_KEY (값은 출력하지 않음)
const fs = require('fs');
const path = require('path');
const { ROOT, dataDir, runJob, startJob, loadJob, finishJob, seedProject } = require('./job');

function arg(argv, name, fallback = undefined) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (fs.existsSync(file) && typeof process.loadEnvFile === 'function') process.loadEnvFile(file);
}

function printResult(r) {
  const s = r.sdk || {};
  console.log(`\n== 작업 ${r.job_id} (${r.kind}) · ${r.project_id} · ${r.executor} ==`);
  console.log(`결과: ${r.ok ? '성공 → 프로젝트에 반영' : '실패 → 반영 안 함'}${r.error_code ? ` (${r.error_code})` : ''}`);
  if (r.executor === 'manual') console.log('SDK: 사용 안 함 (Claude Code 대화가 직접 작업 · 도구 제한·비용 상한·토큰 기록 없음)');
  else console.log(`SDK: ${s.subtype || '-'} · ${s.num_turns ?? '-'}턴 · ${s.duration_ms ? Math.round(s.duration_ms / 1000) : '-'}초 · 모델 ${(s.models || []).join(', ') || '-'}`);
  if (r.executor !== 'manual') console.log(`토큰: 입력 ${s.input_tokens ?? '-'} · 출력 ${s.output_tokens ?? '-'} · 비용 $${s.cost_usd != null ? s.cost_usd.toFixed(4) : '-'}`);
  if (r.executor !== 'manual') console.log(`도구 호출 ${r.tool_uses.length}회 · 거부 ${(s.permission_denials || []).length}회`);
  console.log(`서버 재검증: ${r.verify.ok ? '통과' : r.verify.reasons.join(', ')}`);
  if (r.report && r.report.결과) console.log(`Claude 결과 보고: ${r.report.결과} / 오류 ${r.report.오류.join(' · ') || '없음'} / 알림 ${r.report.알림.join(' · ') || '없음'}`);
  if (r.crash) console.log(`실행 오류: ${r.crash}`);
  console.log(`보고서: ${path.relative(ROOT, path.join(dataDir(), 'reports', `${r.job_id}.json`))}`);
}

function finish(argv) {
  const jobId = argv[1];
  const reportFile = arg(argv, 'report');
  if (!jobId || !reportFile) {
    console.error('사용법: node scripts/service/run-job.js finish <작업ID> --report <결과 보고 파일> [--keep]');
    process.exit(2);
  }
  const meta = loadJob(jobId);
  if (meta.executor !== 'manual') throw new Error(`manual 작업이 아니에요: ${jobId}`);
  const result = finishJob({ meta, reportText: fs.readFileSync(reportFile, 'utf8'), keep: argv.includes('--keep') });
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'finish') return finish(argv);
  const [kind, projectId] = argv;
  if (!kind || !projectId) {
    console.error('사용법: node scripts/service/run-job.js <plan|copy|revise> <프로젝트ID> [--from <예시 제품ID>] [--executor manual]');
    process.exit(2);
  }
  loadEnv();
  const executor = arg(argv, 'executor', 'sdk');
  if (executor === 'sdk' && !process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY가 없어요. 저장소 루트의 .env에 넣어 주세요 (.env.example 참고).');
    process.exit(2);
  }
  const projectDir = path.join(dataDir(), 'projects', projectId);
  const from = arg(argv, 'from');
  if (from && seedProject({ fromProductDir: path.join(ROOT, 'products', from), projectDir })) {
    console.log(`프로젝트를 만들었어요: ${path.relative(ROOT, projectDir)} (products/${from}의 입력·이미지)`);
  }
  if (!fs.existsSync(projectDir)) {
    console.error(`프로젝트가 없어요: ${projectDir}. --from <예시 제품ID>로 처음 만들 수 있어요.`);
    process.exit(2);
  }
  const vars = kind === 'revise'
    ? { stage: arg(argv, 'stage', 'final'), cards: arg(argv, 'cards', '전체'), types: arg(argv, 'types', 'ETC'), memo: arg(argv, 'memo', '') }
    : {};
  if (executor === 'manual') {
    const meta = startJob({ kind, projectId, projectDir, vars, executor });
    console.log(`\n== 작업 ${meta.job_id} (${kind}) · ${projectId} · manual: 준비됨 ==`);
    console.log(`작업 폴더: ${meta.jobDir}`);
    console.log(`명령 실행 시 환경변수: CARDNEWS_MODE=service CARDNEWS_JOB_ID=${meta.job_id} CARDNEWS_JOB_KIND=${kind}`);
    console.log('이 폴더를 작업 위치로 삼아 아래 지시문대로 작업하고, 마지막 결과 보고를 파일로 저장한 뒤:');
    console.log(`  npm run job -- finish ${meta.job_id} --report <결과 보고 파일>`);
    console.log(`\n----- 지시문 -----\n${meta.prompt}\n------------------`);
    return;
  }
  const result = await runJob({
    kind,
    projectId,
    projectDir,
    vars,
    keep: argv.includes('--keep'),
    maxBudgetUsd: arg(argv, 'budget') ? Number(arg(argv, 'budget')) : undefined,
    maxTurns: arg(argv, 'max-turns') ? Number(arg(argv, 'max-turns')) : undefined,
    model: arg(argv, 'model'),
  });
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { printResult, loadEnv };
