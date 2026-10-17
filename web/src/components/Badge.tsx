import type { Kind, Labels, Stage } from '../data/types';
import { label } from '../data/format';

// 단계 배지: 구성안(회색) · 문구(파랑) · 승인 완료(초록)
export function StageBadge({ stage, labels }: { stage: Stage; labels?: Labels }) {
  return <span className={`badge badge-stage-${stage}`}>{label(labels?.stages, stage)}</span>;
}

// 종류 배지: 실제 제작 · 예시 · 평가 실행
export function KindBadge({ kind, labels }: { kind: Kind; labels?: Labels }) {
  return <span className={`badge badge-kind badge-kind-${kind}`}>{label(labels?.kinds, kind)}</span>;
}
