import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/client';

// 헤더 공용 — 패킷 잔량 + 안 읽은 알림 수 (앱 Layout·랜딩 공용)
// 알림: 라우트 이동·포커스 복귀·'notifications:refresh' 시 갱신 / 패킷: 'packets:refresh' 시 갱신
export default function useHeaderCounts(user) {
  const location = useLocation();
  const [packets, setPackets] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshPackets = useCallback(() => {
    if (user) {
      api.get('/me/packets').then(({ data }) => setPackets(data)).catch(() => {});
    } else {
      setPackets(null);
    }
  }, [user]);

  useEffect(() => {
    refreshPackets();
    const handler = () => refreshPackets();
    window.addEventListener('packets:refresh', handler);
    return () => window.removeEventListener('packets:refresh', handler);
  }, [refreshPackets]);

  const refreshUnread = useCallback(() => {
    if (user) {
      api.get('/notifications/unread-count').then(({ data }) => setUnreadCount(data.unread_count || 0)).catch(() => {});
    } else {
      setUnreadCount(0);
    }
  }, [user]);

  useEffect(() => { refreshUnread(); }, [refreshUnread, location.pathname]);

  useEffect(() => {
    const onFocus = () => refreshUnread();
    window.addEventListener('focus', onFocus);
    window.addEventListener('notifications:refresh', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('notifications:refresh', onFocus);
    };
  }, [refreshUnread]);

  return { packets, unreadCount };
}
