// S2 새 제작 · 입력 고치기 (웹 모드) — 담당 이규동
// 입력 폼은 config/input-form.json 정의로 그림 → 저장하면 서버가 products/<제품ID>/input.md를 만들고 입력 확인
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useBlocker } from 'react-router';
import { studioFetch, useStudioStatus, imageUrl, type ExtractResult, type FormDef, type FormField, type ProductDetail } from '../../studio/api';
import { ErrorState, Loading } from '../../components/StateView';
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

export function ProductFormPage() {
  const { status } = useStudioStatus();
  const { id } = useParams();
  if (status === undefined) return <div className="page"><Loading /></div>;
  if (status === null) return <StudioOff />;
  return <ProductForm key={id ?? 'new'} form={status.form} editId={id} />;
}

function ProductForm({ form, editId }: { form: FormDef; editId?: string }) {
  const navigate = useNavigate();
  const fields = useMemo(() => form.groups.flatMap((g) => g.fields), [form]);
  const imageField = fields.find((f) => f.type === 'images');
  const [productId, setProductId] = useState(editId ?? '');
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.filter(f => f.type === 'choice' && f.required && f.options?.length).map(f => [f.key, f.options![0]!])));
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(Boolean(editId));
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty || saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

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

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    try {
      const selected = [...files];
      if (selected.some(f => !['image/png', 'image/jpeg'].includes(f.type) || f.size > 10 * 1024 * 1024)) throw new Error('PNG 또는 JPG 이미지, 파일당 10MB 이하로 선택해주세요.');
      const names = [...images.map(i => i.file), ...selected.map(f => safeName(f.name))];
      if (new Set(names).size !== names.length) throw new Error('같은 이름의 이미지가 있어요. 파일 이름을 바꾼 뒤 다시 추가해주세요.');
      const rows = await Promise.all(
        [...files].map(
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
      setError(null);
    } catch (err) { setError((err as Error).message); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
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
      navigate(`/studio/${d.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      requestAnimationFrame(() => document.getElementById('form-error')?.scrollIntoView({ block: 'center' }));
    }
  };

  if (loading) return <div className="page"><Loading /></div>;
  if (loadError) return <div className="page"><ErrorState error={loadError} /></div>;

  return (
    <div className="page page-narrow">
      <Link to={editId ? `/studio/${editId}` : '/studio'} className="back-link">
        ← {editId ? '제작으로 돌아가기' : '작업실'}
      </Link>
      <h1 className="page-title">{editId ? '입력 고치기' : '새 제작'}</h1>
      <p className="page-desc">제품 정보는 카드 문구의 원문이 돼요. 원문에 없는 효능·수치는 카드에 쓰지 않아요.</p>

      <nav className="form-outline" aria-label="입력 단계"><a href="#product-id">01 제품 이름표</a>{form.groups.map((g, i) => <a key={g.title} href={`#form-group-${i}`}>{String(i + 2).padStart(2, '0')} {g.title}</a>)}</nav>
      <p className="page-desc">자료 저장 → 구성안 만들기 → 구성안 승인 → 카드 검토 순서로 진행됩니다. 저장만으로 생성 작업이 시작되지는 않아요.</p>
      {!editId && (
        <MaterialsFill
          fields={fields}
          onFill={(v) => { setValues((prev) => ({ ...prev, ...v })); setDirty(true); }}
          onAddImages={(files) => addFiles(files)}
        />
      )}
      <form className="studio-form" onSubmit={submit} onChangeCapture={() => setDirty(true)}>
        <fieldset className="form-group" id="product-id">
          <legend>제품ID</legend>
          <label className="field">
            <span className="field-label">
              제품ID <em>필수</em>
            </span>
            <input
              title="영문 소문자·숫자·하이픈으로 입력해 주세요"
              value={productId}
              onChange={(e) => setProductId(e.target.value.toLowerCase())}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="예: toneup-sunscreen"
              required
              disabled={Boolean(editId)}
              autoComplete="off"
            />
            <span className="field-guide">영문 소문자·숫자·하이픈을 사용해 주세요. 나중에 같은 제품을 찾는 고유 이름이에요.</span>
          </label>
        </fieldset>

        {form.groups.map((g, i) => (
          <fieldset key={g.title} className="form-group" id={`form-group-${i}`}>
            <legend>{g.title}</legend>
            {g.fields.map((f) =>
              f.type === 'images' ? (
                <ImagesField key={f.key} field={f} images={images} setImages={setImages} addFiles={addFiles} />
              ) : (
                <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
              ),
            )}
          </fieldset>
        ))}

        {error && (
          <p className="notice notice-error" role="alert" id="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || (imageField?.required && images.length === 0)}>
            {saving ? '저장하는 중…' : editId ? '변경사항 저장하고 계속' : '자료 저장하고 계속'}
          </button>
          <span className="muted">저장하면 입력 확인(필수 항목·이미지·지시문 형태 문장)을 바로 해요.</span>
        </div>
      </form>
      {blocker.state === 'blocked' && <dialog className="leave-dialog" aria-labelledby="leave-title" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={e => { e.preventDefault(); blocker.reset(); }}>
        <h2 id="leave-title">입력 중인 자료가 있어요</h2><p>아직 저장하지 않은 내용은 사라집니다. 계속 입력할까요?</p>
        <div className="action-bar"><button className="btn btn-primary" type="button" autoFocus onClick={() => blocker.reset()}>계속 입력하기</button><button className="btn" type="button" onClick={() => blocker.proceed()}>저장하지 않고 나가기</button></div>
      </dialog>}
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
  const imageFiles = files ? [...files].filter((f) => /\.(png|jpe?g)$/i.test(f.name)) : [];
  const run = async () => {
    if (!files || !files.length) return;
    setBusy(true);
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
  return (
    <section className="form-group materials-fill" aria-labelledby="materials-title">
      <h2 id="materials-title" className="panel-title">자료로 채우기 <span className="muted">비워도 돼요</span></h2>
      <p className="muted">제품 소개 PDF·이미지·글을 올리면 Claude가 읽고 아래 '제품 정보' 칸을 채워요. 자료에 적힌 문장만 옮기고, 없는 내용은 비워 둬요. <strong>채워진 내용을 원문과 대조해 확인한 뒤 저장해 주세요.</strong></p>
      <div className="action-bar">
        <label className="btn file-btn">
          자료 고르기 (PDF·PNG·JPG·TXT·MD)
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.md,application/pdf,image/png,image/jpeg,text/plain,text/markdown" multiple onChange={(e) => { setFiles(e.target.files); setResult(null); }} />
        </label>
        <button type="button" className="btn btn-primary" disabled={busy || !files || !files.length} onClick={run}>
          {busy ? '자료 읽는 중… (1~3분)' : '자료로 칸 채우기'}
        </button>
        {files && files.length > 0 && <span className="muted">{[...files].map((f) => f.name).join(', ')}</span>}
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {result && (
        <div className="notice" role="status">
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
  const guide = [f.guide, f.example && f.type === 'list' ? `예: ${f.example.join(' / ')}` : ''].filter(Boolean).join(' · ');
  return (
    <label className="field">
      <span className="field-label">
        {f.key} {f.required ? <em>필수</em> : <span className="muted">비워도 돼요</span>}
      </span>
      {f.type === 'choice' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} required={f.required}>
          {!f.required && <option value="">선택 안 함</option>}
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : f.type === 'paragraph' || f.type === 'list' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={f.type === 'list' ? 5 : 4} required={f.required} placeholder={f.type === 'list' ? '한 줄에 하나씩' : undefined} />
      ) : (
        <input
          type={f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text'}
          placeholder={f.type === 'url' ? 'https://' : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          min={f.min}
          max={f.max}
          inputMode={f.type === 'number' ? 'numeric' : undefined}
        />
      )}
      {guide && <span className="field-guide">{guide}</span>}
    </label>
  );
}

function ImagesField({
  field: f,
  images,
  setImages,
  addFiles,
}: {
  field: FormField;
  images: ImageRow[];
  setImages: (fn: (prev: ImageRow[]) => ImageRow[]) => void;
  addFiles: (files: FileList | null) => void;
}) {
  const update = (i: number, patch: Partial<ImageRow>) => setImages((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="field">
      <span className="field-label">
        {f.key} {f.required ? <em>필수</em> : <span className="muted">비워도 돼요</span>}
      </span>
      <ul className="image-rows">
        {images.map((img, i) => (
          <li key={`${img.file}-${i}`} className="image-row">
            {img.preview && <img src={img.preview} alt="" width={72} height={72} />}
            <div className="image-row-fields">
              <code>{img.file}</code>
              <input aria-label={`${img.file} 설명`} placeholder="설명 (예: 제품 단독 컷)" value={img.desc} onChange={(e) => update(i, { desc: e.target.value })} required />
              <input aria-label={`${img.file} 출처`} placeholder="출처 (예: 직접 촬영)" value={img.source} onChange={(e) => update(i, { source: e.target.value })} required />
              <select aria-label={`${img.file} 사용 가능 여부`} value={img.usage} onChange={(e) => update(i, { usage: e.target.value })}>
                {(f.usage ?? ['가능', '불가', '확인 중']).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <select aria-label={`${img.file} 용도`} title="제품: 배경 지운 제품 사진 · 제형: 크림 자국 같은 질감 사진 · 배경: 제품 없는 연출 장면" value={img.kind} onChange={(e) => update(i, { kind: e.target.value })}>
                {(f.kinds ?? ['제품', '제형', '배경']).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}>
              빼기
            </button>
          </li>
        ))}
      </ul>
      <label className="btn file-btn">
        이미지 추가 (PNG·JPG)
        <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple onChange={(e) => addFiles(e.target.files)} />
      </label>
      <span className="field-guide">출처가 없거나 '불가'면 제작할 수 없어요. 10MB 이하.</span>
    </div>
  );
}

/** 파일 이름에서 쓸 수 없는 글자를 바꿈 (서버도 같은 규칙으로 다시 검사) */
function safeName(name: string) {
  const ext = (name.match(/\.(png|jpe?g)$/i)?.[0] ?? '.png').toLowerCase();
  const base = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9가-힣_-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  return `${base}${ext}`;
}
