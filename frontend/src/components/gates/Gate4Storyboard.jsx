import { useState, useEffect, useRef } from 'react';
import api from '../../api/client';
import { LayoutGrid, Check, RefreshCw, AlertTriangle, MessageSquare, MapPin, Clapperboard, Pencil, X, SlidersHorizontal, Plus, Camera, ChevronDown, Sparkles, Trash2, Image as ImageIcon } from 'lucide-react';
import ErrorBoundary from '../ErrorBoundary';
import { locationName, locationOptionLabel, characterName } from '../../utils/refNames';

const imageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `/WEBTOON${url}`;
};

export default function Gate4Storyboard({ projectId, episodeId, onRefresh, readOnly = false, gateStatus }) {
  const [cuts, setCuts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');

  // 컷 수 조정
  const [recommendation, setRecommendation] = useState(null);
  const [targetCount, setTargetCount] = useState('');
  const [adjustError, setAdjustError] = useState('');

  // 컷 편집 모달
  const [editingCut, setEditingCut] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // 캐릭터 (이름 표시용)
  const [episodeCharacters, setEpisodeCharacters] = useState([]);

  // 장소
  const [locations, setLocations] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locSaving, setLocSaving] = useState(null);
  const [locSpecUpdated, setLocSpecUpdated] = useState(null);
  const [showSpecEn, setShowSpecEn] = useState({});
  const [locGenJobId, setLocGenJobId] = useState(null);
  const [locDeleting, setLocDeleting] = useState(null);
  const [uploadingPhotoLocId, setUploadingPhotoLocId] = useState(null);
  // 자동 저장 상태: { [ref_key]: 'dirty' | 'saving' | 'saved' | 'error' | 'spec' }
  const [locSaveStatus, setLocSaveStatus] = useState({});
  // 원본 값 (서버에서 로드된 값) — blur 시 비교 대상
  const locOriginalsRef = useRef({});

  const isInvalidated = gateStatus?.gates?.['4_storyboard']?.status === 'invalidated';

  const loadCuts = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/cuts`);
      setCuts(data);
    } catch {}
  };

  const loadRecommendation = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/storyboard/recommend`);
      setRecommendation(data);
    } catch {}
  };

  const loadLocations = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/locations`);
      setLocations(data);
      // 원본 스냅샷 저장 (blur 비교용)
      const origs = {};
      data.forEach(l => { origs[l.ref_key] = { name: l.name || '', description: l.description || '', mood_notes: l.mood_notes || '' }; });
      locOriginalsRef.current = origs;
    } catch {}
  };

  const loadCharacters = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/characters`);
      setEpisodeCharacters(data);
    } catch {}
  };

  useEffect(() => {
    loadCuts();
    loadRecommendation();
    loadLocations();
    loadCharacters();
  }, []);

  // 장소 0개면 자동 AI 제안 (episodeId당 1회)
  const suggestTriedRef = useRef(null);
  useEffect(() => {
    suggestTriedRef.current = null; // 에피소드 변경 시 리셋
  }, [episodeId]);
  useEffect(() => {
    if (locations.length === 0 && !locLoading && !readOnly && suggestTriedRef.current !== episodeId) {
      suggestTriedRef.current = episodeId;
      autoSuggestLocations();
    }
  }, [locations.length, episodeId]);

  const autoSuggestLocations = async () => {
    setLocLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/locations/suggest`);
      const suggestions = data.locations || [];
      if (suggestions.length === 0) return;

      // 기존 DB 장소의 ref_key 집합
      const existing = await api.get(`/projects/${projectId}/episodes/${episodeId}/locations`);
      const existingKeys = new Set((existing.data || []).map(l => l.ref_key));
      const newSuggestions = suggestions.filter(s => !existingKeys.has(s.ref_key));

      if (newSuggestions.length > 0) {
        // 일괄 DB 생성 (텍스트 전용, 이미지 없음 — skip_images 마커)
        await api.post(`/projects/${projectId}/episodes/${episodeId}/locations`, {
          locations: newSuggestions.map(s => ({
            ref_key: s.ref_key,
            name: s.name || s.ref_key,
            description: s.description || '',
            mood_notes: s.mood_notes || '',
            skip_images: true,
          })),
        });
      }
      // DB에서 전체 목록 재조회 (항상 신뢰할 수 있는 소스)
      await loadLocations();
    } catch (err) {
      console.error('auto suggest failed', err);
    } finally {
      setLocLoading(false);
    }
  };

  // 장소 텍스트 저장 (blur 시) — 원본과 비교 후 변경분만 저장
  const saveLocation = async (loc) => {
    if (!loc.id) return;
    const orig = locOriginalsRef.current[loc.ref_key] || {};
    const updates = {};
    if ((loc.name || '') !== (orig.name || '')) updates.name = loc.name;
    if ((loc.description || '') !== (orig.description || '')) updates.description = loc.description;
    if ((loc.mood_notes || '') !== (orig.mood_notes || '')) updates.mood_notes = loc.mood_notes;
    if (Object.keys(updates).length === 0) return; // 변경 없음

    setLocSaveStatus(prev => ({ ...prev, [loc.ref_key]: 'saving' }));
    try {
      const { data } = await api.put(`/locations/${loc.id}`, updates);
      // 원본 갱신
      locOriginalsRef.current[loc.ref_key] = {
        name: data.name || '', description: data.description || '', mood_notes: data.mood_notes || '',
      };
      // 로컬 state에 서버 응답 반영 (spec_en 등)
      setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, ...data } : l));
      if (data.location_spec_en) {
        setLocSaveStatus(prev => ({ ...prev, [loc.ref_key]: 'spec' }));
        setTimeout(() => setLocSaveStatus(prev => ({ ...prev, [loc.ref_key]: 'saved' })), 1500);
      } else {
        setLocSaveStatus(prev => ({ ...prev, [loc.ref_key]: 'saved' }));
      }
      setTimeout(() => setLocSaveStatus(prev => {
        const next = { ...prev };
        if (next[loc.ref_key] === 'saved') delete next[loc.ref_key];
        return next;
      }), 3000);
    } catch (err) {
      setLocSaveStatus(prev => ({ ...prev, [loc.ref_key]: 'error' }));
    }
  };

  // 장소 삭제
  const deleteLocation = async (loc) => {
    if (!loc.id) return;
    setLocDeleting(loc.id);
    try {
      await api.delete(`/locations/${loc.id}`);
      await loadLocations();
    } catch (err) {
      setError(err.response?.data?.detail || '장소 삭제에 실패했습니다.');
    } finally {
      setLocDeleting(null);
    }
  };

  // 장소 이미지 만들기 (1패킷)
  const generateLocationImage = async (loc) => {
    if (!loc.id) return;
    try {
      const { data } = await api.post(`/locations/${loc.id}/regenerate`);
      setLocGenJobId(data.job_id);
      // poll job
      const poll = setInterval(async () => {
        try {
          const jr = await api.get(`/jobs/${data.job_id}`);
          if (jr.data.status === 'completed' || jr.data.status === 'failed') {
            clearInterval(poll);
            setLocGenJobId(null);
            await loadLocations();
          }
        } catch { clearInterval(poll); setLocGenJobId(null); }
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.detail || '장소 이미지 생성에 실패했습니다.');
    }
  };

  // 사진 업로드 (무료 — 비전 추출만)
  const uploadLocationPhoto = async (loc, file) => {
    if (!loc.id) return;
    setUploadingPhotoLocId(loc.id);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.post(`/locations/${loc.id}/photo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadLocations();
    } catch (err) {
      setError(err.response?.data?.detail || '사진 업로드에 실패했습니다.');
    } finally {
      setUploadingPhotoLocId(null);
    }
  };

  // AI 제안 다시 (없는 것만 추가)
  // AI 제안 다시 (없는 것만 DB에 추가)
  const reSuggest = async () => {
    setLocLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/locations/suggest`);
      const suggestions = data.locations || [];
      const existingKeys = new Set(locations.map(l => l.ref_key));
      const newSuggestions = suggestions.filter(s => !existingKeys.has(s.ref_key));
      if (newSuggestions.length > 0) {
        await api.post(`/projects/${projectId}/episodes/${episodeId}/locations`, {
          locations: newSuggestions.map(s => ({
            ref_key: s.ref_key,
            name: s.name || s.ref_key,
            description: s.description || '',
            mood_notes: s.mood_notes || '',
            skip_images: true,
          })),
        });
        await loadLocations();
      } else {
        setError('추가할 새 장소가 없습니다.');
        setTimeout(() => setError(''), 3000);
      }
    } catch {} finally { setLocLoading(false); }
  };

  // 장소 수동 추가 (DB에 즉시 생성)
  const addLocation = async () => {
    const key = `custom_${Date.now()}`;
    try {
      await api.post(`/projects/${projectId}/episodes/${episodeId}/locations`, {
        locations: [{
          ref_key: key,
          name: '',
          description: '',
          skip_images: true,
        }],
      });
      await loadLocations();
    } catch (err) {
      setError(err.response?.data?.detail || '장소 추가에 실패했습니다.');
    }
  };

  const handleGenerate = async (customTarget) => {
    setGenerating(true);
    setError('');
    setAdjustError('');
    try {
      const target = customTarget || (targetCount ? parseInt(targetCount) : null);
      const body = target ? { target_cut_count: target } : {};
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/storyboard`, body);
      setCuts(data.cuts || []);
      await loadCuts();
      await loadRecommendation();
      await onRefresh();
    } catch (err) {
      const detail = err.response?.data?.detail || '콘티 생성에 실패했습니다.';
      if (err.response?.status === 400 && (detail.includes('최소') || detail.includes('최대'))) {
        setAdjustError(detail);
      } else {
        setError(detail);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.post(`/projects/${projectId}/episodes/${episodeId}/storyboard/approve`);
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || '승인에 실패했습니다.');
    } finally {
      setApproving(false);
    }
  };

  // 컷 편집
  const openEditModal = (cut) => {
    setEditingCut(cut);
    setEditForm({
      shot: cut.shot || 'full',
      action: cut.action || '',
      dialogue: (cut.dialogue || []).map(d => ({ ...d })),
      has_product: cut.has_product || false,
      location_id: cut.location_id || '',
    });
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      await api.put(`/cuts/${editingCut.cut_id}`, {
        shot: editForm.shot,
        action: editForm.action,
        dialogue: editForm.dialogue,
        has_product: editForm.has_product,
        location_id: editForm.location_id || null,
      });
      setEditingCut(null);
      await loadCuts();
    } catch (err) {
      setError(err.response?.data?.detail || '컷 수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const updateDialogue = (index, field, value) => {
    setEditForm(prev => {
      const newDialogue = [...prev.dialogue];
      newDialogue[index] = { ...newDialogue[index], [field]: value };
      return { ...prev, dialogue: newDialogue };
    });
  };

  const shotLabel = { long: '롱샷', full: '풀샷', bust: '바스트샷', close_up: '클로즈업' };
  const dialogueTypeLabel = { narration: '나레이션', speech: '대사', thought: '독백', sfx: '효과음' };

  return (
    <div className="space-y-4">
      {/* ── 장소 패널 ── */}
      <ErrorBoundary label="장소 패널">
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-2">
          <MapPin size={20} className="text-emerald-500" /> 장소
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          장소는 글로 설명하면 충분해요. 매장·집처럼 실제 모습을 꼭 살려야 할 때만 이미지를 만드세요 (1패킷)
        </p>

        {error && error.includes('장소') && (
          <p className="text-red-500 dark:text-red-400 text-xs font-bold mb-3">{error}</p>
        )}

        {locations.length === 0 && locLoading && (
          <p className="text-sm text-gray-400 flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> 대본에서 장소 추출 중...</p>
        )}

        {locations.length > 0 && (
          <div className="space-y-3">
            {locations.map((loc) => (
              <div key={loc.ref_key} className="border border-border dark:border-zinc-700 rounded-xl p-4 bg-white/50 dark:bg-zinc-800/50">
                {/* 저장 상태 — 카드 우상단 */}
                {locSaveStatus[loc.ref_key] && (
                  <div className="flex justify-end mb-1">
                    {locSaveStatus[loc.ref_key] === 'dirty' && (
                      <button onClick={() => saveLocation(loc)} className="px-2.5 py-0.5 text-[10px] font-bold text-white bg-comic-blue rounded-full hover:bg-blue-600 transition-colors">저장</button>
                    )}
                    {locSaveStatus[loc.ref_key] === 'saving' && <span className="text-[10px] text-blue-500 font-bold">저장 중…</span>}
                    {locSaveStatus[loc.ref_key] === 'spec' && <span className="text-[10px] text-emerald-500 font-bold">스펙 갱신 중…</span>}
                    {locSaveStatus[loc.ref_key] === 'saved' && <span className="text-[10px] text-emerald-600 font-bold">저장됨 ✓</span>}
                    {locSaveStatus[loc.ref_key] === 'error' && (
                      <button onClick={() => saveLocation(loc)} className="px-2.5 py-0.5 text-[10px] font-bold text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors">저장 실패 — 다시</button>
                    )}
                  </div>
                )}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 space-y-2">
                    {/* 이름 */}
                    <input
                      value={loc.name}
                      onChange={e => {
                        setLocations(prev => prev.map(l => l.ref_key === loc.ref_key ? { ...l, name: e.target.value } : l));
                        setLocSaveStatus(prev => ({ ...prev, [loc.ref_key]: 'dirty' }));
                      }}
                      onBlur={() => saveLocation(loc)}
                      placeholder="장소 이름"
                      className="w-full px-2 py-1 text-sm font-bold rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
                    />
                    {/* 묘사 */}
                    <textarea
                      value={loc.description || ''}
                      onChange={e => {
                        setLocations(prev => prev.map(l => l.ref_key === loc.ref_key ? { ...l, description: e.target.value } : l));
                        setLocSaveStatus(prev => ({ ...prev, [loc.ref_key]: 'dirty' }));
                      }}
                      onBlur={() => saveLocation(loc)}
                      placeholder="공간 묘사 (가구, 조명, 색감 등)"
                      rows={2}
                      className="w-full px-2 py-1 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white resize-none"
                    />
                    {/* 분위기 */}
                    <input
                      value={loc.mood_notes || ''}
                      onChange={e => {
                        setLocations(prev => prev.map(l => l.ref_key === loc.ref_key ? { ...l, mood_notes: e.target.value } : l));
                        setLocSaveStatus(prev => ({ ...prev, [loc.ref_key]: 'dirty' }));
                      }}
                      onBlur={() => saveLocation(loc)}
                      placeholder="분위기 (선택)"
                      className="w-full px-2 py-1 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
                    />
                  </div>
                  {/* 이미지 썸네일 + 삭제 */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {(loc.image_url || loc.converted_photo_url || (loc.reference_photo_url && loc.reference_photo_url !== '__text_only__')) ? (
                      <img
                        src={imageUrl(loc.image_url || loc.converted_photo_url || loc.reference_photo_url)}
                        alt={loc.name}
                        className={`w-20 h-14 object-cover rounded-lg border border-border dark:border-zinc-600 ${!loc.image_url && !loc.converted_photo_url ? 'opacity-70' : ''}`}
                      />
                    ) : null}
                    {!readOnly && (
                      <button
                        onClick={() => deleteLocation(loc)}
                        disabled={locDeleting === loc.id}
                        className="text-[10px] text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 하단 액션 행 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 영문 스펙 미리보기 토글 */}
                  {loc.location_spec_en && (
                    <button
                      onClick={() => setShowSpecEn(prev => ({ ...prev, [loc.ref_key]: !prev[loc.ref_key] }))}
                      className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showSpecEn[loc.ref_key] ? '스펙 접기' : 'EN 스펙 보기'}
                    </button>
                  )}

                  {/* 사진 업로드 */}
                  {loc.id && (!loc.reference_photo_url || loc.reference_photo_url === '__text_only__') && (
                    <label className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer hover:underline">
                      <Camera size={10} /> {uploadingPhotoLocId === loc.id ? '업로드 중...' : '참고 사진'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        disabled={uploadingPhotoLocId === loc.id}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadLocationPhoto(loc, f); e.target.value = ''; }}
                      />
                    </label>
                  )}

                  {/* 장소 이미지 만들기 */}
                  {loc.id && !loc.image_url && !loc.converted_photo_url && (
                    <button
                      onClick={() => generateLocationImage(loc)}
                      disabled={!!locGenJobId}
                      className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    >
                      <ImageIcon size={10} /> 장소 이미지 만들기 (1패킷)
                    </button>
                  )}
                  {loc.id && (loc.image_url || loc.converted_photo_url) && (
                    <button
                      onClick={() => generateLocationImage(loc)}
                      disabled={!!locGenJobId}
                      className="flex items-center gap-1 text-[10px] font-bold text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                    >
                      <RefreshCw size={10} /> 다시 만들기 (1패킷)
                    </button>
                  )}
                </div>

                {/* 영문 스펙 미리보기 (접이식) */}
                {showSpecEn[loc.ref_key] && loc.location_spec_en && (
                  <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-zinc-900 rounded-lg px-2 py-1 italic">
                    {loc.location_spec_en}
                  </p>
                )}
              </div>
            ))}

            {/* 하단 버튼 */}
            {!readOnly && (
              <div className="flex gap-2">
                <button onClick={addLocation} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 border border-dashed border-border dark:border-zinc-600 rounded-lg hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                  <Plus size={12} /> 장소 추가
                </button>
                <button onClick={reSuggest} disabled={locLoading} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50">
                  <Sparkles size={12} /> {locLoading ? '분석 중...' : 'AI 제안 다시'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </ErrorBoundary>

      {/* ── 콘티 패널 ── */}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-4">
          <LayoutGrid size={20} className="text-comic-orange" /> 게이트 4 — 콘티
        </h2>

        {/* 무효화 경고 */}
        {isInvalidated && !readOnly && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-bold mb-2">
              <AlertTriangle size={16} />
              이전 단계가 수정되어 콘티를 다시 생성해야 합니다
            </div>
          </div>
        )}

        {/* 권장 컷 수 안내 + 컷 수 조정 */}
        {recommendation && !readOnly && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm font-bold mb-2">
              <SlidersHorizontal size={16} />
              이 대본은 {recommendation.recommended_min}~{recommendation.recommended_max}컷이 적당합니다
              <span className="text-xs text-blue-500 dark:text-blue-400 font-normal">
                (현재 {recommendation.current_count}컷 · 최소 {recommendation.absolute_min}컷)
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                value={targetCount}
                onChange={(e) => { setTargetCount(e.target.value); setAdjustError(''); }}
                placeholder={`목표 컷 수 (${recommendation.absolute_min}~${recommendation.recommended_max})`}
                min={recommendation.absolute_min}
                max={recommendation.recommended_max}
                className="w-48 px-3 py-1.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg text-sm font-bold bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-comic-blue"
              />
              <button
                onClick={() => handleGenerate()}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-comic-blue text-white rounded-full text-xs font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                {generating ? <><RefreshCw size={12} className="animate-spin" /> 조정 중...</> :
                  targetCount ? `${targetCount}컷으로 ${cuts.length > 0 ? '재생성' : '생성'}` :
                  cuts.length > 0 ? '재생성' : '콘티 생성'}
              </button>
            </div>
            {adjustError && (
              <p className="text-red-500 dark:text-red-400 text-xs font-bold mt-2">{adjustError}</p>
            )}
          </div>
        )}

        {readOnly && cuts.length === 0 && (
          <p className="text-sm font-bold text-gray-400 dark:text-zinc-500">저장된 콘티 데이터가 없습니다.</p>
        )}

        {error && !error.includes('장소') && (
          <div className="text-sm font-bold mb-3">
            <p className="text-red-500 dark:text-red-400">{error}</p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">일시적인 오류일 수 있습니다. 잠시 후 다시 시도해주세요.</p>
          </div>
        )}
      </div>

      {/* 컷 목록 */}
      {cuts.length > 0 && (
        <div className={isInvalidated && !readOnly ? 'opacity-50' : ''}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-600 dark:text-gray-400">
              총 {cuts.length}컷
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
            {cuts.map((cut) => (
              <div
                key={cut.cut_id}
                className={`border-2 rounded-xl p-4 bg-white/50 dark:bg-zinc-800/50 ${
                  cut.status === 'invalidated' ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-border dark:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white bg-ink-black dark:bg-zinc-600 px-2 py-0.5 rounded-full">#{cut.cut_number}</span>
                    <span className="text-xs font-bold text-comic-blue dark:text-blue-400">
                      {shotLabel[cut.shot] || cut.shot}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {cut.status === 'invalidated' && (
                      <span className="flex items-center gap-0.5 text-xs font-bold text-amber-600 dark:text-amber-500">
                        <AlertTriangle size={10} /> 무효화
                      </span>
                    )}
                    {!readOnly && !isInvalidated && (
                      <button onClick={() => openEditModal(cut)} className="p-1 text-gray-400 hover:text-comic-blue dark:hover:text-blue-400 transition-colors" title="컷 편집">
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {cut.has_product && (
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      📦 제품 등장
                    </span>
                  </div>
                )}

                {cut.location_id && (
                  <div className="flex items-center gap-1 mb-2">
                    <MapPin size={11} className="text-emerald-500 flex-shrink-0" />
                    <span className="text-xs font-bold text-ink-black dark:text-white truncate">{locationName(cut.location_id, locations)}</span>
                    {locationName(cut.location_id, locations) !== cut.location_id && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{cut.location_id}</span>
                    )}
                  </div>
                )}

                {cut.characters && cut.characters.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {cut.characters.map((ch, i) => (
                      <span key={i} className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {characterName(ch.character_id, episodeCharacters)}{ch.emotion ? ` (${ch.emotion})` : ''}
                      </span>
                    ))}
                  </div>
                )}

                {cut.action && (
                  <div className="flex gap-1.5 mb-2">
                    <Clapperboard size={11} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">{cut.action}</p>
                  </div>
                )}

                {cut.dialogue && cut.dialogue.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border/50 dark:border-zinc-700/50 pt-2">
                    {cut.dialogue.map((d, i) => (
                      <div key={i} className="flex gap-1.5">
                        <MessageSquare size={10} className="text-comic-orange flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                          <span className="font-bold text-gray-800 dark:text-gray-300">
                            {d.speaker ? `${d.speaker}` : dialogueTypeLabel[d.type] || d.type}:
                          </span>{' '}
                          <span className="line-clamp-2">{d.text}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {!readOnly && !isInvalidated && (
            <>
              <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl p-3 mb-4">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  콘티 승인 후 이미지 생성이 시작됩니다 (컷당 1패킷).
                </p>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-500 mt-1">
                  예상 비용: {cuts.length}컷 × 1패킷 = <strong>{cuts.length}패킷</strong>
                </p>
              </div>

              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-green-600 dark:bg-green-600 text-white rounded-full text-sm font-bold hover:bg-green-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Check size={14} /> {approving ? '승인 중...' : '콘티 승인 → 이미지 생성 시작'}
              </button>
            </>
          )}
        </div>
      )}

      {/* 컷 편집 모달 */}
      {editingCut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditingCut(null)}>
          <div
            className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b-2 border-border dark:border-zinc-800">
              <h3 className="font-bold font-serif text-ink-black dark:text-white">컷 #{editingCut.cut_number} 편집</h3>
              <button onClick={() => setEditingCut(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              {/* 장소 드롭다운 */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">장소</label>
                <select
                  value={editForm.location_id || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, location_id: e.target.value || null }))}
                  className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 rounded-xl text-sm bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-comic-blue"
                >
                  <option value="">장소 없음</option>
                  {locations.filter(l => l.id).map(l => (
                    <option key={l.ref_key} value={l.ref_key}>{locationOptionLabel(l.ref_key, l.name)}</option>
                  ))}
                </select>
              </div>

              {/* 샷 타입 */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">샷 타입</label>
                <div className="flex gap-2">
                  {['long', 'full', 'bust', 'close_up'].map(s => (
                    <button
                      key={s}
                      onClick={() => setEditForm(prev => ({ ...prev, shot: s }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        editForm.shot === s
                          ? 'bg-comic-blue text-white'
                          : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {shotLabel[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 액션 */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">액션</label>
                <textarea
                  value={editForm.action}
                  onChange={(e) => setEditForm(prev => ({ ...prev, action: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 rounded-xl text-sm bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-comic-blue resize-none"
                />
              </div>

              {/* 대사 */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">대사</label>
                <div className="space-y-3">
                  {editForm.dialogue?.map((d, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-zinc-900 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={d.type || 'speech'}
                          onChange={(e) => updateDialogue(i, 'type', e.target.value)}
                          className="px-2 py-1 border border-gray-200 dark:border-zinc-700 rounded-lg text-xs font-bold bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
                        >
                          <option value="speech">대사</option>
                          <option value="narration">나레이션</option>
                          <option value="thought">독백</option>
                        </select>
                        <input
                          type="text"
                          value={d.speaker || ''}
                          onChange={(e) => updateDialogue(i, 'speaker', e.target.value || null)}
                          placeholder="화자"
                          className="flex-1 px-2 py-1 border border-gray-200 dark:border-zinc-700 rounded-lg text-xs bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
                        />
                      </div>
                      <textarea
                        value={d.text || ''}
                        onChange={(e) => updateDialogue(i, 'text', e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-ink-black dark:text-white resize-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 제품 등장 토글 (광고 에피소드만) */}
              {gateStatus?.is_ad && (
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400">제품 등장</label>
                  <button
                    onClick={() => setEditForm(prev => ({ ...prev, has_product: !prev.has_product }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      editForm.has_product
                        ? 'bg-amber-500 text-white'
                        : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {editForm.has_product ? 'ON' : 'OFF'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t-2 border-border dark:border-zinc-800">
              <button
                onClick={() => setEditingCut(null)}
                className="flex-1 py-2.5 border-2 border-border dark:border-zinc-700 rounded-full font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-comic-blue text-white rounded-full font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
