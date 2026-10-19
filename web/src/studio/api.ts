// 로컬 제작 API 클라이언트 (웹 모드) — scripts/lib/studio-api.js
// npm run studio(개발 서버)에서만 응답함. 배포된 사이트에서는 isAvailable이 false
import { useCallback, useEffect, useState } from 'react';
import type { Analysis, CardCopy, Role, Source, SourceId, TemplateId } from '../data/types';

const BASE = `${import.meta.env.BASE_URL}api/studio`;

export type StudioStage = 'input' | 'plan' | 'copy' | 'approved';
export type JobKind = 'plan' | 'copy' | 'revise';

export interface FormField {
  key: string;
  required: boolean;
  type: 'text' | 'paragraph' | 'list' | 'images' | 'number';
  guide: string;
  example?: string[];
  usage?: string[];
  min?: number;
  max?: number;
}
export interface FormDef {
  groups: { title: string; source: boolean; fields: FormField[] }[];
}
export interface RevisionType {
  code: string;
  label: string;
  example: string;
}
export interface ClaudeInfo {
  installed: boolean;
  version: string | null;
  logged_in: boolean | null;
}
export interface Issue {
  code?: string;
  where: string;
  message: string;
}
export interface Report {
  errors: Issue[];
  warnings: Issue[];
  cautions: Issue[];
}
export interface ProgressItem {
  ts: string;
  type: 'init' | 'tool' | 'text';
  tool?: string;
  detail?: string;
  text?: string;
  model?: string;
}
export interface ResultReport {
  결과: string | null;
  단계: string | null;
  오류: string[];
  알림: string[];
}
export interface Revision {
  stage: 'plan' | 'final';
  cards: number[];
  types: string[];
  memo: string;
}
export interface StudioJob {
  status: 'running' | 'done';
  product_id?: string;
  job_id: string | null;
  kind: JobKind;
  started_at: string;
  finished_at?: string;
  progress: ProgressItem[];
  revision?: Revision | null;
  ok?: boolean;
  error_code?: string | null;
  crash?: string | null;
  report?: ResultReport | null;
  verify?: { ok: boolean; reasons: string[]; validate?: string } | null;
}
export interface StudioStatus {
  ok: true;
  mode: 'web';
  claude: ClaudeInfo;
  job: StudioJob | null;
  form: FormDef;
  revision_types: RevisionType[];
}
export interface ProductSummary {
  id: string;
  name: string;
  brand: string | null;
  stage: StudioStage;
  updated_at: string;
  running: boolean;
}
export interface StudioCard {
  no: number;
  role: Role;
  template: TemplateId;
  intent: string;
  image: string | null;
  evidence: SourceId[];
  copy?: CardCopy;
}
export interface Actions {
  running: boolean;
  last_job_ok: boolean | null;
  can_edit_input: boolean;
  can_plan: boolean;
  can_approve_plan: boolean;
  can_revise_plan: boolean;
  can_copy: boolean;
  can_approve_final: boolean;
  can_revise_final: boolean;
  can_export: boolean;
}
export interface StudioEvent {
  ts: string;
  event: string;
  job_id: string | null;
  kind?: JobKind;
  ok?: boolean;
  error_code?: string | null;
  check?: 'data' | 'layout';
  error_codes?: string[];
  cards_with_errors?: number[];
  stage?: string | null;
  cards?: number[];
  types?: string[];
  memo?: string;
  approved_by?: 'human' | 'eval';
}
export interface ProductDetail extends ProductSummary {
  input: {
    values: Record<string, string | string[]>;
    images: { file: string; desc: string; source: string; usage: string }[];
    card_count: number | null;
  };
  check: Report;
  cards: { stage: StudioStage; sources: Source[]; analysis: Analysis; cards: StudioCard[] } | null;
  validation: (Report & { quality: { coverage: number | null; evidence_rate: number | null; caution: { total: number } | null } | null }) | null;
  pngs: { file: string; v: number }[];
  events: StudioEvent[];
  job: StudioJob | null;
  export: { listed: boolean; exported_at: string | null };
  actions: Actions;
}

export class StudioError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function studioFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const res = await fetch(BASE + path, {
    method,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-studio': '1' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) throw new StudioError('로컬 제작 API가 꺼져 있어요', res.status);
  const data = await res.json();
  if (!res.ok) throw new StudioError(data.error ?? `요청 실패 (HTTP ${res.status})`, res.status);
  return data as T;
}

export const pngUrl = (id: string, file: string, v?: number) => `${BASE}/products/${encodeURIComponent(id)}/files/png/${file}${v ? `?v=${v}` : ''}`;
export const imageUrl = (id: string, file: string) => `${BASE}/products/${encodeURIComponent(id)}/files/images/${encodeURIComponent(file)}`;

// ── 로컬 제작 API가 켜져 있는지 (한 번만 확인, 화면 여러 곳에서 공유)
let statusPromise: Promise<StudioStatus | null> | null = null;
export function loadStudioStatus(force = false): Promise<StudioStatus | null> {
  if (!statusPromise || force) statusPromise = studioFetch<StudioStatus>('/status').catch(() => null);
  return statusPromise;
}

export function useStudioStatus() {
  const [status, setStatus] = useState<StudioStatus | null | undefined>(undefined);
  const reload = useCallback(() => {
    loadStudioStatus(true).then(setStatus);
  }, []);
  useEffect(() => {
    let alive = true;
    loadStudioStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  /** undefined = 확인 중, null = 꺼져 있음(배포 사이트 등) */
  return { status, reload };
}

/** 주기적으로 다시 불러오기 (작업 진행 중 화면) */
export function usePolling<T>(load: () => Promise<T>, deps: unknown[], intervalMs: (data: T | undefined) => number | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    load().then(
      (d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        const next = intervalMs(d);
        if (next) timer = setTimeout(() => setTick((t) => t + 1), next);
      },
      (e: Error) => alive && setError(e),
    );
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // load·intervalMs는 deps로 대표됨
  }, [...deps, tick]);
  return { data, error, refresh, setData };
}

export const STAGE_LABEL: Record<StudioStage, string> = { input: '입력', plan: '구성안', copy: '문구', approved: '승인 완료' };
export const JOB_LABEL: Record<JobKind, string> = { plan: '구성안 작업', copy: '문구·출력 작업', revise: '수정 작업' };

/** 진행 기록 한 줄을 사람이 읽는 말로 */
export function describeProgress(p: ProgressItem): string {
  if (p.type === 'init') return `Claude Code 시작${p.model ? ` (${p.model})` : ''}`;
  if (p.type === 'text') return p.text ?? '';
  const d = p.detail ?? '';
  if (p.tool === 'Bash') {
    if (/npm run check/.test(d)) return '입력 확인';
    if (/npm run validate/.test(d)) return '데이터 검증';
    if (/npm run render .*--card/.test(d)) return `카드 다시 출력 (${d.match(/--card\s+(\S+)/)?.[1] ?? ''}번)`;
    if (/npm run render/.test(d)) return '카드 출력·레이아웃 점검';
    return `명령 실행: ${d}`;
  }
  if (p.tool === 'Write' || p.tool === 'Edit') return /cards\.json/.test(d) ? '카드 데이터(cards.json) 저장' : `파일 쓰기: ${d}`;
  if (p.tool === 'Read') return `자료 읽기: ${d.split('/').slice(-2).join('/')}`;
  if (p.tool === 'Skill') return `작업 절차(Skill) 사용: ${d}`;
  return `${p.tool ?? '도구'} ${d}`;
}
