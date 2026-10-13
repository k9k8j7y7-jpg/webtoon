import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { getSubscription, isStandalone, pushSupported, needsIOSInstall } from '../utils/push';

// 안드로이드 "홈 화면에 추가" 안내 카드
// beforeinstallprompt 이벤트가 보관돼 있고, standalone 아닐 때만 표시
// 푸시가 켜져 있을 때만 의미 있음(알림을 켠 사람에게만 홈 화면 추가 권유)
const DONE_KEY = 'install_nudge_done';

export default function InstallCard() {
  const [prompt, setPrompt] = useState(window.__deferredInstallPrompt || null);
  const [dismissed, setDismissed] = useState(() => Boolean(localStorage.getItem(DONE_KEY)));
  const [pushOn, setPushOn] = useState(false);

  useEffect(() => {
    const handler = () => setPrompt(window.__deferredInstallPrompt || null);
    window.addEventListener('install:prompt-ready', handler);
    return () => window.removeEventListener('install:prompt-ready', handler);
  }, []);

  // 푸시 구독 상태 확인
  useEffect(() => {
    if (!pushSupported() || needsIOSInstall()) return;
    let cancelled = false;
    getSubscription()
      .then((sub) => { if (!cancelled) setPushOn(Boolean(sub) && Notification.permission === 'granted'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!pushOn || !prompt || dismissed || isStandalone()) return null;

  const install = async () => {
    try {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        window.__deferredInstallPrompt = null;
        setPrompt(null);
      }
    } catch {
      // prompt already used
    }
  };

  const dismiss = () => {
    localStorage.setItem(DONE_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="glass-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Download size={18} className="text-cyan-500 dark:text-cyan-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-ink-black dark:text-white break-keep">앱처럼 쓰기</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 break-keep">
            홈 화면에 추가하면 알림이 EziToon 이름으로 떠요
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={dismiss} className="flex-1 h-9 rounded-full text-xs font-bold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 border border-transparent dark:border-white/10">
          닫기
        </button>
        <button onClick={install} className="neon-btn flex-1 h-9 !rounded-full text-xs">
          홈 화면에 추가
        </button>
      </div>
    </div>
  );
}
