/**
 * 상세페이지 STEP 3 — 준비
 * 스타일(korean_webtoon 기본) · 캐릭터(등장 섹션 있을 때만, 저장된 캐릭터 1명) · 제품 확인 · 비율 2:3 고정 표시
 * 형식·장소·연출 강도 숨김. 승인 → 완성 (섹션 = 컷 자동 생성)
 */
import { useState, useCallback, useRef } from 'react';
import api, { pollJob } from '../../../api/client';
import resolveUrl from '../../../utils/resolveUrl';
import useGateLoad from '../../../hooks/useGateLoad';
import DetailLoad from './DetailLoad';
import { Check, Loader2, Lock, User, Package, AlertTriangle, Plus, Camera } from 'lucide-react';

const chipCls = (on) =>
  `px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${on ? 'bg-comic-orange text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'}`;

export default function DetailPrepare({ projectId, episodeId, onRefresh, readOnly }) {
  const [presets, setPresets] = useState([]);
  const [style, setStyle] = useState(null);
  const [sections, setSections] = useState([]);
  const [linked, setLinked] = useState([]);
  const [library, setLibrary] = useState([]);
  const [product, setProduct] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmNoChar, setConfirmNoChar] = useState(false);
  const photoInputRef = useRef(null);

  const load = useCallback(async () => {
    const [pr, st, sec, ln, lib, proj, prods] = await Promise.all([
      api.get('/styles/presets'),
      api.get(`/projects/${projectId}/episodes/${episodeId}/style`),
      api.get(`/projects/${projectId}/episodes/${episodeId}/detail/sections`),
      api.get(`/projects/${projectId}/episodes/${episodeId}/characters`),
      api.get('/users/me/characters').catch(() => ({ data: [] })),
      api.get(`/projects/${projectId}/characters`).catch(() => ({ data: [] })),
      api.get(`/projects/${projectId}/episodes/${episodeId}/products`),
    ]);
    setPresets([...(pr.data.core || []), ...(pr.data.beta || [])]);
    let key = st.data?.preset_key;
    if (!key && !readOnly) {
      // 기본 korean_webtoon
      await api.put(`/projects/${projectId}/episodes/${episodeId}/style`, { preset_key: 'korean_webtoon' }).catch(() => {});
      key = 'korean_webtoon';
    }
    setStyle(key);
    setSections(sec.data.sections || []);
    setLinked(ln.data || []);
    const seen = new Set();
    setLibrary([...(lib.data || []), ...(proj.data || [])].filter((c) => c.front_image_url && !seen.has(c.id) && seen.add(c.id)));
    setProduct(prods.data[0] || null);
  }, [projectId, episodeId, readOnly]);
  const { loading, error: loadError, retry } = useGateLoad(load, [load]);

  const needsChar = sections.some((s) => s.character);
  const linkedChar = linked[0] || null;

  const pickStyle = async (key) => {
    if (readOnly || key === style) return;
    setBusy('style'); setError('');
    try {
      await api.put(`/projects/${projectId}/episodes/${episodeId}/style`, { preset_key: key });
      setStyle(key);
    } catch (err) {
      setError(err.response?.data?.detail || '스타일을 바꾸지 못했어요');
    } finally { setBusy(''); }
  };

  const pickChar = async (c) => {
    if (readOnly) return;
    setBusy(`char:${c.id}`); setError('');
    try {
      for (const l of linked) {
        if (l.id !== c.id) await api.delete(`/projects/${projectId}/episodes/${episodeId}/characters/${l.id}/link`);
      }
      await api.post(`/projects/${projectId}/episodes/${episodeId}/characters/link`, { character_id: c.id });
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/characters`);
      setLinked(data || []);
    } catch (err) {
      setError(err.response?.data?.detail || '캐릭터를 불러오지 못했어요');
    } finally { setBusy(''); }
  };

  const createNewChar = async () => {
    setBusy('create'); setError('');
    try {
      const stub = await api.post(`/projects/${projectId}/episodes/${episodeId}/characters/stub`, { ref_key: 'model' });
      const charId = stub.data.id;
      const { data } = await api.post(`/characters/${charId}/regenerate`);
      await pollJob(data.job_id);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || '캐릭터를 만들지 못했어요');
    } finally { setBusy(''); }
  };

  const handlePhotoReal = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy('photo'); setError('');
    try {
      const stub = await api.post(`/projects/${projectId}/episodes/${episodeId}/characters/stub`, { ref_key: 'model', is_photo_real: true });
      const charId = stub.data.id;
      const formData = new FormData();
      formData.append('files', file);
      await api.post(`/characters/${charId}/photos?is_photo_real=true&consent_given=true`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || '사진을 올리지 못했어요');
    } finally { setBusy(''); }
  };

  const approve = async () => {
    if (needsChar && !linkedChar && !confirmNoChar) { setConfirmNoChar(true); return; }
    setBusy('approve'); setError('');
    try {
      await api.post(`/projects/${projectId}/episodes/${episodeId}/assets/approve`, {});
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || '진행하지 못했어요');
      setBusy('');
    }
  };

  if (loading || loadError) return <DetailLoad loading={loading} error={loadError} onRetry={retry} />;

  const front = product?.photos?.find((p) => p.kind === 'front');

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 비율 고정 */}
      <div className="glass-card p-4 flex items-center gap-3">
        <div className="w-8 h-12 rounded-md border-2 border-comic-orange bg-comic-orange/10 shrink-0" />
        <div className="min-w-0">
          <p className="font-bold text-sm text-ink-black dark:text-white flex items-center gap-1.5">세로 2:3 <Lock size={12} className="text-gray-400" /></p>
          <p className="text-xs text-gray-500 dark:text-gray-400 break-keep">상세페이지는 섹션을 세로로 이어 붙이기 때문에 비율이 고정돼요.</p>
        </div>
      </div>

      {/* 스타일 */}
      <section className="glass-card p-4 sm:p-5">
        <h3 className="font-bold text-ink-black dark:text-white mb-2.5">그림 스타일</h3>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p.key} onClick={() => pickStyle(p.key)} disabled={!!busy} className={chipCls(style === p.key)}>
              {p.label}{p.tier === 'beta' && <span className="ml-1 opacity-60">β</span>}
            </button>
          ))}
        </div>
      </section>

      {/* 캐릭터 */}
      <section className="glass-card p-4 sm:p-5">
        <h3 className="font-bold text-ink-black dark:text-white flex items-center gap-1.5"><User size={15} /> 캐릭터</h3>
        {!needsChar ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">모든 섹션이 &lsquo;제품만&rsquo;이라 캐릭터가 필요 없어요.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3 break-keep">
              &lsquo;등장&rsquo; 섹션 {sections.filter((s) => s.character).length}개에 나올 캐릭터 1명을 골라 주세요.
            </p>
            {library.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 mb-3">
                {library.map((c) => {
                  const on = linkedChar?.id === c.id;
                  return (
                    <button key={c.id} onClick={() => pickChar(c)} disabled={!!busy || readOnly}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all ${on ? 'border-comic-orange ring-4 ring-comic-orange/20' : 'border-border dark:border-zinc-700 hover:border-comic-orange/60'}`}>
                      <img src={resolveUrl(c.front_image_url)} alt={c.name || '캐릭터'} className="w-full aspect-[3/4] object-cover bg-gray-50 dark:bg-zinc-900" />
                      <p className="text-[11px] font-bold py-1 text-ink-black dark:text-white truncate px-1">{c.name || '이름 없음'}</p>
                      {on && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-comic-orange text-white flex items-center justify-center"><Check size={12} /></span>}
                      {busy === `char:${c.id}` && <span className="absolute inset-0 bg-black/30 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-white" /></span>}
                    </button>
                  );
                })}
              </div>
            )}
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <button onClick={createNewChar} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {busy === 'create' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} 새로 만들기 · 2패킷
                </button>
                <button onClick={() => photoInputRef.current?.click()} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors">
                  {busy === 'photo' ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} 실사 사진으로
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoReal} />
              </div>
            )}
            {library.length === 0 && !busy && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 break-keep">
                저장된 캐릭터가 없어요. 위 버튼으로 새로 만들거나 한 컷·인스타툰에서 저장한 캐릭터가 여기에 나와요.
              </p>
            )}
          </>
        )}
      </section>

      {/* 제품 확인 */}
      <section className="glass-card p-4 sm:p-5">
        <h3 className="font-bold text-ink-black dark:text-white flex items-center gap-1.5 mb-2.5"><Package size={15} /> 제품</h3>
        {product ? (
          <div className="flex items-center gap-3">
            {front && <img src={resolveUrl(front.image_url)} alt="제품" className="w-16 h-16 object-contain rounded-lg bg-white dark:bg-zinc-900 border border-border dark:border-zinc-700" />}
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink-black dark:text-white truncate">{product.name_ko || product.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">사진 {product.photos?.length || 0}장 — 모든 섹션에 참고로 들어가요</p>
            </div>
          </div>
        ) : (
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">제품 사진이 없어요 — 브리프에서 정면 사진을 올려 주세요.</p>
        )}
      </section>

      {error && <p className="text-sm font-bold text-red-500 dark:text-red-400">{error}</p>}
      {confirmNoChar && (
        <p className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-start gap-1.5 break-keep">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" /> 캐릭터 없이 진행하면 &lsquo;등장&rsquo; 섹션에는 그때그때 다른 인물이 그려질 수 있어요. 그래도 진행하려면 한 번 더 눌러 주세요.
        </p>
      )}

      {!readOnly && (
        <button onClick={approve} disabled={!!busy} className="neon-btn w-full flex items-center justify-center gap-2 disabled:opacity-50">
          {busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : null} 준비 완료 → 완성
        </button>
      )}
    </div>
  );
}
