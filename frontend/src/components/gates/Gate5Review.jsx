import { useState, useEffect, useRef, useCallback } from 'react';
import api, { pollJob } from '../../api/client';
import JobProgress from '../JobProgress';
import BubbleOverlay, { BubbleMiniIcon, STYLE_ORDER, STYLE_LABELS } from '../BubbleOverlay';
import { resolveBubbleStyle } from '../../utils/bubbleMapping';
import { Image, RefreshCw, RotateCcw, Download, Check, AlertTriangle, MessageSquare, Save, X, ZoomIn, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import CutEditor from '../CutEditor';
import SfxLayer from '../SfxLayer';
import ExportProgressModal from '../ExportProgressModal';
import { exportAsPNGZip, exportAsVertical, exportAsInstagram, exportAsA4Single, exportAsA4Grid } from '../../utils/exportRenderer';

// ── 그리드 컷 카드: 이미지 + SVG 말풍선 오버레이 ──
function CutImageWithBubbles({ cut, imageUrl, onZoom }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const handleImageLoad = useCallback((e) => {
    const el = containerRef.current;
    if (el) setDims({ w: el.offsetWidth, h: el.offsetHeight });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el && el.offsetWidth > 0) setDims({ w: el.offsetWidth, h: el.offsetHeight });
  }, []);

  return (
    <div ref={containerRef} className="relative aspect-square bg-gray-100 dark:bg-zinc-800 group/img overflow-hidden">
      <img
        src={imageUrl}
        alt={`컷 ${cut.cut_number}`}
        className={`w-full h-full object-cover ${cut.status === 'invalidated' ? 'opacity-50' : ''}`}
        onLoad={handleImageLoad}
      />
      {/* SVG 말풍선 오버레이 */}
      {dims.w > 0 && cut.dialogue && cut.dialogue.length > 0 && (
        <BubbleOverlay
          dialogue={cut.dialogue}
          characters={cut.characters || []}
          width={dims.w}
          height={dims.h}
        />
      )}
      {/* SVG 효과음 오버레이 */}
      {dims.w > 0 && (
        <SfxLayer sfxItems={cut.sfx_items} width={dims.w} height={dims.h} />
      )}
      {/* 확대 미리보기 오버레이 */}
      <button
        onClick={onZoom}
        className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/30 transition-colors cursor-zoom-in"
      >
        <ZoomIn size={28} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-lg" />
      </button>
      {cut.status === 'invalidated' && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-900/20 pointer-events-none">
          <span className="bg-amber-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 font-bold">
            <AlertTriangle size={10} /> 재생성 필요
          </span>
        </div>
      )}
      <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full font-bold pointer-events-none">
        #{cut.cut_number}
      </div>
      {cut.dialogue && cut.dialogue.length > 0 && (
        <div className="absolute top-1 right-1 bg-purple-600/80 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold pointer-events-none">
          말풍선
        </div>
      )}
    </div>
  );
}

// ── 라이트박스: 이미지 + SVG 말풍선 오버레이 ──
function LightboxImageWithBubbles({ cut, imgSrc }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const handleImageLoad = useCallback((e) => {
    const img = e.target;
    setDims({ w: img.clientWidth, h: img.clientHeight });
  }, []);

  return (
    <div ref={containerRef} className="relative inline-block">
      <img
        src={imgSrc}
        alt={`컷 ${cut.cut_number} 미리보기`}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
        onLoad={handleImageLoad}
      />
      {dims.w > 0 && cut.dialogue && cut.dialogue.length > 0 && (
        <BubbleOverlay
          dialogue={cut.dialogue}
          characters={cut.characters || []}
          width={dims.w}
          height={dims.h}
        />
      )}
      {dims.w > 0 && (
        <SfxLayer sfxItems={cut.sfx_items} width={dims.w} height={dims.h} />
      )}
    </div>
  );
}

export default function Gate5Review({ projectId, episodeId, onRefresh }) {
  const [cuts, setCuts] = useState([]);
  const [job, setJob] = useState(null);
  const [selectedCut, setSelectedCut] = useState(null);
  const [editingDialogue, setEditingDialogue] = useState(null); // { cutId, dialogue }
  const [savingDialogue, setSavingDialogue] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [exportModal, setExportModal] = useState(null); // { state, done, total, format, error }
  const exportAbortRef = useRef(null);
  const [a4Mode, setA4Mode] = useState(null); // null | 'grid' (dropdown open)
  const [partialResult, setPartialResult] = useState(null); // { done, total, failed: [cut_id...] }
  const [previewIndex, setPreviewIndex] = useState(null); // 라이트박스 미리보기 인덱스
  const [editCutIndex, setEditCutIndex] = useState(null); // CutEditor 편집 인덱스

  const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';

  const imageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}?v=${cacheBuster}`;
  };

  const loadCuts = async () => {
    const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/cuts`);
    setCuts(data);
  };

  useEffect(() => { loadCuts(); }, []);

  // 게이트4 승인 후 자동 이미지 생성
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (cuts.length > 0 && !autoTriggered.current && !job) {
      const hasAnyImage = cuts.some(c => c.image_url);
      if (!hasAnyImage) {
        autoTriggered.current = true;
        handleGenerateAll().catch(() => {}); // 400 등 에러 무시 (이미 handleGenerateAll 내부에서 처리)
      }
    }
  }, [cuts]);

  const handleGenerateAll = async () => {
    setError('');
    setPartialResult(null);
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/generate`);
      setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: data.total_cuts } });
      const result = await pollJob(data.job_id, setJob);
      setJob(null);
      setCacheBuster(Date.now());
      await loadCuts();
      // 부분 실패 처리
      if (result?.status === 'completed_partial' && result?.failed?.length > 0) {
        setPartialResult({
          done: result.progress?.done || 0,
          total: result.progress?.total || 0,
          failed: result.failed,
        });
      }
    } catch (err) {
      setJob(null);
      const msg = err.response?.data?.detail || err.message;
      if (msg === 'Network Error') {
        setError('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError(msg);
      }
    }
  };

  const handleRegenerate = async (cutId) => {
    setError('');
    setPartialResult(null);
    try {
      const { data } = await api.post(`/cuts/${cutId}/regenerate`, { mode: 'reseed' });
      setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: 1 } });
      await pollJob(data.job_id, setJob);
      setJob(null);
      setCacheBuster(Date.now());
      await loadCuts();
    } catch (err) {
      setJob(null);
      const msg = err.response?.data?.detail || err.message;
      if (msg === 'Network Error') {
        setError('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError(msg);
      }
    }
  };

  const handleRevert = async (cutId) => {
    try {
      await api.post(`/cuts/${cutId}/revert`);
      setCacheBuster(Date.now());
      await loadCuts();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleExport = async (format, extraArg) => {
    const abortCtrl = new AbortController();
    exportAbortRef.current = abortCtrl;
    const total = cuts.filter(c => c.image_url).length;
    setExportModal({ state: 'running', done: 0, total, format, error: null });
    setExporting(true);

    const getUrl = (cut) => imageUrl(getCutImageUrl(cut));
    const onProgress = (done) => setExportModal(prev => prev ? { ...prev, done } : prev);
    const opts = { onProgress, signal: abortCtrl.signal };

    try {
      let blob;
      if (format === 'png_cuts') {
        blob = await exportAsPNGZip(cuts, [], getUrl, opts);
      } else if (format === 'vertical_single') {
        blob = await exportAsVertical(cuts, [], getUrl, opts);
      } else if (format === 'instagram_carousel') {
        blob = await exportAsInstagram(cuts, [], getUrl, opts);
      } else if (format === 'a4_single') {
        blob = await exportAsA4Single(extraArg, [], getUrl, opts);
      } else if (format === 'a4_grid') {
        blob = await exportAsA4Grid(cuts, [], getUrl, opts);
      }

      if (blob) {
        const ext = (format === 'vertical_single' || format === 'a4_single') ? 'png'
          : (format === 'a4_grid' && cuts.filter(c => c.image_url).length <= 12) ? 'png'
          : 'zip';
        const filename = `episode_${episodeId}_${format}.${ext}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setExportModal(prev => prev ? { ...prev, state: 'done' } : prev);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setExportModal(prev => prev ? { ...prev, state: 'cancelled' } : prev);
      } else {
        setExportModal(prev => prev ? { ...prev, state: 'error', error: err.message } : prev);
      }
    } finally {
      setExporting(false);
      exportAbortRef.current = null;
    }
  };

  const [editingCut, setEditingCut] = useState(null); // 팔레트에서 캐릭터 감정 참조용

  const openDialogueEditor = (cut) => {
    setEditingCut(cut);
    setEditingDialogue({
      cutId: cut.cut_id,
      dialogue: (cut.dialogue || []).map(d => ({ ...d })),
    });
    setOpenPaletteIndex(null);
  };

  const updateDialogueText = (index, newText) => {
    setEditingDialogue(prev => {
      const updated = [...prev.dialogue];
      updated[index] = { ...updated[index], text: newText };
      return { ...prev, dialogue: updated };
    });
  };

  const updateDialogueBubbleStyle = (index, styleKey) => {
    setEditingDialogue(prev => {
      const updated = [...prev.dialogue];
      // null = 자동 매핑으로 되돌림
      updated[index] = { ...updated[index], bubble_style: styleKey };
      return { ...prev, dialogue: updated };
    });
  };

  const [openPaletteIndex, setOpenPaletteIndex] = useState(null);

  const saveDialogue = async () => {
    if (!editingDialogue) return;
    setSavingDialogue(true);
    try {
      await api.put(`/cuts/${editingDialogue.cutId}/dialogue`, {
        dialogue: editingDialogue.dialogue,
      });
      setCacheBuster(Date.now());
      await loadCuts();
      setEditingDialogue(null);
      setEditingCut(null);
      setOpenPaletteIndex(null);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSavingDialogue(false);
    }
  };

  // ── 캐릭터 이름 맵 (ref_key → 한글 이름) ──
  const [charNameMap, setCharNameMap] = useState({});
  useEffect(() => {
    api.get(`/projects/${projectId}/episodes/${episodeId}/characters`)
      .then(({ data }) => {
        const map = {};
        data.forEach(c => { if (c.ref_key && c.name) map[c.ref_key] = c.name; });
        setCharNameMap(map);
      })
      .catch(() => {});
  }, [projectId, episodeId]);

  const pendingCuts = cuts.filter(c => c.status === 'pending' || c.status === 'invalidated');
  const hasImages = cuts.some(c => c.image_url);

  const dialogueTypeLabel = { speech: '대사', narration: '나레이션', thought: '독백', sfx: '효과음' };

  // ── B. 영문 → 한글 표시 매핑 ──
  const shotLabel = { long: '롱샷', full: '풀샷', bust: '바스트샷', close_up: '클로즈업' };
  const getCharName = (c) => {
    const id = typeof c === 'string' ? c : c.character_id;
    return charNameMap[id] || id;
  };

  // SVG 오버레이 방식: raw 이미지 + BubbleOverlay (코드로 말풍선 렌더링)
  const getCutImageUrl = (cut) => {
    return cut.image_url;
  };

  return (
    <div className="space-y-4">
      {job && <JobProgress job={job} label="이미지 생성" />}

      <div className="bg-white dark:bg-surface-dark border-2 border-border dark:border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
            <Image size={20} className="text-indigo-500" /> 게이트 5 — 이미지 검수
          </h2>
          <div className="flex gap-2">
            {pendingCuts.length > 0 && (
              <button
                onClick={handleGenerateAll}
                disabled={!!job}
                className="flex items-center gap-1 px-4 py-2 bg-ink-black dark:bg-white dark:text-ink-black text-white rounded-full text-xs font-bold hover:bg-comic-blue dark:hover:bg-comic-orange hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Image size={12} /> {pendingCuts.length}컷 생성
              </button>
            )}
            {hasImages && (
              <div className="flex gap-1">
                <button
                  onClick={() => handleExport('vertical_single')}
                  disabled={exporting}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Download size={12} /> 세로
                </button>
                <button
                  onClick={() => handleExport('instagram_carousel')}
                  disabled={exporting}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Download size={12} /> 인스타
                </button>
                <button
                  onClick={() => handleExport('png_cuts')}
                  disabled={exporting}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Download size={12} /> PNG
                </button>
                <div className="relative">
                  <button
                    onClick={() => setA4Mode(a4Mode ? null : 'grid')}
                    disabled={exporting}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Download size={12} /> A4
                  </button>
                  {a4Mode && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-800 border-2 border-border dark:border-zinc-600 rounded-xl shadow-lg p-3 w-56">
                      <div className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">A4 인쇄용 내보내기</div>
                      <button
                        onClick={() => { setA4Mode(null); handleExport('a4_grid'); }}
                        className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        📄 그리드 (4×3)
                      </button>
                      <div className="mt-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1">한 컷 크게:</div>
                        <div className="max-h-32 overflow-y-auto">
                          {cuts.filter(c => c.image_url).map(c => (
                            <button
                              key={c.cut_id}
                              onClick={() => { setA4Mode(null); handleExport('a4_single', c); }}
                              className="w-full text-left px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                            >
                              #{c.cut_number}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => setA4Mode(null)}
                        className="w-full mt-2 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        닫기
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-red-500 dark:text-red-400 text-sm font-bold mb-3">{error}</p>}

        {partialResult && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-2xl p-4 mb-3">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle size={14} />
              {partialResult.done - partialResult.failed.length}/{partialResult.total} 완료 ({partialResult.failed.length}컷 실패)
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
              실패한 컷은 아래에서 개별 재생성할 수 있습니다.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {cuts.map((cut) => (
            <div
              key={cut.cut_id}
              className={`border-2 rounded-2xl overflow-hidden group transition ${
                cut.status === 'invalidated' ? 'border-amber-300 dark:border-amber-600' : 'border-border dark:border-zinc-700'
              }`}
            >
              {getCutImageUrl(cut) ? (
                <CutImageWithBubbles
                  cut={cut}
                  imageUrl={imageUrl(getCutImageUrl(cut))}
                  onZoom={(e) => { e.stopPropagation(); setPreviewIndex(cuts.indexOf(cut)); }}
                />
              ) : (
                <div className="aspect-square bg-gray-50 dark:bg-zinc-800 flex items-center justify-center">
                  <div className="text-center text-gray-300 dark:text-zinc-600">
                    <Image size={32} className="mx-auto mb-1" />
                    <span className="text-xs font-bold">#{cut.cut_number}</span>
                  </div>
                </div>
              )}

              <div className="p-2">
                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5">
                  {shotLabel[cut.shot] || cut.shot} · {cut.characters?.map(c => getCharName(c)).join(', ')}
                </div>
                {cut.image_url && (
                  <div className="flex gap-1 flex-wrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRegenerate(cut.cut_id); }}
                      disabled={!!job}
                      title="재생성"
                      className="flex items-center gap-1 px-2 py-1 bg-comic-blue/10 text-comic-blue rounded-full font-bold shadow-sm hover:bg-comic-blue/20 text-[11px] disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw size={11} /> 재생성
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRevert(cut.cut_id); }}
                      title="되돌리기"
                      className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded-full font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-zinc-700 text-[11px] transition-colors"
                    >
                      <RotateCcw size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditCutIndex(cuts.indexOf(cut)); }}
                      title="컷 편집"
                      className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full font-bold shadow-sm hover:bg-purple-200 dark:hover:bg-purple-900/50 text-[11px] transition-colors"
                    >
                      <Pencil size={11} /> 편집
                    </button>
                    {cut.dialogue && cut.dialogue.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openDialogueEditor(cut); }}
                        title="대사 편집"
                        className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded-full font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-zinc-700 text-[11px] transition-colors"
                      >
                        <MessageSquare size={11} /> 대사
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 이미지 라이트박스 모달 */}
      {previewIndex !== null && cuts[previewIndex] && (() => {
        const cut = cuts[previewIndex];
        const imgSrc = imageUrl(getCutImageUrl(cut));
        const hasPrev = previewIndex > 0;
        const hasNext = previewIndex < cuts.length - 1;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setPreviewIndex(null)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPreviewIndex(null);
              if (e.key === 'ArrowLeft' && hasPrev) setPreviewIndex(previewIndex - 1);
              if (e.key === 'ArrowRight' && hasNext) setPreviewIndex(previewIndex + 1);
            }}
            tabIndex={0}
            ref={(el) => el?.focus()}
          >
            {/* 닫기 */}
            <button
              onClick={() => setPreviewIndex(null)}
              className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
            >
              <X size={24} />
            </button>

            {/* 컷 번호 */}
            <div className="absolute top-4 left-4 bg-black/50 text-white text-sm px-3 py-1.5 rounded-full font-bold z-10">
              #{cut.cut_number} / {cuts.length}
            </div>

            {/* 이전 */}
            {hasPrev && (
              <button
                onClick={(e) => { e.stopPropagation(); setPreviewIndex(previewIndex - 1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            {/* 다음 */}
            {hasNext && (
              <button
                onClick={(e) => { e.stopPropagation(); setPreviewIndex(previewIndex + 1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
              >
                <ChevronRight size={28} />
              </button>
            )}

            {/* 이미지 + 말풍선 SVG 오버레이 */}
            <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              <LightboxImageWithBubbles cut={cut} imgSrc={imgSrc} />
            </div>

            {/* 하단 정보 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 text-white text-xs px-4 py-2 rounded-full font-bold z-10">
              <span>{shotLabel[cut.shot] || cut.shot}</span>
              <span className="text-white/50">·</span>
              <span>{cut.characters?.map(c => getCharName(c)).join(', ')}</span>
              {cut.dialogue && cut.dialogue.length > 0 && (
                <>
                  <span className="text-white/50">·</span>
                  <span className="text-purple-300">말풍선 {cut.dialogue.length}개</span>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* 대사 편집 모달 */}
      {editingDialogue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditingDialogue(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-2xl border-2 border-border dark:border-zinc-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
                <MessageSquare size={18} className="text-purple-500" /> 대사 편집
              </h3>
              <button onClick={() => setEditingDialogue(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">대사를 수정하면 이미지 재생성 없이 말풍선만 다시 합성됩니다 (무료).</p>

            <div className="space-y-3">
              {editingDialogue.dialogue.map((d, i) => {
                const currentStyle = d.bubble_style || resolveBubbleStyle(d, editingCut?.characters || []);
                const isAuto = !d.bubble_style;
                return (
                  <div key={i} className="border border-border dark:border-zinc-700 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        d.type === 'speech' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        d.type === 'narration' ? 'bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-gray-300' :
                        'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {dialogueTypeLabel[d.type] || d.type}
                      </span>
                      {d.speaker && <span className="text-xs font-bold text-gray-600 dark:text-gray-400">{d.speaker}</span>}
                      <div className="ml-auto relative">
                        {d.type === 'narration' ? (
                          <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 dark:bg-zinc-700 text-gray-400 dark:text-gray-500 rounded-lg">
                            자막
                          </span>
                        ) : (
                        <button
                          type="button"
                          onClick={() => setOpenPaletteIndex(openPaletteIndex === i ? null : i)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                            isAuto
                              ? 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-600'
                              : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                          }`}
                          title="말풍선 스타일 변경"
                        >
                          <BubbleMiniIcon styleKey={currentStyle} size={20} />
                          <span>{isAuto ? '자동' : STYLE_LABELS[currentStyle]}</span>
                        </button>
                        )}
                        {/* 말풍선 아이콘 팔레트 (narration 제외) */}
                        {openPaletteIndex === i && d.type !== 'narration' && (
                          <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-zinc-800 border-2 border-border dark:border-zinc-600 rounded-2xl p-3 shadow-xl min-w-[280px]">
                            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-2">기본</div>
                            <div className="grid grid-cols-4 gap-1 mb-2">
                              {STYLE_ORDER.filter(sk => sk !== 'narration').slice(0, 3).map(sk => (
                                <BubbleMiniIcon
                                  key={sk}
                                  styleKey={sk}
                                  size={28}
                                  selected={currentStyle === sk}
                                  onClick={() => { updateDialogueBubbleStyle(i, sk); setOpenPaletteIndex(null); }}
                                />
                              ))}
                            </div>
                            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-2">감정</div>
                            <div className="grid grid-cols-4 gap-1 mb-2">
                              {STYLE_ORDER.slice(4).map(sk => (
                                <BubbleMiniIcon
                                  key={sk}
                                  styleKey={sk}
                                  size={28}
                                  selected={currentStyle === sk}
                                  onClick={() => { updateDialogueBubbleStyle(i, sk); setOpenPaletteIndex(null); }}
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => { updateDialogueBubbleStyle(i, null); setOpenPaletteIndex(null); }}
                              className={`w-full text-center text-[10px] font-bold px-2 py-1.5 rounded-lg transition-colors ${
                                isAuto
                                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                                  : 'bg-gray-100 dark:bg-zinc-700 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              자동 (감정 기반)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={d.text}
                      onChange={e => updateDialogueText(i, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-border dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-ink-black dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                      rows={2}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setEditingDialogue(null)}
                className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full"
              >
                취소
              </button>
              <button
                onClick={saveDialogue}
                disabled={savingDialogue}
                className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded-full text-sm font-bold hover:bg-purple-700 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Save size={14} /> {savingDialogue ? '저장 중...' : '저장 (재조판)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CutEditor 전체화면 편집 모달 */}
      {editCutIndex !== null && cuts[editCutIndex] && (() => {
        const cut = cuts[editCutIndex];
        const hasPrev = editCutIndex > 0 && cuts[editCutIndex - 1]?.image_url;
        const hasNext = editCutIndex < cuts.length - 1 && cuts[editCutIndex + 1]?.image_url;
        return (
          <CutEditor
            cut={{ ...cut, dialogue: cut.dialogue || [], sfx_items: cut.sfx_items || [] }}
            imageUrl={imageUrl(getCutImageUrl(cut))}
            characters={cut.characters || []}
            charNameMap={charNameMap}
            onClose={() => setEditCutIndex(null)}
            onSave={async () => {
              setCacheBuster(Date.now());
              await loadCuts();
            }}
            onPrev={hasPrev ? () => setEditCutIndex(editCutIndex - 1) : null}
            onNext={hasNext ? () => setEditCutIndex(editCutIndex + 1) : null}
            cutIndex={editCutIndex + 1}
            totalCuts={cuts.length}
          />
        );
      })()}

      {/* Export 진행 모달 */}
      {exportModal && (
        <ExportProgressModal
          state={exportModal.state}
          done={exportModal.done}
          total={exportModal.total}
          format={exportModal.format}
          error={exportModal.error}
          onCancel={() => { exportAbortRef.current?.abort(); }}
          onRetry={() => { setExportModal(null); handleExport(exportModal.format); }}
          onClose={() => setExportModal(null)}
        />
      )}
    </div>
  );
}
