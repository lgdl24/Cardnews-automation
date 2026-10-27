// 과정 지표 계산 (데이터 분석 A1·A3): 이벤트 기록 → 작업별 시간, 수정, 자동 수정, 1회 통과, 토큰·비용
// 정의는 docs/event-log-spec.md '과정 지표'
// 시간은 AI 작업 시간만 셈 (2026-10-27): 사람이 확인·대기한 시간은 다른 제품 작업·자리 비움이 섞여 비교할 수 없어서 뺌
const { round } = require('./metrics');

const PHASES = {
  plan_job: '구성안 작업',
  copy_job: '문구·출력 작업',
  revise_job: '수정 작업',
};
const JOB_PHASE = { plan: 'plan_job', copy: 'copy_job', revise: 'revise_job' };

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
  let finalApprovedAt = null;

  const t = (e) => new Date(e.ts).getTime();

  for (const e of events) {
    if (e.skill_version) versions.add(e.skill_version);

    switch (e.event) {
      case 'job_started':
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
        break;
      }
      case 'validate_result': {
        const job = e.job_id && jobs.get(e.job_id);
        (job ? job.results : outside).push(e);
        break;
      }
      case 'final_approved':
        finalApprovedAt = t(e);
        break;
      case 'revision_requested':
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
  const phases = Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, toMin(v)]));
  const aiMs = Object.values(ms).reduce((a, v) => a + v, 0);
  const timedJobs = jobList.some((j) => j.minutes !== null);

  return {
    skill_versions: [...versions],
    complete: finalApprovedAt !== null,
    // 총 제작 시간 = AI 작업 시간 합 (사람 확인·대기 시간 제외). 시간을 잰 작업이 없으면 null
    total_minutes: timedJobs ? toMin(aiMs) : null,
    ai_minutes: timedJobs ? toMin(aiMs) : null,
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
