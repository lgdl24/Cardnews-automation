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

/**
 * 실패 코드 → 무엇이 문제였고, 누가 무엇을 하면 되는지 (#125)
 * fix: input 입력 고치기 · revise 해당 카드 수정 요청 · retry 그대로 다시 · wait 기다렸다가 다시 · admin 작업실(관리자) 문제
 * 화면에는 이 쉬운 설명만 먼저 보이고, 오류 코드·Claude가 남긴 원문은 「자세한 기록」에 접어 둠
 */
export type FailFix = 'input' | 'revise' | 'retry' | 'wait' | 'admin';
export interface ErrorGuide { title: string; hint: string; fix: FailFix; short: string }
const ERROR_INFO: Record<string, ErrorGuide> = {
  INPUT_MISSING: { short: '빠진 항목', fix: 'input', title: '입력 자료에 빠진 항목이 있어요', hint: '아래 항목을 눌러 해당 칸을 채운 뒤 구성안을 다시 만들어 주세요.' },
  CHECK_FAILED: { short: '입력 확인 실패', fix: 'input', title: '입력 내용에 고칠 곳이 있어요', hint: '아래 항목을 눌러 해당 칸으로 가서 고친 뒤 다시 만들어 주세요.' },
  PARSE_ERROR: { short: '결과 형식 깨짐', fix: 'retry', title: '만든 결과를 정리하다 형식이 깨졌어요', hint: '일시적인 문제일 때가 많아요. 입력은 그대로 두고 다시 시작해 주세요.' },
  SCHEMA_ERROR: { short: '빠지거나 잘못된 칸', fix: 'revise', title: '카드에 비거나 잘못 채워진 칸이 남았어요', hint: 'Claude가 두 번 고쳐 봤지만 남았어요. 다시 시작하거나, 아래 카드를 골라 수정 요청을 보내 주세요.' },
  EVIDENCE_ERROR: { short: '자료에 없는 내용', fix: 'revise', title: '자료에 없는 내용이 카드에 들어갔어요', hint: '아래 카드를 골라 “자료에 있는 내용으로 고쳐 주세요”라고 수정 요청을 보내 주세요.' },
  CHAR_LIMIT: { short: '문구가 길어요', fix: 'revise', title: '카드 문구가 너무 길어요', hint: '아래 카드를 골라 ‘길이’ 유형으로 수정 요청을 보내 주세요.' },
  OVERFLOW: { short: '글자가 칸을 넘침', fix: 'revise', title: '카드 안에서 글자가 칸을 넘쳤어요', hint: '아래 카드를 골라 ‘길이’ 유형으로 수정 요청을 보내 주세요.' },
  USAGE_LIMIT: { short: '사용량 한도', fix: 'wait', title: 'Claude 사용량을 다 써서 잠시 기다려야 해요', hint: '보통 몇 시간 안에 풀려요. 그때 같은 작업을 다시 시작해 주세요. 입력은 그대로 두셔도 돼요.' },
  RUN_ERROR: { short: '실행 오류', fix: 'admin', title: '작업실에서 Claude를 실행하지 못했어요', hint: '입력 자료 문제가 아니에요. 다시 시작해 보고, 반복되면 관리자에게 아래 「자세한 기록」을 복사해 보내 주세요.' },
  NO_RESULT: { short: '결과 없음', fix: 'retry', title: 'Claude가 결과 없이 끝났어요', hint: '입력은 그대로 두고 다시 시작해 주세요.' },
  ERROR_MAX_TURNS: { short: '작업이 너무 길어짐', fix: 'retry', title: '작업이 너무 길어져 중간에 멈췄어요', hint: '다시 시작해 주세요. 반복되면 자료 글이 너무 길지 않은지 확인해 주세요.' },
  STOPPED: { short: 'Claude가 멈춤', fix: 'retry', title: 'Claude가 작업을 멈췄어요', hint: 'Claude가 더 진행하면 안 된다고 판단했어요. 아래 「자세한 기록」에서 이유를 볼 수 있어요. 고칠 곳이 없으면 그대로 다시 시작해 주세요.' },
  VERIFY_FAILED: { short: '결과 확인 실패', fix: 'retry', title: '결과를 다시 확인했더니 기준에 맞지 않아 반영하지 않았어요', hint: '다시 시작해 주세요. 기존 결과는 그대로예요.' },
};
const FALLBACK: ErrorGuide = { short: '실패', fix: 'retry', title: '작업이 끝나지 못했어요', hint: '다시 시작해 주세요. 반복되면 관리자에게 아래 「자세한 기록」을 보내 주세요.' };
export function errorInfo(code: string | null | undefined): ErrorGuide {
  return (code && ERROR_INFO[code]) || FALLBACK;
}
/** 오류 코드를 짧은 말로 (제작 기록·검증 목록) */
export const errorShort = (code: string | null | undefined) => (code && ERROR_INFO[code]?.short) || code || '';

// Claude가 멈춘 이유가 작업실 프로그램(명령·권한·스크립트) 쪽인지, 입력 쪽인지 — 결과 보고 글로 가늠
const SYSTEM_HINT = /npm |npm$|스크립트|명령|권한|package\.json|scripts\/|실행되지|실행 실패|Permission|ENOENT|node /i;
const INPUT_HINT = /INPUT_MISSING|빠진 항목|누락|비어 있|지시문/;

/** 작업 실패 안내: 오류 코드 + Claude가 남긴 글로 고칠 곳을 정함 */
export function failureGuide(code: string | null | undefined, reportLines: string[]): ErrorGuide {
  const base = errorInfo(code);
  if (code !== 'STOPPED') return base;
  const text = reportLines.join('\n');
  if (SYSTEM_HINT.test(text)) return { ...base, fix: 'admin', title: '작업실 프로그램 문제로 멈췄어요', hint: '입력 자료 문제가 아니에요. 관리자에게 아래 「자세한 기록」을 복사해 보내 주세요. 고친 뒤 다시 시작하면 돼요.' };
  if (INPUT_HINT.test(text)) return { ...base, fix: 'input', title: '입력 자료 때문에 멈췄어요', hint: '입력 고치기에서 빠지거나 이상한 내용을 고친 뒤 다시 만들어 주세요. 이유는 아래 「자세한 기록」에 있어요.' };
  return base;
}

const FIELD_LABEL: Record<string, string> = { badge: '배지', title: '제목', subtitle: '부제', caption: '설명', body: '본문', items: '항목', note: '참고', image: '이미지', role: '역할', template: '디자인', evidence: '근거', sources: '원문 인용' };
/** 'cards[2].copy.title'·'3번 카드.copy.title'·'copy.title' → '제목' */
export function fieldLabel(field: string | undefined) {
  if (!field) return '';
  const last = field.split(/[.\s]/).filter(Boolean).pop() ?? field;
  return FIELD_LABEL[last.replace(/\[\d+\]$/, '')] ?? '';
}

/** 결과 보고의 오류 줄('CHAR_LIMIT 3 copy.title') → { card: 3, text: '3번 카드 제목 — 문구가 길어요' } */
export function plainErrorLine(line: string): { card: number | null; code: string | null; text: string } {
  const m = line.match(/\b([A-Z][A-Z_]{4,})\b(?:\s+(\d+))?(?:\s+([\w.[\]]+))?/);
  if (!m) return { card: null, code: null, text: line };
  const code = m[1]!;
  const card = m[2] ? Number(m[2]) : null;
  const where = [card ? `${card}번 카드` : '', fieldLabel(m[3])].filter(Boolean).join(' ');
  return { card, code, text: `${where ? `${where} — ` : ''}${errorShort(code)}` };
}

/** 입력 확인 위치('## 제품명'·'이미지 main.png') → 입력 화면에서 이동할 칸 이름 */
export function inputFieldOf(where: string): string | null {
  const h = where.match(/##\s*([^>#]+?)\s*$/);
  if (h) return h[1]!.trim();
  if (/이미지|images?\b|\.(png|jpe?g)$/i.test(where)) return 'images';
  return null;
}
/**
 * 확인·검증 위치를 사람이 읽는 말로
 * '# 제품 > ## 주요 특징' → '주요 특징' · '3번 카드.copy.title' → '3번 카드 제목' · 'sources s2' → '원문 인용 s2'
 */
export function plainWhere(where: string) {
  const card = where.match(/^(\d+번 카드)\.?(.*)$/);
  if (card) return [card[1], fieldLabel(card[2] || undefined)].filter(Boolean).join(' ');
  if (/^sources\b/.test(where)) return where.replace(/^sources/, '원문 인용');
  return where.replace(/^.*>\s*/, '').replace(/#+\s*/g, '').trim();
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
