import { useState, useEffect } from 'react';
import api from '../../api/client';
import { LayoutGrid, Check, RefreshCw, AlertTriangle, MessageSquare, MapPin, Clapperboard, Pencil, X, SlidersHorizontal } from 'lucide-react';

export default function Gate4Storyboard({ projectId, episodeId, onRefresh, readOnly = false, gateStatus }) {
  const [cuts, setCuts] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');

  // 컷 수 조정
  const [recommendation, setRecommendation] = useState(null);
  const [targetCount, setTargetCount] = useState('');
  const [adjustError, setAdjustError] = useState('');

  // 컷 편집 모달
  const [editingCut, setEditingCut] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const isInvalidated = gateStatus?.gates?.['4_storyboard']?.status === 'invalidated';

  const loadCuts = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/cuts`);
      setCuts(data);
    } catch {}
  };

  const loadRecommendation = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/storyboard/recommend`);
      setRecommendation(data);
    } catch {}
  };

  useEffect(() => {
    loadCuts();
    loadRecommendation();
  }, []);

  const handleGenerate = async (customTarget) => {
    setGenerating(true);
    setError('');
    setAdjustError('');
    try {
      const target = customTarget || (targetCount ? parseInt(targetCount) : null);
      const body = target ? { target_cut_count: target } : {};
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/storyboard`, body);
      setCuts(data.cuts || []);
      await loadCuts();
      // 생성 후 권장 범위 + 게이트 상태 갱신 (invalidated → draft 반영)
      await loadRecommendation();
      await onRefresh();
    } catch (err) {
      const detail = err.response?.data?.detail || '콘티 생성에 실패했습니다.';
      if (err.response?.status === 400 && (detail.includes('최소') || detail.includes('최대'))) {
        setAdjustError(detail);
      } else {
        setError(detail);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.post(`/projects/${projectId}/episodes/${episodeId}/storyboard/approve`);
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || '승인에 실패했습니다.');
    } finally {
      setApproving(false);
    }
  };

  // 컷 편집
  const openEditModal = (cut) => {
    setEditingCut(cut);
    setEditForm({
      shot: cut.shot || 'full',
      action: cut.action || '',
      dialogue: (cut.dialogue || []).map(d => ({ ...d })),
    });
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      await api.put(`/cuts/${editingCut.cut_id}`, {
        shot: editForm.shot,
        action: editForm.action,
        dialogue: editForm.dialogue,
      });
      setEditingCut(null);
      await loadCuts();
    } catch (err) {
      setError(err.response?.data?.detail || '컷 수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const updateDialogue = (index, field, value) => {
    setEditForm(prev => {
      const newDialogue = [...prev.dialogue];
      newDialogue[index] = { ...newDialogue[index], [field]: value };
      return { ...prev, dialogue: newDialogue };
    });
  };

  const shotLabel = { long: '롱샷', full: '풀샷', bust: '바스트샷', close_up: '클로즈업' };
  const dialogueTypeLabel = { narration: '나레이션', speech: '대사', thought: '독백', sfx: '효과음' };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-4">
          <LayoutGrid size={20} className="text-comic-orange" /> 게이트 4 — 콘티
        </h2>

        {/* 무효화 경고 */}
        {isInvalidated && !readOnly && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-bold mb-2">
              <AlertTriangle size={16} />
              이전 단계가 수정되어 콘티를 다시 생성해야 합니다
            </div>
          </div>
        )}

        {/* 권장 컷 수 안내 + 컷 수 조정 */}
        {recommendation && !readOnly && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm font-bold mb-2">
              <SlidersHorizontal size={16} />
              이 대본은 {recommendation.recommended_min}~{recommendation.recommended_max}컷이 적당합니다
              <span className="text-xs text-blue-500 dark:text-blue-400 font-normal">
                (현재 {recommendation.current_count}컷 · 최소 {recommendation.absolute_min}컷)
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                value={targetCount}
                onChange={(e) => { setTargetCount(e.target.value); setAdjustError(''); }}
                placeholder={`목표 컷 수 (${recommendation.absolute_min}~${recommendation.recommended_max})`}
                min={recommendation.absolute_min}
                max={recommendation.recommended_max}
                className="w-48 px-3 py-1.5 border-2 border-blue-200 dark:border-blue-700 rounded-lg text-sm font-bold bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-comic-blue"
              />
              <button
                onClick={() => handleGenerate()}
                disabled={generating}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-comic-blue text-white rounded-full text-xs font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                {generating ? <><RefreshCw size={12} className="animate-spin" /> 조정 중...</> :
                  targetCount ? `${targetCount}컷으로 ${cuts.length > 0 ? '재생성' : '생성'}` :
                  cuts.length > 0 ? '재생성' : '콘티 생성'}
              </button>
            </div>
            {adjustError && (
              <p className="text-red-500 dark:text-red-400 text-xs font-bold mt-2">{adjustError}</p>
            )}
          </div>
        )}

        {/* 읽기 전용에서 생성 버튼 없음 */}
        {readOnly && cuts.length === 0 && (
          <p className="text-sm font-bold text-gray-400 dark:text-zinc-500">저장된 콘티 데이터가 없습니다.</p>
        )}

        {error && (
          <div className="text-sm font-bold mb-3">
            <p className="text-red-500 dark:text-red-400">{error}</p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">일시적인 오류일 수 있습니다. 잠시 후 다시 시도해주세요.</p>
          </div>
        )}
      </div>

      {/* 컷 목록 */}
      {cuts.length > 0 && (
        <div className={isInvalidated && !readOnly ? 'opacity-50' : ''}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-600 dark:text-gray-400">
              총 {cuts.length}컷
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
            {cuts.map((cut) => (
              <div
                key={cut.cut_id}
                className={`border-2 rounded-xl p-4 bg-white/50 dark:bg-zinc-800/50 ${
                  cut.status === 'invalidated' ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-border dark:border-zinc-700'
                }`}
              >
                {/* 헤더: 컷 번호 + 샷 타입 + 편집 버튼 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white bg-ink-black dark:bg-zinc-600 px-2 py-0.5 rounded-full">#{cut.cut_number}</span>
                    <span className="text-xs font-bold text-comic-blue dark:text-blue-400">
                      {shotLabel[cut.shot] || cut.shot}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {cut.status === 'invalidated' && (
                      <span className="flex items-center gap-0.5 text-xs font-bold text-amber-600 dark:text-amber-500">
                        <AlertTriangle size={10} /> 무효화
                      </span>
                    )}
                    {!readOnly && !isInvalidated && (
                      <button
                        onClick={() => openEditModal(cut)}
                        className="p-1 text-gray-400 hover:text-comic-blue dark:hover:text-blue-400 transition-colors"
                        title="컷 편집"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 장소 */}
                {cut.location_id && (
                  <div className="flex items-center gap-1 mb-2 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin size={11} className="text-emerald-500 flex-shrink-0" />
                    <span className="font-bold truncate">{cut.location_id}</span>
                  </div>
                )}

                {/* 등장인물 */}
                {cut.characters && cut.characters.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {cut.characters.map((ch, i) => (
                      <span key={i} className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {ch.character_id}{ch.emotion ? ` (${ch.emotion})` : ''}
                      </span>
                    ))}
                  </div>
                )}

                {/* 액션 */}
                {cut.action && (
                  <div className="flex gap-1.5 mb-2">
                    <Clapperboard size={11} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">{cut.action}</p>
                  </div>
                )}

                {/* 대사 */}
                {cut.dialogue && cut.dialogue.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border/50 dark:border-zinc-700/50 pt-2">
                    {cut.dialogue.map((d, i) => (
                      <div key={i} className="flex gap-1.5">
                        <MessageSquare size={10} className="text-comic-orange flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                          <span className="font-bold text-gray-800 dark:text-gray-300">
                            {d.speaker ? `${d.speaker}` : dialogueTypeLabel[d.type] || d.type}:
                          </span>{' '}
                          <span className="line-clamp-2">{d.text}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 비용 안내 + 승인 */}
          {!readOnly && !isInvalidated && (
            <>
              <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl p-3 mb-4">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  콘티 승인 후 이미지 생성이 시작됩니다 (컷당 2크레딧).
                </p>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-500 mt-1">
                  예상 비용: {cuts.length}컷 × 2크레딧 = <strong>{cuts.length * 2}크레딧</strong>
                </p>
              </div>

              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-green-600 dark:bg-green-600 text-white rounded-full text-sm font-bold hover:bg-green-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Check size={14} /> {approving ? '승인 중...' : '콘티 승인 → 이미지 생성 시작'}
              </button>
            </>
          )}
        </div>
      )}

      {/* 컷 편집 모달 */}
      {editingCut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditingCut(null)}>
          <div
            className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between p-5 border-b-2 border-border dark:border-zinc-800">
              <h3 className="font-bold font-serif text-ink-black dark:text-white">컷 #{editingCut.cut_number} 편집</h3>
              <button onClick={() => setEditingCut(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            {/* 모달 바디 */}
            <div className="overflow-y-auto p-5 space-y-4">
              {/* 샷 타입 */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">샷 타입</label>
                <div className="flex gap-2">
                  {['long', 'full', 'bust', 'close_up'].map(s => (
                    <button
                      key={s}
                      onClick={() => setEditForm(prev => ({ ...prev, shot: s }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                        editForm.shot === s
                          ? 'bg-comic-blue text-white'
                          : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
                      }`}
                    >
                      {shotLabel[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 액션 */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">액션</label>
                <textarea
                  value={editForm.action}
                  onChange={(e) => setEditForm(prev => ({ ...prev, action: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 rounded-xl text-sm bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-comic-blue resize-none"
                />
              </div>

              {/* 대사 */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">대사</label>
                <div className="space-y-3">
                  {editForm.dialogue?.map((d, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-zinc-900 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={d.type || 'speech'}
                          onChange={(e) => updateDialogue(i, 'type', e.target.value)}
                          className="px-2 py-1 border border-gray-200 dark:border-zinc-700 rounded-lg text-xs font-bold bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
                        >
                          <option value="speech">대사</option>
                          <option value="narration">나레이션</option>
                          <option value="thought">독백</option>
                        </select>
                        <input
                          type="text"
                          value={d.speaker || ''}
                          onChange={(e) => updateDialogue(i, 'speaker', e.target.value || null)}
                          placeholder="화자"
                          className="flex-1 px-2 py-1 border border-gray-200 dark:border-zinc-700 rounded-lg text-xs bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
                        />
                      </div>
                      <textarea
                        value={d.text || ''}
                        onChange={(e) => updateDialogue(i, 'text', e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-ink-black dark:text-white resize-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 모달 푸터 */}
            <div className="flex gap-3 p-5 border-t-2 border-border dark:border-zinc-800">
              <button
                onClick={() => setEditingCut(null)}
                className="flex-1 py-2.5 border-2 border-border dark:border-zinc-700 rounded-full font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-comic-blue text-white rounded-full font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
