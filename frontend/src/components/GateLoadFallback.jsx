import { RefreshCw } from 'lucide-react';

/** 게이트 초기 로딩 스켈레톤 (glass-card 톤) */
export function GateSkeleton({ lines = 3 }) {
  return (
    <div className="glass-card p-6 animate-pulse space-y-4">
      <div className="h-5 w-40 bg-gray-200 dark:bg-white/10 rounded-lg" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 bg-gray-200 dark:bg-white/10 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
          <div className="h-3 bg-gray-100 dark:bg-white/5 rounded" style={{ width: `${50 + Math.random() * 30}%` }} />
        </div>
      ))}
    </div>
  );
}

/** 게이트 로딩 실패 카드 */
export function GateLoadError({ message, onRetry }) {
  return (
    <div className="glass-card p-6 flex flex-col items-center justify-center gap-3 py-12">
      <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
        불러오지 못했어요
      </p>
      {message && (
        <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs text-center">{message}</p>
      )}
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-comic-blue hover:bg-blue-600 rounded-full transition-colors shadow-sm"
      >
        <RefreshCw size={14} /> 다시 시도
      </button>
    </div>
  );
}
