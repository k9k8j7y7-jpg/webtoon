import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api, { pollJob } from '../../api/client';
import JobProgress from '../JobProgress';
import BubbleOverlay, { BubbleMiniIcon, STYLE_ORDER, STYLE_LABELS } from '../BubbleOverlay';
import { resolveBubbleStyle } from '../../utils/bubbleMapping';
import { Image, RefreshCw, RotateCcw, Download, Check, AlertTriangle, MessageSquare, Save, X, ZoomIn, ChevronLeft, ChevronRight, ChevronDown, Pencil, SlidersHorizontal, ExternalLink, LayoutGrid, Share2, Film, Clapperboard, Play, Trash2 } from 'lucide-react';
import MotionModal from '../MotionModal';
import MotionPicker from '../MotionPicker';
import ReelModal from '../ReelModal';
import CutEditor from '../CutEditor';
import SfxLayer from '../SfxLayer';
import EffectLayer from '../EffectLayer';
import ProductLayer from '../ProductLayer';
import { locationName, locationOptionLabel, characterName } from '../../utils/refNames';
import PngBubbleLayer from '../PngBubbleLayer';
import ExportProgressModal from '../ExportProgressModal';
import { exportAsPNGZip, exportAsVertical, exportAsInstagram, exportAsA4Single, exportAsA4Grid } from '../../utils/exportRenderer';
import useGateLoad from '../../hooks/useGateLoad';
import { GateSkeleton, GateLoadError } from '../GateLoadFallback';
import { PAGE_FORMATS } from '../../utils/pageFormats';
import PublishBar from '../PublishBar';
import InstaShareModal from '../InstaShareModal';
import { useAuth } from '../../contexts/AuthContext';

// ── 그리드 컷 카드: 이미지 + SVG 말풍선 오버레이 ──
// 에피소드 비율 "9:16" → CSS aspect-ratio "9 / 16" (미설정 = 기존 에피소드 1:1)
const cssAspect = (ratio) => (ratio || '1:1').replace(':', ' / ');

function CutImageWithBubbles({ cut, imageUrl, onZoom, products, aspectRatio, resolveUrl }) {
  const containerRef = useRef(null);
  const mediaRef = useRef(null);
  const [videoError, setVideoError] = useState(false);
  // 오버레이 박스 = 틀 안에 object-contain으로 실제 그려진 이미지 영역 (틀과 이미지 비율이 달라도 말풍선 위치 정합)
  const [dims, setDims] = useState({ w: 0, h: 0, x: 0, y: 0 });

  // 모션 영상 판정
  const motion = cut.motion || {};
  const selectedCandidate = motion.selected && (motion.candidates || []).find(c => c.id === motion.selected);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const videoSrc = selectedCandidate?.path && !reducedMotion && !videoError
    ? (resolveUrl ? resolveUrl(selectedCandidate.path) : `${(typeof window !== 'undefined' && (import.meta.env.VITE_API_URL || '/WEBTOON')) || '/WEBTOON'}${selectedCandidate.path}`)
    : null;

  const measure = useCallback(() => {
    const el = containerRef.current;
    const m = mediaRef.current;
    if (!el || !m) return;
    const nw = m.naturalWidth || m.videoWidth || 0;
    const nh = m.naturalHeight || m.videoHeight || 0;
    if (!nw) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    const scale = Math.min(cw / nw, ch / nh);
    const w = nw * scale, h = nh * scale;
    setDims({ w, h, x: (cw - w) / 2, y: (ch - h) / 2 });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [measure]);

  return (
    <div ref={containerRef} className="relative bg-gray-100 dark:bg-zinc-800 group/img overflow-hidden" style={{ aspectRatio: cssAspect(aspectRatio) }}>
      {videoSrc ? (
        <video
          ref={mediaRef}
          src={videoSrc}
          poster={imageUrl}
          autoPlay muted loop playsInline
          preload="metadata"
          className={`w-full h-full object-contain ${cut.status === 'invalidated' ? 'opacity-50' : ''}`}
          onLoadedMetadata={measure}
          onError={() => setVideoError(true)}
        />
      ) : (
        <img
          ref={mediaRef}
          src={imageUrl}
          alt={`컷 ${cut.cut_number}`}
          className={`w-full h-full object-contain ${cut.status === 'invalidated' ? 'opacity-50' : ''}`}
          onLoad={measure}
        />
      )}
      <div className="absolute pointer-events-none" style={{ left: dims.x, top: dims.y, width: dims.w, height: dims.h }}>
      {/* 제품 오버레이 */}
      {dims.w > 0 && products?.length > 0 && (
        <ProductLayer productItems={cut.product_items} products={products} width={dims.w} height={dims.h} />
      )}
      {/* 배경효과 오버레이 */}
      {dims.w > 0 && (
        <EffectLayer effectItems={cut.effect_items} width={dims.w} height={dims.h} />
      )}
      {/* SVG 말풍선 오버레이 */}
      {dims.w > 0 && cut.dialogue && cut.dialogue.length > 0 && (
        <BubbleOverlay
          dialogue={cut.dialogue}
          characters={cut.characters || []}
          width={dims.w}
          height={dims.h}
        />
      )}
      {/* PNG 말풍선 오버레이 */}
      {dims.w > 0 && (
        <PngBubbleLayer pngbubbleItems={cut.pngbubble_items} width={dims.w} height={dims.h} />
      )}
      {/* SVG 효과음 오버레이 */}
      {dims.w > 0 && (
        <SfxLayer sfxItems={cut.sfx_items} width={dims.w} height={dims.h} />
      )}
      </div>
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
      {cut.has_product && (
        <div className="absolute bottom-1 left-1 bg-amber-500/80 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold pointer-events-none">
          📦 제품
        </div>
      )}
    </div>
  );
}

// ── 라이트박스: 이미지 + SVG 말풍선 오버레이 ──
function LightboxImageWithBubbles({ cut, imgSrc, products, resolveUrl }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [videoError, setVideoError] = useState(false);

  const handleMediaLoad = useCallback((e) => {
    const m = e.target;
    setDims({ w: m.clientWidth, h: m.clientHeight });
  }, []);

  const motion = cut.motion || {};
  const sel = motion.selected && (motion.candidates || []).find(c => c.id === motion.selected);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const videoSrc = sel?.path && !reducedMotion && !videoError && resolveUrl ? resolveUrl(sel.path) : null;

  return (
    <div ref={containerRef} className="relative inline-block">
      {videoSrc ? (
        <video
          src={videoSrc}
          poster={imgSrc}
          autoPlay muted loop playsInline preload="metadata"
          className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          onLoadedMetadata={handleMediaLoad}
          onError={() => setVideoError(true)}
        />
      ) : (
        <img
          src={imgSrc}
          alt={`컷 ${cut.cut_number} 미리보기`}
          className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          onLoad={handleMediaLoad}
        />
      )}
      {dims.w > 0 && products?.length > 0 && (
        <ProductLayer productItems={cut.product_items} products={products} width={dims.w} height={dims.h} />
      )}
      {dims.w > 0 && (
        <EffectLayer effectItems={cut.effect_items} width={dims.w} height={dims.h} />
      )}
      {dims.w > 0 && cut.dialogue && cut.dialogue.length > 0 && (
        <BubbleOverlay
          dialogue={cut.dialogue}
          characters={cut.characters || []}
          width={dims.w}
          height={dims.h}
        />
      )}
      {dims.w > 0 && (
        <PngBubbleLayer pngbubbleItems={cut.pngbubble_items} width={dims.w} height={dims.h} />
      )}
      {dims.w > 0 && (
        <SfxLayer sfxItems={cut.sfx_items} width={dims.w} height={dims.h} />
      )}
    </div>
  );
}

export default function Gate5Review({ projectId, episodeId, onRefresh, gateStatus }) {
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
  const [products, setProducts] = useState([]); // 광고 제품 목록
  const [pagePreview, setPagePreview] = useState(false); // 페이지 미리보기 토글
  const [instaShareOpen, setInstaShareOpen] = useState(false);
  const [epMeta, setEpMeta] = useState(null); // { title, is_public, share_token }
  const { user } = useAuth();
  const [motionModalCut, setMotionModalCut] = useState(null);
  const [motionPickerCut, setMotionPickerCut] = useState(null);
  const [motionJobs, setMotionJobs] = useState({});
  const [characters, setCharacters] = useState([]);
  const [reelModalOpen, setReelModalOpen] = useState(false);
  const [reelStatus, setReelStatus] = useState(null); // {status, path, is_stale, ...}
  const [reelJob, setReelJob] = useState(null); // job_id
  const [reelDropdown, setReelDropdown] = useState(false);
  const [reelPreview, setReelPreview] = useState(false); // 미리보기 모달

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

  const loadProducts = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/products`);
      setProducts(data);
    } catch { /* 광고 아니면 404 — 무시 */ }
  };

  const loadEpMeta = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}`);
      setEpMeta({ title: data.title, is_public: data.is_public, share_token: data.share_token });
    } catch { /* PublishBar가 별도 호출하므로 실패해도 무관 */ }
  };

  const loadCharacters = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/characters`);
      setCharacters(data);
    } catch { /* 무시 */ }
  };

  const [autoStoryboarding, setAutoStoryboarding] = useState(false);

  const loadAllData = async () => {
    const { data: cutsData } = await api.get(`/projects/${projectId}/episodes/${episodeId}/cuts`);
    setCuts(cutsData);

    // onecut_ad: cuts=0이면 자동 콘티 생성 (gate4에서 빠진 경우 방지)
    const purpose = gateStatus?.purpose;
    if (purpose === 'onecut_ad' && cutsData.length === 0) {
      setAutoStoryboarding(true);
      try {
        await api.post(`/projects/${projectId}/episodes/${episodeId}/storyboard`, { target_cut_count: 1 });
        await api.post(`/projects/${projectId}/episodes/${episodeId}/storyboard/approve`);
        const { data: refreshed } = await api.get(`/projects/${projectId}/episodes/${episodeId}/cuts`);
        setCuts(refreshed);
      } catch (e) { console.error('auto storyboard failed:', e); }
      finally { setAutoStoryboarding(false); }
    }

    loadProducts();
    loadEpMeta();
    loadCharacters();
  };

  const { loading: initialLoading, error: loadError, retry: retryLoad } = useGateLoad(loadAllData);

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

  // 폴링 중 서버 재시작으로 job을 잃었으면(404) 안내 후 컷 목록 재조회 — 생성 자체는 끝까지 진행됐을 수 있음
  const recoverLostJob = async (err) => {
    if (!err?.jobLost) return false;
    setJob(null);
    setError(err.message);
    setCacheBuster(Date.now());
    try {
      await loadCuts();
    } catch { /* 재조회 실패는 안내 문구로 충분 */ }
    window.dispatchEvent(new Event('packets:refresh'));
    return true;
  };

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
      window.dispatchEvent(new Event('packets:refresh'));
      // 부분 실패 처리
      if (result?.status === 'completed_partial' && result?.failed?.length > 0) {
        setPartialResult({
          done: result.progress?.done || 0,
          total: result.progress?.total || 0,
          failed: result.failed,
        });
      }
    } catch (err) {
      if (await recoverLostJob(err)) return;
      setJob(null);
      const detail = err.response?.data?.detail;
      if (err.response?.status === 402 && detail?.message) {
        setError(`${detail.message} (잔량 ${detail.balance}, 필요 ${detail.needed})`);
      } else {
        setError('생성이 잠시 지연되고 있어요. 다시 시도해 주세요. (패킷은 차감되지 않았습니다)');
      }
    }
  };

  const handleRegenerate = async (cutId, dramaLevel) => {
    setError('');
    setPartialResult(null);
    try {
      const body = { mode: 'reseed' };
      if (dramaLevel) body.params = { drama_level: dramaLevel };
      const { data } = await api.post(`/cuts/${cutId}/regenerate`, body);
      setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: 1 } });
      await pollJob(data.job_id, setJob);
      setJob(null);
      setCacheBuster(Date.now());
      await loadCuts();
      window.dispatchEvent(new Event('packets:refresh'));
    } catch (err) {
      if (await recoverLostJob(err)) return;
      setJob(null);
      const detail = err.response?.data?.detail;
      if (err.response?.status === 402 && detail?.message) {
        setError(`${detail.message} (잔량 ${detail.balance}, 필요 ${detail.needed})`);
      } else {
        setError('생성이 잠시 지연되고 있어요. 다시 시도해 주세요. (패킷은 차감되지 않았습니다)');
      }
    }
  };

  const handleClearDramaOverride = async (cutId) => {
    try {
      await api.delete(`/cuts/${cutId}/drama-level`);
      await loadCuts();
    } catch { /* ignore */ }
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
    // 페이지 형식 전달 (vertical이면 null → 현행 경로)
    const pf = gateStatus?.page_format || 'vertical';
    const pfObj = PAGE_FORMATS[pf];
    const pfOpt = (pfObj && pfObj.per_page) ? pfObj : null;
    const opts = { onProgress, signal: abortCtrl.signal, products, pageFormat: pfOpt };

    try {
      let blob;
      if (format === 'png_cuts') {
        blob = await exportAsPNGZip(cuts, [], getUrl, opts);
      } else if (format === 'vertical_single') {
        blob = await exportAsVertical(cuts, [], getUrl, opts);
      } else if (format === 'instagram_carousel') {
        blob = await exportAsInstagram(cuts, [], getUrl, { ...opts, nickname: user?.nickname });
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

  // ── 캐릭터 이름 맵 (ref_key → 한글 이름) + 전체 목록 ──
  const [charNameMap, setCharNameMap] = useState({});
  const [episodeCharacters, setEpisodeCharacters] = useState([]);
  useEffect(() => {
    api.get(`/projects/${projectId}/episodes/${episodeId}/characters`)
      .then(({ data }) => {
        const map = {};
        data.forEach(c => { if (c.ref_key && c.name) map[c.ref_key] = c.name; });
        setCharNameMap(map);
        setEpisodeCharacters(data);
      })
      .catch(() => {});
  }, [projectId, episodeId]);

  // ── 장소 목록 (콘티 수정 모달 드롭다운용) ──
  const [episodeLocations, setEpisodeLocations] = useState([]);
  useEffect(() => {
    api.get(`/projects/${projectId}/episodes/${episodeId}/locations`)
      .then(({ data }) => setEpisodeLocations(data))
      .catch(() => {});
  }, [projectId, episodeId]);

  // ── 콘티 수정 모달 ──
  const [storyboardEdit, setStoryboardEdit] = useState(null); // { cut, form: { shot, action, characters } }
  const [savingStoryboard, setSavingStoryboard] = useState(false);
  // ── 지문 AI 재작성 (1-7) ──
  const [rewriteRequest, setRewriteRequest] = useState('');
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewritePrevAction, setRewritePrevAction] = useState(null); // 되돌리기용
  const [suggestedChars, setSuggestedChars] = useState([]); // ref_key[]

  const openStoryboardEditor = (cut) => {
    const currentCharIds = (cut.characters || []).map(c => typeof c === 'string' ? c : c.character_id);
    setRewriteRequest('');
    setRewritePrevAction(null);
    setSuggestedChars([]);
    setStoryboardEdit({
      cut,
      form: {
        shot: cut.shot || 'full',
        action: cut.action || '',
        characterIds: currentCharIds,
        has_product: cut.has_product || false,
        location_id: cut.location_id || '',
      },
    });
  };

  const updateStoryboardForm = (field, value) => {
    setStoryboardEdit(prev => prev ? { ...prev, form: { ...prev.form, [field]: value } } : prev);
  };

  const toggleStoryboardChar = (refKey) => {
    setStoryboardEdit(prev => {
      if (!prev) return prev;
      const ids = prev.form.characterIds;
      const next = ids.includes(refKey) ? ids.filter(id => id !== refKey) : [...ids, refKey];
      return { ...prev, form: { ...prev.form, characterIds: next } };
    });
  };

  const handleRewriteAction = async () => {
    if (!storyboardEdit || !rewriteRequest.trim()) return;
    setRewriteLoading(true);
    setSuggestedChars([]);
    try {
      const { data } = await api.post(`/cuts/${storyboardEdit.cut.cut_id}/rewrite-action`, {
        request: rewriteRequest.trim(),
      });
      setRewritePrevAction(storyboardEdit.form.action);
      updateStoryboardForm('action', data.action);
      // suggested_characters 중 현재 미선택인 것만 제안
      const currentIds = storyboardEdit.form.characterIds;
      const newSuggestions = (data.suggested_characters || []).filter(rk => !currentIds.includes(rk));
      setSuggestedChars(newSuggestions);
      setRewriteRequest('');
    } catch (err) {
      setError(err.response?.data?.detail || '지문 재작성 실패');
    } finally {
      setRewriteLoading(false);
    }
  };

  const undoRewrite = () => {
    if (rewritePrevAction !== null) {
      updateStoryboardForm('action', rewritePrevAction);
      setRewritePrevAction(null);
      setSuggestedChars([]);
    }
  };

  const saveStoryboard = async (andRegenerate = false) => {
    if (!storyboardEdit) return;
    setSavingStoryboard(true);
    try {
      const { cut, form } = storyboardEdit;
      // 기존 캐릭터 데이터에서 emotion/pose 보존, 새로 추가된 캐릭터는 기본값
      const oldChars = cut.characters || [];
      const characters = form.characterIds.map(id => {
        const existing = oldChars.find(c => (typeof c === 'string' ? c : c.character_id) === id);
        if (existing && typeof existing === 'object') return existing;
        return { character_id: id, emotion: 'neutral', pose: '' };
      });

      await api.put(`/cuts/${cut.cut_id}`, {
        shot: form.shot,
        action: form.action,
        characters,
        has_product: form.has_product,
        location_id: form.location_id || null,
      });

      if (andRegenerate) {
        const { data } = await api.post(`/cuts/${cut.cut_id}/regenerate`, { mode: 'reseed' });
        setStoryboardEdit(null);
        setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: 1 } });
        await pollJob(data.job_id, setJob);
        setJob(null);
      } else {
        setStoryboardEdit(null);
      }

      setCacheBuster(Date.now());
      await loadCuts();
    } catch (err) {
      if (await recoverLostJob(err)) { setStoryboardEdit(null); return; }
      const detail = err.response?.data?.detail;
      if (err.response?.status === 402 && detail?.message) {
        setError(`${detail.message} (잔량 ${detail.balance}, 필요 ${detail.needed})`);
      } else {
        setError('생성이 잠시 지연되고 있어요. 다시 시도해 주세요. (패킷은 차감되지 않았습니다)');
      }
    } finally {
      setSavingStoryboard(false);
    }
  };

  const pendingCuts = cuts.filter(c => c.status === 'pending' || c.status === 'invalidated');
  const hasImages = cuts.some(c => c.image_url);

  // ── 모션 헬퍼 ──
  const getMotion = (cut) => cut.motion || (cut.spec?.motion) || {};
  const motionStatus = (cut) => getMotion(cut).status || 'none';

  const handleMotionStarted = async (cutId, jobId) => {
    setMotionJobs(prev => ({ ...prev, [cutId]: jobId }));
    try {
      await pollJob(jobId, () => {});
    } catch { /* job lost 등 */ }
    setMotionJobs(prev => { const n = { ...prev }; delete n[cutId]; return n; });
    setCacheBuster(Date.now());
    await loadCuts();
    window.dispatchEvent(new Event('packets:refresh'));
  };

  const handleMotionSelected = () => {
    setCacheBuster(Date.now());
    loadCuts();
  };

  const handleMotionDeleted = () => {
    setCacheBuster(Date.now());
    loadCuts();
  };

  const handleMotionRemake = (cut) => {
    setMotionModalCut(cut);
  };

  const hasMotionCuts = cuts.some(c => getMotion(c).selected);

  // ── 릴스 헬퍼 ──
  const loadReel = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/reel`);
      setReelStatus(data);
    } catch { setReelStatus(null); }
  };
  useEffect(() => { if (cuts.length > 0) loadReel(); }, [cuts]);

  const handleReelStarted = async (jobId) => {
    setReelJob(jobId);
    setReelStatus({ status: 'queued' });
    try {
      await pollJob(jobId, (j) => setReelStatus({ status: j.status === 'processing' ? 'running' : j.status, stage: j.progress?.stage }));
    } catch { /* job lost */ }
    setReelJob(null);
    await loadReel();
    window.dispatchEvent(new Event('packets:refresh'));
  };

  const handleReelDelete = async () => {
    if (!window.confirm('릴스 영상을 지울까요?')) return;
    try {
      await api.delete(`/projects/${projectId}/episodes/${episodeId}/reel`);
      setReelStatus({ status: 'none' });
      setReelDropdown(false);
    } catch { /* ignore */ }
  };

  const dialogueTypeLabel = { speech: '대사', narration: '나레이션', thought: '독백', sfx: '효과음' };

  // ── B. 영문 → 한글 표시 매핑 ──
  const shotLabel = { long: '롱샷', full: '풀샷', bust: '바스트샷', close_up: '클로즈업' };
  const getCharName = (c) => {
    const id = typeof c === 'string' ? c : c.character_id;
    return charNameMap[id] || id;
  };

  const isUnknownChar = (c) => {
    const id = typeof c === 'string' ? c : c.character_id;
    return !charNameMap[id];
  };

  // SVG 오버레이 방식: raw 이미지 + BubbleOverlay (코드로 말풍선 렌더링)
  const getCutImageUrl = (cut) => {
    return cut.image_url;
  };

  if (initialLoading) return <GateSkeleton lines={3} />;
  if (loadError) return <GateLoadError message={loadError} onRetry={retryLoad} />;

  return (
    <div className="space-y-4">
      {job && <JobProgress job={job} label="이미지 생성" />}

      {hasImages && <PublishBar projectId={projectId} episodeId={episodeId} />}

      <div className="glass-card p-4 sm:p-6">
        {/* 모바일: 제목 / 생성 버튼 / 내보내기 4개를 세로로 쌓음 (가로 배치 시 제목이 폭 0으로 눌려 글자 단위로 꺾이던 문제) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
            <Image size={20} className="text-indigo-500 shrink-0" /> 웹툰 만들기
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            {pendingCuts.length > 0 && (
              <div className="flex flex-col items-start gap-1">
                <button
                  onClick={handleGenerateAll}
                  disabled={!!job}
                  className="neon-btn flex items-center justify-center gap-1 w-full sm:w-auto !rounded-full !px-4 !py-2 text-xs whitespace-nowrap disabled:opacity-50"
                >
                  <Image size={12} /> {pendingCuts.length}컷 생성 ({pendingCuts.length}패킷)
                </button>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  연출: {DRAMA_LABELS[gateStatus?.drama_level || (gateStatus?.is_ad ? 'light' : 'normal')]}
                </span>
                {gateStatus?.has_photo_real_char && (
                  <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400">
                    실사 캐릭터 포함 — 컷당 약 30~40초
                  </span>
                )}
                {!gateStatus?.has_photo_real_char && cuts.some(c => c.has_product) && (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    제품 컷은 더 정교하게 그려서 40초쯤 걸려요
                  </span>
                )}
                {gateStatus?.purpose === 'onecut_ad' && (
                  <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400">
                    모델·제품·카피를 한 장에 그려요 — 60초쯤
                  </span>
                )}
              </div>
            )}
            {/* 페이지 미리보기 토글 (vertical이 아닐 때만) */}
            {hasImages && (() => {
              const pf = gateStatus?.page_format || 'vertical';
              const fmt = PAGE_FORMATS[pf];
              if (!fmt || !fmt.per_page) return null;
              return (
                <button
                  onClick={() => setPagePreview(!pagePreview)}
                  className={`flex items-center gap-1 h-10 sm:h-auto px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors shadow-sm ${
                    pagePreview
                      ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                      : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                  }`}
                >
                  <LayoutGrid size={12} /> 페이지 미리보기
                </button>
              );
            })()}
            {hasImages && (
              <div className="flex flex-wrap gap-2 sm:gap-1">
                <button
                  onClick={() => handleExport('vertical_single')}
                  disabled={exporting}
                  className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold whitespace-nowrap hover:bg-gray-200 dark:hover:bg-white/20 transition-colors shadow-sm disabled:opacity-50 dark:border dark:border-white/10"
                >
                  <Download size={12} /> 세로
                </button>
                <button
                  onClick={() => handleExport('instagram_carousel')}
                  disabled={exporting}
                  className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold whitespace-nowrap hover:bg-gray-200 dark:hover:bg-white/20 transition-colors shadow-sm disabled:opacity-50 dark:border dark:border-white/10"
                >
                  <Download size={12} /> 인스타
                </button>
                <button
                  onClick={() => setInstaShareOpen(true)}
                  disabled={exporting}
                  className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 dark:from-purple-500/30 dark:to-pink-500/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-bold whitespace-nowrap hover:from-purple-500/30 hover:to-pink-500/30 dark:hover:from-purple-500/40 dark:hover:to-pink-500/40 transition-colors shadow-sm disabled:opacity-50 border border-purple-200 dark:border-purple-500/30"
                >
                  <Share2 size={12} /> 인스타 공유
                </button>
                <button
                  onClick={() => handleExport('png_cuts')}
                  disabled={exporting}
                  className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold whitespace-nowrap hover:bg-gray-200 dark:hover:bg-white/20 transition-colors shadow-sm disabled:opacity-50 dark:border dark:border-white/10"
                >
                  <Download size={12} /> PNG
                </button>
                {hasMotionCuts && (
                  <button
                    onClick={async () => {
                      const motionCuts = cuts.filter(c => getMotion(c).selected);
                      if (!motionCuts.length) return;
                      for (const c of motionCuts) {
                        try {
                          const { data } = await api.get(`/cuts/${c.cut_id}/motion/export`);
                          const url = data.video_url ? imageUrl(data.video_url) : null;
                          if (!url) continue;
                          const resp = await fetch(url);
                          const blob = await resp.blob();
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = `cut_${c.cut_number}.mp4`;
                          a.click();
                          URL.revokeObjectURL(a.href);
                          if (motionCuts.length > 1) await new Promise(r => setTimeout(r, 300));
                        } catch { /* skip */ }
                      }
                    }}
                    className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-full text-xs font-bold whitespace-nowrap hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors shadow-sm border border-violet-200 dark:border-violet-500/30"
                  >
                    <Film size={12} /> 움직인 컷 MP4
                  </button>
                )}
                {/* 릴스 영상 버튼 */}
                {(() => {
                  const rs = reelStatus?.status;
                  const isRunning = rs === 'queued' || rs === 'running' || !!reelJob;
                  const isDone = rs === 'done';
                  const isStale = reelStatus?.is_stale;

                  if (isRunning) {
                    return (
                      <span className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 text-xs font-bold text-rose-500 dark:text-rose-400 animate-pulse">
                        <span className="animate-spin"><Clapperboard size={12} /></span> 릴스 만드는 중…
                      </span>
                    );
                  }
                  if (isDone) {
                    return (
                      <>
                        <button
                          data-reel-btn
                          onClick={() => { setReelDropdown(!reelDropdown); }}
                          className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-full text-xs font-bold whitespace-nowrap hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors shadow-sm border border-rose-200 dark:border-rose-500/30"
                          title={isStale ? '컷이 바뀌었어요 — 다시 만들기' : undefined}
                        >
                          <span className="relative shrink-0">
                            <Clapperboard size={12} />
                            {isStale && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />}
                          </span>
                          릴스 영상
                          <ChevronDown data-reel-chevron size={10} className="shrink-0" />
                        </button>
                        {reelDropdown && createPortal(
                          <div
                            className="fixed inset-0 z-[60]"
                            onClick={() => setReelDropdown(false)}
                          >
                            <div
                              className="fixed z-[60] bg-white dark:bg-zinc-800 border-2 border-border dark:border-zinc-600 rounded-xl shadow-lg p-2 w-52"
                              style={{ top: 'min(50%, 400px)', right: '1rem' }}
                              onClick={e => e.stopPropagation()}
                            >
                              {isStale && (
                                <p className="px-3 py-1.5 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">컷이 바뀌었어요 — 다시 만들면 최신 컷으로 만들어요</p>
                              )}
                              <button onClick={() => { setReelDropdown(false); setReelPreview(true); }}
                                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center gap-2">
                                <Play size={14} /> 미리보기
                              </button>
                              <button onClick={async () => {
                                setReelDropdown(false);
                                if (!reelStatus?.path) return;
                                const resp = await fetch(imageUrl(reelStatus.path));
                                const blob = await resp.blob();
                                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                                a.download = 'reel.mp4'; a.click(); URL.revokeObjectURL(a.href);
                              }} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center gap-2">
                                <Download size={14} /> 받기 (MP4)
                              </button>
                              <button onClick={() => { setReelDropdown(false); setInstaShareOpen(true); }}
                                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center gap-2">
                                <Share2 size={14} /> 인스타 공유
                              </button>
                              <button onClick={() => { setReelDropdown(false); setReelModalOpen(true); }}
                                className="w-full text-left px-3 py-2 text-sm text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2">
                                <RefreshCw size={14} /> 다시 만들기 (1패킷)
                              </button>
                              <button onClick={() => { setReelDropdown(false); handleReelDelete(); }}
                                className="w-full text-left px-3 py-2 text-sm text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                                <Trash2 size={14} /> 삭제
                              </button>
                            </div>
                          </div>,
                          document.body
                        )}
                      </>
                    );
                  }
                  // none / failed
                  return (
                    <button
                      onClick={() => setReelModalOpen(true)}
                      disabled={!hasImages}
                      className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-full text-xs font-bold whitespace-nowrap hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors shadow-sm border border-rose-200 dark:border-rose-500/30 disabled:opacity-50"
                    >
                      <Clapperboard size={12} /> 릴스 영상
                    </button>
                  );
                })()}
                <div className="relative flex">
                  <button
                    onClick={() => setA4Mode(a4Mode ? null : 'grid')}
                    disabled={exporting}
                    className="flex items-center gap-1 h-10 sm:h-auto px-3 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-full text-xs font-bold whitespace-nowrap hover:bg-gray-200 dark:hover:bg-white/20 transition-colors shadow-sm disabled:opacity-50 dark:border dark:border-white/10"
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

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 flex-shrink-0"><X size={14} /></button>
          </div>
        )}

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

        {/* 페이지 미리보기 패널 */}
        {pagePreview && (() => {
          const pf = gateStatus?.page_format || 'vertical';
          const fmt = PAGE_FORMATS[pf];
          if (!fmt || !fmt.per_page) return null;
          const { cols, rows, per_page, frame: fr } = fmt;
          const hasFixedRatio = !!fmt.cell_ratio;
          const [rw, rh] = hasFixedRatio ? fmt.cell_ratio.split(':').map(Number) : [1, 1];
          const gapPct = ((fr?.gap_ratio || 0.025) * 100).toFixed(1);
          const marginPct = ((fr?.margin_ratio || 0.03) * 100).toFixed(1);
          const borderPx = Math.max(1, Math.round((fr?.border_px || 3) * 0.6));
          const strokeColor = fr?.stroke || '#000000';
          const imageCuts = cuts.filter(c => getCutImageUrl(c));
          const pageCount = Math.ceil(imageCuts.length / per_page);
          if (pageCount === 0) return null;

          return (
            <div className="mb-4 space-y-6">
              {Array.from({ length: pageCount }, (_, p) => {
                const pageCuts = imageCuts.slice(p * per_page, (p + 1) * per_page);
                return (
                  <div key={p}>
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">페이지 {p + 1}</p>
                    <div
                      className="grid bg-white"
                      style={{
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gridTemplateRows: `repeat(${rows}, 1fr)`,
                        gap: `${gapPct}%`,
                        padding: `${marginPct}%`,
                        border: `${borderPx}px solid ${strokeColor}`,
                      }}
                    >
                      {Array.from({ length: per_page }, (_, slot) => {
                        const cut = pageCuts[slot];
                        if (!cut) {
                          return (
                            <div
                              key={slot}
                              className="bg-gray-50"
                              style={{ ...(hasFixedRatio ? { aspectRatio: `${rw} / ${rh}` } : {}), border: `${borderPx}px solid ${strokeColor}` }}
                            />
                          );
                        }
                        const cutIdx = cuts.indexOf(cut);
                        return (
                          <div
                            key={slot}
                            className="relative overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
                            style={{ ...(hasFixedRatio ? { aspectRatio: `${rw} / ${rh}` } : {}), border: `${borderPx}px solid ${strokeColor}` }}
                            onClick={() => {
                              setPagePreview(false);
                              setTimeout(() => {
                                const el = document.getElementById(`cut-card-${cut.cut_id}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 100);
                            }}
                          >
                            <CutImageWithBubbles
                              cut={cut}
                              imageUrl={imageUrl(getCutImageUrl(cut))}
                              onZoom={() => setPreviewIndex(cutIdx)}
                              products={products}
                              aspectRatio={gateStatus?.aspect_ratio}
                              resolveUrl={imageUrl}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {cuts.map((cut) => (
            <div
              key={cut.cut_id}
              id={`cut-card-${cut.cut_id}`}
              className={`border-2 rounded-2xl overflow-hidden group transition ${
                cut.status === 'invalidated' ? 'border-amber-300 dark:border-amber-600' : 'border-border dark:border-zinc-700'
              }`}
            >
              {getCutImageUrl(cut) ? (
                <CutImageWithBubbles
                  cut={cut}
                  imageUrl={imageUrl(getCutImageUrl(cut))}
                  onZoom={(e) => { e.stopPropagation(); setPreviewIndex(cuts.indexOf(cut)); }}
                  products={products}
                  aspectRatio={gateStatus?.aspect_ratio}
                  resolveUrl={imageUrl}
                />
              ) : (
                <div className="bg-gray-50 dark:bg-zinc-800 flex items-center justify-center" style={{ aspectRatio: cssAspect(gateStatus?.aspect_ratio) }}>
                  <div className="text-center text-gray-300 dark:text-zinc-600">
                    <Image size={32} className="mx-auto mb-1" />
                    <span className="text-xs font-bold">#{cut.cut_number}</span>
                  </div>
                </div>
              )}

              <div className="p-2">
                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                  {cut.has_product && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0" title="제품 참조 포함">📦</span>
                  )}
                  <span className="truncate">{shotLabel[cut.shot] || cut.shot} · {cut.characters?.map(c => getCharName(c)).join(', ')}</span>
                  {cut.characters?.some(c => isUnknownChar(c)) && (
                    <span className="text-amber-500 shrink-0" title={`알 수 없는 캐릭터: ${cut.characters.filter(c => isUnknownChar(c)).map(c => typeof c === 'string' ? c : c.character_id).join(', ')}`}>⚠</span>
                  )}
                  {cut.drama_level && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('에피소드 기본값으로 되돌릴까요?\n(이미지는 재생성하지 않아요)')) handleClearDramaOverride(cut.cut_id);
                      }}
                      title="에피소드 기본값으로 되돌리기"
                      className="ml-auto shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                    >
                      {DRAMA_LABELS[cut.drama_level] || cut.drama_level}
                    </button>
                  )}
                </div>
                {cut.image_url && (
                  <div className="flex gap-1">
                    <RegenDropdown cutId={cut.cut_id} cutSpec={cut} disabled={!!job}
                      onRegenerate={handleRegenerate}
                      epDramaLevel={gateStatus?.drama_level || (gateStatus?.is_ad ? 'light' : 'normal')}
                      hasProduct={cut.has_product && products.length > 0}
                      purpose={gateStatus?.purpose}
                      projectId={projectId} episodeId={episodeId} />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRevert(cut.cut_id); }}
                      title="되돌리기"
                      className="flex items-center justify-center h-8 w-8 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded-full font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditCutIndex(cuts.indexOf(cut)); }}
                      title="컷 편집"
                      className="flex items-center gap-0.5 h-8 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full font-bold shadow-sm hover:bg-purple-200 dark:hover:bg-purple-900/50 text-[10px] transition-colors"
                    >
                      <Pencil size={11} /> <span className="hidden min-[400px]:inline">편집</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openStoryboardEditor(cut); }}
                      disabled={!!job}
                      title="콘티 수정 (지문·캐릭터·샷 타입)"
                      className="flex items-center gap-0.5 h-8 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full font-bold shadow-sm hover:bg-amber-200 dark:hover:bg-amber-900/50 text-[10px] transition-colors disabled:opacity-50"
                    >
                      <SlidersHorizontal size={11} /> <span className="hidden min-[400px]:inline">콘티</span>
                    </button>
                    {cut.dialogue && cut.dialogue.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openDialogueEditor(cut); }}
                        title="대사 편집"
                        className="flex items-center gap-0.5 h-8 px-2 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded-full font-bold shadow-sm hover:bg-gray-200 dark:hover:bg-zinc-700 text-[10px] transition-colors"
                      >
                        <MessageSquare size={11} /> <span className="hidden min-[400px]:inline">대사</span>
                      </button>
                    )}
                  </div>
                )}
                {/* 모션 상태 표시 */}
                {cut.image_url && (() => {
                  const ms = motionStatus(cut);
                  const isRunning = ms === 'queued' || ms === 'running' || !!motionJobs[cut.cut_id];
                  const isDone = ms === 'done' && !getMotion(cut).selected;
                  const isSelected = ms === 'done' && !!getMotion(cut).selected;
                  const hasPhotoReal = (cut.characters || []).some(c => {
                    const ch = characters.find(x => x.ref_key === (typeof c === 'string' ? c : c.character_id));
                    return ch?.is_photo_real;
                  });

                  if (isRunning) {
                    return (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-violet-500 dark:text-violet-400 font-bold px-1">
                        <span className="animate-spin"><Film size={10} /></span> 영상 만드는 중…
                      </div>
                    );
                  }
                  if (isDone) {
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMotionPickerCut(cut); }}
                        className="mt-1 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 animate-pulse hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                      >
                        <Film size={10} /> ▶ 후보 고르기
                      </button>
                    );
                  }
                  if (isSelected) {
                    const selCand = (getMotion(cut).candidates || []).find(x => x.id === getMotion(cut).selected);
                    return (
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMotionPickerCut(cut); }}
                          className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-500 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                        >
                          <Film size={10} /> ▶ 영상
                        </button>
                        {selCand?.path && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const { data } = await api.get(`/cuts/${cut.cut_id}/motion/export`);
                                const url = data.video_url ? imageUrl(data.video_url) : imageUrl(selCand.path);
                                const resp = await fetch(url);
                                const blob = await resp.blob();
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(blob);
                                a.download = `cut_${cut.cut_number}.mp4`;
                                a.click();
                                URL.revokeObjectURL(a.href);
                              } catch { /* 폴백: 원본 mp4 */ }
                            }}
                            title="영상 받기 (MP4)"
                            className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                          >
                            <Download size={9} />
                          </button>
                        )}
                      </div>
                    );
                  }
                  // none — 움직이게 버튼
                  return (
                    <button
                      onClick={(e) => { e.stopPropagation(); setMotionModalCut(cut); }}
                      disabled={!!job || hasPhotoReal}
                      title={hasPhotoReal ? '실사 캐릭터 컷은 아직 지원하지 않아요' : '컷을 움직이게 만들기'}
                      className="mt-1 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-gray-50 dark:bg-zinc-800/50 text-gray-400 dark:text-zinc-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-500 dark:hover:text-violet-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Film size={10} /> 움직이게
                    </button>
                  );
                })()}
                {/* 카피 신고 (onecut_ad, 이미지 있는 컷만) */}
                {gateStatus?.purpose === 'onecut_ad' && cut.image_url && !cut.spec?.copy_reported_versions?.includes(cut.spec?.generation?.version ?? cut.version) && (
                  <div className="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                    글자가 틀리면 패킷을 돌려드려요 ·{' '}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          setError('');
                          const { data } = await api.post(`/cuts/${cut.cut_id}/copy-report`);
                          if (data.ok) {
                            alert('글자는 정확해요. 다른 이유면 다시 그리기(1패킷)로 새로 만들어 보세요!');
                          } else {
                            alert('글자 오류 확인 — 패킷을 돌려드리고 다시 그려요');
                            if (data.job_id) {
                              setJob({ job_id: data.job_id, status: 'processing', progress: { done: 0, total: 1 } });
                              await pollJob(data.job_id, setJob);
                              setJob(null);
                              setCacheBuster(Date.now());
                              await loadCuts();
                              window.dispatchEvent(new Event('packets:refresh'));
                            }
                          }
                        } catch (err) {
                          const msg = err.response?.data?.detail || '검사에 실패했어요';
                          alert(msg);
                        }
                      }}
                      className="text-indigo-500 dark:text-indigo-400 hover:underline font-bold"
                    >
                      글자가 틀렸나요?
                    </button>
                  </div>
                )}
                {gateStatus?.purpose === 'onecut_ad' && cut.image_url && cut.spec?.copy_reported_versions?.includes(cut.spec?.generation?.version ?? cut.version) && (
                  <div className="mt-1.5 text-[9px] text-zinc-400 dark:text-zinc-500">
                    이 버전은 이미 검사했어요
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
              <LightboxImageWithBubbles cut={cut} imgSrc={imgSrc} products={products} resolveUrl={imageUrl} />
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
          <div className="bg-white dark:bg-night-card rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-2xl border-2 border-border dark:border-white/10" onClick={e => e.stopPropagation()}>
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
                      {d.speaker && (
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-400">
                          {characterName(d.speaker, episodeCharacters)}
                          {characterName(d.speaker, episodeCharacters) !== d.speaker && (
                            <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500 ml-1">{d.speaker}</span>
                          )}
                        </span>
                      )}
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

      {/* 콘티 수정 모달 */}
      {storyboardEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setStoryboardEdit(null)}>
          <div className="bg-white dark:bg-night-card rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto shadow-2xl border-2 border-border dark:border-white/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-amber-500" /> 콘티 수정 — #{storyboardEdit.cut.cut_number}
              </h3>
              <button onClick={() => setStoryboardEdit(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full">
                <X size={18} />
              </button>
            </div>

            {/* 장소 */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">장소</label>
              <select
                value={storyboardEdit.form.location_id || ''}
                onChange={(e) => updateStoryboardForm('location_id', e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-ink-black dark:text-white"
              >
                <option value="">장소 없음</option>
                {episodeLocations.map(l => (
                  <option key={l.ref_key} value={l.ref_key}>{locationOptionLabel(l.ref_key, l.name)}</option>
                ))}
              </select>
            </div>

            {/* 샷 타입 */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">샷 타입</label>
              <div className="flex gap-2 flex-wrap">
                {['long', 'full', 'bust', 'close_up'].map(s => (
                  <button
                    key={s}
                    onClick={() => updateStoryboardForm('shot', s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      storyboardEdit.form.shot === s
                        ? 'bg-comic-blue text-white'
                        : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
                    }`}
                  >
                    {shotLabel[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* 등장 캐릭터 */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">등장 캐릭터</label>
              <div className="flex flex-wrap gap-2">
                {episodeCharacters.map(c => (
                  <button
                    key={c.ref_key}
                    onClick={() => toggleStoryboardChar(c.ref_key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      storyboardEdit.form.characterIds.includes(c.ref_key)
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
                    }`}
                  >
                    {c.name} <span className="opacity-50 text-[10px]">({c.ref_key})</span>
                  </button>
                ))}
                {/* 알 수 없는 ref_key (에피소드 캐릭터에 없는 키) */}
                {storyboardEdit.form.characterIds
                  .filter(id => !episodeCharacters.some(c => c.ref_key === id))
                  .map(id => (
                    <button
                      key={id}
                      onClick={() => toggleStoryboardChar(id)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 transition-all hover:bg-red-100 dark:hover:bg-red-900/30"
                      title="클릭하여 제거"
                    >
                      ⚠ {id} ✕
                    </button>
                  ))
                }
                {episodeCharacters.length === 0 && (
                  <span className="text-xs text-gray-400">연결된 캐릭터가 없습니다</span>
                )}
              </div>
            </div>

            {/* 지문 AI 재작성 (1-7) */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">이렇게 바꿔줘</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={rewriteRequest}
                  onChange={(e) => setRewriteRequest(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !rewriteLoading && handleRewriteAction()}
                  placeholder="예: 백미러에 아내랑 도도가 보여야 해"
                  className="flex-1 px-3 py-1.5 border-2 border-border dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  disabled={rewriteLoading}
                />
                <button
                  onClick={handleRewriteAction}
                  disabled={rewriteLoading || !rewriteRequest.trim()}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-all disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
                >
                  {rewriteLoading ? (
                    <><RefreshCw size={12} className="animate-spin" /> 작성 중...</>
                  ) : (
                    <><Pencil size={12} /> 지문 다시 쓰기</>
                  )}
                </button>
              </div>
            </div>

            {/* 캐릭터 추가 제안 칩 */}
            {suggestedChars.length > 0 && (
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 dark:text-gray-400">추가?</span>
                {suggestedChars.map(rk => {
                  const c = episodeCharacters.find(ec => ec.ref_key === rk);
                  return (
                    <button
                      key={rk}
                      onClick={() => {
                        toggleStoryboardChar(rk);
                        setSuggestedChars(prev => prev.filter(r => r !== rk));
                      }}
                      className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-800/40 transition-all"
                    >
                      + {c?.name || rk}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 지문 (액션) */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400">지문</label>
                {rewritePrevAction !== null && (
                  <button
                    onClick={undoRewrite}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-600 transition-colors"
                  >
                    <RotateCcw size={12} /> 되돌리기
                  </button>
                )}
              </div>
              <textarea
                value={storyboardEdit.form.action}
                onChange={(e) => { updateStoryboardForm('action', e.target.value); setRewritePrevAction(null); }}
                rows={4}
                className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 rounded-xl text-sm bg-white dark:bg-zinc-800 text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                placeholder="이 컷에서 일어나는 장면을 묘사해주세요"
              />
            </div>

            {/* 제품 등장 토글 */}
            {products.length > 0 && (
              <div className="flex items-center justify-between mb-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">제품 등장</span>
                  <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70 mt-0.5">ON: 이미지에 제품 시트 참조 첨부</p>
                </div>
                <button
                  onClick={() => updateStoryboardForm('has_product', !storyboardEdit.form.has_product)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    storyboardEdit.form.has_product
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {storyboardEdit.form.has_product ? 'ON' : 'OFF'}
                </button>
              </div>
            )}

            {/* 콘티 전체 보기 링크 */}
            <a
              href={`/WEBTOON/projects/${projectId}/episodes/${episodeId}/workflow`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-comic-blue hover:underline mb-4"
            >
              <ExternalLink size={12} /> 콘티 전체 보기 (게이트 4)
            </a>

            {/* 버튼 */}
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setStoryboardEdit(null)}
                className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full"
              >
                취소
              </button>
              <button
                onClick={() => saveStoryboard(false)}
                disabled={savingStoryboard}
                className="flex items-center gap-1 px-4 py-2 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-full text-sm font-bold hover:bg-gray-300 dark:hover:bg-zinc-600 transition-all shadow-sm disabled:opacity-50"
              >
                <Save size={14} /> 저장만
              </button>
              <button
                onClick={() => saveStoryboard(true)}
                disabled={savingStoryboard || !!job}
                className="flex items-center gap-1 px-4 py-2 bg-amber-500 text-white rounded-full text-sm font-bold hover:bg-amber-600 hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
              >
                <RefreshCw size={14} /> {savingStoryboard ? '처리 중...' : '저장 후 재생성'}
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
            cut={{ ...cut, dialogue: cut.dialogue || [], sfx_items: cut.sfx_items || [], effect_items: cut.effect_items || [], product_items: cut.product_items || [], pngbubble_items: cut.pngbubble_items || [] }}
            products={products}
            imageUrl={imageUrl(getCutImageUrl(cut))}
            characters={cut.characters || []}
            charNameMap={charNameMap}
            purpose={gateStatus?.purpose}
            onClose={() => setEditCutIndex(null)}
            onSave={async () => {
              setCacheBuster(Date.now());
              await loadCuts();
            }}
            onPrev={hasPrev ? () => setEditCutIndex(editCutIndex - 1) : null}
            onNext={hasNext ? () => setEditCutIndex(editCutIndex + 1) : null}
            cutIndex={editCutIndex + 1}
            totalCuts={cuts.length}
            onBatchNarrationStyle={async (targetStyle) => {
              for (const c of cuts) {
                const dl = c.dialogue || [];
                const hasNarration = dl.some(d => d.type === 'narration');
                if (!hasNarration) continue;
                let narrBoxIdx = 0;
                const updated = dl.map(d => {
                  if (d.type !== 'narration') return d;
                  if (targetStyle === 'box') {
                    if (d.bubble_style === 'box') { narrBoxIdx++; return d; } // 이미 box면 layout 유지
                    const layout = narrBoxIdx === 0
                      ? { x: 0.04, y: 0.04, width: 0.44, tail_direction: 'none' }
                      : { x: 0.52, y: 0.70, width: 0.44, tail_direction: 'none' };
                    narrBoxIdx++;
                    return { ...d, bubble_style: 'box', bubble_layout: layout };
                  } else {
                    return { ...d, bubble_style: 'bar', bubble_layout: { x: 0.0, y: 0.82, width: 1.0, tail_direction: 'none' } };
                  }
                });
                await api.put(`/cuts/${c.cut_id}/dialogue`, {
                  dialogue: updated,
                  sfx_items: c.sfx_items || [],
                  effect_items: c.effect_items || [],
                  product_items: c.product_items || [],
                  pngbubble_items: c.pngbubble_items || [],
                }).catch(() => {});
              }
              setCacheBuster(Date.now());
              await loadCuts();
              setEditCutIndex(editCutIndex); // 현재 컷 에디터 새로고침
            }}
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

      {/* 릴스 모달 */}
      {reelModalOpen && (
        <ReelModal
          cuts={cuts}
          projectId={projectId}
          episodeId={episodeId}
          onClose={() => setReelModalOpen(false)}
          onStarted={handleReelStarted}
          getImageUrl={(cut) => imageUrl(cut.image_url)}
        />
      )}

      {/* 릴스 미리보기 */}
      {reelPreview && reelStatus?.path && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80" onClick={() => setReelPreview(false)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <video
              src={imageUrl(reelStatus.path)}
              controls playsInline autoPlay
              className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
              style={{ aspectRatio: '9 / 16' }}
            />
            <button onClick={() => setReelPreview(false)}
              className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full hover:bg-black/80">
              <X size={16} />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 모션 모달 */}
      {motionModalCut && (
        <MotionModal
          cut={motionModalCut}
          characters={characters}
          onClose={() => setMotionModalCut(null)}
          onStarted={(jobId) => handleMotionStarted(motionModalCut.cut_id, jobId)}
        />
      )}

      {/* 모션 피커 */}
      {motionPickerCut && (
        <MotionPicker
          cut={motionPickerCut}
          onClose={() => setMotionPickerCut(null)}
          onSelected={handleMotionSelected}
          onDeleted={handleMotionDeleted}
          onRemake={() => handleMotionRemake(motionPickerCut)}
        />
      )}

      {/* 인스타 공유 모달 */}
      <InstaShareModal
        open={instaShareOpen}
        onClose={() => setInstaShareOpen(false)}
        cuts={cuts}
        characters={[]}
        getImageUrl={(cut) => imageUrl(cut.image_url)}
        products={products}
        pageFormat={(() => { const pf = gateStatus?.page_format || 'vertical'; return PAGE_FORMATS[pf]?.per_page ? PAGE_FORMATS[pf] : null; })()}
        episodeTitle={epMeta?.title || ''}
        nickname={user?.nickname || ''}
        shareUrl={epMeta?.share_token ? `${window.location.origin}/WEBTOON/view/${epMeta.share_token}` : ''}
        isPublic={epMeta?.is_public || false}
        onZipDownload={() => { setInstaShareOpen(false); handleExport('instagram_carousel'); }}
        motionVideoUrls={cuts.filter(c => getMotion(c).selected).map(c => {
          const m = getMotion(c);
          const ep = m.export_path;
          const sel = (m.candidates || []).find(x => x.id === m.selected);
          const url = ep || sel?.path;
          return url ? { cut_number: c.cut_number, url: imageUrl(url), cut_id: c.cut_id } : null;
        }).filter(Boolean)}
        reelPath={reelStatus?.status === 'done' && reelStatus?.path ? imageUrl(reelStatus.path) : null}
      />
    </div>
  );
}

// ── 재생성 드롭다운 (연출 강도 선택) ──
const DRAMA_LABELS = { light: '담백', normal: '보통', strong: '과장' };
const DRAMA_DESC = { light: '효과 없이 깔끔', normal: '감정 효과 2~3개', strong: '집중선·과장까지' };

function RegenDropdown({ cutId, cutSpec, disabled, onRegenerate, epDramaLevel, hasProduct, purpose, projectId, episodeId }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);
  const cutDrama = cutSpec?.drama_level;
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      // portal 안 클릭은 무시 — data-drama-menu로 구분
      if (e.target.closest?.('[data-drama-menu]')) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4 });
    }
    setOpen(!open);
  };

  const menu = open ? createPortal(
    isMobile ? (
      // 모바일: 바텀시트
      <div data-drama-menu className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="w-full max-w-md bg-white dark:bg-night-card rounded-t-2xl shadow-2xl p-4 pb-6 space-y-1" onPointerDown={(e) => e.stopPropagation()}>
          <p className="text-xs font-bold text-gray-400 mb-2 px-1">연출 강도 재생성 (1패킷)</p>
          {hasProduct && (
            <div className="flex items-center gap-2 px-4 py-2 mb-1 bg-amber-50 dark:bg-amber-900/10 rounded-xl">
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">📦 제품 참조 포함</span>
              <span className="text-[10px] text-amber-600/70 dark:text-amber-400/60 ml-auto">GPT 권장</span>
            </div>
          )}
          {['light', 'normal', 'strong'].map((level) => {
            const current = cutDrama || epDramaLevel;
            return (
              <button
                key={level}
                onClick={() => { setOpen(false); onRegenerate(cutId, level); }}
                className={`flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-bold transition-colors ${
                  current === level ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                <div>
                  <span>{DRAMA_LABELS[level]}</span>
                  <span className="ml-2 text-xs font-normal text-gray-400">{DRAMA_DESC[level]}</span>
                </div>
                {current === level && <Check size={14} className="text-amber-500 shrink-0" />}
              </button>
            );
          })}
          {purpose === 'onecut_ad' && projectId && episodeId && (
            <button
              onClick={() => { setOpen(false); window.location.hash = ''; window.location.href = `/WEBTOON/projects/${projectId}/episodes/${episodeId}/workflow?gate=1`; }}
              className="flex items-center gap-1 w-full px-4 py-2.5 mt-1 rounded-xl text-xs font-bold text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              카피 디자인 바꾸기 → 대본 카드로
            </button>
          )}
          <button onClick={() => setOpen(false)} className="w-full mt-2 h-11 rounded-xl text-sm font-bold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">닫기</button>
        </div>
      </div>
    ) : (
      // PC: fixed 팝오버
      <div data-drama-menu className="fixed z-[60] w-40 bg-white dark:bg-night-card border border-border dark:border-night-border rounded-xl shadow-xl overflow-hidden"
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400">연출 강도 재생성</p>
        {hasProduct && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10">
            📦 제품 참조 포함 <span className="text-amber-500/70 ml-auto">GPT 권장</span>
          </div>
        )}
        {['light', 'normal', 'strong'].map((level) => {
          const current = cutDrama || epDramaLevel;
          return (
            <button
              key={level}
              onClick={() => { setOpen(false); onRegenerate(cutId, level); }}
              className="flex items-center justify-between w-full px-3 py-2 text-xs font-bold text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              <span className="text-gray-700 dark:text-gray-200">{DRAMA_LABELS[level]}</span>
              {current === level && <Check size={12} className="text-amber-500" />}
            </button>
          );
        })}
        {purpose === 'onecut_ad' && projectId && episodeId && (
          <button
            onClick={() => { setOpen(false); window.location.href = `/WEBTOON/projects/${projectId}/episodes/${episodeId}/workflow?gate=1`; }}
            className="w-full px-3 py-2 text-[10px] font-bold text-left text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors border-t border-border dark:border-night-border"
          >
            카피 디자인 바꾸기 →
          </button>
        )}
      </div>
    ),
    document.body
  ) : null;

  return (
    <div className="relative">
      <div className="flex">
        <button
          onClick={(e) => { e.stopPropagation(); onRegenerate(cutId); }}
          disabled={disabled}
          title="재생성 (1패킷)"
          className="flex items-center gap-0.5 h-8 px-2 py-1 bg-comic-blue/10 text-comic-blue rounded-l-full font-bold shadow-sm hover:bg-comic-blue/20 text-[10px] disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={11} /> <span className="hidden min-[400px]:inline">재생성</span>
        </button>
        <button
          ref={btnRef}
          onClick={handleOpen}
          disabled={disabled}
          className="flex items-center h-8 px-1.5 bg-comic-blue/10 text-comic-blue rounded-r-full font-bold shadow-sm hover:bg-comic-blue/20 text-[10px] disabled:opacity-50 transition-colors border-l border-comic-blue/20"
        >
          <ChevronDown size={11} />
        </button>
      </div>
      {menu}
    </div>
  );
}
