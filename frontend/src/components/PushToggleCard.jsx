import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, Share, PlusSquare, BellRing } from 'lucide-react';
import ToggleSwitch from './ToggleSwitch';
import {
  getSubscription, needsIOSInstall, pushSupported, subscribePush, unsubscribePush, PushError, PUSH_ERROR_MESSAGES,
} from '../utils/push';

// 알림센터 상단 — "폰으로 알림 받기" 토글. iOS Safari(홈 화면 추가 전)는 토글 대신 설치 안내
export default function PushToggleCard() {
  const iosInstall = needsIOSInstall();
  const supported = pushSupported();
  const [on, setOn] = useState(null); // null = 확인 중
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const denied = supported && Notification.permission === 'denied';

  useEffect(() => {
    if (iosInstall || !supported) return;
    let cancelled = false;
    getSubscription()
      .then((sub) => { if (!cancelled) setOn(Boolean(sub) && Notification.permission === 'granted'); })
      .catch(() => { if (!cancelled) setOn(false); });
    return () => { cancelled = true; };
  }, [iosInstall, supported]);

  const toggle = async (next) => {
    setBusy(true);
    setError('');
    try {
      if (next) await subscribePush();
      else await unsubscribePush();
      setOn(next);
    } catch (err) {
      setError(PUSH_ERROR_MESSAGES[err instanceof PushError ? err.code : 'server']);
      setOn(false);
    } finally {
      setBusy(false);
    }
  };

  if (iosInstall) {
    return (
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone size={18} className="text-cyan-500 dark:text-cyan-400 shrink-0" />
          <p className="text-sm font-bold text-ink-black dark:text-white break-keep">홈 화면에 추가하면 알림을 받을 수 있어요</p>
        </div>
        <ol className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 shrink-0 rounded-full bg-gray-100 dark:bg-white/10 text-[11px] font-bold flex items-center justify-center">1</span>
            <span className="break-keep">Safari 아래쪽 <Share size={14} className="inline -mt-0.5" /> <b>공유</b> 버튼을 누르세요</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 shrink-0 rounded-full bg-gray-100 dark:bg-white/10 text-[11px] font-bold flex items-center justify-center">2</span>
            <span className="break-keep"><PlusSquare size={14} className="inline -mt-0.5" /> <b>홈 화면에 추가</b>를 고르세요</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 shrink-0 rounded-full bg-gray-100 dark:bg-white/10 text-[11px] font-bold flex items-center justify-center">3</span>
            <span className="break-keep">홈 화면의 <b>EziToon</b> 아이콘으로 열고, 여기서 알림을 켜세요</span>
          </li>
        </ol>
        <p className="text-[11px] text-gray-400">iOS 16.4 이상에서 지원돼요.</p>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="glass-card p-4 text-xs text-gray-500 dark:text-gray-400 break-keep">
        {PUSH_ERROR_MESSAGES.unsupported} 알림은 이 화면(알림센터)에서 확인할 수 있어요.
      </div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-2">
      <div className="flex items-center gap-3">
        <BellRing size={18} className="text-cyan-500 dark:text-cyan-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-ink-black dark:text-white">폰으로 알림 받기</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 break-keep">
            이 기기로 새 화·댓글·답글·문의 답변을 알려 드려요.{' '}
            <Link to="/settings#notify" className="text-cyan-600 dark:text-cyan-400 font-bold no-underline">종류 고르기</Link>
          </p>
        </div>
        <ToggleSwitch checked={Boolean(on)} onChange={toggle} disabled={busy || on === null || denied} label="폰으로 알림 받기" />
      </div>
      {(error || denied) && (
        <p className="text-xs font-bold text-red-500 break-keep">{error || PUSH_ERROR_MESSAGES.denied}</p>
      )}
    </div>
  );
}
