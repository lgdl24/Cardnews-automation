// 제작 기록: 이벤트를 products/<제품ID>/log.jsonl에 한 줄씩 추가하고, 과정·품질 지표를 요약
// 형식: docs/event-log-spec.md
//
// 사용법 (대화 모드)
//   node scripts/log.js <제품ID> input_submitted
//   node scripts/log.js <제품ID> job_started --kind plan|copy|revise
//   node scripts/log.js <제품ID> job_finished --ok true|false [--error 오류코드] [--memo "..."]
//   node scripts/log.js <제품ID> plan_approved | final_approved
//   node scripts/log.js <제품ID> revision_requested --stage plan|final --types LEN,TONE [--card 2,3] --memo "..."
//   node scripts/log.js <제품ID> --summary [--json]
//
// validate_result는 validate·render 스크립트가 자동으로 남깁니다.
// 평가 모드(CARDNEWS_MODE=eval)에서는 평가 실행기가 작업·승인 이벤트를 기록하므로 이 명령은 기록하지 않습니다.
const fs = require('fs');
const { paths, readJson, requireProductId } = require('./lib/common');
const {
  EVENTS, JOB_KINDS, isEvalMode, currentJob, startJob, endJob, appendEvent, readEvents,
} = require('./lib/events');
const { summarize, PHASES } = require('./lib/analysis');
const { pct } = require('./lib/metrics');

function parseOptions(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else { opts[key] = next; i += 1; }
  }
  return opts;
}

const fail = (msg) => { console.error(msg); process.exit(2); };
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const num = (v) => (v === undefined || v === true ? undefined : Number(v));

function cardCount(id) {
  try {
    return readJson(paths.product(id, 'cards.json')).cards.length;
  } catch {
    return null;
  }
}

function printSummary(id, s) {
  const v = (x, unit = '') => (x === null || x === undefined ? '-' : `${x}${unit}`);
  console.log(`\n== 제작 요약: ${id} (규칙 ${s.skill_versions.join(', ') || '-'}) ==`);
  console.log(`상태: ${s.complete ? '최종 승인 완료' : '진행 중 (최종 승인 전)'}`);
  console.log(`총 제작 시간 ${v(s.total_minutes, '분')} · AI 처리 ${v(s.ai_minutes, '분')} · 사람 검토 ${v(s.human_minutes, '분')}`);
  console.log('\n단계\t소요(분)');
  for (const [k, label] of Object.entries(PHASES)) console.log(`${label}\t${s.phases[k]}`);

  console.log('\n작업\t종류\t결과\t소요(분)\t1회 통과\t자동 수정');
  for (const j of s.jobs) {
    const ok = j.ok === null ? '진행 중' : j.ok ? '완료' : `중단${j.error_code ? `(${j.error_code})` : ''}`;
    const fp = j.first_pass === null ? '-' : j.first_pass ? 'O' : 'X';
    console.log(`${j.job_id}\t${j.kind}\t${ok}\t${v(j.minutes)}\t${fp}\t${j.auto_fix_count}`);
  }
  if (s.checks_outside_jobs) console.log(`(작업 기록 밖에서 실행한 검사 ${s.checks_outside_jobs}회는 위 표에 포함되지 않아요)`);

  const types = Object.entries(s.revision_types).map(([k, n]) => `${k} ${n}`).join(', ') || '없음';
  console.log(`\n구성안 수정 요청 ${s.plan_revisions}회 · 카드 수정 요청 ${s.revision_rounds}회 · 수정 카드 비율 ${pct(s.revised_card_ratio)}`);
  console.log(`수정 유형: ${types}`);

  const q = s.quality;
  console.log('\n-- 테스트·제작 기록에 옮길 값 --');
  console.log(`Skill 버전: ${s.skill_versions.join(', ') || '-'}`);
  console.log(`소요 시간(분): ${v(s.total_minutes)}`);
  console.log(`수정 횟수: ${s.plan_revisions + s.revision_rounds}`);
  console.log(`원문 커버리지(%): ${q && q.coverage !== null ? Math.round(q.coverage * 100) : '-'}`);
  console.log(`근거 연결률(%): ${q && q.evidence_rate !== null ? Math.round(q.evidence_rate * 100) : '-'}`);
  console.log(`자동 수정 횟수: ${s.auto_fix_total}`);
  console.log(`1회 통과: ${s.first_pass === null ? '-' : s.first_pass ? '예' : '아니오'}`);
  const tokens = s.input_tokens === null && s.output_tokens === null ? null : (s.input_tokens || 0) + (s.output_tokens || 0);
  console.log(`토큰: ${v(tokens)} · 비용(USD): ${v(s.cost_usd)}${tokens === null ? '  (CLI에서는 기록되지 않아요)' : ''}`);
}

const argv = process.argv.slice(2);
const id = requireProductId(argv);
if (!fs.existsSync(paths.product(id))) fail(`products/${id} 폴더가 없어요`);
const opts = parseOptions(argv);

if (opts.summary) {
  let events;
  try {
    events = readEvents(id);
  } catch (e) {
    fail(e.message);
  }
  const s = summarize(events, { cardCount: cardCount(id) });
  if (opts.json) console.log(JSON.stringify({ product_id: id, ...s }, null, 2));
  else printSummary(id, s);
  process.exit(0);
}

const event = argv.find((a, i) => i > 0 && !a.startsWith('--') && !argv[i - 1].startsWith('--'));
if (!EVENTS.includes(event)) fail(`이벤트: ${EVENTS.join(', ')}\n요약: node scripts/log.js <제품ID> --summary`);
if (event === 'validate_result') fail('validate_result는 validate·render 스크립트가 자동으로 기록해요');
if (isEvalMode()) {
  console.log('평가 모드에서는 평가 실행기가 작업·승인 이벤트를 기록해요. 기록하지 않았어요.');
  process.exit(0);
}

const memo = typeof opts.memo === 'string' ? opts.memo : undefined;
const fields = {};

switch (event) {
  case 'job_started': {
    if (!JOB_KINDS.includes(opts.kind)) fail(`--kind는 ${JOB_KINDS.join(' / ')} 중 하나예요`);
    const open = currentJob(id);
    if (open) fail(`진행 중인 작업이 있어요 (${open.job_id}, ${open.kind}). 먼저 job_finished를 기록해 주세요`);
    const job = startJob(id, opts.kind);
    Object.assign(fields, { job_id: job.job_id, kind: job.kind });
    break;
  }
  case 'job_finished': {
    const job = currentJob(id);
    if (!job) fail('진행 중인 작업이 없어요. job_started를 먼저 기록해 주세요');
    if (opts.ok !== 'true' && opts.ok !== 'false') fail('--ok true 또는 --ok false 를 붙여 주세요');
    Object.assign(fields, {
      job_id: job.job_id,
      kind: job.kind,
      ok: opts.ok === 'true',
      error_code: typeof opts.error === 'string' ? opts.error : undefined,
      input_tokens: num(opts['input-tokens']),
      output_tokens: num(opts['output-tokens']),
      cost_usd: num(opts.cost),
    });
    break;
  }
  case 'revision_requested': {
    if (!['plan', 'final'].includes(opts.stage)) fail('--stage는 plan(구성안) 또는 final(카드 검토)이에요');
    const codes = readJson(paths.config('revision-types.json')).types.map((t) => t.code);
    const types = list(opts.types);
    if (!types.length || types.some((c) => !codes.includes(c))) fail(`--types는 ${codes.join(', ')} 중 하나 이상 (쉼표로 구분)`);
    const cards = list(opts.card).map(Number);
    if (cards.some((n) => !Number.isInteger(n) || n < 1)) fail('--card는 카드 번호예요 (예: 2 또는 2,3)');
    Object.assign(fields, { stage: opts.stage, cards, types });
    break;
  }
  case 'input_submitted':
    if (typeof opts['form-started-at'] === 'string') fields.form_started_at = opts['form-started-at'];
    break;
  default:
    break;
}
if (memo) fields.memo = memo;
for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];

const entry = appendEvent(id, event, fields);
if (event === 'job_finished') endJob(id);
console.log(`기록됨: ${event}${entry.job_id ? ` (${entry.job_id})` : ''}`);
