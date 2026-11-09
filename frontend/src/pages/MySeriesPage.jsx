/**
 * MySeriesPage — 연재툰 화 목록 (/my/series/:projectId)
 * 시리즈 이름 · 화 목록(부제=소재) · [새 화 만들기] · 뒤로=내 작품
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import resolveUrl from '../utils/resolveUrl';
import { ArrowLeft, Plus, Clock, Image, Check, ChevronRight } from 'lucide-react';

const STATUS_BADGE = {
  '완성': 'bg-emerald-500/15 text-emerald-500',
  default: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
};

export default function MySeriesPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get(`/my/works/series/${projectId}`)
      .then(({ data: d }) => { setData(d); setLoading(false); })
      .catch(() => { setLoading(false); navigate('/my'); });
  }, [projectId]);

  const handleNewEpisode = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { data: d } = await api.post(`/projects/${projectId}/episodes/next`);
      navigate(`/projects/${projectId}/episodes/${d.id}/workflow`);
    } catch (err) {
      alert(err.response?.data?.detail || '새 화를 만들지 못했어요');
      setCreating(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-400 font-bold">로딩 중...</div>;
  if (!data) return null;

  const { title, episodes = [] } = data;

  return (
    <div className="max-w-2xl mx-auto">
      {/* 뒤로 + 헤더 */}
      <button
        onClick={() => navigate('/my')}
        className="flex items-center gap-1 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> 내 작품
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full">연재</span>
          <h1 className="text-2xl font-bold font-serif text-ink-black dark:text-white truncate">{title}</h1>
        </div>
        <button
          onClick={handleNewEpisode}
          disabled={creating}
          className="neon-btn flex items-center gap-1.5 !px-4 !py-2 !rounded-full text-sm disabled:opacity-50"
        >
          <Plus size={16} /> {creating ? '만드는 중...' : '새 화 만들기'}
        </button>
      </div>

      {/* 화 목록 */}
      {episodes.length === 0 ? (
        <div className="text-center py-16 glass-card">
          <p className="text-gray-500 dark:text-gray-400 font-bold">아직 화가 없어요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {episodes.map((ep) => {
            const badgeCls = STATUS_BADGE[ep.status] || STATUS_BADGE.default;
            return (
              <button
                key={ep.id}
                onClick={() => navigate(`/projects/${projectId}/episodes/${ep.id}/workflow`)}
                className="w-full glass-card p-4 text-left flex gap-3 items-center hover:-translate-y-0.5 hover:border-comic-orange transition-all group"
              >
                {/* 썸네일 */}
                <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-zinc-800 shrink-0 overflow-hidden flex items-center justify-center">
                  {ep.thumbnail_url ? (
                    <img src={resolveUrl(ep.thumbnail_url)} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Image size={20} className="text-gray-300 dark:text-zinc-600" />
                  )}
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-ink-black dark:text-white group-hover:text-comic-orange transition-colors">
                    {ep.episode_no}화{ep.title && ep.title !== `${ep.episode_no}화` ? ` · ${ep.title}` : ''}
                  </p>
                  {ep.subtitle && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{ep.subtitle}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${badgeCls}`}>
                      {ep.completed ? '완성' : ep.status}
                    </span>
                  </div>
                </div>

                <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600 shrink-0 group-hover:text-comic-orange transition-colors" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
