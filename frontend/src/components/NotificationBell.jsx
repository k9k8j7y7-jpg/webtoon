import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellRing } from 'lucide-react';
import api from '../api/client';
import NotificationList, { refreshUnread } from './NotificationList';
import { pushSupported, getSubscription, subscribePush, PUSH_ERROR_MESSAGES } from '../utils/push';

// 헤더 🔔 — PC(sm 이상)는 드롭다운, 모바일은 /notifications 전체 화면으로 이동
export default function NotificationBell({ unreadCount }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const ref = useRef(null);
  const [pushState, setPushState] = useState('loading'); // loading | subscribed | unsubscribed | unsupported
  const [pushBusy, setPushBusy] = useState(false);
  const [toast, setToast] = useState('');

  // 드롭다운 열릴 때 구독 상태 확인
  const checkPush = useCallback(async () => {
    if (!pushSupported()) { setPushState('unsupported'); return; }
    try {
      const sub = await getSubscription();
      setPushState(sub ? 'subscribed' : 'unsubscribed');
    } catch { setPushState('unsubscribed'); }
  }, []);

  useEffect(() => { if (open) checkPush(); }, [open, checkPush]);

  const handleSubscribe = async () => {
    setPushBusy(true);
    try {
      await subscribePush();
      setPushState('subscribed');
      setToast('알림이 켜졌어요!');
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      const msg = PUSH_ERROR_MESSAGES[err.code] || '알림 등록에 실패했어요.';
      setToast(msg);
      setTimeout(() => setToast(''), 4000);
    } finally { setPushBusy(false); }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  // 드롭다운 열려 있을 때 새 알림·탭 복귀 시 자동 갱신
  useEffect(() => {
    if (!open) return;
    const reload = () => {
      api.get('/notifications', { params: { limit: 20 } })
        .then(({ data }) => setItems(data.items))
        .catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('notifications:list-refresh', reload);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('notifications:list-refresh', reload);
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
          {/* 미구독 기기: 브라우저 알림 켜기 */}
          {pushState === 'unsubscribed' && (
            <button onClick={handleSubscribe} disabled={pushBusy}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-left border-b border-border dark:border-night-border bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors disabled:opacity-60">
              <BellRing size={16} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">
                {pushBusy ? '등록 중…' : '브라우저 알림 켜기'}
              </span>
            </button>
          )}
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
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] bg-ink-black dark:bg-white text-white dark:text-ink-black px-5 py-2.5 rounded-full text-sm font-bold shadow-lg animate-slide-up max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}
