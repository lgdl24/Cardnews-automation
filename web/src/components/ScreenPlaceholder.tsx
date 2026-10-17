import type { ReactNode } from 'react';

// 아직 만들지 않은 화면 자리. 담당·읽을 데이터·할 일을 보여줘 각자 바로 시작할 수 있게 함
export function ScreenPlaceholder({
  title,
  owner,
  folder,
  reads,
  todo,
  children,
}: {
  title: string;
  owner: '이규동' | '이용석';
  /** web/src/ 기준 폴더 */
  folder: string;
  /** 읽는 웹 데이터 (docs/web-data-spec.md '화면별로 읽는 파일') */
  reads: string;
  todo: string[];
  children?: ReactNode;
}) {
  return (
    <section className="placeholder" aria-label={`${title} (준비 중)`}>
      <div className="placeholder-head">
        <span className="placeholder-title">{title}</span>
        <span className="badge badge-kind">준비 중</span>
      </div>
      <dl>
        <dt>담당</dt>
        <dd>{owner}</dd>
        <dt>코드</dt>
        <dd>
          <code>web/src/{folder}</code>
        </dd>
        <dt>읽는 데이터</dt>
        <dd>{reads}</dd>
        <dt>할 일</dt>
        <dd>
          <ul>
            {todo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </dd>
      </dl>
      {children}
    </section>
  );
}
