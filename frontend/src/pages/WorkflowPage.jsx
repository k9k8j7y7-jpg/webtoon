import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api, { pollJob } from '../api/client';
import GateProgress from '../components/GateProgress';
import JobProgress from '../components/JobProgress';
import Gate1Planning from '../components/gates/Gate1Planning';
import Gate2Script from '../components/gates/Gate2Script';
import Gate3Assets from '../components/gates/Gate3Assets';
import Gate4Storyboard from '../components/gates/Gate4Storyboard';
import Gate5Review from '../components/gates/Gate5Review';
import { ArrowLeft, Eye, RotateCcw, AlertTriangle, X } from 'lucide-react';

export default function WorkflowPage() {
  const { projectId, episodeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialIdea = location.state?.idea || '';
  const initialStoryOptions = location.state?.storyOptions || null;
  const [gateStatus, setGateStatus] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewingGate, setViewingGate] = useState(null);
  const [revertModal, setRevertModal] = useState(null);
  const [reverting, setReverting] = useState(false);

  const loadStatus = useCallback(async () => {
    const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/status`);
    setGateStatus(data);
    setViewingGate(null);
    return data;
  }, [projectId, episodeId]);

  useEffect(() => {
    loadStatus().finally(() => setLoading(false));
  }, [loadStatus]);

  const runJob = async (jobId, label) => {
    setJob({ job_id: jobId, status: 'processing', progress: { done: 0, total: 0 } });
    try {
      const result = await pollJob(jobId, (j) => setJob(j));
      setJob(null);
      await loadStatus();
      return result;
    } catch (err) {
      setJob(null);
      throw err;
    }
  };

  const handleRevertClick = async () => {
    try {
      const { data } = await api.post(
        `/projects/${projectId}/episodes/${episodeId}/revert?dry_run=true`,
        { target_gate: viewingGate },
      );
      setRevertModal(data.impact);
    } catch (err) {
      alert(err.response?.data?.detail || '되돌아가기 정보 조회에 실패했습니다.');
    }
  };

  const handleRevertConfirm = async () => {
    setReverting(true);
    try {
      await api.post(
        `/projects/${projectId}/episodes/${episodeId}/revert`,
        { target_gate: viewingGate },
      );
      setRevertModal(null);
      await loadStatus();
    } catch (err) {
      alert(err.response?.data?.detail || '되돌아가기에 실패했습니다.');
    } finally {
      setReverting(false);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-400 dark:text-zinc-500 font-bold">로딩 중...</div>;

  const currentGate = gateStatus?.current_gate || 1;
  const displayGate = viewingGate || currentGate;
  const isViewingPrevious = viewingGate && viewingGate < currentGate;

  const handleGateClick = (gateNumber) => {
    const gateKey = ['1_planning', '2_script', '3_assets', '4_storyboard', '5_review'][gateNumber - 1];
    const gateState = gateStatus?.gates?.[gateKey];
    if (!gateState || gateState.status === 'locked') return;

    if (gateNumber === currentGate) {
      setViewingGate(null);
    } else {
      setViewingGate(gateNumber);
    }
  };

  const gateComponents = {
    1: Gate1Planning,
    2: Gate2Script,
    3: Gate3Assets,
    4: Gate4Storyboard,
    5: Gate5Review,
  };
  const GateComponent = gateComponents[displayGate];

  const gateLabels = { 1: '기획', 2: '대본', 3: '자산', 4: '콘티', 5: '이미지' };

  return (
    <div>
      <button
        onClick={() => navigate(`/projects/${projectId}`)}
        className="flex items-center gap-1 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> 에피소드 목록
      </button>

      <div className="mb-6">
        <GateProgress gateStatus={gateStatus} onGateClick={handleGateClick} viewingGate={viewingGate} />
      </div>

      {isViewingPrevious && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-2xl px-5 py-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-bold">
            <Eye size={16} />
            게이트 {viewingGate} — {gateLabels[viewingGate]} (읽기 전용)
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRevertClick}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500 text-white rounded-full text-xs font-bold hover:-translate-y-0.5 transition-all"
            >
              <RotateCcw size={12} /> {gateLabels[viewingGate]} 수정하기
            </button>
            <button
              onClick={() => setViewingGate(null)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 text-white rounded-full text-xs font-bold hover:-translate-y-0.5 transition-all"
            >
              현재 단계로 돌아가기
            </button>
          </div>
        </div>
      )}

      {job && <div className="mb-4"><JobProgress job={job} /></div>}

      <GateComponent
        key={displayGate}
        projectId={projectId}
        episodeId={episodeId}
        gateStatus={gateStatus}
        onRefresh={loadStatus}
        runJob={runJob}
        initialIdea={displayGate === 1 && !viewingGate ? initialIdea : ''}
        initialStoryOptions={displayGate === 1 && !viewingGate ? initialStoryOptions : null}
        readOnly={isViewingPrevious}
      />

      {/* 되돌아가기 무효화 경고 모달 */}
      {revertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setRevertModal(null)}>
          <div
            className="bg-white dark:bg-surface-dark border-2 border-red-200 dark:border-red-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white">{gateLabels[revertModal.target_gate]} 수정하기</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">
                  {gateLabels[revertModal.target_gate]} 단계로 돌아가 수정합니다
                </p>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-900/10 border-2 border-red-100 dark:border-red-900/30 rounded-xl p-4 mb-5">
              <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-3">
                {gateLabels[revertModal.target_gate]}을(를) 수정하면 다음이 재생성되어야 합니다:
              </p>
              <ul className="space-y-1.5 text-sm font-bold text-red-600 dark:text-red-400">
                {revertModal.gates_invalidated.length > 0 && (
                  <li>· 게이트: {revertModal.gates_invalidated.join(', ')}</li>
                )}
                {revertModal.characters_count > 0 && (
                  <li>· 캐릭터 {revertModal.characters_count}명</li>
                )}
                {revertModal.locations_count > 0 && (
                  <li>· 장소 {revertModal.locations_count}곳</li>
                )}
                {revertModal.cuts_count > 0 && (
                  <li>· 콘티 {revertModal.cuts_count}컷</li>
                )}
              </ul>
              <p className="text-xs text-red-500 dark:text-red-400 mt-3">
                이미지는 삭제되지 않고 '재생성 필요' 상태로 표시됩니다.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRevertModal(null)}
                className="flex-1 py-2.5 border-2 border-border dark:border-zinc-700 rounded-full font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
              >
                취소
              </button>
              <button
                onClick={handleRevertConfirm}
                disabled={reverting}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-full font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                {reverting ? '처리 중...' : `${gateLabels[revertModal.target_gate]} 수정하기`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
