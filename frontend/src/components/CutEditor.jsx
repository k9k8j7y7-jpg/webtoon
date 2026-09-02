/**
 * CutEditor — 컷 전체화면 편집기
 *
 * 보기 모드: 이미지 + SVG 말풍선·효과음 오버레이 (읽기 전용)
 * 편집 모드:
 *   - 말풍선: 드래그 이동·꼬리 방향·너비·종류·텍스트
 *   - 효과음: 드래그 이동·회전·글자 크기·색상·텍스트
 *
 * 저장: PUT /cuts/{cut_id}/dialogue — 이미지 재생성 없음 (과금 없음)
 * 좌표: bubble_layout / sfx_layout 모두 상대값(0~1)으로 저장
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';
import BubbleOverlay, { BUBBLE_CONFIGS, SingleBubble, BubbleMiniIcon, wrapText, computeSingleBubbleGeo, CHAR_WIDTH } from './BubbleOverlay';
import SfxLayer from './SfxLayer';
import { resolveBubbleStyle } from '../utils/bubbleMapping';
import bubbleSpec from '../utils/bubbleSpec.json';
import { getFontById, getFontsByUsage } from '../utils/fontCatalog';
import { X, Save, Pencil, Eye, Info, Zap, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { computeInitialLayouts } from '../utils/bubbleLayout';

// ── 꼬리 방향 선택지 ──
const TAIL_DIRS = [
  { key: 'down', label: '↓', title: '아래' },
  { key: 'up',   label: '↑', title: '위' },
  { key: 'left', label: '←', title: '왼쪽' },
  { key: 'right',label: '→', title: '오른쪽' },
  { key: 'none', label: '×', title: '꼬리 없음' },
];

// ── 글자 크기 선택지 (말풍선·효과음 공용) ──
const FONT_SCALE_OPTIONS = [
  { scale: 0.75, label: '작게' },
  { scale: 1.0,  label: '보통' },
  { scale: 1.3,  label: '크게' },
];

// ── 효과음 글자 크기 (더 넓은 범위) ──
const SFX_SCALE_OPTIONS = [
  { scale: 0.75, label: '소' },
  { scale: 1.0,  label: '중' },
  { scale: 1.5,  label: '대' },
  { scale: 2.2,  label: '특대' },
];

// ── 효과음 색상 프리셋 ──
const SFX_COLORS = [
  { color: '#1a1a1a', label: '검정' },
  { color: '#cc2222', label: '빨강' },
  { color: '#1a55cc', label: '파랑' },
  { color: '#d4a800', label: '노랑' },
  { color: '#ffffff', label: '흰색' },
];

// ── 버블 픽셀 높이 계산 — spec 기반, minHeightPx 최소 높이 지원 ──
function computeBubblePixelH(text, pw, style, fontScale = 1.0, minHeightPx = 0) {
  const cfg = BUBBLE_CONFIGS[style] || BUBBLE_CONFIGS.round;
  const sp = bubbleSpec.styles[style] || bubbleSpec.styles.round;
  const fontSize = bubbleSpec.baseFontSize * (cfg.fontSize || 1) * fontScale;
  const maxChars = Math.max(4, Math.floor((pw - sp.paddingX * 2) / (fontSize * CHAR_WIDTH)));
  const lines = wrapText(text || '', maxChars);
  const textH = lines.length * fontSize * bubbleSpec.lineHeightRatio + sp.paddingY * 2;
  return Math.max(textH, minHeightPx);
}

// ── 효과음 기본 크기 (표시 이미지 너비 7%) ──
const sfxFontPx = (imgW) => Math.max(24, imgW * 0.07);

// ── 효과음 드래그 영역 추정 크기 ──
function sfxHitBox(text, imgW, fontScale) {
  const fontSize = sfxFontPx(imgW) * fontScale;
  const w = Math.max(40, text.length * fontSize * 0.62) + 24;
  const h = fontSize * 1.4;
  return { w, h, fontSize };
}

// ──────────────────────────────────────────────────────────────
//  메인 컴포넌트
// ──────────────────────────────────────────────────────────────

export default function CutEditor({ cut, imageUrl, characters = [], charNameMap = {}, onClose, onSave, onPrev, onNext, cutIndex, totalCuts }) {
  const [mode, setMode] = useState('view');
  const [bubbles, setBubbles] = useState(() => (cut.dialogue || []).map(d => ({ ...d })));
  const [sfxItems, setSfxItems] = useState(() => (cut.sfx_items || []).map(s => ({ ...s })));
  const [selectedIdx, setSelectedIdx] = useState(null);     // 선택된 말풍선 인덱스
  const [selectedSfxIdx, setSelectedSfxIdx] = useState(null); // 선택된 효과음 인덱스
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openPalette, setOpenPalette] = useState(false);
  const paletteBtnRef = useRef(null);
  const [palettePos, setPalettePos] = useState({ x: 0, y: 0 });

  // 이미지 실제 렌더 크기 — JS 실측 방식
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const imgSizeRef = useRef({ w: 0, h: 0 });
  const [imgSizeState, setImgSizeState] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [dispSize, setDispSize] = useState({ w: 0, h: 0 });

  // 드래그/리사이즈/회전 ref
  const DRAG_THRESHOLD = 5;
  const dragMoved    = useRef(false);
  const dragRef      = useRef(null); // 말풍선 드래그
  const resizeRef    = useRef(null); // 말풍선 너비 리사이즈
  const sfxDragRef   = useRef(null); // 효과음 드래그
  const rotateRef    = useRef(null); // 효과음 회전

  // 컨테이너 실측 → 이미지 표시 크기 계산
  const recalcSize = useCallback(() => {
    const el = containerRef.current;
    const ns = naturalSize;
    if (!el || !ns.w || !ns.h) return;
    const availW = el.clientWidth * 0.92; // 좌우 여백
    const availH = el.clientHeight;
    const ratio = Math.min(availW / ns.w, availH / ns.h);
    const w = Math.floor(ns.w * ratio);
    const h = Math.floor(ns.h * ratio);
    setDispSize({ w, h });
    imgSizeRef.current = { w, h };
    setImgSizeState({ w, h });
  }, [naturalSize]);

  const measureImg = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    // clientWidth/Height 기반 폴백 (dispSize 계산 전)
    const { clientWidth: w, clientHeight: h } = img;
    if (w > 0 && h > 0) { imgSizeRef.current = { w, h }; setImgSizeState({ w, h }); }
  }, []);

  // 이미지 onLoad → 원본 크기 저장
  const handleImgLoad = useCallback((e) => {
    const img = e.target;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // naturalSize 변경 → 표시 크기 재계산
  useEffect(() => { recalcSize(); }, [recalcSize]);

  // ResizeObserver로 컨테이너 크기 변화 감지 (모드 전환, 창 리사이즈)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => recalcSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recalcSize]);

  // ── 모드 전환 ────────────────────────────────────────────

  const enterEditMode = () => {
    setBubbles(computeInitialLayouts(cut.dialogue || []));
    setSfxItems((cut.sfx_items || []).map(s => ({ ...s })));
    setSelectedIdx(null);
    setSelectedSfxIdx(null);
    setMode('edit');

  };

  const cancelEdit = () => {
    setBubbles((cut.dialogue || []).map(d => ({ ...d })));
    setSfxItems((cut.sfx_items || []).map(s => ({ ...s })));
    setSelectedIdx(null);
    setSelectedSfxIdx(null);
    setOpenPalette(false);
    setMode('view');

  };

  // ── 저장 ─────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/cuts/${cut.cut_id}/dialogue`, {
        dialogue: bubbles,
        sfx_items: sfxItems,
      });
      if (onSave) await onSave();
      setMode('view');
  
    } catch (err) {
      setError(err.response?.data?.detail || '저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  // ── 말풍선 업데이트 ───────────────────────────────────────

  const updateBubble = useCallback((idx, updates) => {
    setBubbles(prev => prev.map((b, i) => i === idx ? { ...b, ...updates } : b));
  }, []);

  const updateLayout = useCallback((idx, layoutUpdates) => {
    setBubbles(prev => prev.map((b, i) =>
      i === idx ? { ...b, bubble_layout: { ...b.bubble_layout, ...layoutUpdates } } : b
    ));
  }, []);

  // ── 효과음 업데이트 ───────────────────────────────────────

  const updateSfxItem = useCallback((idx, updates) => {
    setSfxItems(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  }, []);

  const updateSfxLayout = useCallback((idx, layoutUpdates) => {
    setSfxItems(prev => prev.map((s, i) =>
      i === idx ? { ...s, sfx_layout: { ...s.sfx_layout, ...layoutUpdates } } : s
    ));
  }, []);

  const handleAddSfx = () => {
    const newIdx = sfxItems.length;
    const newSfx = {
      id: `sfx_${Date.now()}`,
      text: '쾅!',
      sfx_layout: {
        x: 0.25 + Math.random() * 0.40,
        y: 0.25 + Math.random() * 0.35,
        font_scale: 1.5,
        rotation: Math.round((Math.random() - 0.5) * 30),
        color: '#1a1a1a',
      },
    };
    setSfxItems(prev => [...prev, newSfx]);
    setSelectedSfxIdx(newIdx);
    setSelectedIdx(null);
    setOpenPalette(false);
  };

  const handleDeleteSfx = (idx) => {
    setSfxItems(prev => prev.filter((_, i) => i !== idx));
    setSelectedSfxIdx(null);
  };

  const handleDeleteBubble = (idx) => {
    setBubbles(prev => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  // ── 말풍선 드래그 ─────────────────────────────────────────

  const handleBubblePointerDown = (e, idx) => {
    e.stopPropagation();
    if (e.touches) e.preventDefault();
    setSelectedIdx(idx);
    setSelectedSfxIdx(null);
    setOpenPalette(false);
    dragMoved.current = false;

    const b = bubbles[idx];
    if (!b.bubble_layout) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = {
      idx,
      startX: clientX, startY: clientY,
      origX: b.bubble_layout.x, origY: b.bubble_layout.y,
    };
  };

  const applyDrag = useCallback((clientX, clientY) => {
    const ds = dragRef.current;
    if (!ds) return;
    const { w, h } = imgSizeRef.current;
    if (!w || !h) return;
    if (Math.hypot(clientX - ds.startX, clientY - ds.startY) < DRAG_THRESHOLD) return;
    dragMoved.current = true;
    const dx = (clientX - ds.startX) / w;
    const dy = (clientY - ds.startY) / h;
    setBubbles(prev => {
      const b = prev[ds.idx];
      const bw = b.bubble_layout?.width || 0.5;
      return prev.map((item, i) => i !== ds.idx ? item : {
        ...item,
        bubble_layout: {
          ...item.bubble_layout,
          x: ds.origX + dx,
          y: ds.origY + dy,
        },
      });
    });
  }, []);

  const applyResize = useCallback((clientX) => {
    const rs = resizeRef.current;
    if (!rs) return;
    const { w } = imgSizeRef.current;
    if (!w) return;
    if (Math.abs(clientX - rs.startX) < DRAG_THRESHOLD) return;
    dragMoved.current = true;
    const dx = (clientX - rs.startX) / w;
    const newW = Math.max(0.15, Math.min(0.95, rs.origWidth + dx));
    setBubbles(prev => prev.map((b, i) =>
      i === rs.idx ? { ...b, bubble_layout: { ...b.bubble_layout, width: newW } } : b
    ));
  }, []);

  const handleResizePointerDown = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    const b = bubbles[idx];
    resizeRef.current = { idx, startX: e.clientX, origWidth: b.bubble_layout?.width || 0.5 };
  };

  // ── 효과음 드래그 ─────────────────────────────────────────

  const handleSfxPointerDown = (e, idx) => {
    e.stopPropagation();
    if (e.touches) e.preventDefault();
    setSelectedSfxIdx(idx);
    setSelectedIdx(null);
    setOpenPalette(false);
    dragMoved.current = false;

    const sfx = sfxItems[idx];
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    sfxDragRef.current = {
      idx,
      startX: clientX, startY: clientY,
      origX: sfx.sfx_layout.x, origY: sfx.sfx_layout.y,
    };
  };

  const applySfxDrag = useCallback((clientX, clientY) => {
    const sd = sfxDragRef.current;
    if (!sd) return;
    const { w, h } = imgSizeRef.current;
    if (!w || !h) return;
    if (Math.hypot(clientX - sd.startX, clientY - sd.startY) < DRAG_THRESHOLD) return;
    dragMoved.current = true;
    const dx = (clientX - sd.startX) / w;
    const dy = (clientY - sd.startY) / h;
    setSfxItems(prev => prev.map((item, i) => i !== sd.idx ? item : {
      ...item,
      sfx_layout: {
        ...item.sfx_layout,
        x: Math.max(0.01, Math.min(0.99, sd.origX + dx)),
        y: Math.max(0.01, Math.min(0.99, sd.origY + dy)),
      },
    }));
  }, []);

  // ── 효과음 회전 ───────────────────────────────────────────

  const handleRotateStart = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    const sfx = sfxItems[idx];
    const layout = sfx.sfx_layout;
    const imgRect = imgRef.current?.getBoundingClientRect();
    if (!imgRect) return;
    const { w, h } = imgSizeRef.current;
    const centerX = imgRect.left + layout.x * w;
    const centerY = imgRect.top + layout.y * h;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
    rotateRef.current = {
      idx, centerX, centerY,
      startAngle,
      origRotation: layout.rotation || 0,
    };
  };

  const applyRotate = useCallback((clientX, clientY) => {
    const rs = rotateRef.current;
    if (!rs) return;
    const angle = Math.atan2(clientY - rs.centerY, clientX - rs.centerX) * 180 / Math.PI;
    const newRotation = rs.origRotation + (angle - rs.startAngle);
    setSfxItems(prev => prev.map((item, i) =>
      i === rs.idx ? { ...item, sfx_layout: { ...item.sfx_layout, rotation: Math.round(newRotation) } } : item
    ));
  }, []);

  // ── window 이벤트 (mousemove/mouseup/touch) ───────────────

  const handleMouseMove = useCallback((e) => {
    if (dragRef.current)    applyDrag(e.clientX, e.clientY);
    else if (sfxDragRef.current) applySfxDrag(e.clientX, e.clientY);
    else if (resizeRef.current)  applyResize(e.clientX);
    else if (rotateRef.current)  applyRotate(e.clientX, e.clientY);
  }, [applyDrag, applySfxDrag, applyResize, applyRotate]);

  const handleMouseUp = useCallback((e) => {
    // 말풍선 드래그 클릭 판정
    const ds = dragRef.current;
    if (ds) {
      const dist = Math.hypot((e?.clientX ?? ds.startX) - ds.startX, (e?.clientY ?? ds.startY) - ds.startY);
      if (dist < DRAG_THRESHOLD) setSelectedIdx(ds.idx);
    }
    dragRef.current = null;

    // 효과음 드래그 클릭 판정
    const sd = sfxDragRef.current;
    if (sd) {
      const dist = Math.hypot((e?.clientX ?? sd.startX) - sd.startX, (e?.clientY ?? sd.startY) - sd.startY);
      if (dist < DRAG_THRESHOLD) setSelectedSfxIdx(sd.idx);
    }
    sfxDragRef.current = null;
    resizeRef.current = null;
    rotateRef.current = null;
  }, [setSelectedIdx, setSelectedSfxIdx]);

  const handleTouchMove = useCallback((e) => {
    if (!e.touches?.length) return;
    e.preventDefault();
    const t = e.touches[0];
    if (dragRef.current)     applyDrag(t.clientX, t.clientY);
    else if (sfxDragRef.current) applySfxDrag(t.clientX, t.clientY);
  }, [applyDrag, applySfxDrag]);

  const handleTouchEnd = useCallback((e) => {
    const t = e.changedTouches?.[0];

    const ds = dragRef.current;
    if (ds && t) {
      if (Math.hypot(t.clientX - ds.startX, t.clientY - ds.startY) < DRAG_THRESHOLD) setSelectedIdx(ds.idx);
    }
    dragRef.current = null;

    const sd = sfxDragRef.current;
    if (sd && t) {
      if (Math.hypot(t.clientX - sd.startX, t.clientY - sd.startY) < DRAG_THRESHOLD) setSelectedSfxIdx(sd.idx);
    }
    sfxDragRef.current = null;
    resizeRef.current = null;
    rotateRef.current = null;
  }, [setSelectedIdx, setSelectedSfxIdx]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // ── 키보드 이전/다음 컷 이동 (편집 모드가 아닐 때만) ──
  useEffect(() => {
    const handleKey = (e) => {
      if (mode === 'edit') return; // 편집 중에는 키보드 이동 비활성
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev?.(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onNext?.(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, onPrev, onNext]);

  // ── 파생 상태 ────────────────────────────────────────────

  const selectedBubble  = selectedIdx !== null ? bubbles[selectedIdx] : null;
  const selectedSfxItem = selectedSfxIdx !== null ? sfxItems[selectedSfxIdx] : null;
  const { w: imgW, h: imgH } = imgSizeState;

  // ──────────────────────────────────────────────────────────────
  //  렌더링
  // ──────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onClick={() => { setSelectedIdx(null); setSelectedSfxIdx(null); setOpenPalette(false); }}
    >
      {/* ── 상단 바 ── */}
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-sm shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {/* 컷 번호 / 총 컷 수 */}
          <span className="text-white font-bold text-sm">
            컷 #{cut.cut_number}
            {totalCuts > 0 && (
              <span className="text-zinc-400 font-normal text-xs ml-1">({cutIndex}/{totalCuts})</span>
            )}
          </span>
          {mode === 'view' && (
            <span className="text-xs text-zinc-400 font-bold flex items-center gap-1">
              <Eye size={12} /> 보기 모드
            </span>
          )}
          {mode === 'edit' && (
            <span className="text-xs text-purple-400 font-bold flex items-center gap-1">
              <Pencil size={12} /> 편집 모드
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'view' && cut.image_url && (
            <button
              onClick={enterEditMode}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-sm font-bold transition-colors shadow-sm"
            >
              <Pencil size={13} /> 편집
            </button>
          )}
          {mode === 'edit' && (
            <>
              {/* 효과음 추가 버튼 */}
              <button
                onClick={handleAddSfx}
                className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-full text-xs font-bold transition-colors shadow-sm"
              >
                <Zap size={12} /> 효과음 추가
              </button>
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm font-bold transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-full text-sm font-bold transition-colors shadow-sm disabled:opacity-50"
              >
                <Save size={13} /> {saving ? '저장 중…' : '저장'}
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── 이미지 영역 ── */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden min-h-0 relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative" style={dispSize.w > 0 ? { width: dispSize.w, height: dispSize.h } : undefined}>
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`컷 ${cut.cut_number}`}
            className="select-none block"
            style={dispSize.w > 0 ? { width: dispSize.w, height: dispSize.h } : { maxWidth: '92vw', maxHeight: '100%', objectFit: 'contain' }}
            onLoad={handleImgLoad}
            draggable={false}
          />

          {/* 보기 모드: 읽기 전용 오버레이 */}
          {mode === 'view' && imgW > 0 && (
            <>
              <BubbleOverlay dialogue={bubbles} characters={characters} width={imgW} height={imgH} />
              <SfxLayer sfxItems={sfxItems} width={imgW} height={imgH} />
            </>
          )}

          {/* 편집 모드: 인터랙티브 SVG */}
          {mode === 'edit' && imgW > 0 && (
            <svg
              className="absolute inset-0"
              width={imgW} height={imgH}
              overflow="visible"
              style={{ top: 0, left: 0 }}
              onClick={e => e.stopPropagation()}
            >
              {/* 배경 투명 rect: 빈 곳 클릭 → 선택 해제 */}
              <rect
                x={0} y={0} width={imgW} height={imgH}
                fill="transparent"
                style={{ pointerEvents: 'all', cursor: 'default' }}
                onClick={e => {
                  e.stopPropagation();
                  if (dragMoved.current) { dragMoved.current = false; return; }
                  setSelectedIdx(null);
                  setSelectedSfxIdx(null);
                  setOpenPalette(false);
                }}
              />

              {/* ── 말풍선들 ── */}
              {bubbles.map((b, i) => {
                const layout = b.bubble_layout;
                if (!layout) return null;
                const style = resolveBubbleStyle(b, characters);
                const px = layout.x * imgW;
                const py = layout.y * imgH;
                const pw = layout.width * imgW;
                const fontScale = layout.font_scale || 1.0;
                const minHeightPx = (layout.min_height || 0) * imgH;
                const tailDir = layout.tail_direction || 'down';
                const flipTail = layout.tail_flip || false;

                // computeSingleBubbleGeo로 실제 도형 크기를 얻음
                // fixedWidth=true: 사용자가 설정한 너비를 그대로 사용 (스마트핏 없음)
                const geo = computeSingleBubbleGeo(style, b.text, px, py, pw, minHeightPx, fontScale, tailDir, flipTail, true);
                const { bx: gx, by: gy, needW: gw, needH: gh } = geo;

                const isSelected = selectedIdx === i;
                const isNarration = b.type === 'narration';

                return (
                  <g key={i}>
                    <g style={{ pointerEvents: 'none' }}>
                      <SingleBubble
                        style={style} text={b.text}
                        bubbleX={px} bubbleY={py} bubbleW={pw}
                        bubbleH={minHeightPx}
                        tailDirection={tailDir}
                        flipTail={flipTail}
                        fontScale={fontScale}
                        fixedWidth={true}
                        viewW={imgW}
                        textOffsetX={layout.text_offset_x || 0}
                        textOffsetY={layout.text_offset_y || 0}
                      />
                    </g>
                    {/* 선택 박스 — 실제 도형 크기(gx,gy,gw,gh) 기준 */}
                    {isSelected && (
                      <rect x={gx-3} y={gy-3} width={gw+6} height={gh+6}
                        fill="none" stroke="#a855f7" strokeWidth={2}
                        strokeDasharray="5,3" rx={5} style={{ pointerEvents: 'none' }} />
                    )}
                    {/* 드래그 히트박스 — 사용자 지정 영역(px,py,pw) 기준으로 드래그 편의 유지 */}
                    <rect
                      x={px} y={py} width={pw} height={gh}
                      fill="transparent" style={{ cursor: 'grab', pointerEvents: 'all' }}
                      onMouseDown={e => handleBubblePointerDown(e, i)}
                      onTouchStart={e => { e.preventDefault(); handleBubblePointerDown(e, i); }}
                      onClick={e => { e.stopPropagation(); dragMoved.current = false; setSelectedIdx(i); setSelectedSfxIdx(null); setOpenPalette(false); }}
                    />
                    <text x={gx+4} y={gy-5} fill={isSelected ? '#a855f7' : 'rgba(255,255,255,0.5)'}
                      fontSize={9} fontWeight="bold"
                      stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>
                      {i + 1}
                    </text>
                    {isSelected && !isNarration && (
                      <g onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleResizePointerDown(e, i); }}
                        style={{ cursor: 'ew-resize', pointerEvents: 'all' }}>
                        <circle cx={gx+gw+1} cy={gy+gh/2} r={9} fill="#7c3aed" opacity={0.9} />
                        <text x={gx+gw+1} y={gy+gh/2+4} textAnchor="middle" fill="white" fontSize={11} fontWeight="bold"
                          style={{ pointerEvents: 'none' }}>↔</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* ── 효과음들 ── */}
              {sfxItems.map((sfx, i) => {
                const layout = sfx.sfx_layout || {};
                const px = (layout.x ?? 0.5) * imgW;
                const py = (layout.y ?? 0.5) * imgH;
                const fontScale = layout.font_scale || 1.0;
                const rotation = layout.rotation || 0;
                const color = layout.color || '#1a1a1a';
                const text = sfx.text || '';
                const isSelected = selectedSfxIdx === i;
                const { w: hitW, h: hitH, fontSize } = sfxHitBox(text, imgW, fontScale);
                const strokeW = Math.max(2, fontSize * 0.08);
                // 흰색 텍스트일 때는 아웃라인을 검정으로
                const outlineColor = color === '#ffffff' ? '#1a1a1a' : '#ffffff';
                const fontEntry = getFontById(layout.font);

                return (
                  <g key={`sfx-${sfx.id || i}`} transform={`translate(${px}, ${py}) rotate(${rotation})`}>
                    {/* 선택 테두리 */}
                    {isSelected && (
                      <rect x={-hitW/2-6} y={-hitH/2-6} width={hitW+12} height={hitH+12}
                        fill="none" stroke="#f97316" strokeWidth={2}
                        strokeDasharray="5,3" rx={5} style={{ pointerEvents: 'none' }} />
                    )}

                    {/* 효과음 텍스트 */}
                    <text
                      textAnchor="middle" dominantBaseline="middle"
                      style={{
                        fontSize: `${fontSize}px`, fontWeight: 900,
                        fill: color, stroke: outlineColor, strokeWidth: strokeW,
                        paintOrder: 'stroke fill',
                        fontFamily: fontEntry.family,
                        letterSpacing: '0.02em', pointerEvents: 'none',
                      }}
                    >{text}</text>

                    {/* 드래그 오버레이 */}
                    <rect
                      x={-hitW/2} y={-hitH/2} width={hitW} height={hitH}
                      fill="transparent" style={{ cursor: 'grab', pointerEvents: 'all' }}
                      onMouseDown={e => handleSfxPointerDown(e, i)}
                      onTouchStart={e => { e.preventDefault(); handleSfxPointerDown(e, i); }}
                      onClick={e => {
                        e.stopPropagation();
                        dragMoved.current = false;
                        setSelectedSfxIdx(i);
                        setSelectedIdx(null);
                        setOpenPalette(false);
                      }}
                    />

                    {/* 번호 라벨 */}
                    <text x={-hitW/2+2} y={-hitH/2-6}
                      fill={isSelected ? '#f97316' : 'rgba(255,165,0,0.45)'}
                      fontSize={8} fontWeight="bold"
                      stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} paintOrder="stroke"
                      style={{ pointerEvents: 'none' }}>
                      효{i+1}
                    </text>

                    {/* 회전 핸들 (선택 시) */}
                    {isSelected && (
                      <g>
                        <line x1="0" y1={-hitH/2-4} x2="0" y2={-hitH/2-28}
                          stroke="#f97316" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
                        <circle cx="0" cy={-hitH/2-32} r={10} fill="#f97316" opacity={0.9}
                          style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                          onMouseDown={e => handleRotateStart(e, i)} />
                        <text x="0" y={-hitH/2-28} textAnchor="middle" dominantBaseline="middle"
                          fill="white" fontSize={13} style={{ pointerEvents: 'none' }}>↻</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* ── 이전/다음 컷 화살표 (라이트박스 스타일) ── */}
        {onPrev && (
          <button
            onClick={e => { e.stopPropagation(); onPrev(); }}
            disabled={mode === 'edit'}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-black/50"
          >
            <ChevronLeft size={28} />
          </button>
        )}
        {onNext && (
          <button
            onClick={e => { e.stopPropagation(); onNext(); }}
            disabled={mode === 'edit'}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10 disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-black/50"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* ── 에러 ── */}
      {error && (
        <div className="shrink-0 px-4 py-2 bg-red-900/60 text-red-300 text-sm font-bold text-center"
          onClick={e => e.stopPropagation()}>
          {error}
        </div>
      )}

      {/* ── 하단 컨트롤 패널 (편집 모드) ── */}
      {mode === 'edit' && (
        <div
          className="shrink-0 bg-zinc-900 border-t border-zinc-800 max-h-[40vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* 말풍선 선택 패널 */}
          {selectedBubble && (
            <div className="px-4 py-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-purple-300">{selectedIdx + 1}번 말풍선</span>
                {selectedBubble.speaker && (
                  <span className="text-xs text-zinc-400 font-bold">
                    {charNameMap[selectedBubble.speaker] || selectedBubble.speaker}
                  </span>
                )}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  selectedBubble.type === 'narration' ? 'bg-zinc-700 text-zinc-300' :
                  selectedBubble.type === 'thought'   ? 'bg-purple-900/50 text-purple-300' :
                                                        'bg-blue-900/40 text-blue-300'
                }`}>
                  {selectedBubble.type === 'narration' ? '나레이션' : selectedBubble.type === 'thought' ? '독백' : '대사'}
                </span>
                <button
                  onClick={() => handleDeleteBubble(selectedIdx)}
                  className="ml-auto flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={12} /> 삭제
                </button>
              </div>

              <div className="flex items-start gap-4 flex-wrap">
                {/* 글자 크기 */}
                <div className="shrink-0">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">글자 크기</p>
                  <div className="flex gap-1">
                    {FONT_SCALE_OPTIONS.map(({ scale, label }) => {
                      const isActive = Math.abs((selectedBubble.bubble_layout?.font_scale || 1.0) - scale) < 0.05;
                      return (
                        <button key={scale}
                          onClick={() => updateLayout(selectedIdx, { font_scale: scale })}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            isActive ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                          }`}
                          style={{ fontSize: `${11 * scale}px` }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 최소 높이 슬라이더 (나레이션 제외) */}
                {selectedBubble.type !== 'narration' && (
                  <div className="shrink-0">
                    <p className="text-[10px] text-zinc-500 font-bold mb-1">
                      최소 높이 {Math.round((selectedBubble.bubble_layout?.min_height || 0) * 100)}%
                      <span className="text-zinc-600 ml-1 font-normal">(텍스트 따라 자동 확장)</span>
                    </p>
                    <input
                      type="range" min={0} max={50} step={1}
                      value={Math.round((selectedBubble.bubble_layout?.min_height || 0) * 100)}
                      onChange={e => updateLayout(selectedIdx, { min_height: Number(e.target.value) / 100 })}
                      className="w-28 accent-purple-500 cursor-pointer"
                    />
                  </div>
                )}

                {/* 꼬리 방향 + 좌우 반전 (꼬리 없는 스타일 제외) */}
                {!['narration', 'shout', 'angry', 'surprised'].includes(selectedBubble.type) && (
                  <div className="shrink-0">
                    <p className="text-[10px] text-zinc-500 font-bold mb-1">꼬리 방향</p>
                    <div className="flex gap-1">
                      {TAIL_DIRS.map(({ key, label, title }) => (
                        <button key={key} title={title}
                          onClick={() => updateLayout(selectedIdx, { tail_direction: key })}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                            (selectedBubble.bubble_layout?.tail_direction || 'down') === key
                              ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                          }`}>{label}</button>
                      ))}
                      {/* 꼬리 좌우 반전 버튼 (꼬리 없음 상태 제외) */}
                      {(selectedBubble.bubble_layout?.tail_direction || 'down') !== 'none' && (
                        <button
                          title="꼬리 좌우 반전"
                          onClick={() => updateLayout(selectedIdx, { tail_flip: !selectedBubble.bubble_layout?.tail_flip })}
                          className={`px-2.5 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                            selectedBubble.bubble_layout?.tail_flip
                              ? 'bg-purple-600 text-white'
                              : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                          }`}
                        >
                          ↔
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 너비 슬라이더 (나레이션 제외) */}
                {selectedBubble.type !== 'narration' && (
                  <div className="shrink-0">
                    <p className="text-[10px] text-zinc-500 font-bold mb-1">
                      너비 {Math.round((selectedBubble.bubble_layout?.width || 0.5) * 100)}%
                    </p>
                    <input type="range" min={15} max={92} step={1}
                      value={Math.round((selectedBubble.bubble_layout?.width || 0.5) * 100)}
                      onChange={e => updateLayout(selectedIdx, { width: Number(e.target.value) / 100 })}
                      className="w-28 accent-purple-500 cursor-pointer" />
                  </div>
                )}

                {/* 텍스트 가로 위치 슬라이더 */}
                <div className="shrink-0">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">
                    텍스트 가로 {Math.round((selectedBubble.bubble_layout?.text_offset_x || 0) * 100)}%
                  </p>
                  <input type="range" min={-50} max={50} step={1}
                    value={Math.round((selectedBubble.bubble_layout?.text_offset_x || 0) * 100)}
                    onChange={e => updateLayout(selectedIdx, { text_offset_x: Number(e.target.value) / 100 })}
                    onDoubleClick={() => updateLayout(selectedIdx, { text_offset_x: 0 })}
                    className="w-28 accent-purple-500 cursor-pointer" />
                </div>

                {/* 텍스트 세로 위치 슬라이더 */}
                <div className="shrink-0">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">
                    텍스트 세로 {Math.round((selectedBubble.bubble_layout?.text_offset_y || 0) * 100)}%
                  </p>
                  <input type="range" min={-50} max={50} step={1}
                    value={Math.round((selectedBubble.bubble_layout?.text_offset_y || 0) * 100)}
                    onChange={e => updateLayout(selectedIdx, { text_offset_y: Number(e.target.value) / 100 })}
                    onDoubleClick={() => updateLayout(selectedIdx, { text_offset_y: 0 })}
                    className="w-28 accent-purple-500 cursor-pointer" />
                </div>

                {/* 종류 팔레트 (나레이션 제외) */}
                {selectedBubble.type !== 'narration' && (
                  <div className="shrink-0">
                    <p className="text-[10px] text-zinc-500 font-bold mb-1">종류</p>
                    <button
                      ref={paletteBtnRef}
                      onClick={e => {
                        e.stopPropagation();
                        if (!openPalette && paletteBtnRef.current) {
                          const r = paletteBtnRef.current.getBoundingClientRect();
                          setPalettePos({ x: r.left, y: r.top });
                        }
                        setOpenPalette(p => !p);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      <BubbleMiniIcon styleKey={selectedBubble.bubble_style || resolveBubbleStyle(selectedBubble, characters)} size={20} />
                      {selectedBubble.bubble_style ? selectedBubble.bubble_style : '자동'}
                    </button>
                  </div>
                )}

                {/* 텍스트 편집 */}
                <div className="flex-1 min-w-[160px]">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">텍스트</p>
                  <textarea value={selectedBubble.text || ''}
                    onChange={e => updateBubble(selectedIdx, { text: e.target.value })}
                    rows={2}
                    className="w-full px-2.5 py-1.5 text-sm font-bold bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:border-purple-500 resize-none"
                    onClick={e => e.stopPropagation()} />
                </div>
              </div>
            </div>
          )}

          {/* 효과음 선택 패널 */}
          {!selectedBubble && selectedSfxItem && (
            <div className="px-4 py-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-orange-400 flex items-center gap-1">
                  <Zap size={12} /> 효과음 {selectedSfxIdx + 1}
                </span>
                <button
                  onClick={() => handleDeleteSfx(selectedSfxIdx)}
                  className="ml-auto flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={12} /> 삭제
                </button>
              </div>

              <div className="flex items-start gap-4 flex-wrap">
                {/* 글자 크기 */}
                <div className="shrink-0">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">글자 크기</p>
                  <div className="flex gap-1">
                    {SFX_SCALE_OPTIONS.map(({ scale, label }) => {
                      const isActive = Math.abs((selectedSfxItem.sfx_layout?.font_scale || 1.0) - scale) < 0.05;
                      return (
                        <button key={scale}
                          onClick={() => updateSfxLayout(selectedSfxIdx, { font_scale: scale })}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            isActive ? 'bg-orange-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                          }`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 회전 슬라이더 */}
                <div className="shrink-0">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">
                    회전 {selectedSfxItem.sfx_layout?.rotation || 0}°
                  </p>
                  <input type="range" min={-180} max={180} step={1}
                    value={selectedSfxItem.sfx_layout?.rotation || 0}
                    onChange={e => updateSfxLayout(selectedSfxIdx, { rotation: Number(e.target.value) })}
                    className="w-28 accent-orange-500 cursor-pointer" />
                </div>

                {/* 색상 프리셋 */}
                <div className="shrink-0">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">색상</p>
                  <div className="flex gap-1.5 items-center">
                    {SFX_COLORS.map(({ color, label }) => (
                      <button key={color} title={label}
                        onClick={() => updateSfxLayout(selectedSfxIdx, { color })}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          selectedSfxItem.sfx_layout?.color === color
                            ? 'border-orange-400 scale-110 ring-1 ring-orange-400'
                            : 'border-zinc-600 hover:border-zinc-400'
                        }`}
                        style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>

                {/* 폰트 선택 */}
                <div className="shrink-0">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">폰트</p>
                  <select
                    value={selectedSfxItem.sfx_layout?.font || 'pretendard'}
                    onChange={e => updateSfxLayout(selectedSfxIdx, { font: e.target.value })}
                    className="px-2 py-1.5 rounded-lg text-xs font-bold bg-zinc-700 text-zinc-200 border border-zinc-600 focus:outline-none focus:border-orange-500 cursor-pointer"
                    onClick={e => e.stopPropagation()}
                  >
                    {getFontsByUsage('sfx').map(f => (
                      <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 px-2 py-1 bg-zinc-900 rounded text-center"
                    style={{ fontFamily: getFontById(selectedSfxItem.sfx_layout?.font).family, fontWeight: 900, fontSize: '16px', color: '#f97316' }}>
                    쾅!
                  </div>
                </div>

                {/* 텍스트 편집 */}
                <div className="flex-1 min-w-[140px]">
                  <p className="text-[10px] text-zinc-500 font-bold mb-1">텍스트</p>
                  <input
                    type="text"
                    value={selectedSfxItem.text || ''}
                    onChange={e => updateSfxItem(selectedSfxIdx, { text: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-sm font-bold bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:border-orange-500"
                    placeholder="쾅!, 두근두근, 쿵!..."
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 아무것도 선택 안 됨 */}
          {!selectedBubble && !selectedSfxItem && (
            <div className="flex items-center justify-center gap-1.5 py-3 text-xs text-zinc-500 font-bold">
              <Info size={13} />
              말풍선 또는 효과음을 클릭하면 편집할 수 있습니다
            </div>
          )}
        </div>
      )}

      {/* ── 종류 팔레트 (fixed, overflow 부모 무시) ── */}
      {openPalette && selectedBubble && selectedBubble.type !== 'narration' && (
        <div
          className="bg-zinc-800 border border-zinc-700 rounded-2xl p-3 shadow-2xl w-72"
          style={{
            position: 'fixed',
            left: Math.min(palettePos.x, window.innerWidth - 300),
            bottom: window.innerHeight - palettePos.y + 8,
            zIndex: 60,
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
          onClick={e => e.stopPropagation()}
        >
          <p className="text-[10px] font-bold text-zinc-400 mb-1.5">기본</p>
          <div className="flex gap-1 flex-wrap mb-2">
            {['round','thought','whisper','shout'].map(sk => (
              <BubbleMiniIcon key={sk} styleKey={sk} size={26}
                selected={(selectedBubble.bubble_style || resolveBubbleStyle(selectedBubble, characters)) === sk}
                onClick={() => { updateBubble(selectedIdx, { bubble_style: sk }); setOpenPalette(false); }} />
            ))}
          </div>
          <p className="text-[10px] font-bold text-zinc-400 mb-1.5">감정</p>
          <div className="flex gap-1 flex-wrap mb-2">
            {['angry','happy','sad','surprised','shy','flustered','realize'].map(sk => (
              <BubbleMiniIcon key={sk} styleKey={sk} size={26}
                selected={(selectedBubble.bubble_style || resolveBubbleStyle(selectedBubble, characters)) === sk}
                onClick={() => { updateBubble(selectedIdx, { bubble_style: sk }); setOpenPalette(false); }} />
            ))}
          </div>
          <button onClick={() => { updateBubble(selectedIdx, { bubble_style: null }); setOpenPalette(false); }}
            className="w-full text-[10px] font-bold text-zinc-400 hover:text-zinc-200 py-1 text-center border border-zinc-700 rounded-lg">
            자동 (감정 기반)
          </button>
        </div>
      )}
    </div>
  );
}
