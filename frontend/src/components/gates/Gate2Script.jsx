import { useState, useEffect } from 'react';
import api from '../../api/client';
import { FileText, Check, RefreshCw, AlertTriangle, X, Eye, Pencil, Plus, Trash2, Save } from 'lucide-react';

const SHOT_LABELS = { long: '롱샷', full: '풀샷', bust: '버스트', close_up: '클로즈업' };
const DIALOGUE_TYPE_LABELS = { speech: '대사', thought: '독백', narration: '나레이션' };

export default function Gate2Script({ projectId, episodeId, onRefresh, readOnly = false, gateStatus }) {
  const [script, setScript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [regenerated, setRegenerated] = useState(false);
  const [prevScript, setPrevScript] = useState(null);
  const [showPrevModal, setShowPrevModal] = useState(false);

  // 컷 편집 상태
  const [editingCut, setEditingCut] = useState(null); // { sceneIdx, cutIdx }
  const [editForm, setEditForm] = useState({ shot: 'bust', action: '', dialogue: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const isInvalidated = gateStatus?.gates?.['2_script']?.status === 'invalidated';

  useEffect(() => {
    api.get(`/projects/${projectId}/episodes/${episodeId}/script`)
      .then(({ data }) => {
        if (data) setScript(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, episodeId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      if (isInvalidated && script) {
        setPrevScript(script);
      }
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/script`);
      setScript(data);
      if (isInvalidated) setRegenerated(true);
    } catch (err) {
      setError(err.response?.data?.detail || '대본 생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.post(`/projects/${projectId}/episodes/${episodeId}/script/approve`, { auto_advance: false });
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || '승인에 실패했습니다.');
    } finally {
      setApproving(false);
    }
  };

  // ── 컷 편집 ──────────────────────────────────────────

  const openEdit = (sceneIdx, cutIdx) => {
    const cut = script.scenes[sceneIdx].cuts[cutIdx];
    setEditForm({
      shot: cut.shot || 'bust',
      action: cut.action || '',
      dialogue: cut.dialogue ? cut.dialogue.map(d => ({ ...d })) : [],
    });
    setSaveError('');
    setEditingCut({ sceneIdx, cutIdx });
  };

  const updateDialogueField = (i, field, value) => {
    setEditForm(prev => ({
      ...prev,
      dialogue: prev.dialogue.map((d, idx) => idx === i ? { ...d, [field]: value } : d),
    }));
  };

  const addDialogue = () => {
    setEditForm(prev => ({
      ...prev,
      dialogue: [...prev.dialogue, { type: 'speech', speaker: '', text: '' }],
    }));
  };

  const removeDialogue = (i) => {
    setEditForm(prev => ({
      ...prev,
      dialogue: prev.dialogue.filter((_, idx) => idx !== i),
    }));
  };

  const handleEditSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      // 딥 클론 후 해당 컷만 수정
      const newScript = JSON.parse(JSON.stringify(script));
      const cut = newScript.scenes[editingCut.sceneIdx].cuts[editingCut.cutIdx];
      cut.shot = editForm.shot;
      cut.action = editForm.action;
      cut.dialogue = editForm.dialogue;

      const { data } = await api.put(
        `/projects/${projectId}/episodes/${episodeId}/script`,
        { script: newScript },
      );

      setScript(data.script || newScript);
      setEditingCut(null);
      // 무효화 전파 결과를 게이트 진행 표시에 반영
      if (onRefresh) await onRefresh();
    } catch (err) {
      setSaveError(err.response?.data?.detail || '저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  // ── 렌더링 ──────────────────────────────────────────

  if (loading) return <div className="text-center py-10 text-gray-400 dark:text-zinc-500 font-bold">대본 데이터 로딩 중...</div>;

  const renderScenes = (editEnabled = false) => (
    <div className="space-y-3">
      {script.scenes.map((scene, sceneIdx) => (
        <div key={scene.scene_id} className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold font-serif text-ink-black dark:text-white">씬 {scene.scene_no}: {scene.summary}</h3>
            <span className="text-xs font-bold bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">{scene.location}</span>
          </div>
          <div className="space-y-2">
            {scene.cuts?.map((cut, cutIdx) => (
              <div key={cut.cut_number} className="border-l-2 border-comic-blue/30 pl-3 py-2">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                  <span className="bg-comic-blue/10 text-comic-blue px-1.5 py-0.5 rounded font-bold">
                    컷 {cut.cut_number}
                  </span>
                  <span>{SHOT_LABELS[cut.shot] || cut.shot}</span>
                  <span>·</span>
                  <span>{cut.characters?.map(c => typeof c === 'string' ? c : c.character_id).join(', ')}</span>
                  {editEnabled && (
                    <button
                      onClick={() => openEdit(sceneIdx, cutIdx)}
                      className="ml-auto flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-comic-blue border border-comic-blue/30 hover:bg-comic-blue/10 rounded-lg transition-colors"
                    >
                      <Pencil size={11} /> 편집
                    </button>
                  )}
                </div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mt-1">{cut.action}</p>
                {cut.dialogue?.map((d, i) => (
                  <p key={i} className="text-sm font-bold text-gray-600 dark:text-gray-400 mt-0.5 italic">
                    <span className="not-italic text-[10px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 px-1 py-0.5 rounded mr-1">
                      {DIALOGUE_TYPE_LABELS[d.type] || d.type}
                    </span>
                    {d.speaker ? `${d.speaker}: ` : ''}{d.text}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!readOnly && (!isInvalidated || regenerated) && (
        <button
          onClick={handleApprove}
          disabled={approving}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-green-600 dark:bg-green-600 text-white rounded-full text-sm font-bold hover:bg-green-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
        >
          <Check size={14} /> {approving ? '승인 중...' : '대본 승인 → 다음 단계'}
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2 mb-4">
          <FileText size={20} className="text-comic-blue" />
          게이트 2 — 대본
        </h2>

        {/* 무효화 상태 + 아직 재생성 안 함: 재생성 필요 경고 */}
        {isInvalidated && !readOnly && !regenerated && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-bold mb-2">
              <AlertTriangle size={16} />
              기획이 수정되어 대본을 다시 생성해야 합니다
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-comic-orange text-white rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
            >
              {generating ? <><RefreshCw size={14} className="animate-spin" /> 대본 재생성 중...</> : '대본 재생성'}
            </button>
          </div>
        )}

        {/* 재생성 완료 안내 */}
        {regenerated && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 text-sm font-bold">
                <Check size={16} />
                대본이 재생성되었습니다
              </div>
              {prevScript && (
                <button
                  onClick={() => setShowPrevModal(true)}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                >
                  <Eye size={14} /> 이전 대본 보기
                </button>
              )}
            </div>
          </div>
        )}

        {/* 데이터 없음: 최초 생성 */}
        {!script && !readOnly && !isInvalidated && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full text-sm font-bold hover:bg-comic-blue dark:hover:bg-comic-orange hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
          >
            {generating ? <><RefreshCw size={14} className="animate-spin" /> 대본 생성 중...</> : '대본 생성'}
          </button>
        )}

        {!script && readOnly && (
          <p className="text-gray-400 dark:text-zinc-500 text-sm font-bold">저장된 대본 데이터가 없습니다.</p>
        )}

        {error && (
          <div className="text-sm font-bold mt-3">
            <p className="text-red-500 dark:text-red-400">{error}</p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">일시적인 오류일 수 있습니다. 잠시 후 다시 시도해주세요.</p>
          </div>
        )}
      </div>

      {/* 무효화 + 아직 재생성 안 함: 이전 대본 흐리게 */}
      {script?.scenes && isInvalidated && !readOnly && !regenerated && (
        <div className="opacity-50 pointer-events-none">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-2">이전 대본 (참고용)</p>
          {renderScenes(false)}
        </div>
      )}

      {/* 정상·재생성 완료·readOnly: 대본 표시 + 편집 버튼 */}
      {script?.scenes && (!isInvalidated || readOnly || regenerated) && (
        <div>
          {renderScenes(!readOnly)}
        </div>
      )}

      {/* ── 컷 편집 모달 ── */}
      {editingCut !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => !saving && setEditingCut(null)}
        >
          <div
            className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between p-5 border-b-2 border-border dark:border-zinc-800">
              <h3 className="font-bold font-serif text-ink-black dark:text-white">
                씬 {script.scenes[editingCut.sceneIdx].scene_no} · 컷 {script.scenes[editingCut.sceneIdx].cuts[editingCut.cutIdx].cut_number} 편집
              </h3>
              <button onClick={() => !saving && setEditingCut(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>

            {/* 바디 */}
            <div className="overflow-y-auto p-5 space-y-5">
              {/* 샷 타입 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">샷 타입</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(SHOT_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setEditForm(prev => ({ ...prev, shot: key }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-colors ${
                        editForm.shot === key
                          ? 'bg-comic-blue text-white border-comic-blue'
                          : 'border-border dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-comic-blue'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 액션 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">액션 / 장면 설명</label>
                <textarea
                  value={editForm.action}
                  onChange={e => setEditForm(prev => ({ ...prev, action: e.target.value }))}
                  placeholder="이 컷에서 일어나는 장면을 설명하세요"
                  rows={3}
                  className="w-full px-3 py-2 text-sm font-bold border-2 border-border dark:border-zinc-700 rounded-xl bg-gray-50 dark:bg-zinc-900 text-ink-black dark:text-white focus:outline-none focus:border-comic-blue resize-none"
                />
              </div>

              {/* 대사 목록 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400">대사</label>
                  <button
                    onClick={addDialogue}
                    className="flex items-center gap-1 text-xs font-bold text-comic-blue hover:text-comic-blue/70 transition-colors"
                  >
                    <Plus size={12} /> 대사 추가
                  </button>
                </div>

                <div className="space-y-3">
                  {editForm.dialogue.length === 0 && (
                    <p className="text-xs font-bold text-gray-400 dark:text-zinc-500 text-center py-4 border-2 border-dashed border-border dark:border-zinc-700 rounded-xl">
                      대사 없음 · 위 "+ 대사 추가"를 눌러 추가하세요
                    </p>
                  )}
                  {editForm.dialogue.map((d, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-zinc-900 border border-border dark:border-zinc-700 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {/* 타입 */}
                        <select
                          value={d.type || 'speech'}
                          onChange={e => updateDialogueField(i, 'type', e.target.value)}
                          className="text-xs font-bold border border-border dark:border-zinc-600 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none"
                        >
                          <option value="speech">대사</option>
                          <option value="thought">독백</option>
                          <option value="narration">나레이션</option>
                        </select>
                        {/* 화자 (나레이션 제외) */}
                        {d.type !== 'narration' && (
                          <input
                            value={d.speaker || ''}
                            onChange={e => updateDialogueField(i, 'speaker', e.target.value)}
                            placeholder="화자 이름"
                            className="flex-1 min-w-0 text-xs font-bold border border-border dark:border-zinc-600 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none"
                          />
                        )}
                        {/* 삭제 */}
                        <button
                          onClick={() => removeDialogue(i)}
                          className="ml-auto flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <textarea
                        value={d.text || ''}
                        onChange={e => updateDialogueField(i, 'text', e.target.value)}
                        placeholder={d.type === 'narration' ? '나레이션 내용을 입력하세요' : '대사를 입력하세요'}
                        rows={2}
                        className="w-full px-2 py-1.5 text-sm font-bold border border-border dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none resize-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {saveError && (
                <p className="text-xs font-bold text-red-500 dark:text-red-400">{saveError}</p>
              )}
            </div>

            {/* 푸터 */}
            <div className="flex gap-3 p-5 border-t-2 border-border dark:border-zinc-800">
              <button
                onClick={() => !saving && setEditingCut(null)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 border-2 border-border dark:border-zinc-700 rounded-full text-sm font-bold text-gray-600 dark:text-gray-400 hover:border-gray-400 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleEditSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-comic-blue text-white rounded-full text-sm font-bold hover:bg-comic-blue/90 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Save size={14} /> {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이전 대본 모달 */}
      {showPrevModal && prevScript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPrevModal(false)}>
          <div
            className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b-2 border-border dark:border-zinc-800">
              <h3 className="font-bold font-serif text-ink-black dark:text-white">이전 대본 (참고용)</h3>
              <button onClick={() => setShowPrevModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3">
              {prevScript.scenes.map((scene) => (
                <div key={scene.scene_id} className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl p-4">
                  <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-2">씬 {scene.scene_no}: {scene.summary}</h4>
                  {scene.cuts?.map((cut) => (
                    <div key={cut.cut_number} className="border-l-2 border-gray-300 dark:border-zinc-600 pl-3 py-1 mb-1">
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">컷 {cut.cut_number}</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{cut.action}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
