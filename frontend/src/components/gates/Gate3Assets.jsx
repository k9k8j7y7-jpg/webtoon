import { useState, useEffect } from 'react';
import api, { pollJob } from '../../api/client';
import JobProgress from '../JobProgress';
import { Users, MapPin, Palette, Check, RefreshCw, X, ChevronDown, ChevronUp, AlertTriangle, Edit3, Plus, Trash2, Sparkles } from 'lucide-react';

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

  const generateCharacters = async () => {
    setPhase('characters');
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/characters`);
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
    // 재생성
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
    setSuggestionList(prev => [...prev, { ref_key: `custom_${Date.now()}`, name: '', description: '', mood_notes: '' }]);
  };

  const updateSuggestion = (idx, field, value) => {
    setSuggestionList(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeSuggestion = (idx) => {
    setSuggestionList(prev => prev.filter((_, i) => i !== idx));
  };

  const generateFromSuggestions = async () => {
    const valid = suggestionList.filter(l => l.name.trim());
    if (!valid.length) return;
    setPhase('locations');
    setError('');
    setLocError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/locations`, { locations: valid });
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
      {job && phase === 'characters' && <JobProgress job={job} label="캐릭터 시트 생성" />}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
            <Users size={20} className="text-purple-500" /> 캐릭터 시트
          </h2>
          <button
            onClick={generateCharacters}
            disabled={!!job || !hasStyle}
            className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded-full text-xs font-bold hover:bg-purple-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
          >
            {hasCharacters ? <><RefreshCw size={12} /> 재생성</> : '캐릭터 생성'}
          </button>
        </div>
        {!hasStyle && (
          <p className="text-sm font-bold text-amber-500 dark:text-amber-400 mb-3">스타일을 먼저 선택해주세요</p>
        )}
        {hasCharacters ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {characters.map((c) => (
              <div key={c.id} className="border-2 border-border dark:border-zinc-700 rounded-xl p-3 bg-white/50 dark:bg-zinc-800/50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-bold text-sm text-ink-black dark:text-white">{c.name}</div>
                    <div className="text-xs font-bold text-gray-500 dark:text-gray-400">{c.ref_key}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => editingChar?.id === c.id ? setEditingChar(null) : openCharEditor(c)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
                    >
                      <Edit3 size={12} /> 캐릭터 편집
                    </button>
                    <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500'}`}>
                      {c.status}
                    </div>
                  </div>
                </div>

                {/* 캐릭터 편집 폼 */}
                {editingChar?.id === c.id && (
                  <div className="mt-3 p-3 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg space-y-3">
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
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400">상세 메모</label>
                      <textarea
                        value={editingChar.detail_notes}
                        onChange={e => updateCharField('detail_notes', e.target.value)}
                        placeholder="예: 은테 안경, 왼쪽 눈 밑 점, 항상 후드티"
                        rows={2}
                        className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveCharConditions} disabled={savingChar}
                        className="flex-1 px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors disabled:opacity-50">
                        {savingChar ? '저장 중...' : '조건 저장'}
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
                레퍼런스 이미지 생성 ({suggestionList.filter(l => l.name.trim()).length}개)
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
    </div>
  );
}
