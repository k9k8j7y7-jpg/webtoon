/**
 * 상세페이지 STEP 1 — 브리프 (제품 먼저)
 * 제품 사진(정면 필수 + 측면·후면·탑뷰·손에 든 사진 선택) → 분석 칩 → 제품명·특징·활용법 프리필
 * → [웹에서 보완] → 타깃·톤 → [상세페이지 기획안 만들기](0패킷) → 섹션 단계
 */
import { useState, useCallback } from 'react';
import api from '../../../api/client';
import resolveUrl from '../../../utils/resolveUrl';
import useGateLoad from '../../../hooks/useGateLoad';
import DetailLoad from './DetailLoad';
import { Camera, X, Sparkles, Globe, Loader2, Check } from 'lucide-react';

const PHOTO_SLOTS = [
  { kind: 'front', label: '정면', required: true },
  { kind: 'side', label: '측면' },
  { kind: 'back', label: '후면' },
  { kind: 'top', label: '탑뷰' },
  { kind: 'holding', label: '손에 든 사진' },
];
export const DETAIL_TONES = [
  { key: 'hook', label: '후킹', desc: '공감·문제 제기로 시작' },
  { key: 'info', label: '정보', desc: '성분·사용법 중심' },
  { key: 'premium', label: '프리미엄', desc: '절제된 고급 문장' },
];
const SHAPE_KR = { bottle: '병', can: '캔', box: '상자', tube: '튜브', flat: '납작형', pouch: '파우치', other: '기타' };
const SIZE_KR = { palm: '손바닥 크기', one_hand: '한 손', two_hands: '두 손', tabletop: '탁상형', large: '대형' };

const inputCls =
  'w-full px-3.5 py-2.5 border-2 border-border dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-xl text-sm text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all';
const labelCls = 'block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5';
const chipCls = (on) =>
  `px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${on ? 'bg-comic-orange text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'}`;

export default function DetailBriefForm({ projectId, episodeId, onRefresh, readOnly }) {
  const [product, setProduct] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [form, setForm] = useState({ product_name: '', features: '', usage: '', web_info: '', target: '', tone: 'hook' });
  const [busy, setBusy] = useState(''); // 'upload:front' | 'analyze' | 'enrich' | 'plan'
  const [enrich, setEnrich] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [{ data: prods }, secRes] = await Promise.all([
      api.get(`/projects/${projectId}/episodes/${episodeId}/products`),
      api.get(`/projects/${projectId}/episodes/${episodeId}/detail/sections`).catch(() => ({ data: {} })),
    ]);
    const p = prods[0] || null;
    setProduct(p);
    setPhotos(p?.photos || []);
    const b = secRes.data?.brief || {};
    setForm((f) => ({
      ...f,
      product_name: b.product_name || p?.name_ko || p?.name || '',
      features: b.features || p?.features || '',
      usage: b.usage || '',
      web_info: b.web_info || '',
      target: b.target || '',
      tone: b.tone || 'hook',
    }));
  }, [projectId, episodeId]);
  const { loading, error: loadError, retry } = useGateLoad(load, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const photoOf = (kind) => photos.find((x) => x.kind === kind);

  const ensureProduct = async () => {
    if (product) return product;
    const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/products`, { name: form.product_name || '제품' });
    const p = { id: data.id, name: data.name };
    setProduct(p);
    return p;
  };

  const runAnalyze = async (pid) => {
    setBusy('analyze');
    try {
      const { data } = await api.post(`/products/${pid}/analyze`);
      setAnalysis(data);
      await api.put(`/products/${pid}`, {
        name_ko: data.name_ko || undefined, label_text: data.label_text || undefined,
        shape: data.shape || undefined, size_hint: data.size_hint || undefined,
        description: data.description || undefined, size_ratio: data.size_ratio || undefined,
      });
      if (data.palette?.length) {
        await api.put(`/projects/${projectId}/episodes/${episodeId}/idea-brief/selection`, { product_palette: data.palette });
      }
      // 분석값 프리필 — 비어 있는 칸만
      setForm((f) => ({
        ...f,
        product_name: f.product_name || data.name_ko || data.name || '',
        features: f.features || (data.label_text || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6).join(', '),
      }));
    } catch (err) {
      setError(err.response?.data?.detail || '사진 분석에 실패했어요 — 직접 적어도 괜찮아요');
    } finally {
      setBusy('');
    }
  };

  const upload = async (kind, file) => {
    if (!file) return;
    setError('');
    setBusy(`upload:${kind}`);
    try {
      const p = await ensureProduct();
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);
      const { data } = await api.post(`/products/${p.id}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotos(data.photos || []);
      setBusy('');
      if (kind === 'front' || (kind === 'holding' && photoOf('front'))) await runAnalyze(p.id);
    } catch (err) {
      setError(err.response?.data?.detail || '사진을 올리지 못했어요');
      setBusy('');
    }
  };

  const removePhoto = async (ph) => {
    try {
      const { data } = await api.delete(`/products/${product.id}/photos/${ph.id}`);
      setPhotos(data.photos || []);
    } catch (err) {
      setError(err.response?.data?.detail || '사진을 지우지 못했어요');
    }
  };

  const runEnrich = async () => {
    if (!form.product_name.trim()) { setError('제품명을 먼저 적어 주세요'); return; }
    setBusy('enrich');
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/ad-brief/enrich-product`, {
        name: form.product_name, info: form.features,
      });
      setEnrich(data);
    } catch (err) {
      setError(err.response?.data?.detail || '웹 보완에 실패했어요');
    } finally {
      setBusy('');
    }
  };

  const applyEnrich = () => {
    if (!enrich) return;
    const web = [enrich.features, enrich.ingredients].filter(Boolean).join('\n');
    setForm((f) => ({
      ...f,
      web_info: [f.web_info, web].filter(Boolean).join('\n'),
      usage: f.usage || enrich.usage || '',
    }));
    setEnrich(null);
  };

  const makePlan = async () => {
    if (!photoOf('front')) { setError('정면 사진을 먼저 올려 주세요'); return; }
    if (!form.product_name.trim()) { setError('제품명을 적어 주세요'); return; }
    setBusy('plan');
    setError('');
    try {
      if (product) await api.put(`/products/${product.id}`, { name: product.name || form.product_name, features: form.features });
      await api.post(`/projects/${projectId}/episodes/${episodeId}/detail/plan`, form);
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || '기획안을 만들지 못했어요 — 다시 눌러 주세요');
      setBusy('');
    }
  };

  if (loading || loadError) return <DetailLoad loading={loading} error={loadError} onRetry={retry} />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* ── 1. 제품 사진 ── */}
      <section className="glass-card p-4 sm:p-5">
        <h3 className="font-bold text-ink-black dark:text-white">제품 사진</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3 break-keep">
          정면 사진은 꼭 필요해요. 측면·후면 사진이 있으면 라벨과 모양이 더 정확해져요. (투명 배경 PNG 권장)
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {PHOTO_SLOTS.map((s) => {
            const ph = photoOf(s.kind);
            const up = busy === `upload:${s.kind}`;
            return (
              <div key={s.kind} className="relative">
                <label
                  className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-colors ${
                    ph ? 'border-transparent bg-white dark:bg-zinc-900' : s.required ? 'border-comic-orange/60 bg-comic-orange/5' : 'border-border dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/60'
                  } ${readOnly ? 'pointer-events-none' : ''}`}
                >
                  {ph ? (
                    <img src={resolveUrl(ph.image_url)} alt={s.label} className="w-full h-full object-contain" />
                  ) : up ? (
                    <Loader2 size={20} className="animate-spin text-comic-orange" />
                  ) : (
                    <>
                      <Camera size={18} className="text-gray-400 dark:text-zinc-500" />
                      <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 mt-1">추가</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" disabled={readOnly || !!busy}
                    onChange={(e) => { upload(s.kind, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {ph && s.kind !== 'front' && !readOnly && (
                  <button onClick={() => removePhoto(ph)} aria-label={`${s.label} 사진 지우기`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 text-white flex items-center justify-center">
                    <X size={11} />
                  </button>
                )}
                <p className="text-center text-[11px] font-bold text-gray-500 dark:text-gray-400 mt-1">
                  {s.label}{s.required && <span className="text-comic-orange"> *</span>}
                </p>
              </div>
            );
          })}
        </div>
        {busy === 'analyze' && (
          <p className="mt-3 text-xs font-bold text-comic-orange flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> 사진을 분석하고 있어요…</p>
        )}
        {analysis && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[analysis.name_ko || analysis.name, SHAPE_KR[analysis.shape], SIZE_KR[analysis.size_hint], analysis.colors,
              analysis.size_ratio ? `손 대비 ${analysis.size_ratio}배` : null].filter(Boolean).map((t, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{t}</span>
            ))}
          </div>
        )}
      </section>

      {/* ── 2. 제품 정보 ── */}
      <section className="glass-card p-4 sm:p-5 space-y-3.5">
        <div>
          <label className={labelCls}>제품명 *</label>
          <input className={inputCls} value={form.product_name} onChange={set('product_name')} disabled={readOnly} placeholder="예: 자연바람 아로마 그린티 스캘프 허브팩 1000g" />
        </div>
        <div>
          <label className={labelCls}>특징 (사실만 적어 주세요 — 수치·인증은 적은 것만 들어가요)</label>
          <textarea className={`${inputCls} min-h-[84px]`} value={form.features} onChange={set('features')} disabled={readOnly} placeholder="예: 녹차 쿨링 성분, 각질·피지 케어, 1000g 대용량" />
        </div>
        <div>
          <label className={labelCls}>활용법</label>
          <textarea className={`${inputCls} min-h-[64px]`} value={form.usage} onChange={set('usage')} disabled={readOnly} placeholder="예: 샴푸 후 도포, 3분 마사지, 5~10분 뒤 헹굼" />
        </div>
        {!readOnly && (
          <button onClick={runEnrich} disabled={!!busy}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border-2 border-border dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:border-comic-orange disabled:opacity-50">
            {busy === 'enrich' ? <Loader2 size={13} className="animate-spin" /> : <Globe size={13} />} 웹에서 보완
          </button>
        )}
        {enrich && (
          <div className="rounded-xl border-2 border-comic-blue/30 bg-comic-blue/5 dark:bg-comic-blue/10 p-3 text-xs text-gray-700 dark:text-gray-300 space-y-1.5">
            {enrich.error && <p className="font-bold text-amber-600 dark:text-amber-400">{enrich.error}</p>}
            {enrich.features && <p><b>특징</b> {enrich.features}</p>}
            {enrich.ingredients && <p><b>성분</b> {enrich.ingredients}</p>}
            {enrich.usage && <p><b>활용법</b> {enrich.usage}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={applyEnrich} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-comic-blue text-white font-bold"><Check size={12} /> 반영</button>
              <button onClick={() => setEnrich(null)} className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 font-bold text-gray-500 dark:text-gray-400">닫기</button>
            </div>
          </div>
        )}
        {form.web_info && (
          <div>
            <label className={labelCls}>웹 보완 정보 (고칠 수 있어요)</label>
            <textarea className={`${inputCls} min-h-[64px]`} value={form.web_info} onChange={set('web_info')} disabled={readOnly} />
          </div>
        )}
      </section>

      {/* ── 3. 타깃·톤 ── */}
      <section className="glass-card p-4 sm:p-5 space-y-3.5">
        <div>
          <label className={labelCls}>누구에게 파나요</label>
          <input className={inputCls} value={form.target} onChange={set('target')} disabled={readOnly} placeholder="예: 두피 열감·냄새가 고민인 30~40대" />
        </div>
        <div>
          <label className={labelCls}>기획안 톤</label>
          <div className="flex flex-wrap gap-2">
            {DETAIL_TONES.map((t) => (
              <button key={t.key} onClick={() => !readOnly && setForm((f) => ({ ...f, tone: t.key }))} className={chipCls(form.tone === t.key)} title={t.desc}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1.5">{DETAIL_TONES.find((t) => t.key === form.tone)?.desc}</p>
        </div>
      </section>

      {error && <p className="text-sm font-bold text-red-500 dark:text-red-400">{error}</p>}

      {!readOnly && (
        <button onClick={makePlan} disabled={!!busy} className="neon-btn w-full flex items-center justify-center gap-2 disabled:opacity-50">
          {busy === 'plan' ? <><Loader2 size={16} className="animate-spin" /> 기획안 만드는 중… (20초쯤)</> : <><Sparkles size={16} /> 상세페이지 기획안 만들기 · 무료</>}
        </button>
      )}
    </div>
  );
}
