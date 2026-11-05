import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { Plus, FolderOpen, Trash2, Clock, Sparkles } from 'lucide-react';

const PROJECT_KINDS = [
  { key: 'story', icon: '📖', label: '이야기', desc: '일상툰·단편·연작' },
  { key: 'ad', icon: '📣', label: '광고', desc: '한 컷·인스타툰' },
  { key: 'series', icon: '📚', label: '연재툰', desc: '같은 제품으로 매주 한 편' },
];
const SERIES_CUT_OPTIONS = [6, 8, 10];
const SERIES_RATIO_OPTIONS = [
  { value: '9:16', label: '세로 9:16' },
  { value: '1:1', label: '정사각 1:1' },
];

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const startSeries = searchParams.get('new') === 'series';
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(startSeries);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState(startSeries ? 'series' : 'story');
  const [seriesCuts, setSeriesCuts] = useState(6);
  const [seriesRatio, setSeriesRatio] = useState('9:16');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const isSeriesKind = kind === 'series';

  // 랜딩 링크(?new=series)로 들어오면 폼을 연 뒤 주소는 정리
  useEffect(() => {
    if (startSeries) setSearchParams({}, { replace: true });
  }, []);

  const load = () => {
    api.get('/projects').then(({ data }) => {
      setProjects(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const body = { title: title.trim(), kind };
      if (isSeriesKind) {
        body.series_cut_count = seriesCuts;
        body.series_ratio = seriesRatio;
      }
      const { data } = await api.post('/projects', body);
      setTitle('');
      setShowCreate(false);
      navigate(data.first_episode_id
        ? `/projects/${data.id}/episodes/${data.first_episode_id}/workflow`
        : `/projects/${data.id}`);
    } catch (err) {
      alert(err.response?.data?.detail || '프로젝트를 만들지 못했어요.');
      setSubmitting(false);
    }
  };

  const chipClass = (active) => `px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${active
    ? 'bg-comic-orange text-white'
    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'}`;

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('프로젝트를 삭제하시겠습니까?')) return;
    await api.delete(`/projects/${id}`);
    load();
  };

  if (loading) return <div className="text-center py-20 text-gray-400 font-bold">로딩 중...</div>;

  return (
    <div>
      {/* 빠른 한 컷 카드 */}
      <button
        onClick={() => navigate('/quick')}
        className="w-full mb-6 p-4 rounded-2xl bg-gradient-to-r from-purple-600/10 to-cyan-500/10 dark:from-purple-600/20 dark:to-cyan-500/20 border border-purple-500/20 dark:border-purple-500/30 hover:scale-[1.01] transition-transform text-left flex items-center gap-4"
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-ink-black dark:text-white text-sm">빠른 한 컷</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">캐릭터 고르고 한 줄이면 끝</p>
        </div>
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-serif text-ink-black dark:text-white">내 프로젝트</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full text-sm font-bold hover:bg-comic-blue dark:hover:bg-comic-orange hover:-translate-y-0.5 transition-all shadow-sm"
        >
          <Plus size={16} /> 새 프로젝트
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-xl p-4 mb-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-3 gap-2">
            {PROJECT_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={`flex flex-col items-center gap-0.5 p-2.5 rounded-xl border-2 text-center transition-all ${kind === k.key
                  ? 'border-comic-orange bg-comic-orange/5 dark:bg-comic-orange/10'
                  : 'border-border dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'}`}
              >
                <span className="text-xl">{k.icon}</span>
                <span className="text-sm font-bold text-ink-black dark:text-white">{k.label}</span>
                <span className="text-[10px] leading-tight text-gray-500 dark:text-gray-400 break-keep">{k.desc}</span>
              </button>
            ))}
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isSeriesKind ? '시리즈 이름' : '프로젝트 제목'}
            className="w-full px-4 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all"
            autoFocus
          />
          {isSeriesKind && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-10 text-xs font-bold text-gray-500 dark:text-gray-400">컷 수</span>
                {SERIES_CUT_OPTIONS.map((n) => (
                  <button key={n} type="button" onClick={() => setSeriesCuts(n)} className={chipClass(seriesCuts === n)}>{n}컷</button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-10 text-xs font-bold text-gray-500 dark:text-gray-400">비율</span>
                {SERIES_RATIO_OPTIONS.map((r) => (
                  <button key={r.value} type="button" onClick={() => setSeriesRatio(r.value)} className={chipClass(seriesRatio === r.value)}>{r.label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button type="submit" disabled={!title.trim() || submitting} className="px-5 py-2 bg-comic-orange text-white rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50 disabled:hover:translate-y-0">
              {isSeriesKind ? '1화 시작' : '생성'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500 font-bold text-sm hover:text-comic-orange transition-colors">취소</button>
          </div>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-surface-dark rounded-2xl border-2 border-dashed border-border dark:border-zinc-800 backdrop-blur-md">
          <FolderOpen size={48} className="mx-auto text-gray-300 dark:text-zinc-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-bold">아직 프로젝트가 없습니다</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-comic-blue dark:text-comic-orange text-sm font-bold hover:underline"
          >
            첫 프로젝트 만들기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="bg-white/80 dark:bg-surface-dark/80 backdrop-blur-sm border-2 border-border dark:border-zinc-800 rounded-2xl p-6 hover:-translate-y-1 hover:shadow-lg hover:border-comic-orange transition-all group no-underline"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  {p.kind === 'series' && (
                    <span className="inline-block mb-1 px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full">연재</span>
                  )}
                  <h3 className="font-bold text-lg font-serif text-ink-black dark:text-white group-hover:text-comic-orange transition-colors">{p.title}</h3>
                  {p.kind === 'series' && p.episode_count > 0 && (
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mt-0.5">{p.episode_count}화까지</p>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(p.id, e)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-xs font-bold text-gray-400 dark:text-gray-500">
                <Clock size={12} />
                {new Date(p.created_at).toLocaleDateString('ko-KR')}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
