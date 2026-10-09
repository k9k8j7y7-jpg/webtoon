import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import api from '../api/client';

// [구독] / [구독 중] 토글. 비회원은 로그인 후 현재 페이지로 복귀.
// 작가 페이지·뷰어(항상 다크)에서 쓰므로 다크 고정 스타일
export default function SubscribeButton({ authorId, subscribed, onChange, size = 'md' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!localStorage.getItem('token')) {
      navigate('/login', { state: { from: location.pathname } });
      return;
    }
    setBusy(true);
    try {
      const { data } = subscribed
        ? await api.delete(`/authors/${authorId}/subscribe`)
        : await api.post(`/authors/${authorId}/subscribe`);
      onChange?.(data);
    } catch (err) {
      if (err.response?.status !== 401) alert(err.response?.data?.detail || '잠시 후 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  const sizeCls = size === 'sm' ? 'h-8 !px-4 text-xs' : 'h-10 !px-8 text-sm';
  return subscribed ? (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center justify-center gap-1 rounded-full font-bold bg-white/10 border border-white/15 text-gray-200 hover:bg-white/15 disabled:opacity-50 shrink-0 ${sizeCls}`}
    >
      <Check size={14} /> 구독 중
    </button>
  ) : (
    <button
      onClick={toggle}
      disabled={busy}
      className={`neon-btn flex items-center justify-center gap-1 !rounded-full disabled:opacity-50 shrink-0 ${sizeCls}`}
    >
      <Plus size={14} /> 구독
    </button>
  );
}
