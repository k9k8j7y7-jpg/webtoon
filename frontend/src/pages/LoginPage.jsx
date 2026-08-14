import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MVP: 직접 토큰 입력 (OAuth UI는 추후)
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      await login(token.trim());
      navigate('/');
    } catch {
      setError('유효하지 않은 토큰입니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <div className="bg-white/80 dark:bg-surface-dark/80 backdrop-blur-sm border-2 border-border dark:border-zinc-800 rounded-2xl shadow-md p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-comic-orange/10 rounded-2xl mb-4">
            <Sparkles size={32} className="text-comic-orange" />
          </div>
          <h1 className="text-2xl font-bold font-serif text-ink-black dark:text-white">Project T</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">AI 웹툰 생성 서비스</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
              인증 토큰
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="JWT 토큰을 입력하세요"
              className="w-full px-4 py-2 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all font-bold text-sm"
            />
          </div>
          {error && <p className="text-red-500 dark:text-red-400 text-sm font-bold">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full font-bold hover:bg-comic-blue dark:hover:bg-comic-orange hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t-2 border-border dark:border-zinc-800">
          <p className="text-xs text-gray-400 dark:text-zinc-500 text-center font-bold">
            MVP — OAuth 로그인은 추후 연동 예정
          </p>
        </div>
      </div>
    </div>
  );
}
