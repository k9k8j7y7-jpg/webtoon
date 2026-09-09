import { useState, useEffect } from 'react';
import { X, Info, AlertTriangle, Wrench, Megaphone } from 'lucide-react';
import api from '../api/client';

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  maintenance: Wrench,
  update: Megaphone,
};

const STYLES = {
  info: 'bg-comic-blue/10 border-comic-blue/30 text-comic-blue',
  warning: 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  maintenance: 'bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
  update: 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
};

export default function NoticeBar() {
  const [notice, setNotice] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get('/notices/active').then(({ data }) => {
      if (!data) return;
      const dismissedId = localStorage.getItem('dismissed_notice_id');
      if (dismissedId === String(data.id)) return;
      setNotice(data);
    }).catch(() => {});
  }, []);

  if (!notice || dismissed) return null;

  const Icon = ICONS[notice.notice_type] || Info;
  const style = STYLES[notice.notice_type] || STYLES.info;

  const handleDismiss = () => {
    localStorage.setItem('dismissed_notice_id', String(notice.id));
    setDismissed(true);
  };

  return (
    <div className={`border-b px-4 py-2 flex items-center justify-center gap-2 text-sm font-bold ${style}`}>
      <Icon size={16} className="shrink-0" />
      <span>{notice.title}</span>
      {notice.body && <span className="font-normal hidden md:inline">— {notice.body}</span>}
      <button onClick={handleDismiss} className="ml-2 p-0.5 rounded hover:bg-black/10 transition-colors shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}
