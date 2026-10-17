import type { ReactNode } from 'react';

// 요약 숫자 카드 (V1·V2 제작 과정·V3 공통)
export function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint ? <div className="metric-hint">{hint}</div> : null}
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="metrics">{children}</div>;
}
