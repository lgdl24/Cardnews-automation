// 제작 기록(이벤트) 저장·읽기
// 형식은 docs/event-log-spec.md. 제품(또는 평가 실행) 폴더의 products/<제품ID>/log.jsonl에 한 줄씩 저장합니다.
const fs = require('fs');
const { paths, readJson } = require('./common');

const EVENTS = [
  'input_submitted', 'job_started', 'job_finished', 'validate_result',
  'plan_approved', 'final_approved', 'revision_requested',
];
const JOB_KINDS = ['plan', 'copy', 'revise'];

// 평가 모드: 평가 실행기(npm run eval)가 claude -p를 실행할 때 CARDNEWS_MODE=eval을 넘김
const isEvalMode = () => process.env.CARDNEWS_MODE === 'eval';

function skillVersion() {
  try {
    return readJson(paths.config('skill-version.json')).version;
  } catch {
    return null;
  }
}

const logFile = (id) => paths.product(id, 'log.jsonl');
const jobFile = (id) => paths.product(id, '.job.json');

// 진행 중인 작업: 평가 모드는 평가 실행기가 넘긴 환경변수, 대화 모드는 job_started가 만든 .job.json
function currentJob(id) {
  if (process.env.CARDNEWS_JOB_ID) {
    return { job_id: process.env.CARDNEWS_JOB_ID, kind: process.env.CARDNEWS_JOB_KIND || null };
  }
  try {
    return JSON.parse(fs.readFileSync(jobFile(id), 'utf8'));
  } catch {
    return null;
  }
}

function startJob(id, kind) {
  const ts = new Date();
  const d = ts.toISOString().replace(/\D/g, ''); // 20261010030031745
  const rand = Math.random().toString(36).slice(2, 5);
  const job = { job_id: `cli-${d.slice(0, 8)}-${d.slice(8, 14)}-${rand}`, kind, started_at: ts.toISOString() };
  fs.writeFileSync(jobFile(id), JSON.stringify(job, null, 2));
  return job;
}

function endJob(id) {
  if (fs.existsSync(jobFile(id))) fs.unlinkSync(jobFile(id));
}

function appendEvent(id, event, fields = {}) {
  if (!EVENTS.includes(event)) throw new Error(`알 수 없는 이벤트: ${event}`);
  const job = currentJob(id);
  const entry = {
    ts: new Date().toISOString(),
    event,
    project_id: id,
    job_id: fields.job_id !== undefined ? fields.job_id : (job ? job.job_id : null),
    skill_version: skillVersion(),
    ...fields,
  };
  fs.appendFileSync(logFile(id), JSON.stringify(entry) + '\n');
  return entry;
}

function readEvents(id) {
  const file = logFile(id);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`log.jsonl ${i + 1}번째 줄을 읽을 수 없어요`);
      }
    })
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

// 검증 리포트 → validate_result 필드
function resultFields(check, report, extra = {}) {
  const cards = new Set();
  for (const e of report.errors) {
    const m = String(e.where).match(/^(\d+)번 카드/);
    if (m) cards.add(Number(m[1]));
  }
  return {
    check,
    ok: report.errors.length === 0,
    error_codes: [...new Set(report.errors.map((e) => e.code))],
    error_count: report.errors.length,
    cards_with_errors: [...cards].sort((a, b) => a - b),
    caution_count: report.cautions.length,
    ...extra,
  };
}

// --no-log 옵션 또는 CARDNEWS_NO_LOG=1이면 기록하지 않음 (서버의 재검증 등)
const shouldLog = (argv) => !argv.includes('--no-log') && process.env.CARDNEWS_NO_LOG !== '1';

module.exports = {
  EVENTS, JOB_KINDS, isEvalMode, skillVersion, currentJob, startJob, endJob,
  appendEvent, readEvents, resultFields, shouldLog,
};
