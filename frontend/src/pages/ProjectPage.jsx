import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { pollJob } from '../api/client';
import { Plus, ArrowLeft, Play, Lightbulb, FileText, Palette, LayoutGrid, ImageIcon, ChevronRight, Sparkles, X, CheckCircle, Trash2, BookOpen, Loader2 } from 'lucide-react';
import { pickRandomChips } from '../constants/ideaChips';

const GENRE_OPTIONS = [
  { value: '', label: '장르 선택 (선택)' },
  { value: 'romance', label: '로맨스' },
  { value: 'daily', label: '일상/힐링' },
  { value: 'comedy', label: '코미디' },
  { value: 'thriller', label: '스릴러' },
  { value: 'fantasy', label: '판타지' },
  { value: 'drama', label: '드라마' },
];

const MOOD_OPTIONS = [
  { value: '', label: '분위기 선택 (선택)' },
  { value: 'warm', label: '따뜻한' },
  { value: 'cheerful', label: '밝고 유쾌한' },
  { value: 'tense', label: '긴장감 있는' },
  { value: 'touching', label: '감동적인' },
  { value: 'dark', label: '어둡고 무거운' },
];

const EPISODE_COUNT_OPTIONS = [4, 8, 12, 16, 24];

export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [creating, setCreating] = useState(false);

  // 단편 모달
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalIdea, setModalIdea] = useState('');
  const [modalStoryOptions, setModalStoryOptions] = useState(null);
  const [modalChips, setModalChips] = useState([]);

  // 연작 모달
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [seriesTitle, setSeriesTitle] = useState('');
  const [seriesIdea, setSeriesIdea] = useState('');
  const [seriesGenre, setSeriesGenre] = useState('');
  const [seriesMood, setSeriesMood] = useState('');
  const [seriesEpisodeCount, setSeriesEpisodeCount] = useState(8);
  const [seriesChips, setSeriesChips] = useState([]);
  const [seriesCreating, setSeriesCreating] = useState(false);
  const [seriesJobMessage, setSeriesJobMessage] = useState('');

  // 온보딩 예시 칩 (마운트마다 랜덤 3개)
  const onboardingChips = useMemo(() => pickRandomChips(3), []);

  useEffect(() => {
    api.get(`/projects/${projectId}`).then(({ data }) => setProject(data));
    api.get(`/projects/${projectId}/episodes`).then(({ data }) => setEpisodes(data));
    api.get(`/projects/${projectId}/series`).then(({ data }) => setSeriesList(data)).catch(() => {});
  }, [projectId]);

  // ── 단편 에피소드 ──

  const openModal = (chip = null) => {
    setModalTitle('');
    setModalIdea(chip?.text || '');
    setModalStoryOptions(chip ? { genre: chip.genre, mood: chip.mood, development: chip.development } : null);
    setModalChips(pickRandomChips(3));
    setShowModal(true);
  };

  const handleCreateEpisode = async () => {
    if (!modalTitle.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes`, {
        episode_no: episodes.length + 1,
        title: modalTitle.trim(),
        idea: modalIdea || '',
      });
      setShowModal(false);
      navigate(`/projects/${projectId}/episodes/${data.id}/workflow`, {
        state: { idea: modalIdea || '', storyOptions: modalStoryOptions },
      });
    } catch (e) {
      alert('에피소드 생성에 실패했습니다.');
      setCreating(false);
    }
  };

  const handleDeleteEpisode = async (e, episodeId) => {
    e.stopPropagation();
    if (!confirm('이 에피소드를 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/projects/${projectId}/episodes/${episodeId}`);
      setEpisodes((prev) => prev.filter((ep) => ep.id !== episodeId));
    } catch {
      alert('에피소드 삭제에 실패했습니다.');
    }
  };

  // ── 연작 시리즈 ──

  const openSeriesModal = () => {
    setSeriesTitle('');
    setSeriesIdea('');
    setSeriesGenre('');
    setSeriesMood('');
    setSeriesEpisodeCount(8);
    setSeriesChips(pickRandomChips(3));
    setSeriesJobMessage('');
    setShowSeriesModal(true);
  };

  const handleCreateSeries = async () => {
    if (!seriesTitle.trim() || !seriesIdea.trim()) return;
    setSeriesCreating(true);
    setSeriesJobMessage('시리즈 생성 중...');
    try {
      // 1) 시리즈 행 생성
      const storyOptions = (seriesGenre || seriesMood) ? { genre: seriesGenre || null, mood: seriesMood || null } : null;
      const { data: created } = await api.post(`/projects/${projectId}/series`, {
        title: seriesTitle.trim(),
        idea: seriesIdea.trim(),
        story_options: storyOptions,
        target_episodes: seriesEpisodeCount,
      });

      // 2) 바이블+아웃라인 생성 (비동기 Job)
      setSeriesJobMessage('바이블과 아웃라인 생성 중...');
      const { data: jobData } = await api.post(`/series/${created.id}/bible`, {
        target_episodes: seriesEpisodeCount,
      });

      await pollJob(jobData.job_id, null, 2000);

      // 3) 완료 → 시리즈 홈으로 이동
      setShowSeriesModal(false);
      navigate(`/projects/${projectId}/series/${created.id}`);
    } catch (e) {
      alert(e?.response?.data?.detail || e.message || '시리즈 생성에 실패했습니다.');
      setSeriesCreating(false);
      setSeriesJobMessage('');
    }
  };

  const handleDeleteSeries = async (e, sid) => {
    e.stopPropagation();
    if (!confirm('이 시리즈를 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/series/${sid}`);
      setSeriesList((prev) => prev.filter((s) => s.id !== sid));
    } catch (e) {
      alert(e?.response?.data?.detail || '시리즈 삭제에 실패했습니다.');
    }
  };

  if (!project) return <div className="text-center py-20 text-gray-400 dark:text-zinc-500 font-bold">로딩 중...</div>;

  const isEpisodeCompleted = (gs) => {
    if (!gs?.gates) return false;
    return gs.gates['5_review']?.status === 'approved';
  };

  const gateLabel = (gs) => {
    if (!gs) return '시작 전';
    if (isEpisodeCompleted(gs)) return null;
    const g = gs.current_gate;
    const labels = { 1: '기획', 2: '대본', 3: '자산', 4: '콘티', 5: '이미지' };
    return `게이트 ${g} — ${labels[g]}`;
  };

  const hasContent = episodes.length > 0 || seriesList.length > 0;

  return (
    <div>
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors">
        <ArrowLeft size={16} /> 프로젝트 목록
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold font-serif text-ink-black dark:text-white">{project.title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openModal()}
            disabled={creating}
            className="flex items-center gap-1.5 px-4 py-2 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full text-sm font-bold hover:bg-comic-blue dark:hover:bg-comic-orange hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
          >
            <Plus size={16} /> 단편
          </button>
          <button
            onClick={openSeriesModal}
            disabled={creating || seriesCreating}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-full text-sm font-bold hover:bg-purple-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
          >
            <BookOpen size={16} /> 연작
          </button>
        </div>
      </div>

      {!hasContent ? (
        <div className="bg-white dark:bg-surface-dark rounded-2xl border-2 border-border dark:border-zinc-800 overflow-hidden backdrop-blur-sm">
          {/* 파이프라인 가이드 */}
          <div className="px-6 pt-6 pb-4">
            <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white mb-1 flex items-center gap-2">
              <Sparkles size={20} className="text-comic-blue" />
              아이디어만 입력하면 웹툰이 완성됩니다
            </h2>
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-5">AI가 5단계를 거쳐 자동으로 웹툰을 만들어드립니다</p>

            <div className="flex items-center justify-between bg-gradient-to-r from-comic-orange/5 to-comic-blue/5 dark:from-comic-orange/10 dark:to-comic-blue/10 rounded-2xl p-4 gap-1 border-2 border-border dark:border-zinc-800">
              {[
                { icon: Lightbulb, label: '아이디어', color: 'text-amber-500' },
                { icon: FileText, label: '기획·대본', color: 'text-comic-blue' },
                { icon: Palette, label: '캐릭터·장소', color: 'text-green-500' },
                { icon: LayoutGrid, label: '콘티', color: 'text-comic-orange' },
                { icon: ImageIcon, label: '이미지 완성', color: 'text-purple-500' },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-10 h-10 rounded-full bg-white dark:bg-zinc-800 shadow-sm border-2 border-border dark:border-zinc-700 flex items-center justify-center ${step.color}`}>
                      <step.icon size={20} />
                    </div>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{step.label}</span>
                  </div>
                  {i < 4 && <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600 mt-[-16px] mx-1" />}
                </div>
              ))}
            </div>
          </div>

          {/* 예시 아이디어 */}
          <div className="px-6 pb-4">
            <p className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-3">이런 아이디어로 시작해보세요</p>
            <div className="space-y-2">
              {onboardingChips.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => openModal(chip)}
                  disabled={creating}
                  className="w-full text-left px-4 py-3 rounded-2xl border-2 border-border dark:border-zinc-800 hover:border-comic-orange hover:bg-comic-orange/5 dark:hover:bg-comic-orange/10 transition-all text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center justify-between group disabled:opacity-50"
                >
                  <span>💡 {chip.text}</span>
                  <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600 group-hover:text-comic-orange transition-colors" />
                </button>
              ))}
            </div>
          </div>

          {/* CTA 버튼 */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={() => openModal()}
              disabled={creating}
              className="flex-1 py-3 bg-comic-orange text-white rounded-full font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus size={18} /> 단편 에피소드
            </button>
            <button
              onClick={openSeriesModal}
              disabled={creating || seriesCreating}
              className="flex-1 py-3 bg-purple-600 text-white rounded-full font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <BookOpen size={18} /> 연작 시리즈
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 시리즈 카드 */}
          {seriesList.map((s) => (
            <div
              key={`s-${s.id}`}
              onClick={() => navigate(`/projects/${projectId}/series/${s.id}`)}
              className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between hover:shadow-md hover:border-purple-400 hover:-translate-y-0.5 transition-all cursor-pointer backdrop-blur-sm group"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 rounded-full">연작</span>
                  <h3 className="font-bold font-serif text-ink-black dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">{s.title}</h3>
                </div>
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mt-0.5">
                  {s.outline_count}화 계획 · 대본 {s.script_done ?? s.episode_count} · 이미지 {s.image_done ?? 0}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleDeleteSeries(e, s.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="시리즈 삭제"
                >
                  <Trash2 size={16} />
                </button>
                <BookOpen size={20} className="text-purple-500 group-hover:text-purple-600 transition-colors" />
              </div>
            </div>
          ))}

          {/* 에피소드 카드 */}
          {episodes.map((ep) => (
            <div
              key={ep.id}
              onClick={() => navigate(`/projects/${projectId}/episodes/${ep.id}/workflow`)}
              className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between hover:shadow-md hover:border-comic-orange hover:-translate-y-0.5 transition-all cursor-pointer backdrop-blur-sm group"
            >
              <div>
                <h3 className="font-bold font-serif text-ink-black dark:text-white group-hover:text-comic-orange transition-colors">{ep.title || `에피소드 ${ep.episode_no}`}</h3>
                {isEpisodeCompleted(ep.gate_status) ? (
                  <p className="text-sm font-bold text-green-500 mt-0.5 flex items-center gap-1">
                    <CheckCircle size={14} /> 에피소드 완료
                  </p>
                ) : (
                  <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mt-0.5">{gateLabel(ep.gate_status)}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => handleDeleteEpisode(e, ep.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="에피소드 삭제"
                >
                  <Trash2 size={16} />
                </button>
                <Play size={20} className="text-comic-blue group-hover:text-comic-orange transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 단편 에피소드 생성 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div
            className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white">단편 에피소드 만들기</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">에피소드 제목</label>
                <input
                  type="text"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  placeholder="예: 쿨링 헤어팩 다이어리"
                  className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400 focus:border-comic-orange focus:outline-none transition-colors font-bold"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateEpisode()}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">아이디어 <span className="text-gray-400 font-normal">(선택)</span></label>
                <textarea
                  value={modalIdea}
                  onChange={(e) => setModalIdea(e.target.value)}
                  placeholder="어떤 이야기를 만들고 싶으신가요?"
                  rows={3}
                  className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400 focus:border-comic-orange focus:outline-none transition-colors font-bold resize-none"
                />
                <div className="mt-3">
                  <div className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">아이디어 예시</span>
                    <span className="text-[11px] text-gray-400 dark:text-zinc-500">눌러서 채운 뒤 자유롭게 수정하세요</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {modalChips.map((chip, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setModalIdea(chip.text);
                          setModalStoryOptions({ genre: chip.genre, mood: chip.mood, development: chip.development });
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-zinc-800 border border-border dark:border-zinc-700 rounded-xl hover:border-comic-orange hover:text-comic-orange hover:bg-comic-orange/5 transition-all text-left whitespace-normal"
                      >
                        💡 {chip.text}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 border-2 border-border dark:border-zinc-700 rounded-full font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleCreateEpisode}
                disabled={!modalTitle.trim() || creating}
                className="flex-1 py-2.5 bg-comic-orange text-white rounded-full font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {creating ? '생성 중...' : '생성하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 연작 시리즈 생성 모달 */}
      {showSeriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !seriesCreating && setShowSeriesModal(false)}>
          <div
            className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
                <BookOpen size={20} className="text-purple-500" />
                연작 시리즈 만들기
              </h2>
              <button onClick={() => !seriesCreating && setShowSeriesModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">시리즈 제목</label>
                <input
                  type="text"
                  value={seriesTitle}
                  onChange={(e) => setSeriesTitle(e.target.value)}
                  placeholder="예: 도도의 카페 일상"
                  className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none transition-colors font-bold"
                  autoFocus
                  disabled={seriesCreating}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">아이디어</label>
                <textarea
                  value={seriesIdea}
                  onChange={(e) => setSeriesIdea(e.target.value)}
                  placeholder="시리즈의 전체 줄거리 아이디어를 입력하세요"
                  rows={3}
                  className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-ink-black dark:text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none transition-colors font-bold resize-none"
                  disabled={seriesCreating}
                />
                <div className="mt-3">
                  <div className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">아이디어 예시</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {seriesChips.map((chip, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={seriesCreating}
                        onClick={() => {
                          setSeriesIdea(chip.text);
                          if (chip.genre) setSeriesGenre(chip.genre);
                          if (chip.mood) setSeriesMood(chip.mood);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-zinc-800 border border-border dark:border-zinc-700 rounded-xl hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-all text-left whitespace-normal disabled:opacity-50"
                      >
                        💡 {chip.text}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">장르</label>
                  <select
                    value={seriesGenre}
                    onChange={(e) => setSeriesGenre(e.target.value)}
                    disabled={seriesCreating}
                    className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-sm font-bold text-ink-black dark:text-white focus:border-purple-500 focus:outline-none"
                  >
                    {GENRE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">분위기</label>
                  <select
                    value={seriesMood}
                    onChange={(e) => setSeriesMood(e.target.value)}
                    disabled={seriesCreating}
                    className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-sm font-bold text-ink-black dark:text-white focus:border-purple-500 focus:outline-none"
                  >
                    {MOOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">목표 회차 수</label>
                <div className="flex gap-2">
                  {EPISODE_COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={seriesCreating}
                      onClick={() => setSeriesEpisodeCount(n)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all border-2 ${
                        seriesEpisodeCount === n
                          ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'border-border dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-purple-300'
                      } disabled:opacity-50`}
                    >
                      {n}화
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {seriesJobMessage && (
              <div className="mt-4 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-purple-500" />
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{seriesJobMessage}</span>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSeriesModal(false)}
                disabled={seriesCreating}
                className="flex-1 py-2.5 border-2 border-border dark:border-zinc-700 rounded-full font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleCreateSeries}
                disabled={!seriesTitle.trim() || !seriesIdea.trim() || seriesCreating}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-full font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {seriesCreating ? '생성 중...' : '시리즈 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
