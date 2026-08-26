import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { pollJob } from '../api/client';
import {
  ArrowLeft, ChevronDown, ChevronUp, RefreshCw, Plus, Trash2, X,
  Merge, Split, ArrowUp, ArrowDown, FileText, Lock, Edit3, Check, Loader2,
} from 'lucide-react';

export default function SeriesPage() {
  const { projectId, seriesId } = useParams();
  const navigate = useNavigate();

  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bibleOpen, setBibleOpen] = useState(true);

  // 비동기 Job 상태: { type, affectedNos, message, error }
  const [activeJob, setActiveJob] = useState(null);
  // 완료 하이라이트 (회차 번호 목록)
  const [highlightNos, setHighlightNos] = useState([]);

  // 인라인 편집
  const [editingIdx, setEditingIdx] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  // from_no 재생성
  const [regenFromNo, setRegenFromNo] = useState(null);

  const jobRunning = !!activeJob;

  const loadSeries = useCallback(async () => {
    try {
      const { data } = await api.get(`/series/${seriesId}`);
      setSeries(data);
    } catch {
      alert('시리즈를 불러올 수 없습니다.');
      navigate(`/projects/${projectId}`);
    } finally {
      setLoading(false);
    }
  }, [seriesId, projectId, navigate]);

  useEffect(() => { loadSeries(); }, [loadSeries]);

  // ── Job 실행 헬퍼 ──

  const runJob = async (apiCall, message, type, affectedNos) => {
    setActiveJob({ type, affectedNos, message, error: null });
    setHighlightNos([]);
    try {
      const { data } = await apiCall();
      await pollJob(data.job_id, null, 2000);
      await loadSeries();
      // 완료 하이라이트: 변경된 회차 추정
      let changedNos = affectedNos;
      if (type === 'merge') {
        // 병합 후 noA가 남고 noB 이후 리넘버링
        changedNos = affectedNos.length > 0 ? [affectedNos[0]] : [];
      } else if (type === 'split') {
        const no = affectedNos[0];
        changedNos = [no, no + 1];
      }
      setHighlightNos(changedNos);
      setActiveJob(null);
      setTimeout(() => setHighlightNos([]), 2000);
    } catch (e) {
      const errMsg = e?.response?.data?.detail || e.message || '작업에 실패했습니다.';
      setActiveJob((prev) => prev ? { ...prev, error: errMsg } : null);
    }
  };

  const dismissJobError = () => setActiveJob(null);

  // ── 바이블 재생성 ──

  const handleBibleRegenerate = () => {
    if (!confirm('바이블과 아웃라인을 전체 재생성합니다.\n기존 내용이 모두 교체됩니다.')) return;
    const target = series.bible?.target_episodes || series.outline?.length || 8;
    const allNos = (series.outline || []).map((x) => x.no);
    runJob(
      () => api.post(`/series/${seriesId}/bible/regenerate`, { target_episodes: target }),
      '바이블 전체 재생성 중...',
      'bible',
      allNos,
    );
  };

  // ── 부분 재생성 ──

  const handleOutlineRegenerate = (fromNo) => {
    if (!confirm(`${fromNo}화부터 아웃라인을 재생성합니다.\n${fromNo}화 이전은 유지됩니다.`)) return;
    setRegenFromNo(null);
    const affectedNos = (series.outline || []).filter((x) => x.no >= fromNo).map((x) => x.no);
    runJob(
      () => api.post(`/series/${seriesId}/outline/regenerate`, { from_no: fromNo }),
      `${fromNo}화부터 재생성 중...`,
      'regen_from',
      affectedNos,
    );
  };

  // ── 병합 ──

  const handleMerge = (noA, noB) => {
    if (!confirm(`${noA}화와 ${noB}화를 합칩니다.\n요약이 AI로 재작성됩니다.`)) return;
    runJob(
      () => api.post(`/series/${seriesId}/outline/merge`, { no_a: noA, no_b: noB }),
      `${noA}화+${noB}화 병합 중...`,
      'merge',
      [noA, noB],
    );
  };

  // ── 분할 ──

  const handleSplit = (no) => {
    if (!confirm(`${no}화를 두 회차로 분할합니다.`)) return;
    runJob(
      () => api.post(`/series/${seriesId}/outline/split`, { no }),
      `${no}화 분할 중...`,
      'split',
      [no],
    );
  };

  // ── 회차 추가 ──

  const handleAddEpisode = () => {
    const outline = [...(series.outline || [])];
    const nextNo = outline.length + 1;
    outline.push({
      no: nextNo,
      title: `${nextNo}화`,
      summary: '',
      hook: '',
      episode_id: null,
      status: 'outline',
    });
    saveOutline(outline);
  };

  // ── 회차 삭제 ──

  const handleDeleteItem = (no) => {
    const item = series.outline.find((x) => x.no === no);
    if (item?.episode_id) {
      alert('에피소드가 연결된 회차는 삭제할 수 없습니다.');
      return;
    }
    if (!confirm(`${no}화를 삭제합니다.`)) return;
    const outline = series.outline.filter((x) => x.no !== no);
    saveOutline(outline);
  };

  // ── 순서 변경 ──

  const handleMove = (idx, dir) => {
    const outline = [...series.outline];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= outline.length) return;
    [outline[idx], outline[newIdx]] = [outline[newIdx], outline[idx]];
    saveOutline(outline);
  };

  // ── 인라인 편집 ──

  const startEdit = (idx) => {
    const item = series.outline[idx];
    setEditingIdx(idx);
    setEditDraft({ title: item.title, summary: item.summary, hook: item.hook || '' });
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditDraft({});
  };

  const saveEdit = () => {
    const outline = [...series.outline];
    outline[editingIdx] = { ...outline[editingIdx], ...editDraft };
    setEditingIdx(null);
    setEditDraft({});
    saveOutline(outline);
  };

  // ── 아웃라인 저장 (PUT) ──

  const saveOutline = async (outline) => {
    try {
      const { data } = await api.put(`/series/${seriesId}/outline`, outline);
      setSeries(data);
    } catch (e) {
      alert(e?.response?.data?.detail || '저장에 실패했습니다.');
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-400 dark:text-zinc-500 font-bold">로딩 중...</div>;
  if (!series) return null;

  const bible = series.bible || {};
  const outline = series.outline || [];

  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <button
        onClick={() => navigate(`/projects/${projectId}`)}
        className="flex items-center gap-1 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> 프로젝트
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 rounded-full">연작</span>
          <h1 className="text-2xl font-bold font-serif text-ink-black dark:text-white truncate">{series.title}</h1>
        </div>
      </div>

      {/* 바이블 전체 재생성 배너 */}
      {activeJob?.type === 'bible' && !activeJob.error && (
        <div className="mb-4 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-300 dark:border-purple-700 rounded-xl flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{activeJob.message}</span>
        </div>
      )}
      {/* 바이블 에러 배너 */}
      {activeJob?.type === 'bible' && activeJob.error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-red-600 dark:text-red-400">바이블 재생성 실패: {activeJob.error}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleBibleRegenerate} className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors">재시도</button>
            <button onClick={dismissJobError} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
        </div>
      )}
      {/* 일반 Job 진행 배너 (bible 외) */}
      {activeJob && activeJob.type !== 'bible' && !activeJob.error && (
        <div className="mb-4 px-4 py-3 bg-comic-blue/10 dark:bg-comic-blue/20 border-2 border-comic-blue/30 rounded-xl flex items-center gap-2">
          <Loader2 size={16} className="animate-spin text-comic-blue" />
          <span className="text-sm font-bold text-comic-blue">{activeJob.message}</span>
        </div>
      )}

      {/* 바이블 섹션 */}
      {bible.synopsis && (
        <div className="mb-6 bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setBibleOpen(!bibleOpen)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            <span className="font-bold text-ink-black dark:text-white flex items-center gap-2">
              <FileText size={16} className="text-purple-500" />
              바이블
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleBibleRegenerate(); }}
                disabled={jobRunning}
                className="text-xs font-bold text-gray-400 hover:text-comic-orange transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshCw size={12} /> 전체 재생성
              </button>
              {bibleOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </div>
          </button>

          {bibleOpen && (
            <div className="px-5 pb-4 space-y-4 border-t border-border dark:border-zinc-800">
              <div className="pt-3">
                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">시놉시스</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{bible.synopsis}</p>
              </div>
              {bible.world && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">세계관</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{bible.world}</p>
                </div>
              )}
              {bible.characters?.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">주요 인물</h3>
                  <div className="space-y-1.5">
                    {bible.characters.map((c, i) => (
                      <div key={i} className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-bold">{c.name}</span>
                        {c.role && <span className="text-gray-400 ml-1">({c.role})</span>}
                        {c.description && <span className="ml-1">— {c.description}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 아웃라인 목록 */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white">
          회차 아웃라인 <span className="text-gray-400 text-base font-normal">({outline.length}화)</span>
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {/* from_no 재생성 */}
          {regenFromNo !== null ? (
            <div className="flex items-center gap-1">
              <select
                value={regenFromNo}
                onChange={(e) => setRegenFromNo(Number(e.target.value))}
                className="px-2 py-1 text-xs font-bold border-2 border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
              >
                {outline.map((item) => (
                  <option key={item.no} value={item.no}>{item.no}화부터</option>
                ))}
              </select>
              <button
                onClick={() => handleOutlineRegenerate(regenFromNo)}
                disabled={jobRunning}
                className="px-3 py-1 text-xs font-bold bg-comic-orange text-white rounded-lg hover:-translate-y-0.5 transition-all disabled:opacity-50"
              >
                재생성
              </button>
              <button onClick={() => setRegenFromNo(null)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setRegenFromNo(outline.length > 0 ? Math.ceil(outline.length / 2) + 1 : 1)}
              disabled={jobRunning || outline.length === 0}
              className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-comic-orange transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw size={12} /> N화부터 다시 생성
            </button>
          )}
          <button
            onClick={handleAddEpisode}
            disabled={jobRunning}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full hover:-translate-y-0.5 transition-all disabled:opacity-50"
          >
            <Plus size={12} /> 회차 추가
          </button>
        </div>
      </div>

      {outline.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-zinc-500 font-bold">
          아웃라인이 없습니다. 바이블을 먼저 생성해주세요.
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {outline.map((item, idx) => {
            const isAffected = activeJob && !activeJob.error && activeJob.affectedNos?.includes(item.no);
            const isFirstAffected = activeJob?.affectedNos?.[0] === item.no;
            const hasError = activeJob?.error && isFirstAffected;
            const isHighlighted = highlightNos.includes(item.no);
            return (
            <div
              key={`${item.no}-${idx}`}
              className={`relative bg-white dark:bg-surface-dark border-2 rounded-2xl p-4 transition-all duration-500 ${
                isHighlighted
                  ? 'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/20'
                  : hasError
                    ? 'border-red-300 dark:border-red-700'
                    : 'border-border dark:border-zinc-800'
              }`}
            >
              {/* 진행 중 오버레이 */}
              {isAffected && (
                <div className="absolute inset-0 bg-white/70 dark:bg-zinc-900/70 rounded-2xl z-10 flex items-center justify-center gap-2">
                  <Loader2 size={18} className="animate-spin text-comic-blue" />
                  <span className="text-sm font-bold text-comic-blue">{activeJob.message}</span>
                </div>
              )}
              {/* 에러 표시 */}
              {hasError && (
                <div className="mb-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">{activeJob.error}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {activeJob.type === 'merge' && (
                      <button onClick={() => { dismissJobError(); handleMerge(activeJob.affectedNos[0], activeJob.affectedNos[1]); }}
                        className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors">재시도</button>
                    )}
                    {activeJob.type === 'split' && (
                      <button onClick={() => { dismissJobError(); handleSplit(activeJob.affectedNos[0]); }}
                        className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors">재시도</button>
                    )}
                    {activeJob.type === 'regen_from' && (
                      <button onClick={() => { const fromNo = Math.min(...activeJob.affectedNos); dismissJobError(); handleOutlineRegenerate(fromNo); }}
                        className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors">재시도</button>
                    )}
                    <button onClick={dismissJobError} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                </div>
              )}
              {editingIdx === idx ? (
                /* 편집 모드 */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-sm font-bold text-comic-orange">{item.no}화</span>
                    <input
                      type="text"
                      name="outline-title"
                      autoComplete="off"
                      autoCorrect="off"
                      value={editDraft.title}
                      onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                      className="min-w-0 flex-1 px-3 py-1.5 text-sm font-bold border-2 border-comic-orange/50 rounded-lg bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:border-comic-orange focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">요약</label>
                    <textarea
                      name="outline-summary"
                      autoComplete="off"
                      autoCorrect="off"
                      value={editDraft.summary}
                      onChange={(e) => {
                        setEditDraft({ ...editDraft, summary: e.target.value });
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                      }}
                      onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                      rows={4}
                      className="w-full px-3 py-2 text-sm border-2 border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:border-comic-orange focus:outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">엔딩 훅</label>
                    <textarea
                      name="outline-hook"
                      autoComplete="off"
                      autoCorrect="off"
                      value={editDraft.hook}
                      onChange={(e) => {
                        setEditDraft({ ...editDraft, hook: e.target.value });
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                      }}
                      onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border-2 border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:border-comic-orange focus:outline-none resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancelEdit} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">취소</button>
                    <button onClick={saveEdit} className="px-4 py-1.5 text-xs font-bold bg-comic-orange text-white rounded-lg hover:-translate-y-0.5 transition-all flex items-center gap-1">
                      <Check size={12} /> 저장
                    </button>
                  </div>
                </div>
              ) : (
                /* 보기 모드 */
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-sm font-bold text-comic-orange">{item.no}화</span>
                      <h3 className="font-bold text-ink-black dark:text-white truncate">{item.title}</h3>
                    </div>
                    {/* 액션 버튼들 */}
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      <button onClick={() => startEdit(idx)} disabled={jobRunning} title="수정"
                        className="p-1 text-gray-400 hover:text-comic-blue transition-colors disabled:opacity-30">
                        <Edit3 size={14} />
                      </button>
                      {idx < outline.length - 1 && (
                        <button onClick={() => handleMerge(item.no, outline[idx + 1].no)} disabled={jobRunning} title={`${item.no}화+${item.no + 1}화 병합`}
                          className="p-1 text-gray-400 hover:text-purple-500 transition-colors disabled:opacity-30">
                          <Merge size={14} />
                        </button>
                      )}
                      <button onClick={() => handleSplit(item.no)} disabled={jobRunning} title="분할"
                        className="p-1 text-gray-400 hover:text-green-500 transition-colors disabled:opacity-30">
                        <Split size={14} />
                      </button>
                      <button onClick={() => handleDeleteItem(item.no)} disabled={jobRunning} title="삭제"
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-30">
                        <Trash2 size={14} />
                      </button>
                      <button onClick={() => handleMove(idx, -1)} disabled={jobRunning || idx === 0} title="위로"
                        className="p-1 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-20">
                        <ArrowUp size={14} />
                      </button>
                      <button onClick={() => handleMove(idx, 1)} disabled={jobRunning || idx === outline.length - 1} title="아래로"
                        className="p-1 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-20">
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-2">{item.summary}</p>
                  {item.hook && (
                    <p className="text-xs text-purple-500 dark:text-purple-400 font-bold">
                      훅: {item.hook}
                    </p>
                  )}
                  {/* 대본 생성 버튼 — 비활성 예약 */}
                  <div className="mt-3 pt-3 border-t border-border dark:border-zinc-800">
                    <button
                      disabled
                      title="다음 업데이트에서 제공"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-300 dark:text-zinc-600 border border-gray-200 dark:border-zinc-700 rounded-lg cursor-not-allowed"
                    >
                      <Lock size={12} /> 대본 생성
                      <span className="text-[10px] text-gray-300 dark:text-zinc-600 ml-1">(다음 업데이트)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
