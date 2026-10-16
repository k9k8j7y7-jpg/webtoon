/**
 * ReelModal — 릴스 영상(컷 이어붙이기) 생성 모달.
 * 컷 썸네일 체크 그리드 + 비용 안내 → [만들기]
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clapperboard, Film, X } from 'lucide-react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function ReelModal({ cuts, projectId, episodeId, onClose, onStarted, getImageUrl }) {
  const navigate = useNavigate();
  const validCuts = (cuts || []).filter(c => c.image_url);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const motionCount = validCuts.filter(c => {
    const m = c.motion || {};
    return m.selected;
  }).length;

  const totalSec = validCuts.length * 3 + 1;

  const handleCreate = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/reel`);
      onStarted(data.job_id);
      onClose();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 402) {
        setError('패킷이 부족해요');
        setTimeout(() => navigate('/packets'), 1500);
        return;
      }
      setError(typeof detail === 'string' ? detail : (detail?.message || `서버 오류 (${e.response?.status || '?'})`));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Clapperboard size={18} className="text-rose-500" /> 릴스 영상 만들기
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* 컷 썸네일 그리드 */}
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-2">포함 컷 ({validCuts.length}컷)</label>
            <div className="grid grid-cols-4 gap-1.5">
              {validCuts.map(c => {
                const hasMotion = !!(c.motion?.selected);
                return (
                  <div key={c.cut_id} className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
                    <img
                      src={getImageUrl(c)}
                      alt={`#${c.cut_number}`}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 flex items-center justify-between">
                      <span>#{c.cut_number}</span>
                      {hasMotion && <Film size={8} className="text-violet-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
            {motionCount > 0 && (
              <p className="text-[10px] text-violet-500 mt-1.5">
                <Film size={10} className="inline" /> {motionCount}컷은 영상으로 들어가요
              </p>
            )}
          </div>

          {/* 비용 안내 */}
          <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>
              <span className="font-bold text-rose-500">{validCuts.length}컷</span> × 3초 + 크레딧 1초 = <span className="font-bold text-ink-black dark:text-white">{totalSec}초</span>
            </p>
            <p><span className="font-bold text-rose-500">1패킷</span> · 1080×1920 · 약 1분</p>
            <p>완성되면 알려드려요</p>
          </div>

          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
            취소
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting || validCuts.length === 0}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-600 hover:to-pink-600 disabled:opacity-50 transition-colors"
          >
            {submitting ? '시작 중…' : '만들기'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
