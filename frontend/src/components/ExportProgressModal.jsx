/**
 * ExportProgressModal — 웹툰 Export 진행 상황 모달
 *
 * states: 'running' | 'done' | 'error' | 'cancelled'
 * 초보 사용자 기준: 침묵 금지, 명확한 안내, 취소 버튼 제공
 */

import { X, Download, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export default function ExportProgressModal({ state, done, total, format, error, onCancel, onRetry, onClose }) {
  const formatLabel = { png_cuts: 'PNG ZIP', vertical_single: '세로 PNG', instagram_carousel: '인스타 ZIP' }[format] || format;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // 예상 시간 (컷당 약 1.2초 기준)
  const estSec = Math.max(5, Math.round(total * 1.2));
  const estLabel = estSec < 60 ? `약 ${estSec}초` : `약 ${Math.ceil(estSec / 60)}분`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 border-2 border-border dark:border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-ink-black dark:text-white flex items-center gap-2">
            <Download size={18} className="text-comic-blue" />
            {formatLabel} 내보내기
          </h3>
          {(state === 'done' || state === 'error' || state === 'cancelled') && (
            <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full">
              <X size={16} />
            </button>
          )}
        </div>

        {/* 진행 중 */}
        {state === 'running' && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
              웹툰을 만드는 중… {done}/{total}
            </p>

            {/* 프로그레스 바 */}
            <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 bg-comic-blue rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 text-right">{pct}%</p>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 space-y-1">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-bold">
                ⏱ {estLabel} 정도 걸려요
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                이 창을 닫으면 처음부터 다시 해야 해요!
              </p>
            </div>

            <button
              onClick={onCancel}
              className="w-full py-2 text-sm text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-bold"
            >
              취소
            </button>
          </div>
        )}

        {/* 완료 */}
        {state === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={20} />
              <p className="font-bold text-sm">완성! 다운로드가 시작됩니다 🎉</p>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              총 {total}컷이 {formatLabel}으로 저장되었어요.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2 text-sm bg-ink-black dark:bg-white dark:text-ink-black text-white rounded-xl font-bold hover:-translate-y-0.5 transition-all shadow-sm"
            >
              닫기
            </button>
          </div>
        )}

        {/* 오류 */}
        {state === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
              <AlertTriangle size={20} />
              <p className="font-bold text-sm">내보내기 실패</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400 break-all">{error || '알 수 없는 오류'}</p>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              일시적인 문제일 수 있어요. 아래에서 다시 시도해보세요.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onRetry}
                className="flex-1 py-2 text-sm bg-comic-blue text-white rounded-xl font-bold hover:-translate-y-0.5 transition-all shadow-sm"
              >
                다시 시도
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 text-sm border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* 취소됨 */}
        {state === 'cancelled' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
              <XCircle size={20} />
              <p className="font-bold text-sm">취소되었어요</p>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              언제든 다시 내보내기 버튼을 누르면 돼요.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2 text-sm border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              닫기
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
