import { useState, useEffect } from 'react';
import api, { pollJob } from '../../api/client';
import JobProgress from '../JobProgress';
import { Users, MapPin, Palette, Check, RefreshCw, X, ChevronDown, ChevronUp, AlertTriangle, Edit3, Plus, Trash2, Sparkles, Link, Unlink, Star, Library, Camera } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';

export default function Gate3Assets({ projectId, episodeId, onRefresh }) {
  const [characters, setCharacters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [styles, setStyles] = useState(null);
  const [presets, setPresets] = useState({ core: [], beta: [] });
  const [job, setJob] = useState(null);
  const [phase, setPhase] = useState(''); // characters | locations
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [showBeta, setShowBeta] = useState(false);
  const [styleChanged, setStyleChanged] = useState(false);
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  // P3: 캐릭터 피커
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState('project'); // 'project' | 'library'
  const [projectChars, setProjectChars] = useState([]);
  const [libraryChars, setLibraryChars] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');

  const imageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}?v=${cacheBuster}`;
  };

  const loadAssets = async () => {
    try {
      const [charRes, locRes, styleRes, presetsRes] = await Promise.all([
        api.get(`/projects/${projectId}/episodes/${episodeId}/characters`),
        api.get(`/projects/${projectId}/episodes/${episodeId}/locations`),
        api.get(`/projects/${projectId}/episodes/${episodeId}/style`).catch(() => ({ data: null })),
        api.get('/styles/presets').catch(() => ({ data: { core: [], beta: [] } })),
      ]);

      const charDetails = await Promise.all(
        charRes.data.map((c) => api.get(`/characters/${c.id}`).then((r) => r.data).catch(() => c))
      );
      const locDetails = await Promise.all(
        locRes.data.map((l) => api.get(`/locations/${l.id}`).then((r) => r.data).catch(() => l))
      );

      setCharacters(charDetails);
      setLocations(locDetails);
      setStyles(styleRes.data);
      setPresets(presetsRes.data);
    } catch {}
  };

  useEffect(() => { loadAssets(); }, []);

  const [skippedInfo, setSkippedInfo] = useState(null);

  const generateCharacters = async () => {
    setPhase('characters');
    setError('');
    setSkippedInfo(null);
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/characters`);
      setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: 0 } });
      const jobResult = await pollJob(data.job_id, setJob);
      setJob(null);
      setStyleChanged(false);
      setCacheBuster(Date.now());
      await loadAssets();
      // 연결 캐릭터 스킵 안내
      const skipped = jobResult?.result?.skipped;
      if (skipped && skipped.length > 0) {
        setSkippedInfo(skipped);
      }
    } catch (err) {
      setJob(null);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const generateLocations = async () => {
    setPhase('locations');
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/locations`);
      setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: 0 } });
      await pollJob(data.job_id, setJob);
      setJob(null);
      setStyleChanged(false);
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      setJob(null);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const selectStyle = async (presetKey) => {
    try {
      const hadAssets = characters.length > 0 || locations.length > 0;
      const wasChanged = styles?.preset_key && styles.preset_key !== presetKey;
      const { data } = await api.put(`/projects/${projectId}/episodes/${episodeId}/style`, { preset_key: presetKey });
      setStyles(data);
      if (hadAssets && wasChanged) {
        setStyleChanged(true);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.post(`/projects/${projectId}/episodes/${episodeId}/assets/approve`);
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setApproving(false);
    }
  };

  // ── 캐릭터 캐릭터 편집 ──
  const [editingChar, setEditingChar] = useState(null); // { id, gender, age_group, ... }
  const [savingChar, setSavingChar] = useState(false);

  const openCharEditor = (c) => {
    setEditingChar({
      id: c.id,
      name: c.name,
      gender: c.gender || '',
      age_group: c.age_group || '',
      hair_style: c.hair_style || '',
      hair_color: c.hair_color || '',
      body_type: c.body_type || '',
      mood: c.mood || '',
      detail_notes: c.detail_notes || '',
    });
  };

  const updateCharField = (field, value) => {
    setEditingChar(prev => ({ ...prev, [field]: value }));
  };

  const saveCharConditions = async () => {
    if (!editingChar) return;
    setSavingChar(true);
    try {
      await api.put(`/characters/${editingChar.id}`, {
        name: editingChar.name || null,
        gender: editingChar.gender || null,
        age_group: editingChar.age_group || null,
        hair_style: editingChar.hair_style || null,
        hair_color: editingChar.hair_color || null,
        body_type: editingChar.body_type || null,
        mood: editingChar.mood || null,
        detail_notes: editingChar.detail_notes || null,
      });
      setEditingChar(null);
      await loadAssets();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSavingChar(false);
    }
  };

  const saveAndRegenerate = async (characterId) => {
    if (editingChar) {
      setSavingChar(true);
      try {
        await api.put(`/characters/${editingChar.id}`, {
          name: editingChar.name || null,
          gender: editingChar.gender || null,
          age_group: editingChar.age_group || null,
          hair_style: editingChar.hair_style || null,
          hair_color: editingChar.hair_color || null,
          body_type: editingChar.body_type || null,
          mood: editingChar.mood || null,
          detail_notes: editingChar.detail_notes || null,
        });
      } catch (err) {
        setError(err.response?.data?.detail || err.message);
        setSavingChar(false);
        return;
      }
      setSavingChar(false);
      setEditingChar(null);
    }
    // 재생성 경고: 연결된 에피소드 2개 이상이면 확인
    try {
      const { data: linkInfo } = await api.get(`/characters/${characterId}/link-info`);
      if (linkInfo.episode_count >= 2) {
        if (!window.confirm(`${linkInfo.episode_count}개 에피소드에서 사용 중입니다. 새 이미지는 이후 생성부터 적용되며, 이미 만든 컷 이미지는 바뀌지 않습니다. 재생성하시겠습니까?`)) return;
      }
    } catch {}
    setPhase('characters');
    setError('');
    try {
      const { data } = await api.post(`/characters/${characterId}/regenerate`);
      setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: 1 } });
      await pollJob(data.job_id, setJob);
      setJob(null);
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      setJob(null);
      setError(err.response?.data?.detail || err.message);
    }
  };

  // ── 장소 제안·편집 ──
  const [suggestionList, setSuggestionList] = useState([]); // 편집 중인 장소 목록
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showSuggestEditor, setShowSuggestEditor] = useState(false);
  const [locMoodEdit, setLocMoodEdit] = useState({}); // {id: mood_notes}
  const [savingLocId, setSavingLocId] = useState(null);
  const [locError, setLocError] = useState('');
  const [uploadingPhotoLocId, setUploadingPhotoLocId] = useState(null);
  const [reconvertingLocId, setReconvertingLocId] = useState(null);

  const loadSuggestions = async () => {
    setSuggestLoading(true);
    setLocError('');
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/locations/suggest`);
      const list = (data.locations || []).map(l => ({
        ref_key: l.ref_key || '',
        name: l.name || '',
        description: l.description || '',
        mood_notes: '',
        photoUrl: null,       // 사진 대체 URL (서버 업로드 후)
        photoPreview: null,   // 로컬 미리보기 URL
      }));
      setSuggestionList(list);
      setShowSuggestEditor(true);
    } catch (err) {
      setLocError(err.response?.data?.detail || err.message);
    } finally {
      setSuggestLoading(false);
    }
  };

  const addSuggestionItem = () => {
    setSuggestionList(prev => [...prev, { ref_key: `custom_${Date.now()}`, name: '', description: '', mood_notes: '', photoUrl: null, photoPreview: null }]);
  };

  const updateSuggestion = (idx, field, value) => {
    setSuggestionList(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeSuggestion = (idx) => {
    setSuggestionList(prev => {
      const item = prev[idx];
      if (item?.photoPreview) URL.revokeObjectURL(item.photoPreview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const [uploadingSuggestIdx, setUploadingSuggestIdx] = useState(null);

  const uploadSuggestionPhoto = async (idx, file) => {
    const item = suggestionList[idx];
    if (!item) return;
    setUploadingSuggestIdx(idx);
    setLocError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(
        `/projects/${projectId}/episodes/${episodeId}/locations/upload-photo?ref_key=${encodeURIComponent(item.ref_key)}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      const preview = URL.createObjectURL(file);
      setSuggestionList(prev => prev.map((it, i) =>
        i === idx ? { ...it, photoUrl: data.url, photoPreview: preview } : it
      ));
    } catch (err) {
      setLocError(err.response?.data?.detail || err.message);
    } finally {
      setUploadingSuggestIdx(null);
    }
  };

  const clearSuggestionPhoto = (idx) => {
    setSuggestionList(prev => prev.map((it, i) => {
      if (i === idx) {
        if (it.photoPreview) URL.revokeObjectURL(it.photoPreview);
        return { ...it, photoUrl: null, photoPreview: null };
      }
      return it;
    }));
  };

  const generateFromSuggestions = async () => {
    const valid = suggestionList.filter(l => l.name.trim());
    if (!valid.length) return;
    setPhase('locations');
    setError('');
    setLocError('');
    try {
      // 사진이 있는 항목에 reference_photo_url 포함
      const payload = valid.map(l => {
        const out = { ref_key: l.ref_key, name: l.name, description: l.description, mood_notes: l.mood_notes };
        if (l.photoUrl) out.reference_photo_url = l.photoUrl;
        return out;
      });
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/locations`, { locations: payload });
      setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: valid.length } });
      await pollJob(data.job_id, setJob);
      setJob(null);
      setShowSuggestEditor(false);
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      setJob(null);
      setLocError(err.response?.data?.detail || err.message);
    }
  };

  const saveLocationMood = async (locId) => {
    setSavingLocId(locId);
    setLocError('');
    const mood = locMoodEdit[locId];
    if (mood === undefined) { setSavingLocId(null); return; }
    try {
      await api.put(`/locations/${locId}`, { mood_notes: mood });
      setLocMoodEdit(prev => { const n = {...prev}; delete n[locId]; return n; });
      await loadAssets();
    } catch (err) {
      setLocError(err.response?.data?.detail || err.message);
    } finally {
      setSavingLocId(null);
    }
  };

  const regenerateLocation = async (locId) => {
    setPhase('locations');
    setError('');
    setLocError('');
    try {
      const { data } = await api.post(`/locations/${locId}/regenerate`);
      setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: 1 } });
      await pollJob(data.job_id, setJob);
      setJob(null);
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      setJob(null);
      setLocError(err.response?.data?.detail || err.message);
    }
  };

  const uploadLocationPhoto = async (locId, file) => {
    setUploadingPhotoLocId(locId);
    setLocError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/locations/${locId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      setLocError(err.response?.data?.detail || err.message);
    } finally {
      setUploadingPhotoLocId(null);
    }
  };

  const reconvertLocationPhoto = async (locId) => {
    setReconvertingLocId(locId);
    setLocError('');
    try {
      await api.post(`/locations/${locId}/reconvert`);
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      setLocError(err.response?.data?.detail || err.message);
    } finally {
      setReconvertingLocId(null);
    }
  };

  const deleteLocationPhoto = async (locId) => {
    setLocError('');
    try {
      await api.delete(`/locations/${locId}/photo`);
      await loadAssets();
    } catch (err) {
      setLocError(err.response?.data?.detail || err.message);
    }
  };

  // ── P3: 피커 열기 ──
  const openPicker = async () => {
    setShowPicker(true);
    setPickerLoading(true);
    setPickerTab('project');
    setPickerError('');
    try {
      const [projRes, libRes] = await Promise.all([
        api.get(`/projects/${projectId}/characters`),
        api.get(`/users/me/characters`).catch(() => ({ data: [] })),
      ]);
      // 현재 에피소드에 이미 연결된 캐릭터 ID 집합
      const linkedIds = new Set(characters.map(c => c.id));
      setProjectChars(projRes.data.filter(c => !linkedIds.has(c.id)));
      setLibraryChars(libRes.data.filter(c => !linkedIds.has(c.id) && c.project_id !== projectId));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setPickerLoading(false);
    }
  };

  const linkCharacter = async (characterId) => {
    setPickerError('');
    try {
      await api.post(`/projects/${projectId}/episodes/${episodeId}/characters/link`, { character_id: characterId });
      setShowPicker(false);
      setPickerError('');
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : detail?.message || err.message;
      setPickerError(msg);
    }
  };

  const unlinkCharacter = async (characterId) => {
    try {
      await api.delete(`/projects/${projectId}/episodes/${episodeId}/characters/${characterId}/link`);
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      if (err.response?.status === 409) {
        const detail = err.response.data.detail;
        const cuts = detail?.referencing_cuts || [];
        if (window.confirm(`이 캐릭터를 참조하는 컷이 ${cuts.length}개 있습니다 (${cuts.slice(0, 5).join(', ')}${cuts.length > 5 ? '...' : ''}). 연결을 해제하시겠습니까?`)) {
          try {
            await api.delete(`/projects/${projectId}/episodes/${episodeId}/characters/${characterId}/link?force=true`);
            setCacheBuster(Date.now());
            await loadAssets();
          } catch (err2) {
            setError(err2.response?.data?.detail || err2.message);
          }
        }
      } else {
        setError(err.response?.data?.detail || err.message);
      }
    }
  };

  const deleteCharacter = async (characterId) => {
    try {
      await api.delete(`/characters/${characterId}`);
      setCacheBuster(Date.now());
      await loadAssets();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'object' ? detail.message : (detail || err.message));
    }
  };

  const togglePromote = async (character) => {
    try {
      if (character.user_id) {
        await api.post(`/characters/${character.id}/demote`);
      } else {
        await api.post(`/characters/${character.id}/promote`);
      }
      await loadAssets();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const hasCharacters = characters.length > 0;
  const hasLocations = locations.length > 0;
  const hasStyle = !!styles?.preset_key;
  const canApprove = hasCharacters && hasLocations && hasStyle;

  const StyleButton = ({ preset, selected }) => (
    <button
      onClick={() => selectStyle(preset.key)}
      className={`relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-bold border-2 transition-all shadow-sm min-w-[100px]
        ${selected
          ? 'bg-comic-orange/10 border-comic-orange text-comic-orange dark:bg-comic-orange/20'
          : 'bg-white dark:bg-zinc-800 border-border dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:border-comic-orange/50 dark:hover:border-comic-orange/50 hover:-translate-y-0.5'}`}
    >
      {selected && <Check size={14} className="absolute top-1.5 right-1.5 text-comic-orange" />}
      <Palette size={18} className={selected ? 'text-comic-orange' : 'text-gray-400 dark:text-gray-500'} />
      <span className="text-xs leading-tight text-center">{preset.label}</span>
      {preset.tier === 'beta' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 font-bold">Beta</span>
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* 스타일 (최상단) */}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-4">
          <Palette size={20} className="text-pink-500" /> 스타일 선택
        </h2>

        {/* 코어 추천 */}
        <div className="mb-3">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">추천</p>
          <div className="flex flex-wrap gap-2">
            {presets.core.map((p) => (
              <StyleButton key={p.key} preset={p} selected={styles?.preset_key === p.key} />
            ))}
          </div>
        </div>

        {/* 베타 확장 */}
        {presets.beta.length > 0 && (
          <div>
            <button
              onClick={() => setShowBeta(!showBeta)}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-2"
            >
              {showBeta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              확장 스타일 ({presets.beta.length})
            </button>
            {showBeta && (
              <div className="flex flex-wrap gap-2">
                {presets.beta.map((p) => (
                  <StyleButton key={p.key} preset={p} selected={styles?.preset_key === p.key} />
                ))}
              </div>
            )}
          </div>
        )}

        {hasStyle && (
          <p className="text-xs font-bold text-green-600 dark:text-green-400 mt-3">
            <Check size={12} className="inline mr-1" />
            {styles.preset_key} 스타일 선택됨
          </p>
        )}

        {styleChanged && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
              스타일이 변경되었습니다. 일관성을 위해 캐릭터/장소를 재생성하세요.
            </p>
          </div>
        )}
      </div>

      {/* 캐릭터 */}
      {skippedInfo && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-400 mb-3">
          <Users size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-bold">{skippedInfo.length}명</span>은 이미 연결되어 건너뛰었습니다: {skippedInfo.map(s => s.name || s.ref_key).join(', ')}
            <button onClick={() => setSkippedInfo(null)} className="ml-2 text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"><X size={12} className="inline" /></button>
          </div>
        </div>
      )}
      {job && phase === 'characters' && <JobProgress job={job} label="캐릭터 시트 생성" />}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
            <Users size={20} className="text-purple-500" /> 캐릭터 시트
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={openPicker}
              disabled={!!job}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-full transition-colors disabled:opacity-50"
            >
              <Link size={12} /> 캐릭터 불러오기
            </button>
            <button
              onClick={generateCharacters}
              disabled={!!job || !hasStyle}
              className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded-full text-xs font-bold hover:bg-purple-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
            >
              {hasCharacters ? <><RefreshCw size={12} /> 재생성</> : '+ 새 캐릭터 생성'}
            </button>
          </div>
        </div>
        {!hasStyle && (
          <p className="text-sm font-bold text-amber-500 dark:text-amber-400 mb-3">스타일을 먼저 선택해주세요</p>
        )}
        {hasCharacters ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {characters.map((c) => (
              <div key={c.id} className="border-2 border-border dark:border-zinc-700 rounded-xl p-3 bg-white/50 dark:bg-zinc-800/50">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-ink-black dark:text-white truncate">{c.name}</div>
                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 truncate">{c.ref_key}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => togglePromote(c)}
                      title={c.user_id ? '내 라이브러리에서 해제' : '내 라이브러리에 등록하면 모든 프로젝트에서 사용할 수 있어요'}
                      className={`p-1 rounded-lg transition-colors ${c.user_id ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 dark:text-gray-600 hover:text-yellow-400'}`}
                    >
                      <Star size={14} fill={c.user_id ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => editingChar?.id === c.id ? setEditingChar(null) : openCharEditor(c)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
                    >
                      <Edit3 size={12} /> 편집
                    </button>
                    <button
                      onClick={() => unlinkCharacter(c.id)}
                      title="이 에피소드에서 제외 (캐릭터는 프로젝트에 유지됩니다)"
                      className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-colors"
                    >
                      <Unlink size={12} />
                    </button>
                    <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500'}`}>
                      {c.status}
                    </div>
                  </div>
                </div>

                {/* 캐릭터 편집 폼 */}
                {editingChar?.id === c.id && (
                  <div className="mt-3 p-3 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">이름</label>
                      <input
                        type="text"
                        value={editingChar.name}
                        onChange={e => updateCharField('name', e.target.value)}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs font-bold rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">성별</label>
                        <select value={editingChar.gender} onChange={e => updateCharField('gender', e.target.value)}
                          className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white">
                          <option value="">미지정</option>
                          <option value="male">남성</option>
                          <option value="female">여성</option>
                          <option value="androgynous">중성적</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">나이대</label>
                        <select value={editingChar.age_group} onChange={e => updateCharField('age_group', e.target.value)}
                          className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white">
                          <option value="">미지정</option>
                          <option value="child">어린이</option>
                          <option value="teen">청소년</option>
                          <option value="young_adult">청년</option>
                          <option value="adult">성인</option>
                          <option value="middle_aged">중년</option>
                          <option value="elderly">노년</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">헤어스타일</label>
                        <select value={editingChar.hair_style} onChange={e => updateCharField('hair_style', e.target.value)}
                          className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white">
                          <option value="">미지정</option>
                          <option value="short">숏컷</option>
                          <option value="medium">미디엄</option>
                          <option value="long">롱</option>
                          <option value="ponytail">포니테일</option>
                          <option value="twin_tails">트윈테일</option>
                          <option value="bob">보브컷</option>
                          <option value="curly">곱슬</option>
                          <option value="buzz">버즈컷</option>
                          <option value="bald">대머리</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">헤어컬러</label>
                        <select value={editingChar.hair_color} onChange={e => updateCharField('hair_color', e.target.value)}
                          className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white">
                          <option value="">미지정</option>
                          <option value="black">검정</option>
                          <option value="brown">갈색</option>
                          <option value="blonde">금발</option>
                          <option value="red">빨간색</option>
                          <option value="white">흰색</option>
                          <option value="silver">은색</option>
                          <option value="blue">파란색</option>
                          <option value="pink">분홍색</option>
                          <option value="purple">보라색</option>
                          <option value="green">초록색</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">체형</label>
                        <select value={editingChar.body_type} onChange={e => updateCharField('body_type', e.target.value)}
                          className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white">
                          <option value="">미지정</option>
                          <option value="slim">마른</option>
                          <option value="average">보통</option>
                          <option value="athletic">근육질</option>
                          <option value="chubby">통통</option>
                          <option value="large">큰 체형</option>
                          <option value="petite">작은 체형</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">분위기</label>
                        <select value={editingChar.mood} onChange={e => updateCharField('mood', e.target.value)}
                          className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white">
                          <option value="">미지정</option>
                          <option value="bright">밝은</option>
                          <option value="calm">차분한</option>
                          <option value="cold">차가운</option>
                          <option value="warm">따뜻한</option>
                          <option value="mysterious">신비로운</option>
                          <option value="tough">터프한</option>
                          <option value="cute">귀여운</option>
                          <option value="elegant">우아한</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">고정 외형 메모</label>
                      <textarea
                        value={editingChar.detail_notes}
                        onChange={e => updateCharField('detail_notes', e.target.value)}
                        placeholder="매 컷에서 반드시 유지할 특징 (예: 검은 뿔테 안경, 하늘색 스카프)"
                        rows={2}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                      />
                      <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">이미지 생성에 반영됩니다</p>
                    </div>
                    <p className="text-[9px] text-purple-500 dark:text-purple-400">이름은 이 캐릭터가 연결된 모든 에피소드에 반영됩니다</p>
                    <div className="flex gap-2">
                      <button onClick={saveCharConditions} disabled={savingChar}
                        className="flex-1 px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors disabled:opacity-50">
                        {savingChar ? '저장 중...' : '저장'}
                      </button>
                      <button onClick={() => saveAndRegenerate(c.id)} disabled={savingChar || !!job}
                        className="flex-1 px-3 py-1.5 text-xs font-bold bg-comic-orange text-white rounded-full hover:bg-orange-600 transition-colors disabled:opacity-50">
                        조건 저장 + 재생성
                      </button>
                      <button onClick={() => setEditingChar(null)}
                        className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                        취소
                      </button>
                    </div>
                  </div>
                )}

                {c.images && c.images.length > 0 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto">
                    {c.images.map((img, idx) => (
                      <div key={idx} className="flex-shrink-0 cursor-pointer" onClick={() => setLightbox({ url: imageUrl(img.url), label: `${c.name} — ${img.label || img.type}` })}>
                        <img
                          src={imageUrl(img.url)}
                          alt={img.label || img.type}
                          className="w-20 h-20 object-cover rounded-lg border border-border dark:border-zinc-600 hover:ring-2 hover:ring-purple-400 transition-all"
                        />
                        <div className="text-[10px] text-center text-gray-500 dark:text-gray-400 mt-1">{img.label || img.type}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          hasStyle && <p className="text-sm font-bold text-gray-400 dark:text-zinc-500">캐릭터 시트를 생성해주세요.</p>
        )}
      </div>

      {/* 장소 */}
      {job && phase === 'locations' && <JobProgress job={job} label="장소 레퍼런스 생성" />}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
            <MapPin size={20} className="text-emerald-500" /> 장소 레퍼런스
          </h2>
          {hasLocations && !showSuggestEditor && (
            <button
              onClick={loadSuggestions}
              disabled={!!job || !hasStyle || suggestLoading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors disabled:opacity-50"
            >
              <Sparkles size={12} /> 다시 제안받기
            </button>
          )}
        </div>

        {!hasStyle && (
          <p className="text-sm font-bold text-amber-500 dark:text-amber-400 mb-3">스타일을 먼저 선택해주세요</p>
        )}

        {locError && (
          <p className="text-red-500 dark:text-red-400 text-xs font-bold mb-3">{locError}</p>
        )}

        {/* ── 제안·편집 단계 ── */}
        {showSuggestEditor && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                대본에서 추출한 장소 목록입니다. 이름 수정·삭제·추가 후 이미지를 생성하세요.
              </p>
              <button onClick={() => setShowSuggestEditor(false)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">취소</button>
            </div>

            {suggestionList.map((item, idx) => (
              <div key={idx} className="flex gap-2 p-3 border border-border dark:border-zinc-700 rounded-xl bg-white/50 dark:bg-zinc-800/50">
                <div className="flex-1 space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">장소 이름</label>
                    <input
                      value={item.name}
                      onChange={e => updateSuggestion(idx, 'name', e.target.value)}
                      placeholder="예: 학교 옥상, 카페 내부"
                      className="w-full mt-0.5 px-2.5 py-1.5 text-sm font-bold rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">분위기 <span className="font-normal">(선택)</span></label>
                    <textarea
                      value={item.mood_notes}
                      onChange={e => updateSuggestion(idx, 'mood_notes', e.target.value)}
                      placeholder="예: 따뜻한 오후 햇살이 드는, 아늑한 분위기"
                      rows={2}
                      className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                    />
                  </div>

                  {/* 사진 대체 */}
                  <div>
                    {item.photoUrl ? (
                      <div className="flex items-center gap-2 px-2.5 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 rounded-lg">
                        <img src={item.photoPreview || imageUrl(item.photoUrl)} alt="참고 사진" className="w-12 h-9 object-cover rounded" />
                        <span className="flex-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">사진 사용</span>
                        <button
                          onClick={() => clearSuggestionPhoto(idx)}
                          className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
                          title="사진 취소 (AI 생성으로 되돌리기)"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-dashed border-emerald-300 dark:border-emerald-700 rounded-lg cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors">
                        <Camera size={12} />
                        {uploadingSuggestIdx === idx ? '업로드 중...' : '사진으로 대체'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          className="hidden"
                          disabled={uploadingSuggestIdx !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadSuggestionPhoto(idx, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
                <button onClick={() => removeSuggestion(idx)}
                  className="self-start mt-1 p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <div className="flex gap-2">
              <button onClick={addSuggestionItem}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 border border-dashed border-border dark:border-zinc-600 rounded-lg hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                <Plus size={12} /> 장소 추가
              </button>
              <button
                onClick={generateFromSuggestions}
                disabled={!!job || !suggestionList.filter(l => l.name.trim()).length}
                className="flex-1 flex items-center justify-center gap-1 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {(() => {
                  const valid = suggestionList.filter(l => l.name.trim());
                  const photoCount = valid.filter(l => l.photoUrl).length;
                  const aiCount = valid.length - photoCount;
                  if (photoCount === 0) return `레퍼런스 이미지 생성 (${valid.length}개)`;
                  if (aiCount === 0) return `장소 등록 (${photoCount}개 사진 사용)`;
                  return `레퍼런스 이미지 생성 (${aiCount}개 · ${photoCount}개는 사진 사용)`;
                })()}
              </button>
            </div>
          </div>
        )}

        {/* ── 이미지 없고 편집기도 없음 → CTA ── */}
        {!hasLocations && !showSuggestEditor && hasStyle && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <MapPin size={32} className="text-emerald-300 dark:text-emerald-700" />
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
              AI가 대본을 분석해 필요한 장소를 제안합니다.<br />
              <span className="text-xs font-normal text-gray-400 dark:text-gray-500">제안 목록을 확인하고 수정한 뒤 이미지를 생성하세요.</span>
            </p>
            <button
              onClick={loadSuggestions}
              disabled={suggestLoading || !!job}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
            >
              <Sparkles size={14} />
              {suggestLoading ? '대본 분석 중...' : 'AI 장소 제안 받기'}
            </button>
          </div>
        )}

        {/* ── 이미지 있음 → 카드 뷰 ── */}
        {hasLocations && !showSuggestEditor && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {locations.map((l) => (
              <div key={l.id} className="border-2 border-border dark:border-zinc-700 rounded-xl p-3 bg-white/50 dark:bg-zinc-800/50 space-y-2">
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-ink-black dark:text-white">{l.name}</div>
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500">{l.ref_key}</div>
                  </div>
                  <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${l.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500'}`}>
                    {l.status}
                  </div>
                </div>

                {/* 이미지 */}
                {l.images && l.images.length > 0 && (
                  <div className="flex gap-2">
                    {l.images.map((img, idx) => (
                      <div key={idx} className="cursor-pointer" onClick={() => setLightbox({ url: imageUrl(img.url), label: l.name })}>
                        <img
                          src={imageUrl(img.url)}
                          alt={l.name}
                          className="w-28 h-20 object-cover rounded-lg border border-border dark:border-zinc-600 hover:ring-2 hover:ring-emerald-400 transition-all"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 분위기 서술 편집 */}
                <div>
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">분위기 서술</label>
                  <textarea
                    value={locMoodEdit[l.id] ?? l.mood_notes ?? ''}
                    onChange={e => setLocMoodEdit(prev => ({ ...prev, [l.id]: e.target.value }))}
                    placeholder="예: 따뜻한 오후 햇살이 드는, 아늑한 분위기"
                    rows={2}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                  />
                </div>

                {/* 참고 사진 업로드 + 변환본 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                    실사 참고 사진 <span className="font-normal">(업로드 시 웹툰 스타일로 자동 변환 · 1컷 비용)</span>
                  </label>
                  {l.reference_photo_url ? (
                    <div className="space-y-2">
                      {/* 변환본 (메인) + 원본 (작게) */}
                      <div className="flex items-center gap-2">
                        {l.converted_photo_url ? (
                          <div className="cursor-pointer" onClick={() => setLightbox({ url: imageUrl(l.converted_photo_url), label: `${l.name} — 변환본` })}>
                            <img
                              src={imageUrl(l.converted_photo_url)}
                              alt="변환본"
                              className="w-28 h-20 object-cover rounded-lg border-2 border-emerald-400 dark:border-emerald-600 hover:ring-2 hover:ring-emerald-300 transition-all"
                            />
                            <div className="text-[10px] text-center text-emerald-600 dark:text-emerald-400 mt-0.5 font-bold">변환본</div>
                          </div>
                        ) : (
                          <div className="w-28 h-20 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 flex items-center justify-center bg-amber-50/50 dark:bg-amber-900/10">
                            <span className="text-[10px] text-amber-500 font-bold">변환 필요</span>
                          </div>
                        )}
                        <div className="cursor-pointer" onClick={() => setLightbox({ url: imageUrl(l.reference_photo_url), label: `${l.name} — 원본 사진` })}>
                          <img
                            src={imageUrl(l.reference_photo_url)}
                            alt="원본"
                            className="w-12 h-9 object-cover rounded border border-gray-300 dark:border-zinc-600 opacity-70 hover:opacity-100 transition-opacity"
                          />
                          <div className="text-[9px] text-center text-gray-400 mt-0.5">원본</div>
                        </div>
                      </div>
                      {/* 버튼: 다시 변환 + 삭제 */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => reconvertLocationPhoto(l.id)}
                          disabled={reconvertingLocId === l.id}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={10} className={reconvertingLocId === l.id ? 'animate-spin' : ''} />
                          {reconvertingLocId === l.id ? '변환 중...' : '다시 변환'}
                        </button>
                        <button
                          onClick={() => deleteLocationPhoto(l.id)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-red-500 hover:text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <X size={10} /> 삭제
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-emerald-300 dark:border-emerald-700 rounded-lg cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                      <Camera size={12} className="text-emerald-500" />
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {uploadingPhotoLocId === l.id ? '업로드 + 변환 중...' : '사진 추가'}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        disabled={uploadingPhotoLocId === l.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadLocationPhoto(l.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2">
                  {locMoodEdit[l.id] !== undefined && (
                    <button
                      onClick={() => saveLocationMood(l.id)}
                      disabled={savingLocId === l.id}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-bold bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {savingLocId === l.id ? '저장 중...' : <><Check size={10} /> 분위기 저장</>}
                    </button>
                  )}
                  <button
                    onClick={() => regenerateLocation(l.id)}
                    disabled={!!job}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-gray-600 dark:text-gray-300 border border-border dark:border-zinc-600 rounded-full hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={10} /> 재생성
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-500 dark:text-red-400 text-sm font-bold">{error}</p>}

      {canApprove && (
        <button
          onClick={handleApprove}
          disabled={approving}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-green-600 dark:bg-green-600 text-white rounded-full text-sm font-bold hover:bg-green-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
        >
          <Check size={14} /> {approving ? '승인 중...' : '자산 승인 → 다음 단계'}
        </button>
      )}

      {/* Lightbox modal */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl max-h-[90vh] p-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="absolute -top-3 -right-3 bg-white dark:bg-zinc-800 rounded-full p-1 shadow-lg z-10 hover:bg-gray-100 dark:hover:bg-zinc-700">
              <X size={18} />
            </button>
            <img src={lightbox.url} alt={lightbox.label} className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
            <div className="text-center text-white text-sm font-bold mt-2">{lightbox.label}</div>
          </div>
        </div>
      )}

      {/* P3: 캐릭터 피커 모달 */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPicker(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border-2 border-border dark:border-zinc-700 shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-zinc-700">
              <h3 className="font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
                <Library size={18} className="text-purple-500" /> 캐릭터 불러오기
              </h3>
              <button onClick={() => setShowPicker(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* 탭 */}
            <div className="flex border-b border-border dark:border-zinc-700">
              <button
                onClick={() => setPickerTab('project')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${pickerTab === 'project' ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                이 프로젝트 ({projectChars.length})
              </button>
              <button
                onClick={() => setPickerTab('library')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${pickerTab === 'library' ? 'text-yellow-600 dark:text-yellow-400 border-b-2 border-yellow-600 dark:border-yellow-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
              >
                <span className="inline-flex items-center gap-1"><Star size={12} /> 내 캐릭터 ({libraryChars.length})</span>
              </button>
            </div>

            {/* 에러 메시지 */}
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
                  {pickerTab === 'project' && projectChars.length === 0 && (
                    <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">이 프로젝트에 불러올 수 있는 캐릭터가 없습니다.</p>
                  )}
                  {pickerTab === 'library' && libraryChars.length === 0 && (
                    <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">내 라이브러리에 캐릭터가 없습니다.<br /><span className="text-xs">캐릭터 카드의 ⭐ 버튼으로 등록할 수 있어요.</span></p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {(pickerTab === 'project' ? projectChars : libraryChars).map(c => {
                      const currentStyle = styles?.preset_key;
                      const styleMismatch = c.style && currentStyle && c.style !== currentStyle;
                      const styleLabel = c.style
                        ? [...(presets.core || []), ...(presets.beta || [])].find(p => p.key === c.style)?.label || c.style
                        : null;
                      return (
                      <div
                        key={c.id}
                        className={`relative flex flex-col items-center gap-2 p-3 border-2 rounded-xl bg-white/50 dark:bg-zinc-800/50 hover:-translate-y-0.5 transition-all cursor-pointer ${styleMismatch ? 'border-amber-400 dark:border-amber-500 hover:border-amber-500' : 'border-border dark:border-zinc-700 hover:border-purple-400 dark:hover:border-purple-500'}`}
                        onClick={() => linkCharacter(c.id)}
                      >
                        {/* 삭제 버튼: 프로젝트 탭 + episode_count 0일 때만 */}
                        {pickerTab === 'project' && c.episode_count === 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`'${c.name || c.ref_key}'을(를) 완전히 삭제합니다. 이미지 파일도 함께 삭제되며 되돌릴 수 없습니다.`)) {
                                deleteCharacter(c.id).then(() => {
                                  setProjectChars(prev => prev.filter(pc => pc.id !== c.id));
                                });
                              }
                            }}
                            title="캐릭터 완전 삭제"
                            className="absolute top-1.5 right-1.5 p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors z-10"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        {c.front_image_url ? (
                          <img src={imageUrl(c.front_image_url)} alt={c.name} className="w-16 h-16 object-cover rounded-lg border border-border dark:border-zinc-600" />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-zinc-700 flex items-center justify-center">
                            <Users size={20} className="text-gray-300 dark:text-gray-600" />
                          </div>
                        )}
                        <div className="text-center w-full">
                          <div className="font-bold text-sm text-ink-black dark:text-white truncate">{c.name || c.ref_key}</div>
                          <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full mt-0.5 font-bold ${!styleLabel ? 'bg-gray-100 dark:bg-zinc-700 text-gray-400 dark:text-gray-500' : styleMismatch ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'}`}>
                            <Palette size={8} className="inline -mt-0.5 mr-0.5" />{styleLabel || '스타일 미기록'}
                          </span>
                          {styleMismatch && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-center justify-center gap-0.5">
                              <AlertTriangle size={10} /> 그림체가 섞일 수 있어요
                            </div>
                          )}
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">{c.episode_count}개 에피소드에서 사용 중</div>
                          {c.created_at && <div className="text-[10px] text-gray-300 dark:text-gray-600">{c.created_at.slice(0, 10)}</div>}
                        </div>
                      </div>
                      );
                    })}
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
