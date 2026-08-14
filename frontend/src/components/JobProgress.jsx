import { Loader2 } from 'lucide-react';

export default function JobProgress({ job, label = '처리 중' }) {
  if (!job) return null;
  const { status, progress } = job;
  const pct = progress?.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  if (status === 'completed') return null;

  return (
    <div className="bg-comic-orange/5 dark:bg-comic-orange/10 border-2 border-comic-orange/30 rounded-2xl p-4 flex items-center gap-3 backdrop-blur-sm">
      <Loader2 size={20} className="text-comic-orange animate-spin" />
      <div className="flex-1">
        <div className="text-sm font-bold text-comic-orange">{label}</div>
        <div className="mt-1 h-2 bg-comic-orange/20 dark:bg-comic-orange/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-comic-orange rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs font-bold text-comic-orange mt-1">
          {progress?.done || 0} / {progress?.total || '?'} ({pct}%)
        </div>
      </div>
    </div>
  );
}
