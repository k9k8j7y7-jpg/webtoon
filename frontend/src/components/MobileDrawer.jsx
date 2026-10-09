import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, Home, Palette, Image, Package, Bell, HelpCircle, MessageSquare, FileText, Shield, Sun, Moon, LogOut, Settings } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function MobileDrawer({ open, onClose, user, packets, onLogout }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  // 라우트 이동 시 닫힘
  useEffect(() => { if (open) onClose(); }, [location.pathname]);

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // 스크롤 잠금
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const MenuItem = ({ to, icon: Icon, label, badge }) => (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors no-underline"
    >
      <Icon size={18} className="text-gray-400 dark:text-zinc-500 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge != null && (
        <span className="text-xs font-bold text-comic-orange">{badge}</span>
      )}
    </Link>
  );

  const Divider = () => <div className="border-t border-border dark:border-night-border my-2 mx-4" />;
  const SectionLabel = ({ children }) => (
    <div className="px-4 pt-3 pb-1 text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{children}</div>
  );

  if (!open) return null;

  return (
    <>
      {/* 배경 dim */}
      <div
        className="fixed inset-0 bg-black/40 z-[60]"
        onClick={onClose}
      />
      {/* 드로어 패널 */}
      <div className="fixed top-0 left-0 h-full w-72 bg-white dark:bg-night-bg z-[61] shadow-2xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-border dark:border-night-border shrink-0">
          <span className="text-lg font-bold font-serif text-ink-black dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-purple-500 dark:to-cyan-400">
            EziToon
          </span>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 overflow-y-auto py-2">
          <MenuItem to="/" icon={Home} label="홈" />

          {user ? (
            <>
              <SectionLabel>만들기</SectionLabel>
              <MenuItem to="/" icon={Palette} label="내 작품" />

              <SectionLabel>둘러보기</SectionLabel>
              <MenuItem to="/" icon={Image} label="갤러리" />

              <SectionLabel>계정</SectionLabel>
              <MenuItem to="/packets" icon={Package} label="패킷 충전" badge={packets?.balance != null ? `${packets.balance}패킷` : null} />
              <MenuItem to="/inquiries" icon={Bell} label="알림" />
              <MenuItem to="/settings" icon={Settings} label="설정" badge={user.nickname ? null : '닉네임 없음'} />

              <SectionLabel>도움말</SectionLabel>
              <MenuItem to="/faq" icon={HelpCircle} label="FAQ" />
              <MenuItem to="/inquiries/new" icon={MessageSquare} label="문의하기" />
              <MenuItem to="/terms" icon={FileText} label="이용약관" />
              <MenuItem to="/privacy" icon={Shield} label="개인정보처리방침" />
            </>
          ) : (
            <>
              <MenuItem to="/" icon={Image} label="갤러리" />
              <Divider />
              <MenuItem to="/faq" icon={HelpCircle} label="FAQ" />
              <MenuItem to="/inquiries/new" icon={MessageSquare} label="문의하기" />
              <MenuItem to="/terms" icon={FileText} label="이용약관" />
              <MenuItem to="/privacy" icon={Shield} label="개인정보처리방침" />
            </>
          )}
        </nav>

        {/* 하단 */}
        <div className="border-t border-border dark:border-night-border p-4 space-y-2 shrink-0">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? '라이트 모드' : '다크 모드'}
          </button>
          {user && (
            <button
              onClick={() => { onClose(); onLogout(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors"
            >
              <LogOut size={18} />
              로그아웃
            </button>
          )}
        </div>
      </div>
    </>
  );
}
