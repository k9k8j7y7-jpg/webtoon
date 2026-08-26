import { useState, useEffect, useMemo } from 'react';
import api from '../../api/client';
import { Lightbulb, Check, RefreshCw, Pencil, Save, Plus, Trash2, Sparkles, UserPlus } from 'lucide-react';
import { pickRandomChips } from '../../constants/ideaChips';

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

export default function Gate1Planning({ projectId, episodeId, onRefresh, initialIdea = '', initialStoryOptions = null, readOnly = false, derivedFromSeries = false }) {
  const [idea, setIdea] = useState(initialIdea);
  const [characters, setCharacters] = useState([]);
  const [planning, setPlanning] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState(null);
  const [error, setError] = useState('');

  // 3축 선택 상태 (initialStoryOptions 또는 저장된 값으로 초기화)
  const [genre, setGenre] = useState(initialStoryOptions?.genre || null);
  const [mood, setMood] = useState(initialStoryOptions?.mood || null);
  const [development, setDevelopment] = useState(initialStoryOptions?.development || null);

  // 랜덤 칩 3개 (컴포넌트 마운트마다 로테이션)
  const visibleChips = useMemo(() => pickRandomChips(3), []);

  useEffect(() => {
    api.get(`/projects/${projectId}/episodes/${episodeId}/planning`)
      .then(({ data }) => {
        if (data) {
          setPlanning(data);
          // 저장된 story_options 복원
          if (data.story_options) {
            setGenre(data.story_options.genre || null);
            setMood(data.story_options.mood || null);
            setDevelopment(data.story_options.development || null);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, episodeId]);

  const handleChipClick = (chip) => {
    setIdea(chip.text);
    // 칩-버튼 연동
    setGenre(chip.genre);
    setMood(chip.mood);
    setDevelopment(chip.development);
    // 입력칸 포커스 + 전체선택
    setTimeout(() => {
      const ta = document.getElementById('idea-textarea');
      if (ta) { ta.focus(); ta.select(); }
    }, 0);
  };

  const toggleOption = (current, setter, key) => {
    setter(current === key ? null : key);
  };

  const handleSuggestCharacters = async () => {
    if (!idea.trim()) return;
    setSuggesting(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/planning/suggest-characters`, {
        idea: idea.trim(),
      });
      setCharacters(data.characters || []);
    } catch (err) {
      setError(err.response?.data?.detail || '캐릭터 제안에 실패했습니다.');
    } finally {
      setSuggesting(false);
    }
  };

  const addCharacter = () => {
    setCharacters([...characters, { name: '', description: '', gender: '남', age: '' }]);
  };

  const updateCharacter = (index, field, value) => {
    const updated = [...characters];
    updated[index] = { ...updated[index], [field]: value };
    setCharacters(updated);
  };

  const removeCharacter = (index) => {
    setCharacters(characters.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!idea.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const validChars = characters.filter((c) => c.name.trim());
      const storyOptions = (genre || mood || development)
        ? { genre, mood, development }
        : undefined;
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/planning`, {
        idea: idea.trim(),
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

  if (readOnly || isSeriesDerived) {
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
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{planning.synopsis}</p>
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

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-4">
          <Lightbulb size={20} className="text-amber-500" />
          게이트 1 — 기획
        </h2>

        <div className="space-y-5">
          {/* 아이디어 입력 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">웹툰 아이디어</label>
            <textarea
              id="idea-textarea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="예: 평범한 고등학생이 시간을 되돌릴 수 있는 회중시계를 발견하고, 시간여행 능력을 얻게 되는 이야기"
              className="w-full px-4 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all font-bold text-sm resize-none"
              rows={3}
            />
            {/* 예시 칩 */}
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5 mb-1.5">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-400">아이디어 예시</span>
                <span className="text-[11px] text-gray-400 dark:text-zinc-500">눌러서 채운 뒤 자유롭게 수정하세요</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {visibleChips.map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-zinc-800 border border-border dark:border-zinc-700 rounded-xl hover:border-comic-orange hover:text-comic-orange hover:bg-comic-orange/5 transition-all text-left whitespace-normal"
                  >
                    💡 {chip.text}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
                    onClick={() => toggleOption(genre, setGenre, opt.key)}
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
                    onClick={() => toggleOption(mood, setMood, opt.key)}
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
                    onClick={() => toggleOption(development, setDevelopment, opt.key)}
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
                  disabled={suggesting || !idea.trim()}
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
            disabled={generating || !idea.trim()}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full text-sm font-bold hover:bg-comic-blue dark:hover:bg-comic-orange hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
          >
            {generating ? <><RefreshCw size={14} className="animate-spin" /> 생성 중...</> : '기획 생성'}
          </button>
        </div>

        {error && <p className="text-red-500 dark:text-red-400 text-sm font-bold mt-3">{error}</p>}
      </div>

      {planning && (
        <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            {editing ? (
              <input
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="text-lg font-bold font-serif text-ink-black dark:text-white bg-transparent border-b-2 border-comic-orange focus:outline-none w-full"
              />
            ) : (
              <h3 className="font-bold font-serif text-ink-black dark:text-white">{planning.title}</h3>
            )}
            {!editing && (
              <button
                onClick={() => { setEditing(true); setEditData({ title: planning.title, logline: planning.logline, synopsis: planning.synopsis, characters: planning.characters ? planning.characters.map(c => ({ ...c })) : [] }); }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-comic-orange border-2 border-border dark:border-zinc-700 rounded-full transition-all"
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
              <textarea
                value={editData.synopsis}
                onChange={(e) => setEditData({ ...editData, synopsis: e.target.value })}
                className="w-full mt-1 px-3 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:border-comic-orange resize-none"
                rows={6}
              />
            ) : (
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{planning.synopsis}</p>
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
                      await api.put(`/projects/${projectId}/episodes/${episodeId}/planning`, {
                        title: editData.title,
                        logline: editData.logline,
                        synopsis: editData.synopsis,
                        planning: { ...planning, title: editData.title, logline: editData.logline, synopsis: editData.synopsis, characters: editData.characters },
                      });
                      setPlanning({ ...planning, title: editData.title, logline: editData.logline, synopsis: editData.synopsis, characters: editData.characters });
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
      )}
    </div>
  );
}
