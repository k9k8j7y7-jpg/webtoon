import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Sparkles, Package, Bell, HelpCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import NoticeBar from './NoticeBar';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [packets, setPackets] = useState(null);

  const refreshPackets = useCallback(() => {
    if (user) {
      api.get('/me/packets').then(({ data }) => setPackets(data)).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    refreshPackets();
    // 생성 완료 후 패킷 배지 갱신 이벤트 수신
    const handler = () => refreshPackets();
    window.addEventListener('packets:refresh', handler);
    return () => window.removeEventListener('packets:refresh', handler);
  }, [refreshPackets]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-transparent">
      <NoticeBar />
      <header className="bg-white/75 dark:bg-zinc-900/75 backdrop-blur-md border-b border-border dark:border-zinc-800 sticky top-0 z-50 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold font-serif text-ink-black dark:text-white no-underline hover:text-comic-orange transition-colors">
            <Sparkles size={22} className="text-comic-blue" />
            EziToon
          </Link>
          <div className="flex items-center gap-2 md:gap-4">
            {/* 패킷 배지 (클릭 → 패킷 현황 페이지) */}
            {packets != null && (
              <Link to="/packets" className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap hover:text-comic-orange transition-colors no-underline">
                <Package size={14} className="text-comic-orange shrink-0" />
                <span>{packets.balance}<span className="hidden md:inline"> 패킷</span></span>
              </Link>
            )}
            {/* FAQ */}
            <Link to="/faq" className="p-1.5 text-gray-400 hover:text-comic-orange rounded transition-colors shrink-0" title="자주 묻는 질문">
              <HelpCircle size={18} />
            </Link>
            {/* 알림 종 자리 (2차 구현) */}
            <button className="p-1.5 text-gray-300 dark:text-zinc-600 cursor-default shrink-0" disabled title="알림 (준비 중)">
              <Bell size={18} />
            </button>
            {/* 프로필 */}
            <span className="hidden md:inline text-sm font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap">{user?.display_name || user?.email}</span>
            <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-comic-orange rounded transition-colors shrink-0" title="로그아웃">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
