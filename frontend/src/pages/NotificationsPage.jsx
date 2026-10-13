import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import NotificationList, { refreshUnread } from '../components/NotificationList';
import { GateSkeleton, GateLoadError } from '../components/GateLoadFallback';
import PushToggleCard from '../components/PushToggleCard';
import InstallCard from '../components/InstallCard';

// 알림센터 전체 화면 (모바일 🔔·☰ "알림"·PC 드롭다운 "전체 보기")
export default function NotificationsPage() {
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get('/notifications', { params: { limit: 100 } })
      .then(({ data }) => { setItems(data.items); setUnread(data.unread_count); })
      .catch((err) => setError(err.response?.data?.detail || '알림을 불러오지 못했어요'));
  }, []);

  useEffect(load, [load]);

  // unread 증가·탭 복귀·포커스 시 목록 자동 갱신
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('notifications:list-refresh', load);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('notifications:list-refresh', load);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const readAll = async () => {
    await api.post('/notifications/read-all').catch(() => {});
    setItems((prev) => prev?.map((n) => ({ ...n, is_read: true })) || prev);
    setUnread(0);
    refreshUnread();
  };

  const handleItemsChange = (next) => {
    setItems(next);
    setUnread(next.filter((n) => !n.is_read).length);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold font-serif text-ink-black dark:text-white">알림</h1>
        <button onClick={readAll} disabled={!unread} className="text-xs font-bold text-cyan-600 dark:text-cyan-400 disabled:text-gray-400 disabled:opacity-60">
          모두 읽음
        </button>
      </div>
      <PushToggleCard />
      <InstallCard />
      {error ? (
        <GateLoadError message={error} onRetry={load} />
      ) : items === null ? (
        <GateSkeleton lines={3} />
      ) : (
        <div className="glass-card overflow-hidden !p-0">
          <NotificationList items={items} onItemsChange={handleItemsChange} />
        </div>
      )}
    </div>
  );
}
