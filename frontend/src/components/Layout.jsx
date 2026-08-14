import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Sparkles, CreditCard } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../api/client';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    if (user) {
      api.get('/me/credits').then(({ data }) => setCredits(data)).catch(() => {});
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-transparent">
      <header className="bg-white/75 dark:bg-zinc-900/75 backdrop-blur-md border-b border-border dark:border-zinc-800 sticky top-0 z-50 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold font-serif text-ink-black dark:text-white no-underline hover:text-comic-orange transition-colors">
            <Sparkles size={22} className="text-comic-blue" />
            Project T
          </Link>
          <div className="flex items-center gap-4">
            {credits && (
              <div className="flex items-center gap-1.5 text-sm font-bold text-gray-500 dark:text-gray-400">
                <CreditCard size={16} className="text-comic-orange" />
                <span>{credits.balance} 크레딧</span>
                <span className="text-gray-300 dark:text-zinc-700 mx-1">|</span>
                <span>{credits.subscription.cut_quota - credits.subscription.cut_used}컷 남음</span>
              </div>
            )}
            <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{user?.display_name || user?.email}</span>
            <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-comic-orange rounded transition-colors">
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
