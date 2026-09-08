import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

export default function OAuthCallbackPage() {
  const { provider } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      setError('인증 코드가 없습니다. 다시 로그인해주세요.');
      return;
    }

    api.post(`/auth/${provider}/callback`, { code })
      .then(({ data }) => login(data.access_token))
      .then(() => navigate('/', { replace: true }))
      .catch((err) => {
        const msg = err.response?.data?.detail || '로그인에 실패했습니다.';
        setError(msg);
      });
  }, [provider, navigate, login]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white/80 dark:bg-surface-dark/80 backdrop-blur-sm border-2 border-border dark:border-zinc-800 rounded-2xl shadow-md p-8 w-full max-w-md text-center">
          <div className="text-red-500 text-4xl mb-4">!</div>
          <h2 className="text-lg font-bold text-ink-black dark:text-white mb-2">로그인 실패</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error}</p>
          <a
            href="/WEBTOON/login"
            className="inline-block px-6 py-2.5 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full font-bold hover:bg-comic-blue dark:hover:bg-comic-orange transition-all"
          >
            다시 로그인
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-comic-orange border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-bold">로그인 처리 중...</p>
      </div>
    </div>
  );
}
