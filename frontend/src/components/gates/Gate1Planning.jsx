import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../api/client';
import { Lightbulb, Check, RefreshCw, Pencil, Save, Plus, Trash2, Sparkles, UserPlus, ChevronDown, ChevronUp, Send } from 'lucide-react';

// --- 3축 옵션 정의 ---
const GENRE_OPTIONS = [
  { key: 'romance', label: '로맨스' },
  { key: 'daily', label: '일상/힐링' },
  { key: 'comedy', label: '코미디' },
  { key: 'thriller', label: '스릴러' },
  { key: 'fantasy', label: '판타지' },
  { key: 'drama', label: '드라마' },
];

const MOOD_OPTIONS = [
  { key: 'warm', label: '따뜻한' },
  { key: 'cheerful', label: '유쾌한' },
  { key: 'tense', label: '긴장감' },
  { key: 'touching', label: '먹먹한' },
  { key: 'dark', label: '어두운' },
];

const DEVELOPMENT_OPTIONS = [
  { key: 'calm', label: '잔잔하게', desc: '감정선과 여운 중심' },
  { key: 'dramatic', label: '극적으로', desc: '뚜렷한 기승전결' },
  { key: 'twist', label: '반전 있게', desc: '마지막에 뒤집히는 결말' },
  { key: 'hook', label: '초반 후킹', desc: '첫 컷부터 강한 사건' },
  { key: 'growth', label: '성장·역전', desc: '바닥에서 올라가는 이야기' },
  { key: 'mystery', label: '미스터리·떡밥', desc: '의문과 단서, 끝에 여운' },
  { key: 'cliffhanger', label: '클리프행어', desc: '다음 화가 궁금해지는 끝맺음' },
];

const SYNOPSIS_LABELS = [['ki', '도입'], ['seung', '전개'], ['jeon', '전환'], ['gyeol', '결말']];

export default function Gate1Planning({ projectId, episodeId, onRefresh, gateStatus, readOnly = false, derivedFromSeries = false }) {
  // idea_brief 상태
  const [ideaBrief, setIdeaBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [rawEdit, setRawEdit] = useState('');
  const [reviseHint, setReviseHint] = useState('');
  const [revising, setRevising] = useState(false);
  // 기획서 저장 상태: null | 'dirty' | 'saving' | 'saved' | 'error'
  const [briefSaveStatus, setBriefSaveStatus] = useState(null);

  const [characters, setCharacters] = useState([]);
  const [charTouched, setCharTouched] = useState(false); // 등장인물 user_touched
  const [planning, setPlanning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState(null);
  const [error, setError] = useState('');

  // 3축 선택 상태 + 개별 touched
  const [genre, setGenre] = useState(null);
  const [mood, setMood] = useState(null);
  const [development, setDevelopment] = useState(null);
  const [genreTouched, setGenreTouched] = useState(false);
  const [moodTouched, setMoodTouched] = useState(false);
  const [devTouched, setDevTouched] = useState(false);

  const saveTimer = useRef(null);

  // idea_brief를 gate_status에서 초기화
  useEffect(() => {
    const brief = gateStatus?.idea_brief || null;
    setIdeaBrief(brief);
    if (brief) {
      setRawEdit(brief.raw || '');
    }
  }, [gateStatus?.idea_brief]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/planning`);
        if (data) {
          setPlanning(data);
          if (data.story_options) {
            setGenre(data.story_options.genre || null);
            setMood(data.story_options.mood || null);
            setDevelopment(data.story_options.development || null);
            // 이전에 저장된 값이면 touched
            setGenreTouched(true);
            setMoodTouched(true);
            setDevTouched(true);
          }
        }
      } catch {}
      setLoading(false);
    };
    loadData();
  }, [projectId, episodeId]);

  // idea_brief 없고 raw가 있으면 자동 생성 트리거
  useEffect(() => {
    const brief = gateStatus?.idea_brief;
    if (brief && brief.raw && !brief.summary && !briefLoading && !loading && !readOnly) {
      triggerIdeaBrief();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, gateStatus?.idea_brief]);

  // idea_brief에서 등장인물/3축 채우기 공용 함수
  const applyBriefSuggestions = (data) => {
    // 3축: 개별 touched 안 된 것만 갱신
    if (data.suggested) {
      if (!genreTouched && data.suggested.genre) setGenre(data.suggested.genre);
      if (!moodTouched && data.suggested.mood) setMood(data.suggested.mood);
      if (!devTouched && data.suggested.development) setDevelopment(data.suggested.development);
    }
    // 등장인물: charTouched 안 되었고 비어있을 때만 채움
    if (data.characters?.length > 0 && !charTouched && characters.length === 0) {
      setCharacters(data.characters.map(c => ({
        name: c.name,
        description: c.description || '',
        gender: c.gender || '기타',
        age: c.age || '',
      })));
    }
  };

  const triggerIdeaBrief = async (raw = null) => {
    setBriefLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/idea-brief`, {
        raw: raw || undefined,
      });
      setIdeaBrief(data);
      setRawEdit(data.raw || '');
      applyBriefSuggestions(data);
    } catch (err) {
      setError(err.response?.data?.detail || '아이디어 정리에 실패했습니다.');
    } finally {
      setBriefLoading(false);
    }
  };

  const handleRevise = async () => {
    if (!reviseHint.trim()) return;
    setRevising(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/idea-brief`, {
        hint: reviseHint.trim(),
      });
      setIdeaBrief(data);
      setReviseHint('');
      applyBriefSuggestions(data);
    } catch (err) {
      setError(err.response?.data?.detail || '재정리에 실패했습니다.');
    } finally {
      setRevising(false);
    }
  };

  // blur 시 idea_brief 필드 저장 (자동)
  const saveBriefField = (field, value) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setBriefSaveStatus('saving');
      try {
        await api.put(`/projects/${projectId}/episodes/${episodeId}/idea-brief`, {
          [field]: value,
        });
        setBriefSaveStatus('saved');
        setTimeout(() => setBriefSaveStatus(prev => prev === 'saved' ? null : prev), 2000);
      } catch {
        setBriefSaveStatus('error');
      }
    }, 500);
  };

  // [저장] 버튼 — 전체 필드 즉시 저장
  const saveBriefAll = async () => {
    if (!ideaBrief) return;
    setBriefSaveStatus('saving');
    try {
      await api.put(`/projects/${projectId}/episodes/${episodeId}/idea-brief`, {
        summary: ideaBrief.summary,
        characters: ideaBrief.characters,
        story: ideaBrief.story,
        tone: ideaBrief.tone,
      });
      setBriefSaveStatus('saved');
      setTimeout(() => setBriefSaveStatus(prev => prev === 'saved' ? null : prev), 2000);
    } catch {
      setBriefSaveStatus('error');
    }
  };

  const updateBriefField = (field, value) => {
    setIdeaBrief(prev => ({ ...prev, [field]: value }));
    setBriefSaveStatus('dirty');
  };

  const updateBriefStory = (key, value) => {
    setIdeaBrief(prev => ({
      ...prev,
      story: { ...(prev?.story || {}), [key]: value },
    }));
    setBriefSaveStatus('dirty');
  };

  const addBriefCharacter = () => {
    setIdeaBrief(prev => ({
      ...prev,
      characters: [...(prev?.characters || []), { name: '', description: '' }],
    }));
  };

  const updateBriefCharacter = (index, field, value) => {
    setIdeaBrief(prev => {
      const chars = [...(prev?.characters || [])];
      chars[index] = { ...chars[index], [field]: value };
      return { ...prev, characters: chars };
    });
    setBriefSaveStatus('dirty');
  };

  const removeBriefCharacter = (index) => {
    setIdeaBrief(prev => ({
      ...prev,
      characters: (prev?.characters || []).filter((_, i) => i !== index),
    }));
  };

  const toggleOption = (current, setter, key, touchSetter) => {
    setter(current === key ? null : key);
    touchSetter(true);
  };

  const handleSuggestCharacters = async () => {
    // idea_brief 기준으로 등장인물 다시 뽑기
    if (!ideaBrief?.raw?.trim()) return;
    if (characters.length > 0) {
      if (!window.confirm('지금 등장인물을 기획서 기준으로 다시 채울까요?')) return;
    }
    setSuggesting(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/planning/suggest-characters`, {
        idea: ideaBrief.raw.trim(),
      });
      setCharacters(data.characters || []);
      setCharTouched(false); // 자동 생성이므로 touched 리셋
    } catch (err) {
      setError(err.response?.data?.detail || '캐릭터 제안에 실패했습니다.');
    } finally {
      setSuggesting(false);
    }
  };

  const addCharacter = () => {
    setCharacters([...characters, { name: '', description: '', gender: '남', age: '' }]);
    setCharTouched(true);
  };

  const updateCharacter = (index, field, value) => {
    const updated = [...characters];
    updated[index] = { ...updated[index], [field]: value };
    setCharacters(updated);
    setCharTouched(true);
  };

  const removeCharacter = (index) => {
    setCharacters(characters.filter((_, i) => i !== index));
    setCharTouched(true);
  };

  // synopsis를 4단 또는 문자열로 표시하는 헬퍼
  const getSynopsisParts = (p) => {
    if (p?.synopsis_parts) return p.synopsis_parts;
    return null;
  };

  const formatSynopsisText = (p) => {
    const parts = getSynopsisParts(p);
    if (parts) {
      return SYNOPSIS_LABELS.map(([k, label]) => parts[k] ? `${label}: ${parts[k]}` : '').filter(Boolean).join('\n');
    }
    return p?.synopsis || '';
  };

  const handleGenerate = async () => {
    // idea: idea_brief가 있으면 기승전결을 조합, 없으면 raw
    let ideaText = '';
    if (ideaBrief?.story) {
      const s = ideaBrief.story;
      const parts = [];
      if (ideaBrief.summary) parts.push(`한 줄 소개: ${ideaBrief.summary}`);
      if (s.ki) parts.push(`[도입] ${s.ki}`);
      if (s.seung) parts.push(`[전개] ${s.seung}`);
      if (s.jeon) parts.push(`[전환] ${s.jeon}`);
      if (s.gyeol) parts.push(`[결말] ${s.gyeol}`);
      if (ideaBrief.tone) parts.push(`톤: ${ideaBrief.tone}`);
      ideaText = parts.join('\n');
    } else {
      ideaText = ideaBrief?.raw || '';
    }
    if (!ideaText.trim()) return;

    setGenerating(true);
    setError('');
    try {
      const validChars = characters.filter((c) => c.name.trim());
      const storyOptions = (genre || mood || development)
        ? { genre, mood, development }
        : undefined;
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/planning`, {
        idea: ideaText.trim(),
        characters: validChars.length > 0 ? validChars : undefined,
        story_options: storyOptions,
      });
      setPlanning(data);
    } catch (err) {
      setError(err.response?.data?.detail || '기획 생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.post(`/projects/${projectId}/episodes/${episodeId}/planning/approve`, { auto_advance: false });
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || '승인에 실패했습니다.');
    } finally {
      setApproving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-400 dark:text-zinc-500 font-bold">기획 데이터 로딩 중...</div>;

  // 연작 파생 기획: Gate 1은 항상 읽기 전용
  const isSeriesDerived = derivedFromSeries && planning?.derived_from_series;

  // ── 시놉시스 4단 렌더 컴포넌트 ──
  const SynopsisParts = ({ parts }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
      {SYNOPSIS_LABELS.map(([k, label]) => (
        <div key={k}>
          <span className="text-[11px] font-bold text-gray-400 dark:text-zinc-500">{label}</span>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-0.5">{parts[k] || ''}</p>
        </div>
      ))}
    </div>
  );

  // ── 읽기 전용 뷰 ──
  if (readOnly || isSeriesDerived) {
    const synParts = getSynopsisParts(planning);
    return (
      <div className="space-y-4">
        {isSeriesDerived && (
          <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-2xl flex items-center gap-2">
            <Lightbulb size={16} className="text-purple-500 shrink-0" />
            <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
              연작 회차는 시리즈 기획(바이블)을 따릅니다. 기획을 수정하려면 시리즈 홈에서 바이블을 수정하세요.
            </span>
          </div>
        )}

        {/* 아이디어 정리 읽기 전용 */}
        {ideaBrief?.summary && (
          <div className="bg-gray-50 dark:bg-zinc-800/50 border-2 border-border dark:border-zinc-700 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-comic-orange" /> 아이디어 정리
            </h2>

            {ideaBrief.raw && (
              <div className="mb-3">
                <span className="text-xs font-bold text-gray-400 dark:text-zinc-500">원문</span>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-wrap">{ideaBrief.raw}</p>
              </div>
            )}
            <div className="mb-2">
              <span className="text-xs font-bold text-gray-400 dark:text-zinc-500">한 줄 소개</span>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-0.5">{ideaBrief.summary}</p>
            </div>
            {ideaBrief.characters?.length > 0 && (
              <div className="mb-2">
                <span className="text-xs font-bold text-gray-400 dark:text-zinc-500">등장 캐릭터</span>
                <div className="mt-0.5 space-y-0.5">
                  {ideaBrief.characters.map((c, i) => (
                    <div key={i} className="text-sm text-gray-600 dark:text-gray-400">
                      <strong>{c.name}</strong> — {c.description}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ideaBrief.story && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                {SYNOPSIS_LABELS.map(([k, label]) => (
                  <div key={k}>
                    <span className="text-xs font-bold text-gray-400 dark:text-zinc-500">{label}</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{ideaBrief.story[k]}</p>
                  </div>
                ))}
              </div>
            )}
            {ideaBrief.tone && (
              <div>
                <span className="text-xs font-bold text-gray-400 dark:text-zinc-500">톤</span>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{ideaBrief.tone}</p>
              </div>
            )}
          </div>
        )}

        {/* 장르/분위기/전개 칩 (읽기 전용) */}
        {planning?.story_options && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {planning.story_options.genre && (
              <span className="px-3 py-1 text-xs font-bold rounded-full border-2 border-comic-orange bg-comic-orange/10 text-comic-orange">
                {GENRE_OPTIONS.find(o => o.key === planning.story_options.genre)?.label || planning.story_options.genre}
              </span>
            )}
            {planning.story_options.mood && (
              <span className="px-3 py-1 text-xs font-bold rounded-full border-2 border-comic-blue bg-comic-blue/10 text-comic-blue">
                {MOOD_OPTIONS.find(o => o.key === planning.story_options.mood)?.label || planning.story_options.mood}
              </span>
            )}
            {planning.story_options.development && (
              <span className="px-3 py-1 text-xs font-bold rounded-full border-2 border-green-500 bg-green-500/10 text-green-600">
                {DEVELOPMENT_OPTIONS.find(o => o.key === planning.story_options.development)?.label || planning.story_options.development}
              </span>
            )}
          </div>
        )}

        {/* 기획 결과 읽기 전용 */}
        <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-4">
            <Lightbulb size={20} className="text-amber-500" />
            게이트 1 — 기획
            {isSeriesDerived && (
              <span className="text-xs font-bold text-purple-500 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full">파생 기획</span>
            )}
          </h2>
          {planning ? (
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">제목</span>
                <p className="font-bold font-serif text-ink-black dark:text-white mt-1">{planning.title}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">로그라인</span>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1">{planning.logline}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">시놉시스</span>
                {synParts ? (
                  <SynopsisParts parts={synParts} />
                ) : (
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{planning.synopsis}</p>
                )}
              </div>
              {planning.characters?.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">등장인물</span>
                  <div className="mt-1 space-y-2">
                    {planning.characters.map((c, i) => (
                      <div key={i} className="text-sm font-bold text-gray-700 dark:text-gray-300">
                        <strong>{c.name}</strong> ({c.ref_key}) — {c.gender && `${c.gender}, `}{c.age && `${c.age}세, `}{c.description}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 dark:text-zinc-500 text-sm font-bold">저장된 기획 데이터가 없습니다.</p>
          )}
        </div>
      </div>
    );
  }

  // ── 편집 모드 ──
  return (
    <div className="space-y-4">

      {/* 아이디어 정리 카드 */}
      <div className="bg-white dark:bg-surface-dark border-2 border-comic-orange/30 dark:border-comic-orange/20 rounded-2xl p-5 backdrop-blur-sm">
        <h2 className="text-base font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-comic-orange" />
          아이디어 정리
        </h2>

        {/* 원문 접이식 */}
        {ideaBrief?.raw && (
          <div className="mb-3">
            <button
              onClick={() => setRawExpanded(!rawExpanded)}
              className="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-comic-orange transition-colors"
            >
              {rawExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              원문 보기
            </button>
            {rawExpanded && (
              <div className="mt-2">
                <textarea
                  value={rawEdit}
                  onChange={(e) => setRawEdit(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:border-comic-orange resize-none"
                  rows={3}
                />
                <button
                  onClick={() => triggerIdeaBrief(rawEdit.trim())}
                  disabled={briefLoading || !rawEdit.trim()}
                  className="mt-1 flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-comic-orange hover:bg-comic-orange/10 border border-comic-orange/30 rounded-full transition-all disabled:opacity-50"
                >
                  <RefreshCw size={12} className={briefLoading ? 'animate-spin' : ''} /> 다시 정리
                </button>
              </div>
            )}
          </div>
        )}

        {/* 로딩 */}
        {briefLoading && (
          <div className="flex items-center gap-2 py-6 justify-center text-comic-orange">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm font-bold">이야기를 정리하고 있어요</span>
          </div>
        )}

        {/* idea_brief 내용 5칸 */}
        {ideaBrief?.summary && !briefLoading && (
          <div className="space-y-3">
            {/* 저장 상태 */}
            {briefSaveStatus && (
              <div className="flex justify-end">
                {briefSaveStatus === 'dirty' && (
                  <button onClick={saveBriefAll} className="px-2.5 py-0.5 text-[10px] font-bold text-white bg-comic-blue rounded-full hover:bg-blue-600 transition-colors">저장</button>
                )}
                {briefSaveStatus === 'saving' && <span className="text-[10px] text-blue-500 font-bold">저장 중…</span>}
                {briefSaveStatus === 'saved' && <span className="text-[10px] text-emerald-600 font-bold">저장됨 ✓</span>}
                {briefSaveStatus === 'error' && (
                  <button onClick={saveBriefAll} className="px-2.5 py-0.5 text-[10px] font-bold text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors">저장 실패 — 다시</button>
                )}
              </div>
            )}
            {/* 한 줄 소개 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">한 줄 소개</label>
              <input
                type="text"
                value={ideaBrief.summary}
                onChange={(e) => updateBriefField('summary', e.target.value)}
                onBlur={() => saveBriefField('summary', ideaBrief.summary)}
                className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
              />
            </div>

            {/* 등장 캐릭터 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400">등장 캐릭터</label>
                <button
                  onClick={addBriefCharacter}
                  className="text-xs font-bold text-comic-orange hover:underline flex items-center gap-0.5"
                >
                  <Plus size={12} /> 추가
                </button>
              </div>
              {ideaBrief.characters?.map((c, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input
                    value={c.name}
                    onChange={(e) => updateBriefCharacter(i, 'name', e.target.value)}
                    onBlur={() => saveBriefField('characters', ideaBrief.characters)}
                    placeholder="이름"
                    className="w-24 min-w-0 px-2 py-1.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
                  />
                  <input
                    value={c.description || ''}
                    onChange={(e) => updateBriefCharacter(i, 'description', e.target.value)}
                    onBlur={() => saveBriefField('characters', ideaBrief.characters)}
                    placeholder="특징"
                    className="flex-1 min-w-0 px-2 py-1.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
                  />
                  <button
                    onClick={() => { removeBriefCharacter(i); saveBriefField('characters', ideaBrief.characters.filter((_, j) => j !== i)); }}
                    className="p-1 text-gray-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* 이야기 기승전결 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">이야기</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SYNOPSIS_LABELS.map(([key, label]) => (
                  <div key={key}>
                    <span className="text-[11px] font-bold text-gray-400 dark:text-zinc-500">{label}</span>
                    <textarea
                      value={ideaBrief.story?.[key] || ''}
                      onChange={(e) => updateBriefStory(key, e.target.value)}
                      onBlur={() => saveBriefField('story', ideaBrief.story)}
                      className="w-full px-2 py-1.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:border-comic-orange resize-none"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 톤 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">톤</label>
              <input
                type="text"
                value={ideaBrief.tone || ''}
                onChange={(e) => updateBriefField('tone', e.target.value)}
                onBlur={() => saveBriefField('tone', ideaBrief.tone)}
                className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
              />
            </div>

            {/* "이렇게 바꿔줘" 재정리 */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={reviseHint}
                onChange={(e) => setReviseHint(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRevise()}
                placeholder="이렇게 바꿔줘 (예: 결말을 해피엔딩으로)"
                className="flex-1 px-3 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-full text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange placeholder-gray-400"
              />
              <button
                onClick={handleRevise}
                disabled={revising || !reviseHint.trim()}
                className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-white bg-comic-orange rounded-full hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                {revising ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                {revising ? '정리 중...' : '다시 정리'}
              </button>
            </div>
          </div>
        )}

        {/* idea_brief가 아직 없고 raw도 없을 때 (기존 에피소드 호환) */}
        {!ideaBrief?.raw && !briefLoading && (
          <p className="text-sm text-gray-400 dark:text-zinc-500 py-2">
            이 에피소드는 아이디어 정리 없이 생성되었습니다. 아래에서 직접 기획을 생성하세요.
          </p>
        )}
      </div>

      {/* 기존 게이트1 설정 (장르/분위기/전개/등장인물/기획 생성) */}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-4">
          <Lightbulb size={20} className="text-amber-500" />
          게이트 1 — 기획
        </h2>

        <div className="space-y-5">
          {/* 3축 선택 */}
          <div className="space-y-3">
            {/* 장르 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">장르 <span className="font-normal text-gray-400">(선택)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {GENRE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleOption(genre, setGenre, opt.key, setGenreTouched)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-full border-2 transition-all ${
                      genre === opt.key
                        ? 'border-comic-orange bg-comic-orange text-white'
                        : 'border-border dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-comic-orange/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 분위기 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">분위기 <span className="font-normal text-gray-400">(선택)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {MOOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleOption(mood, setMood, opt.key, setMoodTouched)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-full border-2 transition-all ${
                      mood === opt.key
                        ? 'border-comic-blue bg-comic-blue text-white'
                        : 'border-border dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-comic-blue/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 이야기 전개 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">이야기 전개 <span className="font-normal text-gray-400">(선택)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {DEVELOPMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleOption(development, setDevelopment, opt.key, setDevTouched)}
                    className={`group flex flex-col items-start px-3 py-1.5 text-xs font-bold rounded-xl border-2 transition-all ${
                      development === opt.key
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-border dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-green-500/50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-[10px] font-normal mt-0.5 ${
                      development === opt.key ? 'text-green-100' : 'text-gray-400 dark:text-zinc-500'
                    }`}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 등장인물 섹션 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                등장인물 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <div className="flex gap-2">
                <button
                  onClick={handleSuggestCharacters}
                  disabled={suggesting || !(ideaBrief?.raw || '').trim()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-comic-blue hover:text-white border-2 border-comic-blue/30 hover:bg-comic-blue rounded-full transition-all disabled:opacity-50"
                >
                  {suggesting ? (
                    <><RefreshCw size={12} className="animate-spin" /> 생성 중...</>
                  ) : (
                    <><Sparkles size={12} /> 자동 생성</>
                  )}
                </button>
                <button
                  onClick={addCharacter}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-comic-orange border-2 border-border dark:border-zinc-700 hover:border-comic-orange rounded-full transition-all"
                >
                  <UserPlus size={12} /> 직접 추가
                </button>
              </div>
            </div>

            {characters.length > 0 ? (
              <div className="space-y-2">
                {characters.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-3 border-2 border-border dark:border-zinc-700 rounded-xl bg-gray-50 dark:bg-zinc-800/50"
                  >
                    <input
                      value={c.name}
                      onChange={(e) => updateCharacter(i, 'name', e.target.value)}
                      placeholder="이름"
                      className="w-24 min-w-0 px-3 py-1.5 border-2 border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 rounded-lg text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
                    />
                    <input
                      value={c.description || ''}
                      onChange={(e) => updateCharacter(i, 'description', e.target.value)}
                      placeholder="추가설명 (예: 포메라니안, 안경 쓴 회사원)"
                      className="flex-1 min-w-0 px-3 py-1.5 border-2 border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 rounded-lg text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
                    />
                    <select
                      value={c.gender || '남'}
                      onChange={(e) => updateCharacter(i, 'gender', e.target.value)}
                      className="px-3 py-1.5 border-2 border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 rounded-lg text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
                    >
                      <option value="남">남</option>
                      <option value="여">여</option>
                      <option value="기타">기타</option>
                    </select>
                    <input
                      type="number"
                      value={c.age || ''}
                      onChange={(e) => updateCharacter(i, 'age', e.target.value)}
                      placeholder="나이"
                      className="w-20 px-3 py-1.5 border-2 border-border dark:border-zinc-600 bg-white dark:bg-zinc-800 rounded-lg text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
                    />
                    <button
                      onClick={() => removeCharacter(i)}
                      className="p-1.5 text-gray-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 border-2 border-dashed border-border dark:border-zinc-700 rounded-xl">
                <p className="text-sm text-gray-400 dark:text-zinc-500">
                  등장인물을 추가하면 더 정확한 기획이 생성됩니다
                </p>
              </div>
            )}
          </div>

          {/* 기획 생성 버튼 */}
          <button
            onClick={handleGenerate}
            disabled={generating || (!(ideaBrief?.raw || '').trim() && !(ideaBrief?.story?.ki || '').trim())}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full text-sm font-bold hover:bg-comic-blue dark:hover:bg-comic-orange hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
          >
            {generating ? <><RefreshCw size={14} className="animate-spin" /> 생성 중...</> : '기획 생성'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 mt-3">
            <p className="text-red-500 dark:text-red-400 text-sm font-bold">{error}</p>
            <button
              onClick={() => triggerIdeaBrief()}
              disabled={briefLoading}
              className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-full transition-colors disabled:opacity-50"
            >
              <RefreshCw size={10} /> 다시 정리
            </button>
          </div>
        )}
      </div>

      {planning && (() => {
        const synParts = getSynopsisParts(planning);
        return (
        <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-start justify-between gap-2">
            {editing ? (
              <input
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="text-lg font-bold font-serif text-ink-black dark:text-white bg-transparent border-b-2 border-comic-orange focus:outline-none w-full"
              />
            ) : (
              <div className="min-w-0 flex-1">
                <h3 className="font-bold font-serif text-ink-black dark:text-white break-words">{planning.title}</h3>
                {planning.suggested_title && planning.suggested_title !== planning.title && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400 dark:text-zinc-500">AI 추천:</span>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{planning.suggested_title}</span>
                    <button
                      onClick={async () => {
                        try {
                          await api.put(`/projects/${projectId}/episodes/${episodeId}/planning`, {
                            title: planning.suggested_title,
                            planning: { ...planning, title: planning.suggested_title },
                          });
                          setPlanning({ ...planning, title: planning.suggested_title, suggested_title: undefined });
                        } catch {}
                      }}
                      className="text-xs font-bold text-comic-blue hover:underline"
                    >
                      적용
                    </button>
                  </div>
                )}
              </div>
            )}
            {!editing && (
              <button
                onClick={() => { setEditing(true); setEditData({ title: planning.title, logline: planning.logline, synopsis: planning.synopsis, synopsis_parts: planning.synopsis_parts || null, characters: planning.characters ? planning.characters.map(c => ({ ...c })) : [] }); }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-comic-orange border-2 border-border dark:border-zinc-700 rounded-full transition-all shrink-0"
              >
                <Pencil size={12} /> 수정
              </button>
            )}
          </div>

          <div>
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">로그라인</span>
            {editing ? (
              <textarea
                value={editData.logline}
                onChange={(e) => setEditData({ ...editData, logline: e.target.value })}
                className="w-full mt-1 px-3 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:border-comic-orange resize-none"
                rows={2}
              />
            ) : (
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1">{planning.logline}</p>
            )}
          </div>

          <div>
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">시놉시스</span>
            {editing ? (
              editData.synopsis_parts ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {SYNOPSIS_LABELS.map(([key, label]) => (
                    <div key={key}>
                      <span className="text-[11px] font-bold text-gray-400 dark:text-zinc-500">{label}</span>
                      <textarea
                        value={editData.synopsis_parts[key] || ''}
                        onChange={(e) => {
                          const newParts = { ...editData.synopsis_parts, [key]: e.target.value };
                          const synText = SYNOPSIS_LABELS.map(([k, l]) => newParts[k] ? `${l}: ${newParts[k]}` : '').filter(Boolean).join('\n');
                          setEditData({ ...editData, synopsis_parts: newParts, synopsis: synText });
                        }}
                        className="w-full px-2 py-1.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:border-comic-orange resize-none"
                        rows={2}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <textarea
                  value={editData.synopsis}
                  onChange={(e) => setEditData({ ...editData, synopsis: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:border-comic-orange resize-none"
                  rows={6}
                />
              )
            ) : (
              synParts ? (
                <SynopsisParts parts={synParts} />
              ) : (
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{planning.synopsis}</p>
              )
            )}
          </div>

          {(editing ? editData.characters : planning.characters)?.length > 0 && (
            <div>
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">등장인물</span>
              <div className="mt-1 space-y-2">
                {editing ? editData.characters.map((c, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      value={c.name}
                      onChange={(e) => { const chars = [...editData.characters]; chars[i] = { ...chars[i], name: e.target.value }; setEditData({ ...editData, characters: chars }); }}
                      className="w-24 px-2 py-1 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-sm font-bold focus:outline-none focus:border-comic-orange"
                      placeholder="이름"
                    />
                    <input
                      value={c.ref_key}
                      onChange={(e) => { const chars = [...editData.characters]; chars[i] = { ...chars[i], ref_key: e.target.value }; setEditData({ ...editData, characters: chars }); }}
                      className="w-20 px-2 py-1 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-sm font-bold focus:outline-none focus:border-comic-orange"
                      placeholder="ref_key"
                    />
                    <input
                      value={c.description}
                      onChange={(e) => { const chars = [...editData.characters]; chars[i] = { ...chars[i], description: e.target.value }; setEditData({ ...editData, characters: chars }); }}
                      className="flex-1 px-2 py-1 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-sm font-bold focus:outline-none focus:border-comic-orange"
                      placeholder="설명"
                    />
                  </div>
                )) : planning.characters.map((c, i) => (
                  <div key={i} className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    <strong>{c.name}</strong> ({c.ref_key}) — {c.gender && `${c.gender}, `}{c.age && `${c.age}세, `}{c.description}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const saveData = {
                        title: editData.title,
                        logline: editData.logline,
                        synopsis: editData.synopsis,
                        planning: { ...planning, title: editData.title, logline: editData.logline, synopsis: editData.synopsis, synopsis_parts: editData.synopsis_parts, characters: editData.characters },
                      };
                      await api.put(`/projects/${projectId}/episodes/${episodeId}/planning`, saveData);
                      setPlanning({ ...planning, title: editData.title, logline: editData.logline, synopsis: editData.synopsis, synopsis_parts: editData.synopsis_parts, characters: editData.characters });
                      setEditing(false);
                    } catch (err) {
                      setError('수정 저장에 실패했습니다.');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-comic-blue text-white rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
                >
                  <Save size={14} /> {saving ? '저장 중...' : '수정 저장'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 px-5 py-2.5 border-2 border-border dark:border-zinc-700 text-gray-600 dark:text-gray-400 rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all"
                >
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-green-600 dark:bg-green-600 text-white rounded-full text-sm font-bold hover:bg-green-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Check size={14} /> {approving ? '승인 중...' : '기획 승인 → 다음 단계'}
              </button>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
