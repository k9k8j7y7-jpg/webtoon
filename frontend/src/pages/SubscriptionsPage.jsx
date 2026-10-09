import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { Avatar } from '../components/AuthorLink';
import { GateSkeleton, GateLoadError } from '../components/GateLoadFallback';
import resolveUrl, { CATEGORY_LABELS } from '../utils/resolveUrl';
import timeAgo from '../utils/timeAgo';

// 내 구독 — 구독 작가 목록 + 새 화 피드(published_at 최신순)
export default function SubscriptionsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.get('/me/subscriptions')
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.detail || '구독 목록을 불러오지 못했어요'));
  };

  useEffect(load, []);

  if (error) return <GateLoadError message={error} onRetry={load} />;
  if (!data) return <GateSkeleton lines={3} />;

  const { authors, feed } = data;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-bold font-serif text-ink-black dark:text-white">내 구독</h1>

      {authors.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">아직 구독한 작가가 없어요</p>
          <Link to="/#gallery" className="neon-btn inline-flex items-center justify-center h-10 !px-6 !rounded-full text-sm no-underline">
            갤러리에서 작가 찾기
          </Link>
        </div>
      ) : (
        <>
          {/* 구독 작가 — 가로 스크롤 */}
          <section>
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">구독 작가 {authors.length}</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {authors.map((a) => (
                <Link
                  key={a.id}
                  to={`/u/${encodeURIComponent(a.nickname)}`}
                  className="flex flex-col items-center gap-1.5 w-16 shrink-0 no-underline"
                >
                  <Avatar src={a.avatar} size={56} />
                  <span className="w-full text-center text-xs font-bold text-gray-700 dark:text-gray-300 truncate">{a.nickname}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* 새 화 피드 */}
          <section>
            <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">새 화</h2>
            {feed.length === 0 ? (
              <p className="glass-card p-8 text-center text-sm text-gray-400">구독한 작가가 아직 공개한 작품이 없어요</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {feed.map((w) => (
                  <Link
                    key={w.share_token}
                    to={`/view/${w.share_token}`}
                    className="glass-card min-w-0 p-2 flex flex-col no-underline hover:border-cyan-500/50 transition-colors"
                  >
                    <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 dark:bg-night-bg mb-2">
                      {w.thumbnail_url && (
                        <img src={resolveUrl(w.thumbnail_url)} alt={w.title} className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-cyan-300 font-semibold">
                        {CATEGORY_LABELS[w.category] || '단편'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-ink-black dark:text-white truncate px-0.5">{w.title}</h3>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400 px-0.5 mt-0.5 min-w-0">
                      {/* 카드 전체가 링크라 작가는 텍스트로 (a 중첩 금지) */}
                      <span className="flex-1 min-w-0 inline-flex items-center gap-1">
                        <Avatar src={w.author?.avatar} size={16} />
                        <span className="truncate">{w.author?.nickname}</span>
                      </span>
                      <span className="shrink-0">{timeAgo(w.published_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
