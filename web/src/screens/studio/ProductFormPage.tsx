// S2 새 제작 · 입력 고치기 (웹 모드) — 담당 이규동
// 입력 폼은 config/input-form.json 정의로 그림 → 저장하면 서버가 products/<제품ID>/input.md를 만들고 입력 확인
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { studioFetch, useStudioStatus, imageUrl, type FormDef, type FormField, type ProductDetail } from '../../studio/api';
import { ErrorState, Loading } from '../../components/StateView';
import { StudioOff } from './StudioCommon';
import './studio.css';

interface ImageRow {
  file: string;
  desc: string;
  source: string;
  usage: string;
  data?: string; // base64 (새로 고른 파일만)
  preview?: string;
}

type Values = Record<string, string>;

export function ProductFormPage() {
  const { status } = useStudioStatus();
  const { id } = useParams();
  if (status === undefined) return <div className="page"><Loading /></div>;
  if (status === null) return <StudioOff />;
  return <ProductForm form={status.form} editId={id} />;
}

function ProductForm({ form, editId }: { form: FormDef; editId?: string }) {
  const navigate = useNavigate();
  const fields = useMemo(() => form.groups.flatMap((g) => g.fields), [form]);
  const imageField = fields.find((f) => f.type === 'images');
  const [productId, setProductId] = useState(editId ?? '');
  const [values, setValues] = useState<Values>({});
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(Boolean(editId));
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 입력 고치기: 기존 값 불러오기
  useEffect(() => {
    if (!editId) return;
    studioFetch<ProductDetail>(`/products/${editId}`).then(
      (d) => {
        const v: Values = {};
        for (const [k, x] of Object.entries(d.input.values)) v[k] = Array.isArray(x) ? x.join('\n') : x;
        setValues(v);
        setImages(d.input.images.map((img) => ({ ...img, preview: imageUrl(editId, img.file) })));
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
    const rows = await Promise.all(
      [...files].map(
        (f) =>
          new Promise<ImageRow>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const url = String(reader.result);
              resolve({ file: safeName(f.name), desc: '', source: '', usage: '가능', data: url.split(',')[1], preview: url });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(f);
          }),
      ),
    );
    setImages((prev) => [...prev, ...rows]);
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
      images: images.map(({ file, desc, source, usage, data }) => ({ file, desc, source, usage, data })),
    };
    try {
      const d = editId
        ? await studioFetch<ProductDetail>(`/products/${editId}/input`, { method: 'PUT', body })
        : await studioFetch<ProductDetail>('/products', { method: 'POST', body });
      navigate(`/studio/${d.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
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

      <form className="studio-form" onSubmit={submit}>
        <fieldset className="form-group">
          <legend>제품ID</legend>
          <label className="field">
            <span className="field-label">
              제품ID <em>필수</em>
            </span>
            <input
              value={productId}
              onChange={(e) => setProductId(e.target.value.toLowerCase())}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="예: toneup-sunscreen"
              required
              disabled={Boolean(editId)}
              autoComplete="off"
            />
            <span className="field-guide">영문 소문자·숫자·하이픈만. 폴더 이름(products/제품ID)과 결과 주소에 쓰여요.</span>
          </label>
        </fieldset>

        {form.groups.map((g) => (
          <fieldset key={g.title} className="form-group">
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
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || (imageField?.required && images.length === 0)}>
            {saving ? '저장하는 중…' : editId ? '저장하고 입력 확인' : '만들고 입력 확인'}
          </button>
          <span className="muted">저장하면 입력 확인(필수 항목·이미지·지시문 형태 문장)을 바로 해요.</span>
        </div>
      </form>
    </div>
  );
}

function Field({ field: f, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  const guide = [f.guide, f.example && f.type === 'list' ? `예: ${f.example.join(' / ')}` : ''].filter(Boolean).join(' · ');
  return (
    <label className="field">
      <span className="field-label">
        {f.key} {f.required ? <em>필수</em> : <span className="muted">선택</span>}
      </span>
      {f.type === 'paragraph' || f.type === 'list' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={f.type === 'list' ? 5 : 4} required={f.required} placeholder={f.type === 'list' ? '한 줄에 하나씩' : undefined} />
      ) : (
        <input
          type={f.type === 'number' ? 'number' : 'text'}
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
        {f.key} {f.required ? <em>필수</em> : <span className="muted">선택</span>}
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
