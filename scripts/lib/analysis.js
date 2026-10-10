// 과정 지표 계산 (데이터 분석 A1·A3): 이벤트 기록 → 단계별 시간, 수정, 자동 수정, 1회 통과, 토큰·비용
// 정의는 docs/event-log-spec.md '과정 지표'
const { round } = require('./metrics');

const PHASES = {
  input: '입력',
  plan_job: '구성안 작업',
  plan_review: '구성안 확인',
  copy_job: '문구·출력 작업',
  final_review: '최종 검토',
  revise_job: '수정 작업',
};
const JOB_PHASE = { plan: 'plan_job', copy: 'copy_job', revise: 'revise_job' };
const AI_PHASES = ['plan_job', 'copy_job', 'revise_job'];
const HUMAN_PHASES = ['input', 'plan_review', 'final_review'];

const toMin = (ms) => round(ms / 60000, 1);

// 작업 하나의 검증 결과 → 1회 통과, 자동 수정 횟수
function judgeJob(results) {
  if (!results.length) return { first_pass: null, auto_fix_count: 0 };
  const firstData = results.find((r) => r.check === 'data');
  const firstLayout = results.find((r) => r.check === 'layout');
  const firstPass = (!firstData || firstData.ok) && (!firstLayout || firstLayout.ok);
  // 실패한 결과 뒤에 다시 검사가 있으면 그 사이에 한 번 고친 것으로 셈
  const autoFix = results.filter((r, i) => !r.ok && i < results.length - 1).length;
  return { first_pass: firstPass, auto_fix_count: autoFix };
}

function summarize(events, { cardCount = null } = {}) {
  const ms = Object.fromEntries(Object.keys(PHASES).map((k) => [k, 0]));
  const jobs = new Map();
  const outside = []; // 작업 밖에서 실행한 검사
  const revisions = [];
  const versions = new Set();
  let start = null;
  let finalApprovedAt = null;
  let planApproved = false;
  let waitingSince = null;

  const t = (e) => new Date(e.ts).getTime();
  const closeWaiting = (e) => {
    if (waitingSince === null) return;
    ms[planApproved ? 'final_review' : 'plan_review'] += t(e) - waitingSince;
    waitingSince = null;
  };

  for (const e of events) {
    if (e.skill_version) versions.add(e.skill_version);
    if (start === null) start = e.form_started_at ? new Date(e.form_started_at).getTime() : t(e);

    switch (e.event) {
      case 'input_submitted':
        if (e.form_started_at) ms.input += t(e) - new Date(e.form_started_at).getTime();
        break;
      case 'job_started':
        closeWaiting(e);
        jobs.set(e.job_id, { job_id: e.job_id, kind: e.kind, started: t(e), finished: null, ok: null, results: [] });
        break;
      case 'job_finished': {
        const job = jobs.get(e.job_id) || { job_id: e.job_id, kind: e.kind, started: null, results: [] };
        job.finished = t(e);
        job.ok = e.ok;
        job.error_code = e.error_code || null;
        job.input_tokens = e.input_tokens ?? null;
        job.output_tokens = e.output_tokens ?? null;
        job.cost_usd = e.cost_usd ?? null;
        jobs.set(e.job_id, job);
        if (job.started !== null && JOB_PHASE[job.kind]) ms[JOB_PHASE[job.kind]] += job.finished - job.started;
        waitingSince = t(e);
        break;
      }
      case 'validate_result': {
        const job = e.job_id && jobs.get(e.job_id);
        (job ? job.results : outside).push(e);
        break;
      }
      case 'plan_approved':
        closeWaiting(e);
        planApproved = true;
        break;
      case 'final_approved':
        closeWaiting(e);
        finalApprovedAt = t(e);
        break;
      case 'revision_requested':
        closeWaiting(e);
        revisions.push(e);
        break;
      default:
        break;
    }
  }

  const jobList = [...jobs.values()].map((j) => ({
    job_id: j.job_id,
    kind: j.kind,
    ok: j.ok,
    minutes: j.started !== null && j.finished !== null ? toMin(j.finished - j.started) : null,
    error_code: j.error_code || null,
    ...judgeJob(j.results),
    input_tokens: j.input_tokens ?? null,
    output_tokens: j.output_tokens ?? null,
    cost_usd: j.cost_usd ?? null,
  }));

  // 수정 요청
  const planRev = revisions.filter((r) => r.stage === 'plan');
  const finalRev = revisions.filter((r) => r.stage === 'final');
  const revisedCards = new Set(finalRev.flatMap((r) => r.cards || []));
  const typeCounts = {};
  for (const r of revisions) for (const code of r.types || []) typeCounts[code] = (typeCounts[code] || 0) + 1;

  // 품질 지표: 문구가 있는 마지막 데이터 검증 결과
  const allResults = events.filter((e) => e.event === 'validate_result' && e.check === 'data' && e.metrics);
  const latest = [...allResults].reverse().find((e) => e.stage === 'copy' || e.stage === 'approved') || allResults[allResults.length - 1];

  const sum = (key) => {
    const vals = jobList.map((j) => j[key]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const firstCopy = jobList.find((j) => j.kind === 'copy');
  const lastTs = events.length ? t(events[events.length - 1]) : null;
  const phases = Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, toMin(v)]));

  return {
    skill_versions: [...versions],
    complete: finalApprovedAt !== null,
    total_minutes: start !== null ? toMin((finalApprovedAt ?? lastTs) - start) : null,
    ai_minutes: toMin(AI_PHASES.reduce((a, k) => a + ms[k], 0)),
    human_minutes: toMin(HUMAN_PHASES.reduce((a, k) => a + ms[k], 0)),
    phases,
    plan_revision_requested: planRev.length > 0,
    plan_revisions: planRev.length,
    revision_rounds: finalRev.length,
    revised_card_ratio: cardCount ? round(revisedCards.size / cardCount) : null,
    revision_types: typeCounts,
    first_pass: firstCopy ? firstCopy.first_pass : null,
    auto_fix_total: jobList.reduce((a, j) => a + j.auto_fix_count, 0),
    input_tokens: sum('input_tokens'),
    output_tokens: sum('output_tokens'),
    cost_usd: sum('cost_usd'),
    quality: latest ? latest.metrics : null,
    jobs: jobList,
    checks_outside_jobs: outside.length,
  };
}

module.exports = { summarize, judgeJob, PHASES };
