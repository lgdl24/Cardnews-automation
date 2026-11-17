// S2 새 제작 · 입력 고치기 (웹 모드) — 담당 이규동
// 입력 폼은 config/input-form.json 정의로 그림 → 저장하면 서버가 products/<제품ID>/input.md를 만들고 입력 확인
// 입력 부담 줄이기: 필수 먼저, 선택 글 항목은 접기 · 제출 때 오류 요약 · 글 입력은 브라우저에 임시 저장(이미지 제외)
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useBlocker } from 'react-router';
import { studioFetch, useStudioStatus, imageUrl, type ExtractResult, type FormDef, type FormField, type ProductDetail } from '../../studio/api';
import { ErrorState, Loading } from '../../components/StateView';
import { Icon } from '../../components/Icon';
import { formatDateTime } from '../../data/format';
import { StudioOff } from './StudioCommon';
import './studio.css';

interface ImageRow {
  file: string;
  desc: string;
  source: string;
  usage: string;
  kind: string; // 제품·제형·배경 (#74)
  data?: string; // base64 (새로 고른 파일만)
  preview?: string;
}

type Values = Record<string, string>;
interface Draft { productId: string; values: Values; saved_at: string }

export function ProductFormPage() {
  const { status } = useStudioStatus();
  const { id } = useParams();
  if (status === undefined) return <div className="page"><Loading /></div>;
  if (status === null) return <StudioOff />;
  return <ProductForm key={id ?? 'new'} form={status.form} editId={id} />;
}

const draftKey = (editId?: string) => `cardnews-draft:${editId ?? 'new'}`;
function readDraft(key: string): Draft | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
}
const filled = (v: string | undefined) => Boolean(v && v.trim());

function ProductForm({ form, editId }: { form: FormDef; editId?: string }) {
  const navigate = useNavigate();
  const fields = useMemo(() => form.groups.flatMap((g) => g.fields), [form]);
  const imageField = fields.find((f) => f.type === 'images');
  const defaults = useMemo<Values>(() => Object.fromEntries(fields.filter((f) => f.type === 'choice' && f.required && f.options?.length).map((f) => [f.key, f.options![0]!])), [fields]);
  const [productId, setProductId] = useState(editId ?? '');
  const [values, setValues] = useState<Values>(defaults);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(Boolean(editId));
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ id: string; text: string }[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(() => readDraft(draftKey(editId)));
  const summaryRef = useRef<HTMLDivElement>(null);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty || saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  // 글 입력 임시 저장 (이 브라우저에만, 이미지 제외): 고친 뒤 0.6초 쉬면 저장
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(editId), JSON.stringify({ productId, values, saved_at: new Date().toISOString() } satisfies Draft)); } catch { /* 저장소를 못 쓰면 건너뜀 */ }
    }, 600);
    return () => clearTimeout(t);
  }, [dirty, productId, values, editId]);

  // 입력 고치기: 기존 값 불러오기
  useEffect(() => {
    if (!editId) return;
    studioFetch<ProductDetail>(`/products/${editId}`).then(
      (d) => {
        const v: Values = {};
        for (const [k, x] of Object.entries(d.input.values)) v[k] = Array.isArray(x) ? x.join('\n') : x;
        setValues(v);
        setImages(d.input.images.map((img) => ({ ...img, kind: img.kind || '제품', preview: imageUrl(editId, img.file) })));
        setLoading(false);
      },
      (e: Error) => {
        setLoadError(e);
        setLoading(false);
      },
    );
  }, [editId]);

  const set = (key: string, v: string) => { setValues((prev) => ({ ...prev, [key]: v })); setDirty(true); };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    try {
      const selected = [...files];
      if (selected.some((f) => !['image/png', 'image/jpeg'].includes(f.type) || f.size > 10 * 1024 * 1024)) throw new Error('PNG 또는 JPG 이미지, 파일당 10MB 이하로 선택해주세요.');
      const names = [...images.map((i) => i.file), ...selected.map((f) => safeName(f.name))];
      if (new Set(names).size !== names.length) throw new Error('같은 이름의 이미지가 있어요. 파일 이름을 바꾼 뒤 다시 추가해주세요.');
      const rows = await Promise.all(
        selected.map(
          (f) =>
            new Promise<ImageRow>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const url = String(reader.result);
                resolve({ file: safeName(f.name), desc: '', source: '', usage: '가능', kind: '제품', data: url.split(',')[1], preview: url });
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(f);
            }),
        ),
      );
      setImages((prev) => [...prev, ...rows]);
      setDirty(true);
      setError(null);
    } catch (err) { setError((err as Error).message); }
  };

  // 제출 전 확인: 브라우저 검사 결과를 화면 위 요약과 필드 표시로 바꿔 보여줌
  const collectProblems = (formEl: HTMLFormElement) => {
    const list: { id: string; text: string }[] = [];
    for (const el of Array.from(formEl.elements) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[]) {
      if (!('willValidate' in el) || !el.willValidate || el.validity.valid) continue;
      const name = el.getAttribute('aria-label') || el.closest('.field')?.querySelector('.field-label-text')?.textContent || el.name || '항목';
      const why = el.validity.valueMissing ? '입력이 필요해요' : el.validity.patternMismatch ? '형식이 맞지 않아요' : el.validity.typeMismatch ? '주소 형식이 맞지 않아요' : el.validity.rangeOverflow || el.validity.rangeUnderflow ? '허용 범위를 벗어났어요' : el.validationMessage;
      if (el.id) list.push({ id: el.id, text: `${name}: ${why}` });
    }
    if (imageField?.required && images.length === 0) list.push({ id: 'image-add', text: `${imageField.key}: 한 장 이상 추가해 주세요` });
    return list;
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    const found = collectProblems(e.currentTarget);
    setProblems(found);
    if (found.length) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSaving(true);
    const body = {
      id: productId,
      values: Object.fromEntries(
        fields.filter((f) => f.type !== 'images').map((f) => [f.key, f.type === 'list' ? (values[f.key] ?? '').split('\n').map((s) => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean) : (values[f.key] ?? '')]),
      ),
      images: images.map(({ file, desc, source, usage, kind, data }) => ({ file, desc, source, usage, kind, data })),
    };
    try {
      const d = editId
        ? await studioFetch<ProductDetail>(`/products/${editId}/input`, { method: 'PUT', body })
        : await studioFetch<ProductDetail>('/products', { method: 'POST', body });
      try { localStorage.removeItem(draftKey(editId)); } catch { /* 무시 */ }
      navigate(`/studio/${d.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      requestAnimationFrame(() => document.getElementById('form-error')?.scrollIntoView({ block: 'center' }));
    }
  };

  if (loading) return <div className="page"><Loading /></div>;
  if (loadError) return <div className="page"><ErrorState error={loadError} /></div>;

  const required = fields.filter((f) => f.required);
  const requiredDone = required.filter((f) => (f.type === 'images' ? images.length > 0 : filled(values[f.key]))).length + (filled(productId) ? 1 : 0);
  const requiredTotal = required.length + 1;
  const groupProgress = (g: FormDef['groups'][number]) => {
    const req = g.fields.filter((f) => f.required);
    return { done: req.filter((f) => (f.type === 'images' ? images.length > 0 : filled(values[f.key]))).length, total: req.length };
  };

  return (
    <div className="page page-narrow">
      <Link to={editId ? `/studio/${editId}` : '/studio'} className="back-link"><Icon name="back" size={16} /> {editId ? '제작으로 돌아가기' : '작업실'}</Link>
      <h1 className="page-title">{editId ? '입력 고치기' : '새 제작'}</h1>
      <p className="page-desc">제품 정보는 카드 문구의 원문이 돼요. 원문에 없는 효능·수치는 카드에 쓰지 않아요. 저장만으로 생성 작업이 시작되지는 않아요.</p>

      {draft && (
        <div className="notice notice-info draft-banner" role="status">
          <span>{formatDateTime(draft.saved_at)}에 임시 저장한 입력이 있어요. 이미지는 임시 저장되지 않아요.</span>
          <span className="action-bar" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-small" onClick={() => { setProductId(editId ?? draft.productId); setValues({ ...defaults, ...draft.values }); setDirty(true); setDraft(null); }}>불러오기</button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => { try { localStorage.removeItem(draftKey(editId)); } catch { /* 무시 */ } setDraft(null); }}>지우기</button>
          </span>
        </div>
      )}

      <div className="form-layout">
        <nav className="form-outline" aria-label="입력 단계">
          <a href="#product-id"><span>제품 이름표</span><span className={`outline-count${filled(productId) ? ' outline-done' : ''}`}>{filled(productId) ? <Icon name="check" size={14} /> : '1'}</span></a>
          {form.groups.map((g, i) => {
            const pr = groupProgress(g);
            return (
              <a key={g.title} href={`#form-group-${i}`}>
                <span>{g.title}</span>
                <span className={`outline-count${pr.done === pr.total ? ' outline-done' : ''}`}>{pr.done === pr.total ? <Icon name="check" size={14} /> : `${pr.done}/${pr.total}`}</span>
              </a>
            );
          })}
        </nav>

        <div className="studio-form">
          {!editId && <MaterialsFill fields={fields} onFill={(v) => { setValues((prev) => ({ ...prev, ...v })); setDirty(true); }} onAddImages={(files) => addFiles(files)} />}

          <form id="product-form" className={`studio-form${submitted ? ' was-submitted' : ''}`} onSubmit={submit} noValidate onChangeCapture={() => setDirty(true)}>
            {problems.length > 0 && (
              <div className="error-summary" role="alert" tabIndex={-1} ref={summaryRef}>
                <h2>저장하기 전에 {problems.length}개 항목을 확인해 주세요</h2>
                <ul>{problems.map((p) => <li key={p.id + p.text}><a href={`#${p.id}`} onClick={(e) => { e.preventDefault(); const el = document.getElementById(p.id); el?.focus(); el?.scrollIntoView({ block: 'center' }); }}>{p.text}</a></li>)}</ul>
              </div>
            )}
            <fieldset className="form-group" id="product-id">
              <legend>제품 이름표</legend>
              <label className="field">
                <span className="field-label"><span className="field-label-text">제품ID</span> <em className="req">필수</em></span>
                <input
                  id="field-product-id"
                  title="영문 소문자·숫자·하이픈으로 입력해 주세요"
                  value={productId}
                  onChange={(e) => { setProductId(e.target.value.toLowerCase()); setDirty(true); }}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="예: toneup-sunscreen"
                  required
                  disabled={Boolean(editId)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="field-error" aria-hidden="true"><Icon name="alert" size={14} /> 영문 소문자·숫자·하이픈으로 입력해 주세요</span>
                <span className="field-guide">영문 소문자·숫자·하이픈. 같은 제품을 다시 찾는 고유 이름이에요. 저장한 뒤에는 바꿀 수 없어요.</span>
              </label>
            </fieldset>

            {form.groups.map((g, i) => {
              const main = g.fields.filter((f) => f.required || f.type === 'choice' || f.type === 'images');
              const extra = g.fields.filter((f) => !main.includes(f));
              return (
                <fieldset key={g.title} className="form-group" id={`form-group-${i}`}>
                  <legend>{g.title}</legend>
                  {g.source && <p className="form-group-desc">여기 적은 문장만 카드 문구의 근거로 써요.</p>}
                  {main.map((f) =>
                    f.type === 'images' ? (
                      <ImagesField key={f.key} field={f} images={images} setImages={(fn) => { setImages(fn); setDirty(true); }} addFiles={addFiles} submitted={submitted} />
                    ) : (
                      <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
                    ),
                  )}
                  {extra.length > 0 && (
                    <details className="optional-fields" open={extra.some((f) => filled(values[f.key]))}>
                      <summary>선택 항목 {extra.length}개 <span className="muted">· {extra.map((f) => f.key).join(', ')}</span></summary>
                      <div>{extra.map((f) => <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />)}</div>
                    </details>
                  )}
                </fieldset>
              );
            })}

            {error && <p className="notice notice-error" role="alert" id="form-error">{error}</p>}
            <div className="form-actions">
              <p className="form-actions-note">
                필수 <strong className="num">{requiredDone}/{requiredTotal}</strong> 입력 · 저장하면 입력 확인(필수 항목·이미지·지시문 형태 문장)을 바로 해요.
              </p>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '저장하는 중…' : editId ? '변경사항 저장하고 계속' : '자료 저장하고 계속'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {blocker.state === 'blocked' && (
        <dialog className="leave-dialog" aria-labelledby="leave-title" ref={(node) => { if (node && !node.open) node.showModal(); }} onCancel={(e) => { e.preventDefault(); blocker.reset(); }}>
          <h2 id="leave-title">입력 중인 자료가 있어요</h2>
          <p>아직 저장하지 않은 내용은 작업실에 반영되지 않아요. 글 입력은 이 브라우저에 임시 저장돼 다시 불러올 수 있지만 이미지는 다시 골라야 해요.</p>
          <div className="action-bar">
            <button className="btn btn-primary" type="button" autoFocus onClick={() => blocker.reset()}>계속 입력하기</button>
            <button className="btn" type="button" onClick={() => blocker.proceed()}>저장하지 않고 나가기</button>
          </div>
        </dialog>
      )}
    </div>
  );
}

// 자료로 채우기: 제품 소개 PDF·이미지·글을 올리면 내 컴퓨터의 Claude Code가 읽고 '제품 정보' 칸 초안을 채움.
// 저장은 하지 않음 — 채워진 내용을 사람이 원문과 대조해 고친 뒤 저장해야 원문(input.md)이 됨
function MaterialsFill({ fields, onFill, onAddImages }: { fields: FormField[]; onFill: (v: Values) => void; onAddImages: (files: FileList) => void }) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const imageFiles = files ? [...files].filter((f) => /\.(png|jpe?g)$/i.test(f.name)) : [];
  const run = async () => {
    if (!files || !files.length) return;
    setBusy(true);
    setStarted(Date.now());
    setError(null);
    setResult(null);
    try {
      if ([...files].some((f) => f.size > 20 * 1024 * 1024)) throw new Error('자료는 파일당 20MB 이하로 올려 주세요.');
      const payload = await Promise.all([...files].map((f) => new Promise<{ name: string; data: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: f.name, data: String(reader.result).split(',')[1] ?? '' });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(f);
      })));
      const r = await studioFetch<ExtractResult>('/extract', { method: 'POST', body: { files: payload } });
      const v: Values = {};
      for (const f of fields) {
        const x = r.values[f.key];
        const text = Array.isArray(x) ? x.join('\n') : (x ?? '');
        if (text) v[f.key] = text;
      }
      onFill(v);
      setResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sec = started ? Math.round((now - started) / 1000) : 0;
  return (
    <section className="form-group materials-fill" aria-labelledby="materials-title">
      <div>
        <h2 id="materials-title" className="panel-title">자료로 빠르게 채우기 <em className="opt">선택</em></h2>
        <p className="field-guide">제품 소개 PDF·이미지·글을 올리면 Claude가 읽고 '제품 정보' 칸을 채워요. 자료에 적힌 문장만 옮기고, 없는 내용은 비워 둬요. <strong>채워진 내용은 원문과 대조해 확인한 뒤 저장해 주세요.</strong></p>
      </div>
      <label className="btn file-btn">
        <span><Icon name="doc" size={18} /> {files?.length ? [...files].map((f) => f.name).join(', ') : '자료 고르기'}</span>
        <span className="muted">PDF·PNG·JPG·TXT·MD, 파일당 20MB</span>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.md,application/pdf,image/png,image/jpeg,text/plain,text/markdown" multiple onChange={(e) => { setFiles(e.target.files); setResult(null); }} />
      </label>
      <div className="action-bar" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-primary" disabled={busy || !files || !files.length} onClick={run}>
          {busy ? <><span className="spinner spinner-sm" aria-hidden="true" /> 자료 읽는 중 · {sec}초</> : '자료로 칸 채우기'}
        </button>
        {busy && <span className="muted" role="status">이 컴퓨터의 Claude Code가 읽고 있어요. 보통 1~3분 걸려요.</span>}
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {result && (
        <div className="notice notice-info" role="status">
          <p>제품 정보 칸을 채웠어요. 원문과 다른 곳이 없는지 확인해 주세요.</p>
          {result.missing.length > 0 && <p>자료에서 찾지 못한 칸: {result.missing.join(', ')} — 직접 채워 주세요.</p>}
          {result.warnings.map((w) => <p key={w}>[경고] {w}</p>)}
          {imageFiles.length > 0 && files && (
            <div className="action-bar">
              <button type="button" className="btn btn-small" onClick={() => { const dt = new DataTransfer(); imageFiles.forEach((f) => dt.items.add(f)); onAddImages(dt.files); }}>
                올린 이미지 {imageFiles.length}장을 이미지 칸에 추가
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Field({ field: f, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const guideId = `${id}-guide`;
  const guide = [f.guide, f.example && f.type === 'list' ? `예: ${f.example.join(' / ')}` : ''].filter(Boolean).join(' · ');
  const lines = f.type === 'list' ? value.split('\n').filter((s) => s.trim()).length : 0;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        <span className="field-label-text">{f.key}</span> {f.required ? <em className="req">필수</em> : <em className="opt">선택</em>}
      </label>
      {f.type === 'choice' ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required={f.required} aria-describedby={guide ? guideId : undefined}>
          {!f.required && <option value="">선택 안 함</option>}
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === 'paragraph' || f.type === 'list' ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={f.type === 'list' ? 5 : 4} required={f.required} placeholder={f.type === 'list' ? '한 줄에 하나씩' : undefined} aria-describedby={guide ? guideId : undefined} />
      ) : (
        <input
          id={id}
          type={f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text'}
          placeholder={f.type === 'url' ? 'https://' : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          min={f.min}
          max={f.max}
          inputMode={f.type === 'number' ? 'numeric' : undefined}
          aria-describedby={guide ? guideId : undefined}
        />
      )}
      <span className="field-error" aria-hidden="true"><Icon name="alert" size={14} /> {f.type === 'url' ? 'https://로 시작하는 주소를 넣어 주세요' : f.type === 'number' ? `${f.min ?? 1}~${f.max ?? ''} 사이 숫자를 넣어 주세요` : '이 항목을 채워 주세요'}</span>
      {(guide || f.type === 'list') && (
        <span className="field-guide" id={guideId}>
          {guide}
          {f.type === 'list' && <span className="num"> · {lines}줄</span>}
        </span>
      )}
    </div>
  );
}

function ImagesField({ field: f, images, setImages, addFiles, submitted }: {
  field: FormField;
  images: ImageRow[];
  setImages: (fn: (prev: ImageRow[]) => ImageRow[]) => void;
  addFiles: (files: FileList | null) => void;
  submitted: boolean;
}) {
  const update = (i: number, patch: Partial<ImageRow>) => setImages((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="field">
      <span className="field-label">
        <span className="field-label-text">{f.key}</span> {f.required ? <em className="req">필수</em> : <em className="opt">선택</em>}
        {images.length > 0 && <span className="muted num">{images.length}장</span>}
      </span>
      {images.length > 0 && (
        <ul className="image-rows">
          {images.map((img, i) => {
            const blocked = img.usage === '불가';
            const needInfo = !img.desc.trim() || !img.source.trim();
            return (
              <li key={`${img.file}-${i}`} className={`image-row${blocked ? ' is-blocked' : ''}`}>
                {img.preview ? <img src={img.preview} alt="" width={80} height={80} /> : <span />}
                <div className="image-row-fields">
                  <div className="image-row-head">
                    <code>{img.file}</code>
                    <span className={`pill ${img.data ? 'pill-running' : 'pill-done'}`}>{img.data ? '새 이미지 · 저장할 때 올라가요' : '저장됨'}</span>
                    {blocked && <span className="pill pill-failed">사용 불가 · 제작할 수 없어요</span>}
                    {!blocked && needInfo && <span className={`pill ${submitted ? 'pill-failed' : 'pill-queued'}`}>설명·출처 필요</span>}
                  </div>
                  <input id={`img-${i}-desc`} aria-label={`${img.file} 설명`} placeholder="설명 (예: 제품 단독 컷)" value={img.desc} onChange={(e) => update(i, { desc: e.target.value })} required />
                  <input id={`img-${i}-source`} aria-label={`${img.file} 출처`} placeholder="출처 (예: 직접 촬영)" value={img.source} onChange={(e) => update(i, { source: e.target.value })} required />
                  <select aria-label={`${img.file} 사용 가능 여부`} value={img.usage} onChange={(e) => update(i, { usage: e.target.value })}>
                    {(f.usage ?? ['가능', '불가', '확인 중']).map((u) => <option key={u}>{u}</option>)}
                  </select>
                  <select aria-label={`${img.file} 용도`} title="제품: 배경 지운 제품 사진 · 제형: 크림 자국 같은 질감 사진 · 배경: 제품 없는 연출 장면" value={img.kind} onChange={(e) => update(i, { kind: e.target.value })}>
                    {(f.kinds ?? ['제품', '제형', '배경']).map((k) => <option key={k}>{k}</option>)}
                  </select>
                </div>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))} aria-label={`${img.file} 빼기`}>
                  <Icon name="x" size={16} /> 빼기
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <label className="btn file-btn" id="image-add-label">
        <span><Icon name="image" size={18} /> 이미지 추가</span>
        <span className="muted">PNG·JPG, 파일당 10MB · 제품·제형·배경 용도를 골라 주세요</span>
        <input id="image-add" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </label>
      <span className="field-guide">출처가 없거나 '불가'면 제작할 수 없어요. 설명은 카드 이미지 설명에 쓰여요.</span>
    </div>
  );
}

/** 파일 이름에서 쓸 수 없는 글자를 바꿈 (서버도 같은 규칙으로 다시 검사) */
function safeName(name: string) {
  const ext = (name.match(/\.(png|jpe?g)$/i)?.[0] ?? '.png').toLowerCase();
  const base = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9가-힣_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  return `${base}${ext}`;
}
