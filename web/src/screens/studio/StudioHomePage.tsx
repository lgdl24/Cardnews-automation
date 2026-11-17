// S1 작업실 (웹 모드 · 로컬 실행) — 담당 이규동
// 로컬 제작 API(npm run studio)가 켜져 있을 때만 쓸 수 있음. 제품 목록: 대표 카드·상태·이어서 할 일
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../../components/Icon';
import { pngUrl, studioFetch, usePolling, useStudioStatus, type ProductSummary } from '../../studio/api';
import { workStatus, type WorkStatus } from '../../studio/status';
import { formatDateTime } from '../../data/format';
import { EmptyState, ErrorState, Loading } from '../../components/StateView';
import { StudioOff, ClaudeStatus } from './StudioCommon';
import './studio.css';

export function StudioHomePage() {
  const { status } = useStudioStatus();
  if (status === undefined) return <div className="page"><Loading /></div>;
  if (status === null) return <StudioOff />;
  return <StudioHome />;
}

const FILTERS: { key: 'all' | WorkStatus['filter']; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'review', label: '검토 필요' },
  { key: 'running', label: '진행·대기' },
  { key: 'failed', label: '실패' },
  { key: 'input', label: '구성안 전' },
  { key: 'approved', label: '승인 완료' },
];

function StudioHome() {
  const [params, setParams] = useSearchParams();
  const filter = params.get('stage') ?? 'all';
  const query = params.get('q') ?? '';
  const change = (key: string, value: string) =>
    setParams((prev) => { const p = new URLSearchParams(prev); if (value && value !== 'all') p.set(key, value); else p.delete(key); return p; }, { replace: true });
  const { status } = useStudioStatus();
  const list = usePolling(() => studioFetch<{ products: ProductSummary[] }>('/products'), [], (d) => (d && d.products.some((p) => p.running || p.queued) ? 2000 : 8000));

  const products = (list.data?.products ?? []).map((p) => ({ p, s: workStatus(p) }));
  const count = (key: string) => (key === 'all' ? products.length : products.filter((x) => x.s.filter === key).length);
  const q = query.trim().toLowerCase();
  const visible = products
    .filter(({ p, s }) => (filter === 'all' || s.filter === filter) && `${p.name} ${p.brand ?? ''} ${p.id}`.toLowerCase().includes(q))
    .sort((a, b) => rank(a.s) - rank(b.s) || (b.p.updated_at ?? '').localeCompare(a.p.updated_at ?? ''));

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1 className="page-title">제작 작업실</h1>
          <p className="page-desc">자료를 넣고, 구성안과 카드를 검토해 승인하세요. 사람이 승인하기 전에는 다음 단계로 넘어가지 않아요.</p>
        </div>
        <Link to="/studio/new" className="btn btn-primary"><Icon name="plus" size={18} /> 새 제작</Link>
      </div>
      {status && <ClaudeStatus info={status.claude} />}

      <div className="toolbar">
        <div className="filter-tabs" role="group" aria-label="제작 상태">
          {FILTERS.filter((f) => f.key === 'all' || f.key === 'review' || count(f.key) > 0 || filter === f.key).map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => change('stage', f.key)}>
              {f.label}
              {list.data && <span className="filter-count" aria-hidden="true">{count(f.key)}</span>}
            </button>
          ))}
        </div>
        <label className="toolbar-search">
          <Icon name="search" size={18} />
          <input aria-label="제작 제품 검색" type="search" placeholder="제품 이름·브랜드로 검색" value={query} onChange={(e) => change('q', e.target.value)} />
        </label>
      </div>

      <section aria-labelledby="studio-list">
        <h2 className="sr-only" id="studio-list">제품 목록</h2>
        {list.error && !list.data && <ErrorState error={list.error} />}
        {list.error && list.data && <p className="notice notice-warn" role="status">작업실과 연결이 잠시 끊겼어요. 자동으로 다시 확인하고 있어요.</p>}
        {!list.data && !list.error && <Loading />}
        {list.data && products.length === 0 && (
          <EmptyState title="아직 만든 제품이 없어요">
            <p>제품 자료와 사진을 넣으면 Claude가 구성안을 만들어요.</p>
            <Link to="/studio/new" className="btn btn-primary"><Icon name="plus" size={18} /> 첫 제작 시작하기</Link>
          </EmptyState>
        )}
        {visible.length > 0 && (
          <ul className="studio-grid">
            {visible.map(({ p, s }) => (
              <li key={p.id}>
                <ProductTile p={p} s={s} />
              </li>
            ))}
          </ul>
        )}
        {list.data && products.length > 0 && visible.length === 0 && (
          <EmptyState title="이 조건에 해당하는 제품이 없어요">
            <button type="button" className="btn" onClick={() => setParams({})}>전체 제품 보기</button>
          </EmptyState>
        )}
      </section>
    </div>
  );
}

// 사람이 먼저 봐야 할 것부터: 실패 → 검토 → 진행 → 대기 → 입력 → 완료
const ORDER: Record<string, number> = { failed: 0, review: 1, running: 2, queued: 3, neutral: 4, done: 5 };
const rank = (s: WorkStatus) => ORDER[s.tone] ?? 9;

function ProductTile({ p, s }: { p: ProductSummary; s: WorkStatus }) {
  return (
    <Link to={`/studio/${p.id}`} className={`studio-tile tone-${s.tone}`}>
      <div className="studio-tile-thumb">
        {p.thumb ? (
          <img src={pngUrl(p.id, p.thumb.file, p.thumb.v)} alt="" loading="lazy" width={1080} height={1080} />
        ) : (
          <span className="studio-tile-empty">
            {p.running ? <span className="spinner spinner-sm" aria-hidden="true" /> : <Icon name={p.queued ? 'clock' : s.tone === 'failed' ? 'alert' : 'image'} size={22} />}
            {p.running ? 'Claude가 작업 중' : p.queued ? '차례를 기다리는 중' : s.tone === 'failed' ? '작업이 끝나지 못함' : p.stage === 'input' || p.stage === 'plan' ? '카드 만들기 전' : '카드 이미지 없음'}
          </span>
        )}
        {p.png_count ? <span className="studio-tile-count">{p.png_count}장</span> : null}
      </div>
      <div className="studio-tile-body">
        <span className={`pill pill-${s.tone}`}>{s.label}</span>
        <strong className="studio-tile-name">{p.name}</strong>
        <span className="studio-tile-meta">{[p.brand, p.id].filter(Boolean).join(' · ')}</span>
        <span className="studio-tile-foot">
          <span className="muted num">{formatDateTime(p.updated_at)}</span>
          <span className="next-action">{s.next}<Icon name="arrow" size={16} /></span>
        </span>
      </div>
    </Link>
  );
}
