/**
 * MotionPicker — 후보 2개를 나란히 보여주고 선택/삭제/다시 만들기.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, Check, Trash2, RefreshCw, AlertTriangle, X } from 'lucide-react';
import api from '../api/client';

export default function MotionPicker({ cut, onClose, onSelected, onDeleted, onRemake, packets = 4 }) {
  const motion = cut.motion || {};
  const candidates = motion.candidates || [];
  const [selecting, setSelecting] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';
  const videoUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const handleSelect = async (candidateId) => {
    setSelecting(candidateId);
    setError('');
    try {
      await api.post(`/cuts/${cut.cut_id}/motion/select`, { candidate_id: candidateId });
      onSelected(candidateId);
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || '선택 실패');
    } finally {
      setSelecting(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('영상을 지울까요? (이미지는 그대로 남아요)')) return;
    setDeleting(true);
    try {
      await api.delete(`/cuts/${cut.cut_id}/motion`);
      onDeleted();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || '삭제 실패');
    } finally {
      setDeleting(false);
    }
  };

  const checksWarning = (c) => {
    if (!c.checks) return null;
    if (c.checks.hands_ok === false) return '손 모양이 달라 보여요';
    if (c.checks.same_char === false) return '캐릭터가 달라 보여요';
    return null;
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Film size={18} className="text-violet-500" /> #{cut.cut_number} 후보 고르기
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800"><X size={18} /></button>
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {candidates.map((c) => {
              const warn = checksWarning(c);
              const hasVideo = !!c.path;
              return (
                <div key={c.id} className="relative border-2 border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                  {hasVideo ? (
                    <video
                      src={videoUrl(c.path)}
                      autoPlay muted loop playsInline
                      className="w-full aspect-square object-contain bg-black"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-gray-50 dark:bg-zinc-800 flex items-center justify-center p-4">
                      <div className="text-center">
                        <AlertTriangle size={20} className="mx-auto mb-2 text-gray-300 dark:text-zinc-600" />
                        <p className="text-xs text-gray-400 dark:text-zinc-500 font-bold">생성 실패</p>
                        <p className="text-[10px] text-gray-300 dark:text-zinc-600 mt-1">후보 1개만 만들어졌어요</p>
                      </div>
                    </div>
                  )}
                  {warn && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-amber-500/90 text-white text-[10px] font-bold rounded-full">
                      <AlertTriangle size={10} /> {warn}
                    </div>
                  )}
                  <div className="p-2 flex justify-center">
                    <button
                      onClick={() => handleSelect(c.id)}
                      disabled={!hasVideo || !!selecting}
                      className="flex items-center gap-1 px-4 py-1.5 rounded-full text-xs font-bold bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
                    >
                      {selecting === c.id ? '선택 중…' : <><Check size={12} /> 이걸로</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {error && <p className="text-xs text-red-500 font-bold mt-3">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            <Trash2 size={12} /> {deleting ? '삭제 중…' : '영상 지우기'}
          </button>
          <button
            onClick={() => { onRemake(); onClose(); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
          >
            <RefreshCw size={12} /> 다시 만들기 ({packets}패킷)
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
