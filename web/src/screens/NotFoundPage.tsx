import { Link } from 'react-router';
import { EmptyState } from '../components/StateView';

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState title="페이지를 찾을 수 없어요">
        <p>
          <Link to="/">프로젝트 목록으로 가기</Link>
        </p>
      </EmptyState>
    </div>
  );
}
