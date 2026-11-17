/**
 * 상세페이지 STEP 3 — 준비
 * 스타일(korean_webtoon 기본) · 캐릭터(등장 섹션 있을 때만, 저장된 캐릭터에서 고르기 피커) · 제품 확인 · 비율 2:3 고정 표시
 * 형식·장소·연출 강도 숨김. 승인 → 완성 (섹션 = 컷 자동 생성)
 */
import { useState, useCallback, useRef } from 'react';
import api, { pollJob } from '../../../api/client';
import resolveUrl from '../../../utils/resolveUrl';
import useGateLoad from '../../../hooks/useGateLoad';
import DetailLoad from './DetailLoad';
import { Check, Loader2, Lock, User, Package, AlertTriangle, Plus, Camera, Library, X, Star } from 'lucide-react';

const chipCls = (on) =>
  `px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${on ? 'bg-comic-orange text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'}`;

export default function DetailPrepare({ projectId, episodeId, onRefresh, readOnly }) {
  const [presets, setPresets] = useState([]);
  const [style, setStyle] = useState(null);
  const [sections, setSections] = useState([]);
  const [linked, setLinked] = useState([]);
  const [product, setProduct] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmNoChar, setConfirmNoChar] = useState(false);
  const photoInputRef = useRef(null);

  /* 캐릭터 피커 모달 */
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState('library');   // 'library' | 'preset'
  const [pickerMyChars, setPickerMyChars] = useState([]);
  const [pickerPresets, setPickerPresets] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');

  const load = useCallback(async () => {
    const [pr, st, sec, ln, prods] = await Promise.all([
      api.get('/styles/presets'),
      api.get(`/projects/${projectId}/episodes/${episodeId}/style`),
      api.get(`/projects/${projectId}/episodes/${episodeId}/detail/sections`),
      api.get(`/projects/${projectId}/episodes/${episodeId}/characters`),
      api.get(`/projects/${projectId}/episodes/${episodeId}/products`),
    ]);
    setPresets([...(pr.data.core || []), ...(pr.data.beta || [])]);
    let key = st.data?.preset_key;
    if (!key && !readOnly) {
      await api.put(`/projects/${projectId}/episodes/${episodeId}/style`, { preset_key: 'korean_webtoon' }).catch(() => {});
      key = 'korean_webtoon';
    }
    setStyle(key);
    setSections(sec.data.sections || []);
    setLinked(ln.data || []);
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

  /* 피커 열기 — 사용자 전체 캐릭터 + 프리셋 로드 */
  const openPicker = async () => {
    setShowPicker(true);
    setPickerLoading(true);
    setPickerTab('library');
    setPickerError('');
    try {
      const [libRes, presetRes] = await Promise.all([
        api.get('/characters/mine').catch(() => ({ data: [] })),
        api.get('/characters/presets').catch(() => ({ data: [] })),
      ]);
      const linkedIds = new Set(linked.map(c => c.id));
      setPickerMyChars((libRes.data || []).filter(c => !linkedIds.has(c.id) && c.front_image_url));
      setPickerPresets((presetRes.data || []).filter(c => !linkedIds.has(c.id) && c.front_image_url));
    } catch (err) {
      setPickerError(err.response?.data?.detail || err.message);
    } finally { setPickerLoading(false); }
  };

  /* 피커에서 캐릭터 선택 → link */
  const pickChar = async (c) => {
    if (readOnly) return;
    setPickerError('');
    setBusy(`char:${c.id}`);
    try {
      for (const l of linked) {
        if (l.id !== c.id) await api.delete(`/projects/${projectId}/episodes/${episodeId}/characters/${l.id}/link`);
      }
      await api.post(`/projects/${projectId}/episodes/${episodeId}/characters/link`, { character_id: c.id });
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/characters`);
      setLinked(data || []);
      setShowPicker(false);
    } catch (err) {
      setPickerError(err.response?.data?.detail || '캐릭터를 불러오지 못했어요');
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
            {/* 현재 연결된 캐릭터 표시 */}
            {linkedChar && (
              <div className="flex items-center gap-3 mb-3 p-3 rounded-xl border-2 border-comic-orange bg-comic-orange/5">
                {linkedChar.front_image_url ? (
                  <img src={resolveUrl(linkedChar.front_image_url)} alt={linkedChar.name || '캐릭터'} className="w-14 h-14 object-cover rounded-lg bg-gray-50 dark:bg-zinc-900" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center"><User size={20} className="text-gray-400" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-black dark:text-white truncate">{linkedChar.name || '이름 없음'}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">선택됨</p>
                </div>
                <Check size={18} className="text-comic-orange shrink-0" />
              </div>
            )}
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <button onClick={openPicker} disabled={!!busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-50 transition-colors">
                  <Library size={12} /> 저장된 캐릭터에서 고르기
                </button>
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

      {/* 캐릭터 피커 모달 */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPicker(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border-2 border-border dark:border-zinc-700 shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-zinc-700">
              <h3 className="font-bold text-ink-black dark:text-white flex items-center gap-2">
                <Library size={18} className="text-purple-500" /> 캐릭터 불러오기
              </h3>
              <button onClick={() => setShowPicker(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* 탭 */}
            <div className="flex border-b border-border dark:border-zinc-700">
              <button
                onClick={() => setPickerTab('library')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${pickerTab === 'library' ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                <span className="inline-flex items-center gap-1"><Star size={12} /> 내 캐릭터 ({pickerMyChars.length})</span>
              </button>
              <button
                onClick={() => setPickerTab('preset')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${pickerTab === 'preset' ? 'text-yellow-600 dark:text-yellow-400 border-b-2 border-yellow-600 dark:border-yellow-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                프리셋 ({pickerPresets.length})
              </button>
            </div>

            {/* 에러 */}
            {pickerError && (
              <div className="mx-4 mt-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-xs font-bold">
                {pickerError}
              </div>
            )}

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto p-4">
              {pickerLoading ? (
                <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">불러오는 중...</p>
              ) : (
                <>
                  {pickerTab === 'library' && pickerMyChars.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-400 dark:text-gray-500">저장된 캐릭터가 없어요.</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">한 컷·인스타툰에서 ⭐ 버튼으로 등록할 수 있어요.</p>
                    </div>
                  )}
                  {pickerTab === 'preset' && pickerPresets.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-400 dark:text-gray-500">프리셋 캐릭터가 없어요.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {(pickerTab === 'library' ? pickerMyChars : pickerPresets).map(c => (
                      <div
                        key={c.id}
                        className="relative flex flex-col items-center gap-2 p-3 border-2 rounded-xl bg-white/50 dark:bg-zinc-800/50 hover:-translate-y-0.5 transition-all cursor-pointer border-border dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-500"
                        onClick={() => pickChar(c)}
                      >
                        {c.front_image_url ? (
                          <img src={resolveUrl(c.front_image_url)} alt={c.name} className="w-16 h-16 object-cover rounded-lg border border-border dark:border-zinc-600" />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-zinc-700 flex items-center justify-center">
                            <User size={20} className="text-gray-300 dark:text-gray-600" />
                          </div>
                        )}
                        <div className="text-center w-full">
                          <div className="font-bold text-sm text-ink-black dark:text-white truncate">
                            {c.name || c.ref_key}
                            {c.is_photo_real && (
                              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">실사</span>
                            )}
                            {c.is_preset && (
                              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">프리셋</span>
                            )}
                          </div>
                          {c.episode_count != null && (
                            <div className="text-[10px] text-gray-400 dark:text-gray-500">{c.episode_count}개 에피소드에서 사용 중</div>
                          )}
                        </div>
                        {busy === `char:${c.id}` && <span className="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center"><Loader2 size={18} className="animate-spin text-white" /></span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
