import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Settings } from 'lucide-react';
import { Avatar } from '../components/AuthorLink';
import resolveUrl, { CATEGORY_LABELS } from '../utils/resolveUrl';

const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';

// 작가 페이지 /u/:nickname — 비로그인 열람 가능, 뷰어처럼 항상 다크
export default function AuthorPage() {
  const { nickname } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const headers = {};
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    axios.get(`${API_BASE}/api/v1/authors/${encodeURIComponent(nickname)}`, { headers })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((err) => { if (!cancelled) setError(err.response?.status || 'error'); });
    return () => { cancelled = true; };
  }, [nickname]);

  const handleSubscribe = () => {
    if (!localStorage.getItem('token')) {
      navigate('/login', { state: { from: `/u/${nickname}` } });
      return;
    }
    alert('구독 기능은 곧 열려요!');
  };

  const shell = (children) => (
    <div className="min-h-screen bg-[#0A0F1D] text-white" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      <header className="sticky top-0 z-50 bg-[#0A0F1D]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <Link to="/" className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400 no-underline">
            EziToon
          </Link>
        </div>
      </header>
      {children}
    </div>
  );

  if (error) {
    return shell(
      <div className="flex flex-col items-center justify-center gap-6 py-32 px-4">
        <p className="text-xl text-gray-400">{error === 404 ? '작가를 찾을 수 없어요' : '오류가 발생했어요'}</p>
        <Link to="/" className="px-6 py-3 bg-white/10 border border-white/10 rounded-full hover:bg-white/20 transition-colors no-underline text-white">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  if (!data) {
    return shell(
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { author, works, subscriber_count, is_me } = data;

  return shell(
    <main className="max-w-5xl mx-auto px-4 py-8">
      {/* 프로필 */}
      <section className="flex flex-col items-center text-center gap-3 pb-8 border-b border-white/10">
        <Avatar src={author.avatar} size={88} />
        <h1 className="text-2xl font-bold break-all">{author.nickname}</h1>
        {author.bio && <p className="text-sm text-gray-400 max-w-md break-keep">{author.bio}</p>}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>작품 {works.length}</span>
          {subscriber_count > 0 && <span>구독자 {subscriber_count}명</span>}
        </div>
        {is_me ? (
          <Link to="/settings" className="mt-1 flex items-center gap-1 h-10 px-5 rounded-full text-sm font-bold bg-white/10 border border-white/10 text-gray-200 hover:bg-white/20 no-underline">
            <Settings size={14} /> 프로필 편집
          </Link>
        ) : (
          <button onClick={handleSubscribe} className="neon-btn mt-1 h-10 !px-8 !rounded-full text-sm">
            구독
          </button>
        )}
      </section>

      {/* 공개 작품 */}
      <section className="pt-8">
        {works.length === 0 ? (
          <p className="text-center py-16 text-gray-500">아직 공개한 작품이 없어요</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {works.map((w) => (
              <Link
                key={w.share_token}
                to={`/view/${w.share_token}`}
                className="group rounded-2xl overflow-hidden bg-white/5 border border-white/10 hover:border-purple-500/50 transition-colors p-2 flex flex-col no-underline text-white"
              >
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#0A0F1D]/80 mb-2">
                  {w.thumbnail_url ? (
                    <img src={resolveUrl(w.thumbnail_url)} alt={w.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-900/50 to-cyan-900/50" />
                  )}
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-cyan-300 font-semibold">
                    {CATEGORY_LABELS[w.category] || '단편'}
                  </span>
                </div>
                <h3 className="text-sm font-bold truncate px-0.5">{w.title}</h3>
                <div className="flex items-center gap-2 text-[11px] text-gray-400 px-0.5 mt-0.5">
                  <span>❤️ {w.like_count || 0}</span>
                  <span>👁 {w.view_count || 0}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
