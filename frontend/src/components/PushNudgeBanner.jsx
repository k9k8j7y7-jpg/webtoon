import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { getSubscription, needsIOSInstall, pushSupported, subscribePush, PushError, PUSH_ERROR_MESSAGES } from '../utils/push';
import { useAuth } from '../contexts/AuthContext';

// 1회 "폰으로 알림 받을까요?" 배너
// 트리거: 구독 성공·댓글/답글 등록 직후 — window 'push:nudge' 이벤트로 호출
// 조건: 로그인 / 푸시 지원 / permission != denied / 활성 구독 없음 / push_nudge_done 없음
const DONE_KEY = 'push_nudge_done';

export default function PushNudgeBanner() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [iosInstall, setIosInstall] = useState(false);

  useEffect(() => {
    const handler = async () => {
      // 이미 표시 중이면 무시
      if (show || success) return;
      // 조건 전부 확인
      if (!user) return;
      if (localStorage.getItem(DONE_KEY)) return;
      if (!pushSupported()) return;
      if (Notification.permission === 'denied') return;
      if (needsIOSInstall()) { setIosInstall(true); setShow(true); return; }
      try {
        const sub = await getSubscription();
        if (sub) return; // 이미 활성 구독 있음
      } catch { return; }
      setShow(true);
    };
    window.addEventListener('push:nudge', handler);
    return () => window.removeEventListener('push:nudge', handler);
  }, [user, show, success]);

  const dismiss = () => {
    localStorage.setItem(DONE_KEY, '1');
    setShow(false);
  };

  const enable = async () => {
    setBusy(true);
    setError('');
    try {
      await subscribePush();
      localStorage.setItem(DONE_KEY, '1');
      setSuccess(true);
      setTimeout(() => { setShow(false); setSuccess(false); }, 2000);
    } catch (err) {
      setError(PUSH_ERROR_MESSAGES[err instanceof PushError ? err.code : 'server']);
    } finally {
      setBusy(false);
    }
  };

  if (!show) return null;

  if (success) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-600/90 backdrop-blur-md border border-emerald-400/30 text-white text-sm font-bold shadow-lg">
          <span>✓</span> 알림을 켰어요
        </div>
      </div>
    );
  }

  if (iosInstall) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
        <div className="px-4 py-4 rounded-2xl bg-[#141a2e]/95 backdrop-blur-md border border-white/10 text-white shadow-lg space-y-2">
          <div className="flex items-start gap-2">
            <BellRing size={18} className="text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-sm font-bold break-keep flex-1">홈 화면에 추가하면 알림을 받을 수 있어요</p>
            <button onClick={dismiss} className="p-0.5 text-gray-400 hover:text-white shrink-0"><X size={16} /></button>
          </div>
          <p className="text-xs text-gray-400 break-keep">Safari 공유 → 홈 화면에 추가 → EziToon 아이콘으로 열기</p>
          <button onClick={dismiss} className="w-full h-9 rounded-full text-xs font-bold bg-white/10 text-gray-300">나중에</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
      <div className="px-4 py-4 rounded-2xl bg-[#141a2e]/95 backdrop-blur-md border border-white/10 text-white shadow-lg space-y-3">
        <div className="flex items-start gap-2">
          <BellRing size={18} className="text-cyan-400 shrink-0 mt-0.5" />
          <p className="text-sm font-bold break-keep flex-1">새 화·답글 알림을 폰으로 받아볼까요?</p>
          <button onClick={dismiss} className="p-0.5 text-gray-400 hover:text-white shrink-0"><X size={16} /></button>
        </div>
        {error && <p className="text-xs font-bold text-red-400 break-keep">{error}</p>}
        <div className="flex gap-2">
          <button onClick={dismiss} className="flex-1 h-9 rounded-full text-xs font-bold bg-white/10 text-gray-300">나중에</button>
          <button onClick={enable} disabled={busy} className="neon-btn flex-1 h-9 !rounded-full text-xs disabled:opacity-50">
            {busy ? '설정 중…' : '켜기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 트리거 헬퍼 — 구독·댓글 성공 후 호출
export function triggerPushNudge() {
  window.dispatchEvent(new Event('push:nudge'));
}
