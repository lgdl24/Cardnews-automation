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
  type: 'text' | 'paragraph' | 'list' | 'images' | 'number' | 'choice' | 'url';
  guide: string;
  example?: string[];
  usage?: string[];
  /** 이미지 용도 (제품·제형·배경, #74) */
  kinds?: string[];
  options?: string[];
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
  /** queued: 다른 제품 작업이 끝나길 기다리는 중 (대기열) */
  status: 'running' | 'done' | 'queued';
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
  /** 대기 중일 때: 대기열 순서(1부터), 들어간 시각, 지금 돌고 있는 작업 */
  position?: number;
  queued_at?: string;
  ahead?: { product_id: string; name: string; kind: JobKind } | null;
}
/** 작업실 전체 작업: 지금 도는 작업 하나 + 대기열 */
export interface JobsOverview {
  running: { product_id: string; name: string; kind: JobKind; started_at: string } | null;
  queue: { product_id: string; name: string; kind: JobKind; queued_at: string; position: number }[];
}
export interface StudioStatus {
  ok: true;
  mode: 'web';
  claude: ClaudeInfo;
  job: StudioJob | null;
  jobs?: JobsOverview;
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
  queued?: boolean;
  queue_position?: number | null;
}
export interface StudioCard {
  no: number;
  role: Role;
  template: TemplateId;
  intent: string;
  /** cards.json 그대로라 없는 필드가 있음: 표지·마무리 카드는 evidence가 없어도 됨 (cards.schema.json) */
  image?: string | null;
  evidence?: SourceId[];
  copy?: CardCopy;
}
export interface Actions {
  /** 이 제품이 작업 중이거나 대기 중 */
  running: boolean;
  job_state?: 'running' | 'queued' | null;
  /** 지금 작업을 시작하면 앞에서 기다릴 작업 수 (0이면 바로 시작) */
  wait_ahead?: number;
  last_job_ok: boolean | null;
  can_edit_input: boolean;
  /** 승인된 문구 그대로 카드 이미지만 다시 출력 (output/이 없는 새 폴더·다른 컴퓨터) */
  can_render?: boolean;
  can_ai_card?: boolean;
  can_ai_bg?: boolean;
  ai_busy?: boolean;
  can_plan: boolean;
  can_approve_plan: boolean;
  can_revise_plan: boolean;
  /** 구성안 승인 전 디자인 묶음 바꾸기 (#74) */
  can_select_design?: boolean;
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
  design?: string;
  from?: string | null;
}
/** 디자인 묶음 (#74): 지금 쓰는 묶음, 정한 곳, 구성안에서 고른 것, 목록 */
export interface DesignCatalogItem {
  id: string;
  name: string;
  summary: string;
  fits: string[];
  avoid?: string[];
  needs: { product: string; background: string };
  version: string;
  color_mode: string;
}
export interface DesignInfo {
  id: string;
  source: 'input' | 'cards' | 'default';
  auto: boolean;
  selected: { id: string; selected_by: 'claude' | 'human'; reason: string } | null;
  catalog: DesignCatalogItem[];
}
export interface ProductDetail extends ProductSummary {
  input: {
    values: Record<string, string | string[]>;
    images: { file: string; desc: string; source: string; usage: string; kind?: string }[];
    card_count: number | null;
  };
  check: Report;
  cards: { stage: StudioStage; sources: Source[]; analysis: Analysis; cards: StudioCard[]; brand_mood?: BrandMood } | null;
  validation: (Report & { quality: { coverage: number | null; evidence_rate: number | null; caution: { total: number } | null } | null }) | null;
  pngs: { file: string; v: number }[];
  events: StudioEvent[];
  job: StudioJob | null;
  export: { listed: boolean; exported_at: string | null };
  actions: Actions;
  design?: DesignInfo;
  figma?: FigmaInfo;
  ai_card?: AiCardInfo | null;
  /** 무드 '브랜드'의 카드별 GPT 배경 (A안: 배경만 GPT, 글자는 코드) */
  ai_bg?: AiBgInfo | null;
  /** 브랜드 URL·상세페이지 스냅샷 상태 (입력에 브랜드 URL이 있을 때) */
  brand_page?: BrandInfo | null;
}

/** 피그마에서 직접 고치기: 연결 코드, 피그마 파일, 준비 시각, 피그마에서 돌려받은 카드 */
export interface FigmaInfo {
  code: string;
  file_url: string | null;
  /** 로컬 Claude Code의 피그마 연결로 바로 넣기 (꺼져 있으면 플러그인으로 가져오기) */
  auto_push?: boolean;
  push?: {
    running: boolean;
    ok: boolean | null;
    page_name: string | null;
    page_id: string | null;
    error: string | null;
    started_at: string;
    finished_at: string | null;
    progress: string[];
    page_url: string | null;
  } | null;
  prepared_at: string | null;
  edited: {
    received_at: string;
    page: string | null;
    cards: { file: string; png: string; v: number; changed: { name: string; before: string | null; after: string | null }[] }[];
  } | null;
}

/** AI 디자인 카드(첫·마지막 카드, GPT 이미지 + 원본 제품 잠금): 실행 상태와 카드별 결과 */
export interface AiCardTry {
  try: number;
  sec: number;
  ok?: boolean;
  diff?: number;
  shift?: [number, number];
  error?: string;
}
export interface AiCardInfo {
  auto: boolean;
  running: boolean;
  run: { card: number | null; auto: boolean; started_at: string; finished_at: string | null; ok: boolean | null; progress: string[] } | null;
  made_at: string | null;
  targets: number[];
  applied: number[];
  stale: number[];
  cards: {
    no: number;
    kind: 'cover' | 'closing';
    ok: boolean;
    file: string | null;
    text_checked: boolean;
    tries: AiCardTry[];
    v: number;
    applied: boolean;
    stale: boolean;
    template: { file: string; v: number } | null;
  }[];
}

/** 브랜드 상세페이지 스냅샷 (brand/snapshot.json) */
export interface BrandInfo {
  url: string;
  url_ok: boolean;
  snapshot: {
    ok: boolean;
    fetched_at: string;
    title: string | null;
    error: string | null;
    warnings: string[];
    colors: { hex: string; ratio: number }[];
    shots: { file: string; v: number }[];
  } | null;
}
/** cards.json brand_mood: 구성안 작업이 정한 브랜드 무드 */
export interface BrandMood {
  source: 'snapshot' | 'product_photo';
  summary: string;
  palette: Record<string, string>;
  tone: string;
  photo_style: string;
  scene: string;
  evidence: string[];
}
/** AI 배경 (scripts/ai-bg.js) 실행 상태와 카드별 결과 */
export interface AiBgInfo {
  auto: boolean;
  running: boolean;
  run: { card: number | null; auto: boolean; started_at: string; finished_at: string | null; ok: boolean | null; progress: string[] } | null;
  made_at: string | null;
  has_mood: boolean;
  stale: number[];
  cards: { no: number; template: string; ok: boolean; current: boolean; file: string | null; v: number; tries: { try: number; sec: number; error?: string }[] }[];
}
/** 자료로 입력 칸 채우기 결과 (POST /extract) */
export interface ExtractResult {
  values: Record<string, string | string[]>;
  missing: string[];
  warnings: string[];
  files: string[];
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
export const aiCardUrl = (id: string, file: string, v?: number) => `${BASE}/products/${encodeURIComponent(id)}/files/ai-card/${file}${v ? `?v=${v}` : ''}`;
export const figmaEditedUrl = (id: string, file: string, v?: number) => `${BASE}/products/${encodeURIComponent(id)}/files/figma-edited/${file}${v ? `?v=${v}` : ''}`;
export const aiBgUrl = (id: string, file: string, v?: number) => `${BASE}/products/${encodeURIComponent(id)}/files/ai-bg/${file}${v ? `?v=${v}` : ''}`;
export const brandShotUrl = (id: string, file: string, v?: number) => `${BASE}/products/${encodeURIComponent(id)}/files/brand/${file}${v ? `?v=${v}` : ''}`;
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
