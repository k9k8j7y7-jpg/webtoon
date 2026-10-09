import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import api from '../api/client';
import NotificationList, { refreshUnread } from './NotificationList';

// 헤더 🔔 — PC(sm 이상)는 드롭다운, 모바일은 /notifications 전체 화면으로 이동
export default function NotificationBell({ unreadCount }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const handleBell = () => {
    if (window.matchMedia('(max-width: 639px)').matches) {
      navigate('/notifications');
      return;
    }
    if (open) { setOpen(false); return; }
    setOpen(true);
    setItems(null);
    api.get('/notifications', { params: { limit: 20 } })
      .then(({ data }) => setItems(data.items))
      .catch(() => setItems([]));
  };

  const readAll = async () => {
    await api.post('/notifications/read-all').catch(() => {});
    setItems((prev) => prev?.map((n) => ({ ...n, is_read: true })) || prev);
    refreshUnread();
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleBell} className="relative p-1.5 text-gray-400 dark:text-zinc-500 hover:text-comic-orange rounded transition-colors shrink-0" title="알림">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-96 max-h-[70vh] flex flex-col bg-white dark:bg-night-card border border-border dark:border-night-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-night-border">
            <span className="text-sm font-bold text-ink-black dark:text-white">알림</span>
            <button onClick={readAll} disabled={!unreadCount} className="text-xs font-bold text-cyan-600 dark:text-cyan-400 disabled:text-gray-400 disabled:opacity-60">
              모두 읽음
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-10 text-center text-sm text-gray-400">불러오는 중…</p>
            ) : (
              <NotificationList items={items} onItemsChange={setItems} onNavigate={() => setOpen(false)} />
            )}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-xs font-bold text-gray-500 dark:text-gray-400 border-t border-border dark:border-night-border hover:bg-gray-50 dark:hover:bg-white/5 no-underline">
            전체 보기
          </Link>
        </div>
      )}
    </div>
  );
}
