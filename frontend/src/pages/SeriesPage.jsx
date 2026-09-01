import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { pollJob } from '../api/client';
import {
  ArrowLeft, ChevronDown, ChevronUp, RefreshCw, Plus, Trash2, X,
  Merge, Split, ArrowUp, ArrowDown, FileText, Lock, Edit3, Check, Loader2,
  ExternalLink, CheckCircle, BookOpen, Image, PenLine, AlertTriangle, User,
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

  // 수정 후 재생성 (P6)
  const [revisingIdx, setRevisingIdx] = useState(null);
  const [reviseDraft, setReviseDraft] = useState({});
  // 다음 회차 재생성 권장 배너
  const [reviseAdviceNo, setReviseAdviceNo] = useState(null);

  // from_no 재생성
  const [regenFromNo, setRegenFromNo] = useState(null);

  // 바이블 인라인 편집 (1-8)
  const [bibleEditing, setBibleEditing] = useState(false);
  const [bibleDraft, setBibleDraft] = useState({});
  const [bibleSaving, setBibleSaving] = useState(false);
  const [bibleScriptBanner, setBibleScriptBanner] = useState(null); // episodes_with_scripts 수

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
    const itemA = series.outline.find((x) => x.no === noA);
    const itemB = series.outline.find((x) => x.no === noB);
    const hasScripts = itemA?.episode_id || itemB?.episode_id;
    const msg = hasScripts
      ? `${noA}화와 ${noB}화를 합칩니다.\n기존 대본은 새 요약으로 다시 생성됩니다 (직접 수정한 내용 포함).`
      : `${noA}화와 ${noB}화를 합칩니다.\n요약이 AI로 재작성됩니다.`;
    if (!confirm(msg)) return;
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

  // ── 대본 생성 (P5) ──

  const handleGenerate = (no) => {
    const narratorLabel = getNarratorLabel();
    const narratorLine = narratorLabel ? `\n화자: ${narratorLabel}` : '';
    const msg = `${no}화 대본을 생성합니다.\n직전 회차의 캐릭터가 자동으로 연결됩니다.${narratorLine}`;
    if (!confirm(msg)) return;
    runJob(
      () => api.post(`/series/${seriesId}/episodes/${no}/generate`),
      `${no}화 대본 생성 중...`,
      'generate',
      [no],
    );
  };

  // ── 수정 후 재생성 (P6) ──

  const startRevise = (idx) => {
    const item = series.outline[idx];
    setRevisingIdx(idx);
    setReviseDraft({ title: item.title, summary: item.summary, hook: item.hook || '' });
  };

  const cancelRevise = () => {
    setRevisingIdx(null);
    setReviseDraft({});
  };

  const submitRevise = (idx) => {
    const item = series.outline[idx];
    const narratorLabel = getNarratorLabel();
    const narratorLine = narratorLabel ? `\n화자: ${narratorLabel}` : '';
    if (!confirm(`${item.no}화 대본을 새로 생성합니다.\n기존 대본은 대체됩니다 (대본에서 직접 수정한 내용 포함).${narratorLine}`)) return;

    const no = item.no;
    setRevisingIdx(null);
    setReviseDraft({});

    const apiCall = () => api.post(`/series/${seriesId}/outline/${no}/revise`, reviseDraft);

    // runJob 변형: 완료 후 next_has_script 확인
    setActiveJob({ type: 'revise', affectedNos: [no], message: `${no}화 수정 후 재생성 중...`, error: null });
    setHighlightNos([]);
    setReviseAdviceNo(null);

    (async () => {
      try {
        const { data } = await apiCall();
        await pollJob(data.job_id, null, 2000);
        await loadSeries();
        setHighlightNos([no]);
        setActiveJob(null);
        setTimeout(() => setHighlightNos([]), 2000);
        // 다음 회차 재생성 권장
        if (data.next_has_script) {
          setReviseAdviceNo(no + 1);
        }
      } catch (e) {
        const errMsg = e?.response?.data?.detail || e.message || '작업에 실패했습니다.';
        setActiveJob((prev) => prev ? { ...prev, error: errMsg } : null);
      }
    })();
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

  // ── 바이블 인라인 편집 (1-8) ──

  const startBibleEdit = () => {
    const b = series.bible || {};
    setBibleDraft({
      synopsis: b.synopsis || '',
      world: b.world || '',
      narrator: b.narrator ? { ...b.narrator } : { ref_key: '', name: '', perspective: 'third_person' },
      characters: (b.characters || []).map((c) => ({ ...c })),
    });
    setBibleEditing(true);
    setBibleScriptBanner(null);
    setBibleOpen(true);
  };

  const cancelBibleEdit = () => {
    setBibleEditing(false);
    setBibleDraft({});
  };

  const saveBibleEdit = async () => {
    setBibleSaving(true);
    try {
      const payload = {};
      if (bibleDraft.synopsis !== undefined) payload.synopsis = bibleDraft.synopsis;
      if (bibleDraft.world !== undefined) payload.world = bibleDraft.world;
      if (bibleDraft.narrator?.ref_key) payload.narrator = bibleDraft.narrator;
      if (bibleDraft.characters) payload.characters = bibleDraft.characters;
      const { data } = await api.put(`/series/${seriesId}/bible`, payload);
      setSeries(data);
      setBibleEditing(false);
      setBibleDraft({});
      if (data.episodes_with_scripts > 0) {
        setBibleScriptBanner(data.episodes_with_scripts);
      }
    } catch (e) {
      alert(e?.response?.data?.detail || '바이블 저장에 실패했습니다.');
    } finally {
      setBibleSaving(false);
    }
  };

  const updateBibleChar = (idx, field, value) => {
    const chars = [...bibleDraft.characters];
    chars[idx] = { ...chars[idx], [field]: value };
    setBibleDraft({ ...bibleDraft, characters: chars });
  };

  const addBibleChar = () => {
    const chars = [...bibleDraft.characters];
    const key = `char_${Date.now()}`;
    chars.push({ ref_key: key, name: '', role: '', description: '' });
    setBibleDraft({ ...bibleDraft, characters: chars });
  };

  const removeBibleChar = async (idx) => {
    const c = bibleDraft.characters[idx];
    // 바로 draft에서 제거 시도 — 저장 시 서버가 409 반환
    if (!confirm(`'${c.name || c.ref_key}' 인물을 삭제합니다.`)) return;
    const chars = bibleDraft.characters.filter((_, i) => i !== idx);
    setBibleDraft({ ...bibleDraft, characters: chars });
    // narrator가 삭제된 인물이면 초기화
    if (bibleDraft.narrator?.ref_key === c.ref_key) {
      setBibleDraft((prev) => ({ ...prev, narrator: { ref_key: '', name: '', perspective: 'third_person' }, characters: chars }));
    }
  };

  const selectNarrator = (refKey) => {
    const c = bibleDraft.characters.find((ch) => ch.ref_key === refKey);
    if (!c) return;
    setBibleDraft({
      ...bibleDraft,
      narrator: { ...bibleDraft.narrator, ref_key: refKey, name: c.name },
    });
  };

  const togglePerspective = () => {
    setBibleDraft({
      ...bibleDraft,
      narrator: {
        ...bibleDraft.narrator,
        perspective: bibleDraft.narrator.perspective === 'first_person' ? 'third_person' : 'first_person',
      },
    });
  };

  // 화자 표시용 헬퍼
  const getNarratorLabel = () => {
    const b = series?.bible || {};
    const n = b.narrator;
    if (!n?.ref_key) return null;
    const pLabel = n.perspective === 'first_person' ? '1인칭' : '3인칭';
    return `${n.name} (${pLabel})`;
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

      {/* narrator_missing 경고 배너 */}
      {series.narrator_missing && !bibleEditing && bible.synopsis && (
        <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500 shrink-0" />
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">화자가 지정되지 않았습니다. 대본 시점이 흔들릴 수 있어요</span>
          </div>
          <button onClick={startBibleEdit} className="text-xs font-bold text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 underline transition-colors">
            수정에서 지정하기
          </button>
        </div>
      )}

      {/* 바이블 저장 후 안내 배너 */}
      {bibleScriptBanner > 0 && (
        <div className="mb-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-xl flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm text-blue-700 dark:text-blue-400">
            대본 생성된 회차 <b>{bibleScriptBanner}개</b>는 이전 바이블 기준입니다 — <b>[수정 후 재생성]</b>으로 갱신 가능
          </span>
          <button onClick={() => setBibleScriptBanner(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
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
              {!bibleEditing && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); startBibleEdit(); }}
                    disabled={jobRunning}
                    className="text-xs font-bold text-gray-400 hover:text-comic-blue transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <Edit3 size={12} /> 수정
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleBibleRegenerate(); }}
                    disabled={jobRunning}
                    className="text-xs font-bold text-gray-400 hover:text-comic-orange transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> 전체 재생성
                  </button>
                </>
              )}
              {bibleOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </div>
          </button>

          {bibleOpen && !bibleEditing && (
            <div className="px-5 pb-4 space-y-4 border-t border-border dark:border-zinc-800">
              {/* 화자 표시 */}
              {bible.narrator?.ref_key && (
                <div className="pt-3">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">화자</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <User size={14} className="text-purple-500" />
                    <span className="font-bold">{bible.narrator.name}</span>
                    <span className="text-gray-400">({bible.narrator.perspective === 'first_person' ? '1인칭' : '3인칭'})</span>
                  </p>
                </div>
              )}
              <div className={bible.narrator?.ref_key ? '' : 'pt-3'}>
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
                        <span className="text-gray-300 dark:text-zinc-600 text-xs ml-1">[{c.ref_key}]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 편집 모드 (1-8) */}
          {bibleOpen && bibleEditing && (
            <div className="px-5 pb-4 space-y-5 border-t border-border dark:border-zinc-800">
              {/* 시놉시스 */}
              <div className="pt-3">
                <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">시놉시스</label>
                <textarea
                  value={bibleDraft.synopsis}
                  onChange={(e) => setBibleDraft({ ...bibleDraft, synopsis: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border-2 border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:border-comic-blue focus:outline-none resize-y"
                />
              </div>
              {/* 세계관 */}
              <div>
                <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">세계관</label>
                <textarea
                  value={bibleDraft.world}
                  onChange={(e) => setBibleDraft({ ...bibleDraft, world: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border-2 border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:border-comic-blue focus:outline-none resize-y"
                />
              </div>
              {/* 화자 선택 */}
              <div>
                <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">화자 (시점)</label>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mb-2">1인칭이면 대본의 '나'가 이 인물이 됩니다</p>
                <div className="space-y-2">
                  {bibleDraft.characters?.map((c) => (
                    <label key={c.ref_key} className={`flex items-center gap-3 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors ${
                      bibleDraft.narrator?.ref_key === c.ref_key
                        ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-600'
                        : 'border-border dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                    }`}>
                      <input
                        type="radio"
                        name="narrator"
                        checked={bibleDraft.narrator?.ref_key === c.ref_key}
                        onChange={() => selectNarrator(c.ref_key)}
                        className="accent-purple-500"
                      />
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{c.name || c.ref_key}</span>
                      {c.role && <span className="text-xs text-gray-400">({c.role})</span>}
                    </label>
                  ))}
                </div>
                {bibleDraft.narrator?.ref_key && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">시점:</span>
                    <button
                      type="button"
                      onClick={togglePerspective}
                      className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                        bibleDraft.narrator.perspective === 'first_person'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {bibleDraft.narrator.perspective === 'first_person' ? '1인칭' : '3인칭'}
                    </button>
                    <span className="text-xs text-gray-400">(클릭하여 전환)</span>
                  </div>
                )}
              </div>
              {/* 인물 카드 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-500 dark:text-gray-400">주요 인물</label>
                  <button onClick={addBibleChar} className="flex items-center gap-1 text-xs font-bold text-comic-blue hover:text-blue-600 transition-colors">
                    <Plus size={12} /> 인물 추가
                  </button>
                </div>
                <div className="space-y-3">
                  {bibleDraft.characters?.map((c, i) => (
                    <div key={c.ref_key} className="p-3 border-2 border-border dark:border-zinc-700 rounded-lg space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-600 bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Lock size={10} /> {c.ref_key}
                        </span>
                        <button onClick={() => removeBibleChar(i)} className="text-gray-400 hover:text-red-500 transition-colors" title="삭제">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">이름</label>
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) => updateBibleChar(i, 'name', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-border dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:border-comic-blue focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">역할</label>
                          <input
                            type="text"
                            value={c.role || ''}
                            onChange={(e) => updateBibleChar(i, 'role', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-border dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:border-comic-blue focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-0.5">설명</label>
                        <input
                          type="text"
                          value={c.description || ''}
                          onChange={(e) => updateBibleChar(i, 'description', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-border dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:border-comic-blue focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* 저장/취소 */}
              <div className="flex gap-2 justify-end pt-2 border-t border-border dark:border-zinc-800">
                <button onClick={cancelBibleEdit} disabled={bibleSaving} className="px-4 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">취소</button>
                <button
                  onClick={saveBibleEdit}
                  disabled={bibleSaving}
                  className="px-4 py-1.5 text-xs font-bold bg-comic-blue text-white rounded-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-1"
                >
                  {bibleSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {bibleSaving ? '저장 중...' : '저장'}
                </button>
              </div>
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
                    {activeJob.type === 'revise' && (
                      <button onClick={() => { const no = activeJob.affectedNos[0]; dismissJobError(); startRevise(outline.findIndex(x => x.no === no)); }}
                        className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors">다시 시도</button>
                    )}
                    <button onClick={dismissJobError} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                </div>
              )}
              {revisingIdx === idx ? (
                /* 수정 후 재생성 편집 모드 (P6) */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-sm font-bold text-comic-orange">{item.no}화</span>
                    <input
                      type="text"
                      name="revise-title"
                      autoComplete="off"
                      autoCorrect="off"
                      value={reviseDraft.title}
                      onChange={(e) => setReviseDraft({ ...reviseDraft, title: e.target.value })}
                      className="min-w-0 flex-1 px-3 py-1.5 text-sm font-bold border-2 border-comic-orange/50 rounded-lg bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:border-comic-orange focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">요약</label>
                    <textarea
                      name="revise-summary"
                      autoComplete="off"
                      autoCorrect="off"
                      value={reviseDraft.summary}
                      onChange={(e) => {
                        setReviseDraft({ ...reviseDraft, summary: e.target.value });
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
                      name="revise-hook"
                      autoComplete="off"
                      autoCorrect="off"
                      value={reviseDraft.hook}
                      onChange={(e) => {
                        setReviseDraft({ ...reviseDraft, hook: e.target.value });
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                      }}
                      onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border-2 border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 focus:border-comic-orange focus:outline-none resize-none"
                    />
                  </div>
                  <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-400">저장하면 기존 대본이 새로 생성됩니다. 대본에서 직접 수정한 내용도 대체됩니다.</p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={cancelRevise} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">취소</button>
                    <button onClick={() => submitRevise(idx)} className="px-4 py-1.5 text-xs font-bold bg-comic-orange text-white rounded-lg hover:-translate-y-0.5 transition-all flex items-center gap-1">
                      <RefreshCw size={12} /> 수정 후 재생성
                    </button>
                  </div>
                </div>
              ) : editingIdx === idx ? (
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
                      {/* 상태 뱃지 */}
                      {item.status === 'script_generating' || item.status === 'script_regenerating' ? (
                        <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                          <Loader2 size={10} className="animate-spin" /> 생성 중
                        </span>
                      ) : item.has_images ? (
                        <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                          <Image size={10} /> 이미지
                        </span>
                      ) : item.episode_id ? (
                        <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                          <PenLine size={10} /> 대본
                        </span>
                      ) : (
                        <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-500 rounded-full">
                          아웃라인
                        </span>
                      )}
                    </div>
                    {/* 액션 버튼들 */}
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      {item.has_images ? (
                        /* 이미지 완전 잠금 */
                        <span className="p-1 text-gray-300 dark:text-zinc-600 cursor-default" title="이미지가 생성된 회차는 수정·병합·분할할 수 없습니다">
                          <Lock size={14} />
                        </span>
                      ) : item.episode_id ? (
                        /* 대본 회차: 병합 허용, 분할 금지, 편집 → revise */
                        <>
                          {idx < outline.length - 1 && !outline[idx + 1]?.has_images && (
                            <button onClick={() => handleMerge(item.no, outline[idx + 1].no)} disabled={jobRunning}
                              title={`${item.no}화+${item.no + 1}화 병합 (대본 재생성)`}
                              className="p-1 text-gray-400 hover:text-purple-500 transition-colors disabled:opacity-30">
                              <Merge size={14} />
                            </button>
                          )}
                          <span className="p-1 text-gray-300 dark:text-zinc-700 cursor-default" title="대본이 있는 회차는 분할할 수 없습니다. [수정 후 재생성]으로 내용을 조정하세요.">
                            <Split size={14} />
                          </span>
                        </>
                      ) : (
                        /* 아웃라인 회차: 자유 편집 */
                        <>
                          <button onClick={() => startEdit(idx)} disabled={jobRunning} title="수정"
                            className="p-1 text-gray-400 hover:text-comic-blue transition-colors disabled:opacity-30">
                            <Edit3 size={14} />
                          </button>
                          {idx < outline.length - 1 && !outline[idx + 1]?.has_images && (
                            <button onClick={() => handleMerge(item.no, outline[idx + 1].no)} disabled={jobRunning}
                              title={`${item.no}화+${outline[idx + 1].no}화 병합`}
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
                        </>
                      )}
                      {!item.has_images && !item.episode_id && (
                        <>
                          <button onClick={() => handleMove(idx, -1)} disabled={jobRunning || idx === 0} title="위로"
                            className="p-1 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-20">
                            <ArrowUp size={14} />
                          </button>
                          <button onClick={() => handleMove(idx, 1)} disabled={jobRunning || idx === outline.length - 1} title="아래로"
                            className="p-1 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-20">
                            <ArrowDown size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-2">{item.summary}</p>
                  {item.hook && (
                    <p className="text-xs text-purple-500 dark:text-purple-400 font-bold">
                      훅: {item.hook}
                    </p>
                  )}
                  {/* 재생성 권장 배너 (P6) */}
                  {reviseAdviceNo === item.no && (
                    <div className="mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-xs text-amber-700 dark:text-amber-400 font-bold">
                        {item.no}화는 이전 {item.no - 1}화 내용을 기준으로 생성되었습니다.
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                        {item.no}화도 [수정 후 재생성]으로 갱신하는 것을 권장합니다.
                      </p>
                      <button onClick={() => setReviseAdviceNo(null)} className="mt-1 text-[10px] text-amber-500 hover:text-amber-700 transition-colors">닫기</button>
                    </div>
                  )}
                  {/* 대본 생성 / 완료 상태 */}
                  <div className="mt-3 pt-3 border-t border-border dark:border-zinc-800">
                    {item.episode_id ? (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`flex items-center gap-1.5 text-xs font-bold ${
                          item.has_images
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}>
                          <CheckCircle size={14} />
                          {item.has_images ? '이미지 생성됨' : item.status === 'script_done' ? '대본 완료' : '에피소드 생성됨'}
                        </span>
                        <div className="flex items-center gap-2">
                          {/* 수정 후 재생성 버튼 — 대본 완료 + 이미지 없음 */}
                          {!item.has_images && (
                            <button
                              onClick={() => startRevise(idx)}
                              disabled={jobRunning}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-comic-orange hover:text-white border border-comic-orange hover:bg-comic-orange rounded-lg transition-all disabled:opacity-50"
                            >
                              <RefreshCw size={12} /> 수정 후 재생성
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/projects/${series.project_id}/episodes/${item.episode_id}/workflow`)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-comic-blue hover:text-white border border-comic-blue hover:bg-comic-blue rounded-lg transition-all"
                          >
                            <ExternalLink size={12} /> 열기
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerate(item.no)}
                        disabled={jobRunning}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-comic-blue hover:bg-blue-600 rounded-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                      >
                        <BookOpen size={12} /> 대본 생성
                      </button>
                    )}
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
