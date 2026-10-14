/**
 * InstaShareModal — 인스타그램 Web Share API 공유 모달
 *
 * 역할: 웹툰 컷을 1080×1080 letterbox JPEG으로 변환 후 Web Share API로 전달.
 * - 10장 제한 (인스타 캐러셀 최대)
 * - 캡션 기본값 + 편집 + 복사
 * - PC/미지원 환경: 안내 + 링크 복사 + ZIP 다운로드
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Share2, Copy, Check, Download, X } from 'lucide-react';
import { renderCutToCanvas, composePageGrid } from '../utils/exportRenderer';
import { collectUsedFonts, loadFontCSS, ensureFontsLoaded } from '../utils/fontEmbed';

// ── 상수 ──
const INSTA_SIZE = 1080;
const MAX_IMAGES = 20;

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
async function letterboxCanvas(srcCanvas) {
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
  return out;
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

  const abortRef = useRef(null);

  // ── 공유 가능 여부 ──
  // canShare with files는 모바일에서만 지원됨
  const canShareFiles = useCallback((files) => {
    try {
      return !!(navigator.canShare && navigator.canShare({ files }));
    } catch {
      return false;
    }
  }, []);

  // 지원 여부를 미리 판단하기 위해 더미 파일로 확인
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

  // ── open 시 캡션 초기화 + 렌더 시작 ──
  useEffect(() => {
    if (!open) return;

    setCaption(buildDefaultCaption({ episodeTitle, nickname, shareUrl, isPublic }));
    setShareError(null);
    setCopyState('idle');
    setLinkCopyState('idle');

    // 이전 abort 정리
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    filesRef.current = [];
    setRenderState('rendering');
    setRenderDone(0);
    setRenderError(null);

    (async () => {
      try {
        // 대상 컷 결정 (이미지 있는 것만, 최대 MAX_IMAGES)
        const validCuts = (cuts || []).filter((c) => c.image_url);

        // pageFormat이 있으면 페이지 단위로, 없으면 컷 단위
        const isPageFormat = pageFormat && pageFormat.per_page;
        const totalUnits = isPageFormat
          ? Math.ceil(validCuts.length / pageFormat.per_page)
          : validCuts.length;
        const limitedTotal = Math.min(totalUnits, MAX_IMAGES);
        setRenderTotal(limitedTotal);

        // 폰트 준비
        const usedFontIds = collectUsedFonts(validCuts);
        const fontCSS = await loadFontCSS(usedFontIds);
        await ensureFontsLoaded(usedFontIds);

        if (ac.signal.aborted) return;

        const safeTitle = sanitizeFilename(episodeTitle);
        const resultFiles = [];

        if (isPageFormat) {
          // ── 페이지 형식: 페이지 단위로 합성 후 letterbox ──
          // 먼저 전체 컷 캔버스 렌더
          const cutCanvases = [];
          for (const cut of validCuts) {
            if (ac.signal.aborted) return;
            const canvas = await renderCutToCanvas(
              cut,
              characters,
              getImageUrl(cut),
              fontCSS,
              products,
            );
            cutCanvases.push(canvas);
          }

          const pages = composePageGrid(cutCanvases, pageFormat, INSTA_SIZE);
          // 컷 캔버스 해제
          cutCanvases.forEach((c) => { c.width = 0; c.height = 0; });

          for (let i = 0; i < Math.min(pages.length, MAX_IMAGES); i++) {
            if (ac.signal.aborted) return;
            const lb = await letterboxCanvas(pages[i]);
            pages[i].width = 0; pages[i].height = 0;
            const blob = await canvasToJpegBlob(lb);
            lb.width = 0; lb.height = 0;
            const filename = `ezitoon_${safeTitle}_${String(i + 1).padStart(2, '0')}.jpg`;
            resultFiles.push(new File([blob], filename, { type: 'image/jpeg' }));
            setRenderDone(i + 1);
          }
          // 남은 페이지 메모리 해제
          for (let i = MAX_IMAGES; i < pages.length; i++) {
            pages[i].width = 0; pages[i].height = 0;
          }
        } else {
          // ── 컷 단위 letterbox ──
          const limit = Math.min(validCuts.length, MAX_IMAGES);
          for (let i = 0; i < limit; i++) {
            if (ac.signal.aborted) return;
            const cut = validCuts[i];
            const canvas = await renderCutToCanvas(
              cut,
              characters,
              getImageUrl(cut),
              fontCSS,
              products,
            );
            const lb = await letterboxCanvas(canvas);
            canvas.width = 0; canvas.height = 0;
            const blob = await canvasToJpegBlob(lb);
            lb.width = 0; lb.height = 0;
            const filename = `ezitoon_${safeTitle}_${String(i + 1).padStart(2, '0')}.jpg`;
            resultFiles.push(new File([blob], filename, { type: 'image/jpeg' }));
            setRenderDone(i + 1);
          }
        }

        if (ac.signal.aborted) return;

        filesRef.current = resultFiles;
        setRenderState('done');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setRenderError(err.message || '렌더링 실패');
        setRenderState('error');
      }
    })();

    return () => {
      ac.abort();
    };
  // episodeTitle 등은 open 시점에만 읽으면 충분
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // modal 닫힐 때 abort
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
    }
  }, [open]);

  if (!open) return null;

  // ── 장수 초과 여부 ──
  const validCutCount = (cuts || []).filter((c) => c.image_url).length;
  const isPageFormat = pageFormat && pageFormat.per_page;
  const totalUnits = isPageFormat
    ? Math.ceil(validCutCount / pageFormat.per_page)
    : validCutCount;
  const exceeds = totalUnits > MAX_IMAGES;

  // ── 공유 실행 ──
  // navigator.share는 click 핸들러의 동기 호출 스택에서만 user activation 유지
  function handleShare() {
    const files = filesRef.current;
    if (!files.length) return;
    setShareError(null);

    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    const canResult = navigator.canShare ? navigator.canShare({ files }) : false;
    console.log('[InstaShare] share 시도', { fileCount: files.length, totalKB: Math.round(totalBytes / 1024), canShare: canResult });

    // navigator.share를 동기적으로 즉시 호출 (await 없이 .then/.catch)
    navigator.share({
      files,
      title: episodeTitle || 'EziToon 웹툰',
    }).then(() => {
      onClose();
    }).catch((err) => {
      console.error('[InstaShare] share 실패', err.name, err.message);
      if (err.name === 'AbortError') {
        onClose();
      } else {
        setShareError(`공유창을 열지 못했어요. ZIP으로 받아 올려 주세요 (${err.name}: ${err.message})`);
      }
    });
  }

  // ── 캡션 복사 ──
  async function handleCopyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      /* 무시 */
    }
  }

  // ── 링크 복사 ──
  async function handleCopyLink() {
    try {
      const text = shareUrl || window.location.href;
      await navigator.clipboard.writeText(text);
      setLinkCopyState('copied');
      setTimeout(() => setLinkCopyState('idle'), 2000);
    } catch {
      /* 무시 */
    }
  }

  // ── 공유 버튼 활성 여부 ──
  const shareReady = renderState === 'done' && filesRef.current.length > 0;
  const canActuallyShare = shareReady && canShareFiles(filesRef.current);

  // ── 진행률 표시 ──
  const pct = renderTotal > 0 ? Math.round((renderDone / renderTotal) * 100) : 0;

  // ── 레이아웃: 모바일은 바텀시트, PC는 중앙 모달 ──
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-card w-full sm:max-w-md mx-0 sm:mx-4 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-night-border dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <Share2 size={18} className="text-neon-from" />
            <h3 className="font-bold text-ink-black dark:text-white text-sm">
              인스타그램 공유
            </h3>
          </div>
          <button
            onPointerDown={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {/* 10장 초과 안내 */}
          {exceeds && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                인스타는 한 게시물에 20장까지 — 1~20번만 보내요.
                나머지는 ZIP으로 받아 두 번째 게시물로 올려 주세요.
              </p>
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
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(to right, var(--color-neon-from, #a855f7), var(--color-neon-to, #6366f1))',
                  }}
                />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 text-right">{pct}%</p>
            </div>
          )}

          {/* 렌더링 오류 */}
          {renderState === 'error' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400 break-all">
                {renderError || '이미지 준비 중 오류가 발생했어요.'}
              </p>
            </div>
          )}

          {/* 캡션 영역 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-300">
              캡션
            </label>
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
              {copyState === 'copied'
                ? <><Check size={13} className="text-emerald-500" /> 복사됨 ✓</>
                : <><Copy size={13} /> 캡션 복사</>
              }
            </button>
          </div>

          {/* 공유 오류 */}
          {shareError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs text-red-600 dark:text-red-400">{shareError}</p>
            </div>
          )}

          {/* ── 지원 모드: 공유하기 버튼 ── */}
          {/* onClick 필수 — navigator.share는 click 이벤트의 user activation 필요 (pointerdown 불가) */}
          {isShareSupported && !shareError && (
            <button
              onClick={canActuallyShare ? handleShare : undefined}
              disabled={!canActuallyShare}
              className={`neon-btn w-full py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                canActuallyShare
                  ? 'opacity-100 hover:-translate-y-0.5 active:scale-95'
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <Share2 size={16} />
              {renderState === 'rendering' ? '이미지 준비 중…' : '공유하기'}
            </button>
          )}

          {/* ── 공유 오류 시: ZIP 받기 버튼 ── */}
          {shareError && onZipDownload && (
            <button
              onPointerDown={onZipDownload}
              className="neon-btn w-full py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 active:scale-95"
            >
              <Download size={16} />
              ZIP 받기
            </button>
          )}

          {/* ── 미지원(PC) 모드 ── */}
          {!isShareSupported && (
            <div className="space-y-3">
              <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3">
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  폰에서 ssagda.com/WEBTOON을 열고 같은 버튼을 누르면 인스타로 바로 보낼 수 있어요.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onPointerDown={handleCopyLink}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  {linkCopyState === 'copied'
                    ? <><Check size={13} className="text-emerald-500" /> 복사됨 ✓</>
                    : <><Copy size={13} /> 링크 복사</>
                  }
                </button>
                {onZipDownload && (
                  <button
                    onPointerDown={onZipDownload}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl neon-btn transition-all hover:-translate-y-0.5"
                  >
                    <Download size={13} />
                    ZIP 받기
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
