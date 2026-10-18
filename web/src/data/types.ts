// 웹 데이터 타입 — docs/web-data-spec.md v0.1, schemas/web-data/*.schema.json과 같은 모양
// 스키마를 바꾸면 이 파일도 함께 고치고, 두 사람이 리뷰한다 (공통 파일)

export type Kind = 'production' | 'example' | 'eval';
export type Stage = 'plan' | 'copy' | 'approved';
export type Role = 'cover' | 'feature' | 'usage' | 'detail' | 'closing';
export type TemplateId = 'cover' | 'image' | 'description';
export type SourceId = `S${number}`;
/** 0~1 비율. 계산할 수 없으면 null */
export type Rate = number | null;
export type LabelMap = Record<string, string>;

// ── index.json (V1)

export interface Labels {
  kinds: LabelMap;
  stages: LabelMap;
  roles: LabelMap;
  templates: LabelMap;
  revision_types: LabelMap;
  phases: LabelMap;
}

export interface EvalInfo {
  input_id: string;
  run_id: string;
  repeat: number;
  /** A8 비교판 이름. 기본 규칙이면 null */
  variant?: string | null;
}

export interface ProjectSummary {
  id: string;
  kind: Kind;
  label: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  stage: Stage;
  skill_version: string | null;
  card_count: number;
  updated_at: string | null;
  /** 데이터 폴더 기준 경로: projects/<id>/png/card-01.png */
  thumbnail: string;
  summary: {
    coverage: Rate;
    evidence_rate: Rate;
    caution_total: number | null;
    first_pass: boolean | null;
    total_minutes: number | null;
    revision_rounds: number;
  };
  eval: EvalInfo | null;
}

export interface WebIndex {
  spec_version: '0.1';
  exported_at: string;
  skill_version: string;
  labels: Labels;
  projects: ProjectSummary[];
}

// ── project.json (V2 · V4)

export interface Source {
  id: SourceId;
  section: string;
  quote: string;
}

export interface AnalysisItem {
  summary: string;
  evidence: SourceId[];
}

export interface Analysis {
  core_message: string;
  core_evidence: SourceId[];
  features: AnalysisItem[];
  usage: AnalysisItem[];
}

export interface Revision {
  ts: string;
  types: string[];
  memo: string;
}

export interface CharRow {
  field: string;
  /** items 필드는 항목 번호, 나머지는 null */
  index: number | null;
  chars: number;
  limit: number;
  ratio: number;
}

export interface Caution {
  term: string;
  category: string;
  in_source: boolean;
}

/** 템플릿별 문구 필드 (cards.schema.json). 화면은 필요한 필드만 꺼내 씀 */
export interface CardCopy {
  /** 모든 템플릿 */
  title?: string;
  /** 표지형 */
  subtitle?: string;
  badge?: string;
  /** 이미지 강조형 */
  caption?: string;
  /** 설명형 */
  items?: string[];
  [field: string]: string | string[] | undefined;
}

export interface LayoutOverlap {
  target: string;
  px: number;
}

export interface Card {
  no: number;
  role: Role;
  template: TemplateId;
  intent: string;
  image: string | null;
  evidence: SourceId[];
  copy: CardCopy | null;
  /** project.json이 있는 폴더 기준 경로: png/card-01.png */
  png: string;
  chars: CharRow[];
  cautions: Caution[];
  layout: {
    ok: boolean;
    /** 출력을 막는 오류 (내보낸 카드는 항상 빈 배열) */
    issues: unknown[];
    /** 글자-이미지 겹침 경고: 겹친 글자 요소와 겹친 높이(px). 출력은 막지 않음 */
    overlaps: LayoutOverlap[];
  };
  revisions: Revision[];
}

export interface Quality {
  stage: string;
  card_count: number;
  coverage: Rate;
  evidence_rate: Rate;
  char_usage: number | null;
  char_usage_max: number | null;
  caution: { total: number; in_source: number; not_in_source: number } | null;
  coverage_detail: {
    covered: number;
    total: number;
    /** 카드 근거로 쓰이지 않은 원문 항목 (V2의 [참고]) */
    missing: { section: string; text: string }[];
    excluded_count: number;
  };
  /** 지표가 늘어날 수 있음 (예: 핵심 정보 포함률) */
  [metric: string]: unknown;
}

export interface Project {
  spec_version: '0.1';
  id: string;
  kind: Kind;
  label: string | null;
  stage: Stage;
  skill_version: string | null;
  updated_at: string | null;
  product: {
    name: string;
    brand: string | null;
    category: string | null;
    purpose: string | null;
    emphasis: string | null;
    card_count: number;
  };
  images: { file: string; desc: string; source: string; usage: string }[];
  sources: Source[];
  analysis: Analysis;
  cards: Card[];
  plan_revisions: Revision[];
  quality: Quality;
}

// ── timeline.json (V2 제작 과정)

export type JobKind = 'plan' | 'copy' | 'revise';
export type EventName =
  | 'input_submitted'
  | 'job_started'
  | 'job_finished'
  | 'validate_result'
  | 'plan_approved'
  | 'final_approved'
  | 'revision_requested';

export interface Phases {
  input: number;
  plan_job: number;
  plan_review: number;
  copy_job: number;
  final_review: number;
  revise_job: number;
}

export interface Job {
  job_id: string | null;
  kind: JobKind | null;
  ok: boolean | null;
  minutes: number | null;
  error_code: string | null;
  first_pass: boolean | null;
  auto_fix_count: number;
}

export interface TimelineEvent {
  ts: string;
  event: EventName;
  job_id: string | null;
  kind?: JobKind;
  ok?: boolean;
  error_code?: string | null;
  check?: 'data' | 'layout';
  error_codes?: string[];
  cards_with_errors?: number[];
  rendered_cards?: number[];
  stage?: string | null;
  cards?: number[];
  types?: string[];
  memo?: string;
  /** plan_approved·final_approved만 */
  approved_by?: 'human' | 'eval';
}

export interface Timeline {
  spec_version: '0.1';
  id: string;
  summary: {
    complete: boolean;
    total_minutes: number | null;
    ai_minutes: number | null;
    human_minutes: number | null;
    phases: Phases;
    plan_revisions: number;
    revision_rounds: number;
    revised_card_ratio: Rate;
    revision_types: Record<string, number>;
    first_pass: boolean | null;
    auto_fix_total: number;
  };
  jobs: Job[];
  events: TimelineEvent[];
}
