import type { ReactNode } from 'react';
import { DataError } from '../data/load';

export function Loading() {
  return (
    <div className="state" role="status">
      <div className="spinner" aria-hidden="true" />
      불러오는 중이에요
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  const notFound = error instanceof DataError && error.status === 404;
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">{notFound ? '내보낸 데이터를 찾을 수 없어요' : '데이터를 불러오지 못했어요'}</p>
      <p>{error.message}</p>
      {notFound ? (
        <p>
          로컬에서 <code>npm run export</code>로 웹 데이터를 만든 뒤 다시 배포하세요.
        </p>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <p className="state-title">{title}</p>
      {children}
    </div>
  );
}
