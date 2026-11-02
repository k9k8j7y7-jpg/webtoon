import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

export default function JobProgress({ job, label = '처리 중' }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!job) { setVisible(false); return; }
    if (job.status === 'completed') {
      // 완료 후 3초 뒤 사라짐
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    }
    setVisible(true);
  }, [job, job?.status]);

  if (!visible && !(job && job.status !== 'completed')) return null;

  const { status, progress } = job || {};
  const pct = progress?.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const done = status === 'completed';

  return (
    <div className={`bg-comic-orange/5 dark:bg-comic-orange/10 border-2 border-comic-orange/30 rounded-2xl p-4 flex items-center gap-3 backdrop-blur-sm transition-opacity duration-500 ${done ? 'opacity-50' : 'opacity-100'}`}>
      {done
        ? <CheckCircle2 size={20} className="text-green-500" />
        : <Loader2 size={20} className="text-comic-orange animate-spin" />}
      <div className="flex-1">
        <div className="text-sm font-bold text-comic-orange">{done ? '완료!' : label}</div>
        <div className="mt-1 h-2 bg-comic-orange/20 dark:bg-comic-orange/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-comic-orange rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${done ? 100 : pct}%` }}
          />
        </div>
        <div className="text-xs font-bold text-comic-orange mt-1">
          {progress?.done || 0} / {progress?.total || '?'} ({done ? 100 : pct}%)
        </div>
      </div>
    </div>
  );
}
