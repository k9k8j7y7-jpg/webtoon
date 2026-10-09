import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Lock, Copy, Check, ExternalLink } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import NicknameModal from './NicknameModal';

// 게이트5 상단: [공개하기] / [공개 중 · 비공개로]. 닉네임 없으면 모달 → 저장 → 공개 재시도
export default function PublishBar({ projectId, episodeId }) {
  const { user } = useAuth();
  const [state, setState] = useState(null); // { is_public, share_token }
  const [busy, setBusy] = useState(false);
  const [showNickname, setShowNickname] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/projects/${projectId}/episodes/${episodeId}`)
      .then(({ data }) => { if (!cancelled) setState({ is_public: data.is_public, share_token: data.share_token }); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.detail || '공개 상태를 불러오지 못했어요'); });
    return () => { cancelled = true; };
  }, [projectId, episodeId]);

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/episodes/${episodeId}/publish`);
      setState({ is_public: data.is_public, share_token: data.share_token });
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail === 'NICKNAME_REQUIRED') setShowNickname(true);
      else setError(typeof detail === 'string' ? detail : '공개하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    if (!window.confirm('비공개로 바꾸면 공유 링크·작가 페이지·갤러리에서 보이지 않아요. 계속할까요?')) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/episodes/${episodeId}/unpublish`);
      setState({ is_public: data.is_public, share_token: data.share_token });
    } catch (err) {
      setError(err.response?.data?.detail || '변경하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/WEBTOON/view/${state.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('링크를 복사하세요', url);
    }
  };

  if (!state) {
    return error ? <p className="text-xs font-bold text-red-500">{error}</p> : null;
  }

  return (
    <div className="glass-card px-4 py-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm font-bold min-w-0">
        {state.is_public ? (
          <>
            <Globe size={16} className="text-emerald-500 shrink-0" />
            <span className="text-emerald-600 dark:text-emerald-400">공개 중</span>
            {user?.nickname && (
              <Link to={`/u/${encodeURIComponent(user.nickname)}`} className="text-xs text-gray-400 hover:text-cyan-500 truncate no-underline">
                · 내 작가 페이지
              </Link>
            )}
          </>
        ) : (
          <>
            <Lock size={16} className="text-gray-400 shrink-0" />
            <span className="text-gray-600 dark:text-gray-300">비공개</span>
            <span className="text-xs font-normal text-gray-400 truncate">공개하면 갤러리·작가 페이지에 올라가요</span>
          </>
        )}
      </div>
      <div className="flex gap-2">
        {state.is_public ? (
          <>
            <button
              onClick={copyLink}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1 h-9 px-3 rounded-full text-xs font-bold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-transparent dark:border-white/10"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? '복사됨' : '링크 복사'}
            </button>
            <a
              href={`/WEBTOON/view/${state.share_token}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1 h-9 px-3 rounded-full text-xs font-bold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-transparent dark:border-white/10 no-underline"
            >
              <ExternalLink size={12} /> 보기
            </a>
            <button
              onClick={unpublish}
              disabled={busy}
              className="flex-1 sm:flex-none h-9 px-3 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 border border-border dark:border-night-border hover:text-red-500 disabled:opacity-50"
            >
              비공개로
            </button>
          </>
        ) : (
          <button
            onClick={publish}
            disabled={busy}
            className="neon-btn w-full sm:w-auto flex items-center justify-center gap-1 h-9 !px-5 !rounded-full text-xs disabled:opacity-50"
          >
            <Globe size={12} /> {busy ? '공개 중…' : '공개하기'}
          </button>
        )}
      </div>
      {error && <p className="text-xs font-bold text-red-500 sm:basis-full">{error}</p>}
      {showNickname && (
        <NicknameModal
          onClose={() => setShowNickname(false)}
          onSaved={() => { setShowNickname(false); publish(); }}
        />
      )}
    </div>
  );
}
