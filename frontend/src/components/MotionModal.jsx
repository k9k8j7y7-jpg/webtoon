/**
 * MotionModal — [움직이게] 클릭 시 열리는 모달.
 * 등장 캐릭터 체크 + 움직임 강도 + 비용 안내 → [만들기]
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, X } from 'lucide-react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function MotionModal({ cut, characters, onClose, onStarted, packets = 4 }) {
  const navigate = useNavigate();
  const cutChars = (cut.characters || []).map(c => c.character_id).filter(Boolean);
  const linked = characters.filter(ch => cutChars.includes(ch.ref_key));

  const [selected, setSelected] = useState(() => {
    if (linked.length > 0) return [linked[0].id];
    return [];
  });
  const [intensity, setIntensity] = useState('subtle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasPhotoReal = linked.some(c => c.is_photo_real);

  const toggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    if (selected.length === 0) { setError('움직일 캐릭터를 선택해 주세요'); return; }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/cuts/${cut.cut_id}/motion`, {
        subject_ids: selected,
        intensity,
      });
      onStarted(data.job_id);
      onClose();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 402) {
        setError('패킷이 부족해요');
        setTimeout(() => navigate('/packets'), 1500);
        return;
      }
      const status = e.response?.status;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (detail?.message) {
        setError(detail.message);
      } else {
        setError(status ? `서버 오류 (${status})` : '네트워크 오류');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Film size={18} className="text-violet-500" /> #{cut.cut_number} 컷 움직이게
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 캐릭터 선택 */}
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-2">움직일 캐릭터</label>
            {linked.length === 0 ? (
              <p className="text-sm text-gray-400">등장 캐릭터가 없어요</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {linked.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => toggle(ch.id)}
                    disabled={ch.is_photo_real}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-colors ${
                      ch.is_photo_real
                        ? 'border-gray-200 dark:border-zinc-700 text-gray-300 dark:text-zinc-600 cursor-not-allowed'
                        : selected.includes(ch.id)
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                          : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-violet-300'
                    }`}
                  >
                    {ch.name || ch.ref_key}
                    {ch.is_photo_real && <span className="ml-1 text-[10px]">(실사)</span>}
                  </button>
                ))}
              </div>
            )}
            {hasPhotoReal && (
              <p className="text-[11px] text-amber-500 mt-1.5">실사 캐릭터 컷은 아직 지원하지 않아요</p>
            )}
          </div>

          {/* 움직임 강도 */}
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-2">움직임</label>
            <div className="flex gap-2">
              {[['subtle', '살짝'], ['normal', '보통']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setIntensity(val)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
                    intensity === val
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      : 'border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-violet-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 비용 안내 */}
          <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-3 text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p><span className="font-bold text-violet-600 dark:text-violet-400">{packets}패킷</span> · 후보 2개 · 약 2~3분</p>
            <p>완성되면 알려드려요</p>
          </div>

          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
            취소
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting || selected.length === 0 || hasPhotoReal}
            className="neon-btn !rounded-xl !px-5 !py-2 text-sm font-bold disabled:opacity-50"
          >
            {submitting ? '시작 중…' : '만들기'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
