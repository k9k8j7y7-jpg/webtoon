import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Plus, FolderOpen, Trash2, Clock } from 'lucide-react';

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const navigate = useNavigate();

  const load = () => {
    api.get('/projects').then(({ data }) => {
      setProjects(data);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const { data } = await api.post('/projects', { title: title.trim() });
    setTitle('');
    setShowCreate(false);
    navigate(`/projects/${data.id}`);
  };

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
        <form onSubmit={handleCreate} className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-xl p-4 mb-4 flex gap-2 shadow-sm">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="프로젝트 제목"
            className="flex-1 px-4 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all"
            autoFocus
          />
          <button type="submit" className="px-5 py-2 bg-comic-orange text-white rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all shadow-sm">생성</button>
          <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500 font-bold text-sm hover:text-comic-orange transition-colors">취소</button>
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
                <h3 className="font-bold text-lg font-serif text-ink-black dark:text-white group-hover:text-comic-orange transition-colors">{p.title}</h3>
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
