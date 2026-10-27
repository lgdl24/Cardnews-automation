// 과정 지표 (scripts/lib/analysis.js): 시간은 AI 작업 시간만 셈 (2026-10-27)
// 사람이 확인·대기한 시간(다른 제품 작업·자리 비움이 섞임)은 총 제작 시간에 넣지 않음
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, PHASES } = require('../scripts/lib/analysis');

const at = (min) => new Date(Date.UTC(2026, 9, 27, 0, 0) + min * 60000).toISOString();
const ev = (min, event, fields = {}) => ({ ts: at(min), event, project_id: 'p', job_id: null, skill_version: 'v1', ...fields });

test('총 제작 시간 = AI 작업 시간 합, 작업 사이 대기·확인 시간은 빠짐', () => {
  const events = [
    ev(0, 'input_submitted', { form_started_at: at(-20) }),
    ev(1, 'job_started', { job_id: 'j1', kind: 'plan' }),
    ev(3, 'job_finished', { job_id: 'j1', kind: 'plan', ok: true }),
    // 다른 제품 작업을 보느라 40분 대기
    ev(43, 'plan_approved', { approved_by: 'human' }),
    ev(43, 'job_started', { job_id: 'j2', kind: 'copy' }),
    ev(47, 'job_finished', { job_id: 'j2', kind: 'copy', ok: true }),
    ev(60, 'revision_requested', { stage: 'final', types: ['LEN'], cards: [2] }),
    ev(60, 'job_started', { job_id: 'j3', kind: 'revise' }),
    ev(61, 'job_finished', { job_id: 'j3', kind: 'revise', ok: true }),
    ev(90, 'final_approved', { approved_by: 'human' }),
  ];
  const s = summarize(events, { cardCount: 5 });
  assert.deepEqual(Object.keys(PHASES), ['plan_job', 'copy_job', 'revise_job']);
  assert.deepEqual(s.phases, { plan_job: 2, copy_job: 4, revise_job: 1 });
  assert.equal(s.total_minutes, 7);
  assert.equal(s.ai_minutes, 7);
  assert.equal(s.human_minutes, undefined, '사람 검토 시간은 없앰');
  assert.equal(s.complete, true);
  assert.equal(s.revision_rounds, 1);
});

test('시간을 잰 작업이 없으면 총 제작 시간은 null', () => {
  const s = summarize([ev(0, 'input_submitted'), ev(5, 'job_started', { job_id: 'j1', kind: 'plan' })]);
  assert.equal(s.total_minutes, null);
  assert.equal(s.complete, false);
});
