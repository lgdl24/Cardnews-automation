// 인스타 게시 패널 (B5, #104) — 최종 승인 뒤: 계정·카드·캡션 미리보기 → 게시 전 점검·사람 확인 → 확인 창 → 진행 → 게시 링크
// 지금 게시와 예약 게시. 서버가 상태를 저장하므로 새로고침·작업실 재시작 뒤에도 이어서 보임
// 캡션 수정은 다른 담당 기능(이번 범위 아님) → 자동 캡션을 보여주기만
import { useEffect, useRef, useState } from 'react';
import { IG_ACTIVE, pngUrl, studioFetch, usePolling, type IgAccount, type IgRequest, type IgStatus, type ProductDetail } from '../../studio/api';
import { formatElapsed } from '../../studio/status';
import { formatDateTime } from '../../data/format';
import { Icon } from '../../components/Icon';

const CHECK_WORD = { pass: '통과', warn: '사람 확인', fail: '고쳐야 함', todo: '아직' } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const toLocalInput = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Confirm = { kind: 'now' } | { kind: 'schedule'; at: string };

export function PublishPanel({ detail }: { detail: ProductDetail }) {
  const id = detail.id;
  // '다시 점검'을 누른 다음 한 번만 점검을 새로 돌림 (진행 중 2초 갱신 때마다 돌리지 않게)
  const refreshNext = useRef(false);
  const ig = usePolling(
    () => {
      const refresh = refreshNext.current;
      refreshNext.current = false;
      return studioFetch<IgStatus>(`/products/${encodeURIComponent(id)}/instagram${refresh ? '?refresh=1' : ''}`);
    },
    [id, detail.updated_at],
    (d) => (d?.current && IG_ACTIVE.includes(d.current.state) ? 2000 : d?.schedule?.state === 'scheduled' || d?.schedule?.state === 'running' ? 15000 : null),
  );
  const [account, setAccount] = useState<IgAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(Date.now() + 60 * 60 * 1000));
  // 체크는 바로 보이게 하고 서버 저장이 끝나면 서버 값으로 (실패하면 되돌림)
  const [localAcks, setLocalAcks] = useState<string[] | null>(null);

  const loadAccount = async (refresh = false) => {
    setAccountLoading(true);
    try {
      setAccount(await studioFetch<IgAccount>(`/instagram/account${refresh ? '?refresh=1' : ''}`));
    } catch (e) {
      setAccount({ ok: false, error: (e as Error).message });
    } finally {
      setAccountLoading(false);
    }
  };
  useEffect(() => {
    loadAccount();
  }, []);

  const s = ig.data;
  const act = async (path: string, body?: unknown, method: 'POST' | 'DELETE' = 'POST') => {
    setBusy(true);
    setError(null);
    try {
      const r = await studioFetch<IgStatus & { instagram?: IgStatus }>(`/products/${encodeURIComponent(id)}/instagram/${path}`, { method, body });
      ig.setData(r.instagram ?? r);
      ig.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      ig.refresh();
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!s) {
    return (
      <section className="ig-panel" aria-labelledby="ig-title">
        <h3 className="panel-title" id="ig-title">인스타 게시</h3>
        {ig.error ? <p className="notice notice-error">{ig.error.message}</p> : <p className="muted">게시 상태를 불러오는 중이에요…</p>}
      </section>
    );
  }

  const cur = s.current ?? null;
  const active = Boolean(cur && IG_ACTIVE.includes(cur.state));
  const latest = s.published?.[0];
  const sched = s.schedule ?? null;
  const scheduled = sched?.state === 'scheduled';
  const pill = active ? ['running', '게시 중'] : cur?.state === 'unknown' ? ['failed', '확인 필요'] : scheduled ? ['queued', `예약 ${fmt(sched!.at)}`] : latest ? ['done', '게시 완료'] : cur?.state === 'failed' ? ['failed', '게시 실패'] : ['neutral', '게시 전'];
  const warnIds = (s.check?.checks ?? []).filter((c) => c.status === 'warn').map((c) => c.id);
  const acks = new Set(localAcks ?? s.acks ?? []);
  const cardCount = s.cards?.length ?? 0;
  const user = account?.username ? `@${account.username}` : '연결된 계정';
  const minAt = Date.now() + (s.limits?.schedule_min_minutes ?? 2) * 60000;

  return (
    <section className={`ig-panel${active ? ' is-active' : ''}`} aria-labelledby="ig-title">
      <div className="ig-head">
        <div>
          <h3 className="panel-title" id="ig-title"><Icon name="external" size={18} /> 인스타 게시</h3>
          <p className="muted">최종 승인한 카드 {cardCount}장을 순서대로 캐러셀로 올려요. 캡션은 승인 문구로 자동으로 만들어요.</p>
        </div>
        <span className={`pill pill-${pill[0]}`}>{pill[1]}</span>
      </div>

      <div className="ig-account" role="status">
        {account === null || accountLoading ? (
          <span className="muted">계정 확인 중…</span>
        ) : account.ok ? (
          <span><strong>@{account.username}</strong> <span className="muted">· {account.login} · 24시간 게시 {account.used ?? '?'}/{account.total ?? '?'}건</span></span>
        ) : (
          <span className="ig-account-error"><Icon name="alert" size={16} /> {account.error}</span>
        )}
        <button type="button" className="btn btn-small btn-ghost" disabled={accountLoading} onClick={() => loadAccount(true)}>계정 다시 확인</button>
      </div>

      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {cur && <RequestView req={cur} steps={s.steps ?? []} busy={busy} onVerify={() => act('verify')} />}
      {!active && latest && cur?.state !== 'published' && (
        <p className="notice">지난 게시: <a href={latest.permalink ?? '#'} target="_blank" rel="noreferrer">{latest.permalink ?? latest.media_id}</a> · {formatDateTime(latest.published_at)}</p>
      )}

      {sched && sched.state !== 'canceled' && sched.state !== 'done' && (
        <div className={`ig-schedule ig-schedule-${sched.state}`} role="status">
          <Icon name="clock" size={18} />
          <div>
            {sched.state === 'scheduled' && <p><strong>{fmt(sched.at)}</strong>에 게시하도록 예약했어요.</p>}
            {sched.state === 'running' && <p>예약한 게시를 진행하고 있어요.</p>}
            {sched.state === 'missed' && <p><strong>예약을 놓쳤어요.</strong> {sched.reason}</p>}
            {sched.state === 'blocked' && <p><strong>예약 시각에 게시하지 못했어요.</strong> {sched.reason}</p>}
            {(sched.state === 'failed' || sched.state === 'unknown') && <p><strong>예약 게시가 끝나지 못했어요.</strong> {sched.reason ?? '위의 게시 상태를 확인해 주세요.'}</p>}
            {sched.state === 'scheduled' && <p className="muted">그 시각에 이 컴퓨터와 작업실(npm run studio)이 켜져 있어야 해요. 꺼져 있다가 {s.limits?.grace_minutes ?? 10}분 넘게 지나면 자동으로 게시하지 않고 다시 확인을 받아요.</p>}
          </div>
          {['scheduled', 'missed', 'blocked'].includes(sched.state) && (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => act('schedule', undefined, 'DELETE')}>{sched.state === 'scheduled' ? '예약 취소' : '예약 지우기'}</button>
          )}
        </div>
      )}

      <details className="fold ig-preview" open={!latest && !active}>
        <summary><span className="fold-title">게시 미리보기</span><span className="fold-meta muted">카드 {cardCount}장 · 캡션 {s.caption?.length ?? 0}자</span></summary>
        <div className="fold-body">
          <ol className="ig-cards" aria-label="게시 순서">
            {(s.cards ?? []).map((c) => {
              const png = detail.pngs.find((x) => x.file === c.file);
              return (
                <li key={c.no}>
                  {png ? <img src={pngUrl(id, png.file, png.v)} alt={`게시 ${c.no}번째 카드`} width={1080} height={1080} loading="lazy" /> : <span className="card-missing">없음</span>}
                  <span className="num">{c.no}</span>
                </li>
              );
            })}
          </ol>
          <pre className="ig-caption">{s.caption}</pre>
          <p className="muted">캡션은 승인된 카드 문구로만 만들어요(새 문구 없음). 첫 줄에 AI 활용 표시가 들어가요. 캡션 수정 기능은 담당자가 따로 만들 예정이에요.</p>
        </div>
      </details>

      {s.check && (
        <div className="ig-check">
          <div className="ig-check-head">
            <h4 className="panel-subtitle">게시 전 점검</h4>
            <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => { refreshNext.current = true; ig.refresh(); }}><Icon name="refresh" size={14} /> 다시 점검</button>
          </div>
          <ul className="check-list">
            {s.check.checks.map((c) => (
              <li key={c.id} className={`check-item check-${c.status}`}>
                <span className="check-mark" aria-hidden="true"><Icon name={c.status === 'pass' ? 'check' : c.status === 'fail' ? 'x' : c.status === 'warn' ? 'alert' : 'clock'} size={14} /></span>
                <span className="check-label">{c.label}</span>
                <span className="check-word">{CHECK_WORD[c.status]}</span>
                <span className="check-detail">{c.detail}</span>
                {c.status === 'warn' && (
                  <label className="check check-ack">
                    <input
                      type="checkbox"
                      checked={acks.has(c.id)}
                      disabled={busy || active || Boolean(latest && latest.version === s.version)}
                      onChange={(e) => {
                        const next = new Set(acks);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        setLocalAcks([...next]);
                        act('ack', { version: s.version, ids: [...next] }).finally(() => setLocalAcks(null));
                      }}
                    />
                    확인했어요
                  </label>
                )}
              </li>
            ))}
          </ul>
          {warnIds.length > 0 && <p className="muted">‘사람 확인’ 항목은 직접 보고 체크해 주세요. 카드나 캡션이 바뀌면 다시 확인해야 해요.</p>}
        </div>
      )}

      {!active && (
        <div className="ig-actions">
          {s.blockers.length > 0 && !(latest && latest.version === s.version && s.blockers.length === 1) && (
            <ul className="ig-blockers">{s.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          )}
          {latest && latest.version === s.version && <p className="muted">이 버전은 이미 게시했어요. 카드를 고쳐 다시 승인하면 새로 게시할 수 있어요.</p>}
          <div className="action-bar">
            <button type="button" className="btn btn-primary" disabled={busy || !s.can_publish} onClick={() => setConfirm({ kind: 'now' })}>
              <Icon name="external" size={18} /> 지금 게시
            </button>
            {!scheduled && (
              <button type="button" className="btn" disabled={busy || !s.can_schedule} aria-expanded={scheduleOpen} onClick={() => setScheduleOpen((o) => !o)}>
                <Icon name="clock" size={18} /> 예약 게시
              </button>
            )}
          </div>
          {scheduleOpen && !scheduled && (
            <div className="ig-schedule-form">
              <label className="field">
                <span className="field-label">게시할 시각</span>
                <input type="datetime-local" value={when} min={toLocalInput(minAt)} onChange={(e) => setWhen(e.target.value)} />
                <span className="field-guide">{s.limits?.schedule_min_minutes ?? 2}분 뒤부터 {s.limits?.schedule_max_days ?? 30}일 안. 그 시각에 이 컴퓨터와 작업실이 켜져 있어야 해요.</span>
              </label>
              <button type="button" className="btn" disabled={busy || !when || new Date(when).getTime() < minAt} onClick={() => setConfirm({ kind: 'schedule', at: new Date(when).toISOString() })}>이 시각으로 예약</button>
            </div>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'now' ? '인스타에 지금 공개 게시할까요?' : '예약 게시를 정할까요?'}
          lines={[
            `${user}에 카드 ${cardCount}장을 1→${cardCount} 순서로 올려요.`,
            `캡션 첫 줄: ${s.caption?.split('\n')[0] ?? ''}`,
            confirm.kind === 'schedule' ? `${fmt(confirm.at)}에 게시해요. 그 시각에 이 컴퓨터와 작업실이 켜져 있어야 해요.` : '게시하면 되돌릴 수 없어요. 지우려면 인스타 앱에서 직접 지워야 해요.',
          ]}
          okLabel={confirm.kind === 'now' ? '게시하기' : '예약하기'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onOk={async () => {
            const ok = confirm.kind === 'now' ? await act('publish', { version: s.version }) : await act('schedule', { version: s.version, at: confirm.at });
            if (ok) {
              setConfirm(null);
              setScheduleOpen(false);
            } else setConfirm(null);
          }}
        />
      )}
    </section>
  );
}

function RequestView({ req, steps, busy, onVerify }: { req: IgRequest; steps: { key: string; label: string }[]; busy: boolean; onVerify: () => void }) {
  const active = IG_ACTIVE.includes(req.state);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  const reached = new Set(req.steps.map((s) => s.key));
  const nowKey = active ? req.steps[req.steps.length - 1]?.key : null;
  const end = active ? now : Date.parse(req.finished_at ?? req.updated_at);
  const elapsed = (end - Date.parse(req.requested_at)) / 1000;
  const by = req.trigger === 'schedule' ? '예약 게시' : req.trigger === 'cli' ? '터미널 게시' : '지금 게시';
  if (req.state === 'published') {
    return (
      <div className="ig-result is-done" role="status">
        <Icon name="check" size={20} />
        <div>
          <p><strong>게시했어요</strong> <span className="muted">· {by} · {req.account ? `@${req.account} · ` : ''}{formatDateTime(req.finished_at ?? req.updated_at)} · {formatElapsed(elapsed)}</span></p>
          {req.permalink ? (
            <a className="btn btn-small" href={req.permalink} target="_blank" rel="noreferrer">인스타에서 보기 <Icon name="external" size={14} /></a>
          ) : (
            <p className="muted">게시는 됐지만 링크를 아직 못 받았어요. <button type="button" className="btn btn-small" disabled={busy} onClick={onVerify}>링크 다시 확인</button></p>
          )}
        </div>
      </div>
    );
  }
  if (req.state === 'unknown') {
    return (
      <div className="ig-result is-unknown" role="alert">
        <Icon name="alert" size={20} />
        <div>
          <p><strong>게시가 됐는지 확인이 필요해요</strong></p>
          <p>{req.error?.message}</p>
          <p className="muted">확인하기 전에는 중복 게시를 막으려고 다시 게시할 수 없어요.</p>
          <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={onVerify}>인스타에서 게시 여부 확인</button>
        </div>
      </div>
    );
  }
  if (req.state === 'failed') {
    return (
      <div className="ig-result is-failed" role="alert">
        <Icon name="x" size={20} />
        <div>
          <p><strong>게시하지 못했어요</strong> <span className="muted">· {by} · {formatDateTime(req.finished_at ?? req.updated_at)}</span></p>
          <p>{req.error?.message}</p>
          <p className="muted">인스타에는 올라가지 않았어요. 원인을 해결한 뒤 다시 게시할 수 있어요.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="ig-progress" aria-live="polite">
      <div className="ig-progress-head">
        <span className="spinner spinner-sm" aria-hidden="true" />
        <strong>{by} 진행 중</strong>
        <span className="muted num">경과 {formatElapsed(elapsed)}</span>
      </div>
      <ol className="job-timeline ig-steps">
        {steps.map((s) => {
          const isNow = s.key === nowKey;
          const done = reached.has(s.key) && !isNow;
          return (
            <li key={s.key} className={isNow ? 'is-now' : done ? 'is-done' : 'is-todo'}>
              <span className="job-timeline-dot" aria-hidden="true">{isNow ? <span className="spinner spinner-xs" /> : done ? <Icon name="check" size={12} /> : null}</span>
              <span>{s.label}{s.key === 'uploading' && req.progress ? ` (${req.progress.done}/${req.progress.total})` : ''}</span>
              {isNow && <span className="sr-only"> (지금 하는 일)</span>}
            </li>
          );
        })}
      </ol>
      <p className="muted">화면을 닫아도 게시는 계속돼요. 진행 중에는 취소할 수 없어요.</p>
    </div>
  );
}

function ConfirmDialog({ title, lines, okLabel, busy, onOk, onCancel }: { title: string; lines: string[]; okLabel: string; busy: boolean; onOk: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="leave-dialog ig-confirm" aria-labelledby="ig-confirm-title" onCancel={(e) => { e.preventDefault(); onCancel(); }}>
      <h2 id="ig-confirm-title">{title}</h2>
      {lines.map((l) => <p key={l}>{l}</p>)}
      <div className="action-bar">
        <button type="button" className="btn" autoFocus onClick={onCancel}>취소</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onOk}>{busy ? '보내는 중…' : okLabel}</button>
      </div>
    </dialog>
  );
}
