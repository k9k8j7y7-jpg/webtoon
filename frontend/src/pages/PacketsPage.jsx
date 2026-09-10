import { useState, useEffect } from 'react';
import { Package, ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';
import api from '../api/client';

const REASON_ICON = {
  generation: ArrowDownCircle,
  refund: ArrowUpCircle,
  admin_grant: ArrowUpCircle,
  purchase: ArrowUpCircle,
};
const REASON_COLOR = {
  generation: 'text-red-500',
  refund: 'text-emerald-500',
  admin_grant: 'text-comic-blue',
  purchase: 'text-comic-orange',
};

export default function PacketsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const load = async (offset = 0) => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/me/packets/history', {
        params: { limit: PAGE_SIZE, offset },
      });
      setData(res);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page * PAGE_SIZE); }, [page]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> 불러오는 중...
      </div>
    );
  }

  if (!data) return null;

  const totalPages = Math.ceil((data.total || 0) / PAGE_SIZE);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 잔량 카드 */}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-14 h-14 bg-comic-orange/10 dark:bg-comic-orange/20 rounded-2xl flex items-center justify-center">
          <Package size={28} className="text-comic-orange" />
        </div>
        <div>
          <div className="text-sm font-bold text-gray-500 dark:text-gray-400">보유 패킷</div>
          <div className="text-3xl font-black text-ink-black dark:text-white">
            {data.balance}<span className="text-base font-bold text-gray-400 ml-1">패킷</span>
          </div>
        </div>
      </div>

      {/* 사용 내역 */}
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border dark:border-zinc-800">
          <h2 className="text-base font-bold text-ink-black dark:text-white">사용 내역</h2>
        </div>

        {data.transactions.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            아직 내역이 없습니다
          </div>
        ) : (
          <div className="divide-y divide-border dark:divide-zinc-800">
            {data.transactions.map(tx => {
              const Icon = REASON_ICON[tx.reason] || ArrowDownCircle;
              const color = REASON_COLOR[tx.reason] || 'text-gray-400';
              const isPositive = tx.delta > 0;

              return (
                <div key={tx.id} className="px-6 py-3 flex items-center gap-3">
                  <Icon size={18} className={color} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-ink-black dark:text-white truncate">
                      {tx.reason_label}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString('ko-KR') : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-black ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isPositive ? '+' : ''}{tx.delta}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">
                      잔액 {tx.balance_after}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 페이징 */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-border dark:border-zinc-800 flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-zinc-800 dark:text-gray-400 rounded-lg disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
            >
              이전
            </button>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs font-bold text-gray-500 bg-gray-100 dark:bg-zinc-800 dark:text-gray-400 rounded-lg disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="text-xs text-gray-400 dark:text-gray-500 text-center space-y-1">
        <p>컷 이미지 생성 = 1패킷 / 캐릭터 시트 = 2패킷 / 장소·사진 변환 = 1패킷</p>
        <p>텍스트 전용(외형 추출, 콘티 등) = 무료</p>
      </div>
    </div>
  );
}
