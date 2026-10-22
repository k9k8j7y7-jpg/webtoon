/**
 * InstaShareModal — 인스타그램 Web Share API 공유 모달
 *
 * - 1080×1080 letterbox JPEG q0.9 + 크레딧(ⓒ 닉네임 · EziToon)
 * - 20장 제한 (인스타 캐러셀 최대)
 * - 페이지/컷별 토글 (page_format이 있을 때만)
 * - 캡션 기본값 + 편집 + 복사, 피드 안내
 * - PC/미지원 환경: 안내 + 링크 복사 + ZIP 다운로드
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Share2, Copy, Check, Download, X, Film, Clapperboard } from 'lucide-react';
import { renderCutToCanvas, composePageGrid } from '../utils/exportRenderer';
import { collectUsedFonts, loadFontCSS, ensureFontsLoaded } from '../utils/fontEmbed';

// ── 상수 ──
const INSTA_SIZE = 1080;
const MAX_IMAGES = 20;
const CREDIT_FONT_RATIO = 0.022; // 폭의 2.2%
const CREDIT_MARGIN_RATIO = 0.02; // 여백 폭의 2%

// ── 로컬 이미지 로드 헬퍼 ──
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${src}`));
    img.src = src;
  });
}

// ── Canvas → JPEG Blob (q=0.9) ──
function canvasToJpegBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG 변환 실패'))),
      'image/jpeg',
      0.9,
    );
  });
}

// ── Canvas → 1080×1080 letterbox (흰 배경) ──
function letterboxCanvas(srcCanvas) {
  const W = srcCanvas.width;
  const H = srcCanvas.height;
  const scale = Math.min(INSTA_SIZE / W, INSTA_SIZE / H);
  const imgW = Math.round(W * scale);
  const imgH = Math.round(H * scale);
  const ox = Math.floor((INSTA_SIZE - imgW) / 2);
  const oy = Math.floor((INSTA_SIZE - imgH) / 2);

  const out = document.createElement('canvas');
  out.width = INSTA_SIZE;
  out.height = INSTA_SIZE;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, INSTA_SIZE, INSTA_SIZE);
  ctx.drawImage(srcCanvas, ox, oy, imgW, imgH);

  // 이미지 영역 정보 반환 (크레딧 배치용)
  return { canvas: out, imgRect: { x: ox, y: oy, w: imgW, h: imgH } };
}

// ── 크레딧 그리기 ──
function drawCredit(canvas, imgRect, nickname) {
  const ctx = canvas.getContext('2d');
  const text = nickname ? `\u00A9 ${nickname} \u00B7 EziToon` : '\u00A9 EziToon';
  const fontSize = Math.round(INSTA_SIZE * CREDIT_FONT_RATIO);
  const margin = Math.round(INSTA_SIZE * CREDIT_MARGIN_RATIO);
  ctx.font = `bold ${fontSize}px "Pretendard", "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';

  const cx = INSTA_SIZE - margin;
  const cy = INSTA_SIZE - margin;

  // letterbox 흰 여백 위인지 판정 (이미지 하단 밖이면 흰 배경)
  const onWhiteMargin = cy > imgRect.y + imgRect.h;

  if (onWhiteMargin) {
    // 흰 배경 위 → 검은 글씨
    ctx.fillStyle = '#000000';
    ctx.fillText(text, cx, cy);
  } else {
    // 이미지 위 → 흰 글씨 + 검은 외곽선
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = Math.max(2, fontSize * 0.08);
    ctx.lineJoin = 'round';
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy);
  }
}

// ── 파일명 sanitize ──
function sanitizeFilename(str) {
  return (str || '웹툰').replace(/[^\w가-힣\s\-]/g, '').replace(/\s+/g, '_').slice(0, 40);
}

// ── 기본 캡션 생성 ──
function buildDefaultCaption({ episodeTitle, nickname, shareUrl, isPublic }) {
  const lines = [
    episodeTitle || '웹툰',
    `by ${nickname || '작가'} · EziToon으로 만든 웹툰`,
  ];
  if (isPublic && shareUrl) lines.push(shareUrl);
  lines.push('#EziToon #이지툰 #AI웹툰');
  return lines.join('\n');
}

// ══════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════

export default function InstaShareModal({
  open,
  onClose,
  cuts,
  characters,
  getImageUrl,
  products,
  pageFormat,
  episodeTitle,
  nickname,
  shareUrl,
  isPublic,
  onZipDownload,
  motionVideoUrls, // [{cut_number, url}] — selected motion mp4 URLs
  reelPath, // string | null — 릴스 mp4 URL
}) {
  // ── 렌더링 상태 ──
  const [renderState, setRenderState] = useState('idle'); // idle | rendering | done | error
  const [renderDone, setRenderDone] = useState(0);
  const [renderTotal, setRenderTotal] = useState(0);
  const [renderError, setRenderError] = useState(null);
  const filesRef = useRef([]); // File[]

  // ── UI 상태 ──
  const [caption, setCaption] = useState('');
  const [copyState, setCopyState] = useState('idle'); // idle | copied
  const [linkCopyState, setLinkCopyState] = useState('idle');
  const [shareError, setShareError] = useState(null);

  // ── 페이지/컷별 토글 ──
  const hasPageFormat = !!(pageFormat && pageFormat.per_page);
  const [shareMode, setShareMode] = useState(() => localStorage.getItem('insta_share_mode') || 'page');

  // ── 크레딧 체크박스 ──
  const [showCredit, setShowCredit] = useState(() => localStorage.getItem('insta_credit') !== '0');

  // ── 공유 소스 선택 (이미지 / 영상 컷 / 릴스) ──
  const [shareSource, setShareSource] = useState('images'); // 'images' | 'motionVideo' | 'reel'

  const abortRef = useRef(null);
  const renderKeyRef = useRef(0); // 토글 전환 시 이전 렌더 무시용

  // ── 공유 가능 여부 ──
  const canShareFiles = useCallback((files) => {
    try {
      return !!(navigator.canShare && navigator.canShare({ files }));
    } catch {
      return false;
    }
  }, []);

  const [isShareSupported, setIsShareSupported] = useState(false);
  useEffect(() => {
    if (!open) return;
    try {
      const dummy = new File([''], 'test.jpg', { type: 'image/jpeg' });
      setIsShareSupported(!!(navigator.canShare && navigator.canShare({ files: [dummy] })));
    } catch {
      setIsShareSupported(false);
    }
  }, [open]);

  // ── 장수 계산 ──
  const validCutCount = (cuts || []).filter((c) => c.image_url).length;
  const pageCount = hasPageFormat ? Math.ceil(validCutCount / pageFormat.per_page) : validCutCount;
  const cutCount = validCutCount;
  // 현재 모드의 실제 장수
  const effectiveMode = hasPageFormat ? shareMode : 'cuts';
  const currentTotal = effectiveMode === 'page' ? pageCount : cutCount;
  const exceeds = currentTotal > MAX_IMAGES;

  // ── 렌더 실행 함수 ──
  const startRender = useCallback(async (mode, credit, ac, key) => {
    const validCuts = (cuts || []).filter((c) => c.image_url);
    const usePageMode = mode === 'page' && hasPageFormat;
    const totalUnits = usePageMode ? Math.ceil(validCuts.length / pageFormat.per_page) : validCuts.length;
    const limitedTotal = Math.min(totalUnits, MAX_IMAGES);
    setRenderTotal(limitedTotal);

    const usedFontIds = collectUsedFonts(validCuts);
    const fontCSS = await loadFontCSS(usedFontIds);
    await ensureFontsLoaded(usedFontIds);
    if (ac.signal.aborted || renderKeyRef.current !== key) return;

    const safeTitle = sanitizeFilename(episodeTitle);
    const resultFiles = [];

    if (usePageMode) {
      const cutCanvases = [];
      for (const cut of validCuts) {
        if (ac.signal.aborted || renderKeyRef.current !== key) return;
        const canvas = await renderCutToCanvas(cut, characters, getImageUrl(cut), fontCSS, products);
        cutCanvases.push(canvas);
      }
      const pages = composePageGrid(cutCanvases, pageFormat, INSTA_SIZE);
      cutCanvases.forEach((c) => { c.width = 0; c.height = 0; });

      for (let i = 0; i < Math.min(pages.length, MAX_IMAGES); i++) {
        if (ac.signal.aborted || renderKeyRef.current !== key) return;
        const { canvas: lb, imgRect } = letterboxCanvas(pages[i]);
        pages[i].width = 0; pages[i].height = 0;
        if (credit) drawCredit(lb, imgRect, nickname);
        const blob = await canvasToJpegBlob(lb);
        lb.width = 0; lb.height = 0;
        resultFiles.push(new File([blob], `ezitoon_${safeTitle}_${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
        setRenderDone(i + 1);
      }
      for (let i = MAX_IMAGES; i < pages.length; i++) { pages[i].width = 0; pages[i].height = 0; }
    } else {
      const limit = Math.min(validCuts.length, MAX_IMAGES);
      for (let i = 0; i < limit; i++) {
        if (ac.signal.aborted || renderKeyRef.current !== key) return;
        const cut = validCuts[i];
        const canvas = await renderCutToCanvas(cut, characters, getImageUrl(cut), fontCSS, products);
        const { canvas: lb, imgRect } = letterboxCanvas(canvas);
        canvas.width = 0; canvas.height = 0;
        if (credit) drawCredit(lb, imgRect, nickname);
        const blob = await canvasToJpegBlob(lb);
        lb.width = 0; lb.height = 0;
        resultFiles.push(new File([blob], `ezitoon_${safeTitle}_${String(i + 1).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
        setRenderDone(i + 1);
      }
    }

    if (ac.signal.aborted || renderKeyRef.current !== key) return;
    filesRef.current = resultFiles;
    setRenderState('done');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuts, characters, getImageUrl, products, pageFormat, hasPageFormat, episodeTitle, nickname]);

  // ── 렌더 트리거 (open 시 + 토글/크레딧 변경 시) ──
  const triggerRender = useCallback((mode, credit) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const key = ++renderKeyRef.current;

    filesRef.current = [];
    setRenderState('rendering');
    setRenderDone(0);
    setRenderError(null);
    setShareError(null);

    startRender(mode, credit, ac, key).catch((err) => {
      if (err.name === 'AbortError' || renderKeyRef.current !== key) return;
      setRenderError(err.message || '렌더링 실패');
      setRenderState('error');
    });
  }, [startRender]);

  // ── open 시 초기화 + 렌더 시작 ──
  useEffect(() => {
    if (!open) return;
    setCaption(buildDefaultCaption({ episodeTitle, nickname, shareUrl, isPublic }));
    setCopyState('idle');
    setLinkCopyState('idle');
    setShareError(null);

    const mode = hasPageFormat ? (localStorage.getItem('insta_share_mode') || 'page') : 'cuts';
    setShareMode(mode);
    const credit = localStorage.getItem('insta_credit') !== '0';
    setShowCredit(credit);

    triggerRender(mode, credit);

    return () => { abortRef.current?.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { if (!open) abortRef.current?.abort(); }, [open]);

  if (!open) return null;

  // ── 토글 전환 ──
  function handleModeChange(mode) {
    setShareMode(mode);
    localStorage.setItem('insta_share_mode', mode);
    triggerRender(mode, showCredit);
  }

  // ── 크레딧 토글 ──
  function handleCreditChange(checked) {
    setShowCredit(checked);
    localStorage.setItem('insta_credit', checked ? '1' : '0');
    triggerRender(effectiveMode, checked);
  }

  // ── 공유 실행 ──
  async function handleShare() {
    setShareError(null);

    let shareFiles;
    if (shareSource === 'reel' && reelPath) {
      try {
        const resp = await fetch(reelPath);
        const blob = await resp.blob();
        shareFiles = [new File([blob], 'ezitoon_reel.mp4', { type: 'video/mp4' })];
        if (!navigator.canShare?.({ files: shareFiles })) {
          setShareError('이 기기에서 영상 공유를 지원하지 않아요');
          return;
        }
      } catch {
        setShareError('릴스 파일 준비 실패');
        return;
      }
    } else if (shareSource === 'motionVideo' && (motionVideoUrls || []).length > 0) {
      try {
        shareFiles = [];
        for (const mv of motionVideoUrls) {
          const resp = await fetch(mv.url);
          const blob = await resp.blob();
          shareFiles.push(new File([blob], `ezitoon_cut${mv.cut_number}.mp4`, { type: 'video/mp4' }));
        }
        if (!navigator.canShare?.({ files: shareFiles })) {
          setShareError('이 기기에서 영상 공유를 지원하지 않아요');
          return;
        }
      } catch {
        setShareError('영상 파일 준비 실패');
        return;
      }
    } else {
      shareFiles = filesRef.current;
      if (!shareFiles.length) return;
    }

    navigator.share({
      files: shareFiles,
      title: episodeTitle || 'EziToon 웹툰',
    }).then(() => {
      onClose();
    }).catch((err) => {
      console.error('[InstaShare] share 실패', err.name, err.message);
      if (err.name === 'AbortError') {
        onClose();
      } else {
        setShareError('공유창을 열지 못했어요. ZIP으로 받아 올려 주세요');
      }
    });
  }

  // ── 캡션 복사 ──
  async function handleCopyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch { /* 무시 */ }
  }

  // ── 링크 복사 ──
  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      setLinkCopyState('copied');
      setTimeout(() => setLinkCopyState('idle'), 2000);
    } catch { /* 무시 */ }
  }

  const shareReady = renderState === 'done' && filesRef.current.length > 0;
  const canActuallyShare = shareReady && canShareFiles(filesRef.current);
  const pct = renderTotal > 0 ? Math.round((renderDone / renderTotal) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card w-full sm:max-w-md mx-0 sm:mx-4 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-night-border dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <Share2 size={18} className="text-neon-from" />
            <h3 className="font-bold text-ink-black dark:text-white text-sm">인스타그램 공유</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {/* 페이지/컷별 토글 — page_format이 있을 때만 */}
          {hasPageFormat && (
            <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <button
                onPointerDown={() => handleModeChange('page')}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${shareMode === 'page' ? 'bg-neon-from text-white' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}
              >
                페이지로 ({Math.min(pageCount, MAX_IMAGES)}장)
              </button>
              <button
                onPointerDown={() => handleModeChange('cuts')}
                className={`flex-1 py-2 text-xs font-bold transition-colors ${shareMode === 'cuts' ? 'bg-neon-from text-white' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}
              >
                컷별로 ({Math.min(cutCount, MAX_IMAGES)}장)
              </button>
            </div>
          )}

          {/* 20장 초과 안내 */}
          {exceeds && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                인스타는 한 게시물에 20장까지 — 1~20번만 보내요.
                나머지는 ZIP으로 받아 두 번째 게시물로 올려 주세요.
              </p>
            </div>
          )}

          {/* 크레딧 체크박스 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showCredit}
              onChange={(e) => handleCreditChange(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-neon-from focus:ring-neon-from/50"
            />
            <span className="text-xs text-zinc-600 dark:text-zinc-300">
              크레딧 표시 ({'\u00A9'} {nickname || '작가'} · EziToon)
            </span>
          </label>

          {/* 공유 소스 3택 라디오 — 영상 컷 또는 릴스가 있을 때 */}
          {((motionVideoUrls || []).length > 0 || reelPath) && (
            <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
              <button
                onPointerDown={() => setShareSource('images')}
                className={`flex-1 py-2 text-[11px] font-bold transition-colors ${shareSource === 'images' ? 'bg-neon-from text-white' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}
              >
                이미지
              </button>
              <button
                onPointerDown={() => (motionVideoUrls || []).length > 0 && setShareSource('motionVideo')}
                disabled={!(motionVideoUrls || []).length}
                className={`flex-1 py-2 text-[11px] font-bold transition-colors ${shareSource === 'motionVideo' ? 'bg-violet-500 text-white' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'} disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <Film size={10} className="inline mr-0.5" />영상 컷
              </button>
              <button
                onPointerDown={() => reelPath && setShareSource('reel')}
                disabled={!reelPath}
                className={`flex-1 py-2 text-[11px] font-bold transition-colors ${shareSource === 'reel' ? 'bg-rose-500 text-white' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'} disabled:opacity-30 disabled:cursor-not-allowed`}
                title={!reelPath ? '먼저 릴스 영상을 만들어요' : ''}
              >
                <Clapperboard size={10} className="inline mr-0.5" />릴스
              </button>
            </div>
          )}

          {/* 렌더링 진행 */}
          {renderState === 'rendering' && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
                이미지 준비 중 {renderDone}/{renderTotal}
              </p>
              <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: 'linear-gradient(to right, var(--color-neon-from, #a855f7), var(--color-neon-to, #6366f1))' }}
                />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 text-right">{pct}%</p>
            </div>
          )}

          {/* 렌더링 오류 */}
          {renderState === 'error' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400 break-all">{renderError || '이미지 준비 중 오류가 발생했어요.'}</p>
            </div>
          )}

          {/* 캡션 영역 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-300">캡션</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              className="w-full text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-neon-from/50"
            />
            <button
              onPointerDown={handleCopyCaption}
              className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              {copyState === 'copied' ? <><Check size={13} className="text-emerald-500" /> 복사됨 ✓</> : <><Copy size={13} /> 캡션 복사</>}
            </button>
          </div>

          {/* 공유 오류 */}
          {shareError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400">{shareError}</p>
            </div>
          )}

          {/* 지원 모드: 피드 안내 + 공유하기 버튼 */}
          {isShareSupported && !shareError && (
            <>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center">
                공유창에서 Instagram → <b className="text-zinc-600 dark:text-zinc-300">피드</b>를 선택하면 여러 장이 슬라이드로 올라가요
              </p>
              <button
                onClick={canActuallyShare ? handleShare : undefined}
                disabled={!canActuallyShare}
                className={`neon-btn w-full py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${canActuallyShare ? 'opacity-100 hover:-translate-y-0.5 active:scale-95' : 'opacity-50 cursor-not-allowed'}`}
              >
                <Share2 size={16} />
                {renderState === 'rendering' ? '이미지 준비 중…' : '공유하기'}
              </button>
            </>
          )}

          {/* 공유 오류 시: ZIP 받기 */}
          {shareError && onZipDownload && (
            <button
              onPointerDown={onZipDownload}
              className="neon-btn w-full py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:scale-95"
            >
              <Download size={16} /> ZIP 받기
            </button>
          )}

          {/* 미지원(PC) 모드 — 피드 안내 없음 */}
          {!isShareSupported && (
            <div className="space-y-3">
              <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3">
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  폰에서 ssagda.com/WEBTOON을 열고 같은 버튼을 누르면 인스타로 바로 보낼 수 있어요.
                </p>
              </div>
              <div className="flex gap-2">
                <button onPointerDown={handleCopyLink} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                  {linkCopyState === 'copied' ? <><Check size={13} className="text-emerald-500" /> 복사됨 ✓</> : <><Copy size={13} /> 링크 복사</>}
                </button>
                {onZipDownload && (
                  <button onPointerDown={onZipDownload} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl neon-btn transition-all hover:-translate-y-0.5">
                    <Download size={13} /> ZIP 받기
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
