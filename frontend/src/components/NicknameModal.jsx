import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// [공개하기] 시점에 닉네임이 없으면 띄우는 모달. 저장 성공 시 onSaved(me) 호출
// body로 portal — glass-card(backdrop-filter) 안에서는 fixed가 카드 기준으로 잡혀 잘린다
export default function NicknameModal({ onClose, onSaved, confirmLabel = '저장하고 공개', description }) {
  const { user, updateUser } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put('/me/profile', { nickname, bio: user?.bio || null });
      updateUser(data);
      onSaved?.(data);
    } catch (err) {
      setError(err.response?.data?.detail || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-night-card border border-border dark:border-night-border rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold text-ink-black dark:text-white">작가 이름을 정해주세요</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 break-keep">
          {description || '공개한 작품과 작가 페이지에 이 이름이 보여요. 나중에 설정에서 바꿀 수 있어요.'}
        </p>
        <input
          autoFocus
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && nickname.trim()) handleSave(); }}
          maxLength={20}
          placeholder="예: 도도툰"
          className="w-full px-3 py-2.5 rounded-xl border border-border dark:border-night-border bg-white dark:bg-night-bg text-sm text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
        <p className="mt-1.5 text-[11px] text-gray-400">2~20자 · 한글·영문·숫자·밑줄(_)</p>
        {error && <p className="mt-2 text-xs font-bold text-red-500">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-full text-sm font-bold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !nickname.trim()}
            className="neon-btn flex-1 h-10 !rounded-full text-sm disabled:opacity-50"
          >
            {saving ? '저장 중…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
