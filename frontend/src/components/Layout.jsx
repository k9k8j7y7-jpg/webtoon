import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Sparkles, Package, HelpCircle, Menu, Sun, Moon, MessageSquare, FileText, Settings, Users } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';
import NoticeBar from './NoticeBar';
import MobileDrawer from './MobileDrawer';
import NotificationBell from './NotificationBell';
import { useTheme } from '../contexts/ThemeContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [packets, setPackets] = useState(null);
  const { theme, toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshPackets = useCallback(() => {
    if (user) {
      api.get('/me/packets').then(({ data }) => setPackets(data)).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    refreshPackets();
    const handler = () => refreshPackets();
    window.addEventListener('packets:refresh', handler);
    return () => window.removeEventListener('packets:refresh', handler);
  }, [refreshPackets]);

  // 안 읽은 알림 수(새 화·문의 답변 등 알림센터 통합) — 라우트 이동·포커스 복귀·읽음 처리 시 갱신
  const refreshUnread = useCallback(() => {
    if (user) {
      api.get('/notifications/unread-count').then(({ data }) => setUnreadCount(data.unread_count || 0)).catch(() => {});
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

  // ? 드롭다운 바깥 클릭 닫기
  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e) => { if (helpRef.current && !helpRef.current.contains(e.target)) setHelpOpen(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [helpOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-transparent">
      <NoticeBar />
      <header className="bg-white/75 dark:bg-night-bg/80 backdrop-blur-md border-b border-border dark:border-night-border sticky top-0 z-50 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* 좌측: 모바일 ☰ + 로고 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="sm:hidden p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:text-comic-orange transition-colors"
              style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Menu size={22} />
            </button>
            <Link to="/" className="flex items-center gap-2 text-xl font-bold font-serif text-ink-black dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-purple-500 dark:to-cyan-400 no-underline hover:text-comic-orange transition-colors">
              <Sparkles size={22} className="text-comic-blue dark:text-cyan-400" />
              EziToon
            </Link>
          </div>

          {/* 우측 */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* 패킷 배지 */}
            {packets != null && (
              <Link to="/packets" className="flex items-center gap-1.5 text-xs md:text-sm font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap hover:text-comic-orange transition-colors no-underline">
                <Package size={14} className="text-comic-orange shrink-0" />
                <span>{packets.balance}<span className="hidden md:inline"> 패킷</span></span>
              </Link>
            )}

            {/* PC: 다크/라이트 토글 */}
            <button onClick={toggleTheme} className="hidden sm:block p-1.5 text-gray-400 dark:text-zinc-400 hover:text-comic-orange rounded transition-colors shrink-0" title={theme === 'dark' ? '라이트 모드' : '다크 모드'}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* PC: ? 도움말 드롭다운 */}
            <div className="relative hidden sm:block" ref={helpRef}>
              <button
                onClick={() => setHelpOpen(!helpOpen)}
                className="p-1.5 text-gray-400 hover:text-comic-orange rounded transition-colors shrink-0"
                title="도움말"
              >
                <HelpCircle size={18} />
              </button>
              {helpOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-night-card border border-border dark:border-night-border rounded-xl shadow-lg py-1 z-50">
                  <Link to="/faq" onClick={() => setHelpOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 no-underline">
                    <HelpCircle size={14} className="text-gray-400" /> FAQ
                  </Link>
                  <Link to="/inquiries/new" onClick={() => setHelpOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 no-underline">
                    <MessageSquare size={14} className="text-gray-400" /> 문의하기
                  </Link>
                  <Link to="/inquiries" onClick={() => setHelpOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 no-underline">
                    <FileText size={14} className="text-gray-400" /> 내 문의 내역
                  </Link>
                </div>
              )}
            </div>

            {/* PC: 내 구독 (모바일은 ☰ 드로어) */}
            <Link to="/subscriptions" className="hidden sm:flex items-center gap-1 text-sm font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap hover:text-comic-orange transition-colors no-underline shrink-0" title="내 구독">
              <Users size={16} className="shrink-0" />
              <span className="hidden md:inline">내 구독</span>
            </Link>

            {/* 🔔 알림센터 */}
            <NotificationBell unreadCount={unreadCount} />

            {/* PC: 프로필(→ 설정) + 로그아웃 */}
            <Link to="/settings" className="hidden sm:flex items-center gap-1 text-sm font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap hover:text-comic-orange no-underline" title="설정">
              <Settings size={16} className="text-gray-400 shrink-0" />
              <span className="hidden md:inline">{user?.nickname || user?.display_name || user?.email}</span>
            </Link>
            <button onClick={handleLogout} className="hidden sm:block p-1.5 text-gray-400 hover:text-comic-orange rounded transition-colors shrink-0" title="로그아웃">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        packets={packets}
        unreadCount={unreadCount}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
