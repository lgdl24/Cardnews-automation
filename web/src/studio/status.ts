// 작업실 상태를 사람이 읽는 말로 — 목록·상세·진행 패널이 같은 기준을 씀
// 서버가 준 값(단계·작업 상태·마지막 작업 결과)만 쓰고, 퍼센트·예상 시간은 만들지 않음
import type { JobKind, ProductDetail, ProductSummary } from './api';

export type Tone = 'neutral' | 'running' | 'queued' | 'review' | 'done' | 'failed';
export interface WorkStatus {
  tone: Tone;
  label: string;
  /** 목록에서 누르면 할 일 */
  next: string;
  filter: 'input' | 'review' | 'running' | 'failed' | 'approved';
}

const KIND_SHORT: Record<JobKind, string> = { plan: '구성안', copy: '카드 만들기', revise: '수정' };

export function workStatus(p: ProductSummary): WorkStatus {
  if (p.running) return { tone: 'running', label: '작업 중', next: '진행 보기', filter: 'running' };
  if (p.queued) return { tone: 'queued', label: p.queue_position ? `대기 ${p.queue_position}번째` : '대기 중', next: '대기 확인', filter: 'running' };
  if (p.last_job && !p.last_job.ok && p.stage !== 'approved') {
    return { tone: 'failed', label: `${p.last_job.kind ? KIND_SHORT[p.last_job.kind] : '작업'} 실패`, next: '원인 확인', filter: 'failed' };
  }
  if (p.stage === 'input') return { tone: 'neutral', label: '입력 완료', next: '구성안 만들기', filter: 'input' };
  if (p.stage === 'plan') return { tone: 'review', label: '구성안 검토', next: '구성안 검토', filter: 'review' };
  if (p.stage === 'copy') return { tone: 'review', label: '카드 검토', next: '카드 검토', filter: 'review' };
  return { tone: 'done', label: '승인 완료', next: '결과 보기', filter: 'approved' };
}

/** 실패 코드 → 무엇이 문제였고 어떻게 다시 하는지 */
const ERROR_INFO: Record<string, { title: string; hint: string }> = {
  INPUT_MISSING: { title: '입력 자료에 빠진 항목이 있어요', hint: '입력 고치기에서 빠진 항목을 채운 뒤 다시 만들어 주세요.' },
  CHECK_FAILED: { title: '입력 확인을 통과하지 못했어요', hint: '입력 확인 결과의 오류를 고친 뒤 다시 만들어 주세요.' },
  PARSE_ERROR: { title: '카드 데이터를 읽지 못했어요', hint: '같은 작업을 다시 시작해 보세요. 기존 결과는 그대로예요.' },
  SCHEMA_ERROR: { title: '카드 데이터 형식이 규격과 달라요', hint: '자동 수정(최대 2회) 뒤에도 남았어요. 다시 시작하거나 수정 요청으로 해당 카드를 지정해 주세요.' },
  EVIDENCE_ERROR: { title: '원문 근거와 맞지 않는 문구가 남았어요', hint: '수정 요청에서 해당 카드를 고르고 원문에 맞게 고쳐 달라고 요청해 주세요.' },
  CHAR_LIMIT: { title: '글자 수 기준을 넘는 문구가 남았어요', hint: '수정 요청에서 해당 카드와 ‘길이’ 유형을 골라 주세요.' },
  OVERFLOW: { title: '카드 안에서 글자가 넘쳤어요', hint: '수정 요청에서 해당 카드와 ‘길이’ 유형을 골라 주세요.' },
  USAGE_LIMIT: { title: 'Claude 사용량 한도에 걸렸어요', hint: '한도가 풀린 뒤 같은 작업을 다시 시작해 주세요.' },
  RUN_ERROR: { title: 'Claude Code를 실행하다 오류가 났어요', hint: '터미널에서 claude auth status로 로그인 상태를 확인하고 다시 시작해 주세요.' },
  NO_RESULT: { title: 'Claude Code가 결과 없이 끝났어요', hint: '같은 작업을 다시 시작해 보세요.' },
  ERROR_MAX_TURNS: { title: '정해진 단계 수 안에 작업이 끝나지 않았어요', hint: '같은 작업을 다시 시작해 보세요. 반복되면 입력 자료 길이를 확인해 주세요.' },
  STOPPED: { title: 'Claude가 작업을 중단했어요', hint: '아래 결과 보고의 알림을 확인하고 필요한 부분을 고친 뒤 다시 시작해 주세요.' },
  VERIFY_FAILED: { title: '결과 재검증을 통과하지 못해 반영하지 않았어요', hint: '같은 작업을 다시 시작해 보세요. 기존 결과는 그대로예요.' },
};
export function errorInfo(code: string | null | undefined) {
  return (code && ERROR_INFO[code]) || { title: '작업이 끝나지 못했어요', hint: '결과 보고를 확인하고 다시 시작해 주세요.' };
}

export function formatElapsed(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m ? `${m}분 ${String(s % 60).padStart(2, '0')}초` : `${s}초`;
}
export function formatAgo(sec: number) {
  if (sec < 5) return '방금';
  if (sec < 60) return `${Math.round(sec)}초 전`;
  return `${Math.floor(sec / 60)}분 전`;
}

/** 제작 단계 표시: 입력 → 구성안 검토 → 카드 만들기 → 카드 검토 → 승인·내보내기 */
export type StepState = 'done' | 'current' | 'running' | 'queued' | 'failed' | 'todo';
export const STEP_NAMES = ['입력', '구성안', '카드 만들기', '카드 검토', '승인·내보내기'] as const;

export function stepStates(p: ProductDetail): StepState[] {
  const a = p.actions;
  const job = p.job;
  const busy: StepState | null = a.running ? (a.job_state === 'queued' || job?.status === 'queued' ? 'queued' : 'running') : null;
  const failed = !a.running && job && job.status === 'done' && job.ok === false ? job : null;
  const s: StepState[] = ['todo', 'todo', 'todo', 'todo', 'todo'];
  const fill = (n: number) => { for (let i = 0; i < n; i++) s[i] = 'done'; };
  if (p.stage === 'input') {
    fill(1);
    s[1] = busy ?? (failed ? 'failed' : 'todo');
    if (!busy && !failed) { s[0] = 'current'; }
  } else if (p.stage === 'plan') {
    const copyPhase = Boolean(a.can_copy) || (job?.kind === 'copy' && (busy || failed));
    if (copyPhase) { fill(2); s[2] = busy ?? (failed ? 'failed' : 'current'); }
    else { fill(1); s[1] = busy ?? (failed ? 'failed' : 'current'); }
  } else if (p.stage === 'copy') {
    fill(3); s[3] = busy ?? (failed ? 'failed' : 'current');
  } else {
    fill(4); s[4] = p.export.exported_at ? 'done' : 'current';
  }
  return s;
}
