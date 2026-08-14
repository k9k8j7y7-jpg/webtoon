/**
 * exportRenderer.js — 프론트엔드 Export 렌더러 (SVG 직렬화 방식)
 *
 * 핵심 원칙: 화면에서 보이는 SVG를 그대로 직렬화하여 Export.
 * BubbleOverlay·SfxLayer 컴포넌트를 renderToStaticMarkup()으로 호출하여
 * 화면과 구조적으로 동일한 SVG를 생성한다.
 *
 * 폰트: SVG 내부 <style>에 Pretendard woff2를 Base64로 인라인.
 * 해상도: viewBox는 참조 크기(REF_WIDTH), width/height는 원본 이미지 해상도.
 */

import JSZip from 'jszip';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BubbleOverlayComponent from '../components/BubbleOverlay';
import SfxLayerComponent from '../components/SfxLayer';
import { loadFontCSS } from './fontEmbed';
import { computeInitialLayouts } from './bubbleLayout';

// ── 이미지 로드 헬퍼 ──

function loadImage(src, useCORS = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCORS) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${src}`));
    img.src = src;
  });
}

// ── SVG 내부 콘텐츠 추출 ──
// renderToStaticMarkup이 반환하는 <svg ...>...</svg>에서
// 안쪽 콘텐츠만 꺼내어 wrapper SVG에 넣는다.

function extractSvgContent(svgString) {
  if (!svgString) return '';
  const match = svgString.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  return match ? match[1] : '';
}

// ── 참조 크기 ──
// 화면 표시 크기에 가까운 값으로 geometry를 계산하고,
// SVG viewBox → width/height 스케일링으로 원본 해상도 출력.
const REF_WIDTH = 400;

// ── 컷 1장 → Canvas (SVG 직렬화 방식) ──

export async function renderCutToCanvas(cut, characters, imageUrl, fontCSS) {
  const img = await loadImage(imageUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 1. 베이스 이미지
  ctx.drawImage(img, 0, 0, W, H);

  // 2. SVG 오버레이 (말풍선 + 효과음) — CutEditor 보기모드와 동일한 배치
  // computeInitialLayouts: bubble_layout이 없는 대사에 기본 배치 할당
  const dialogue = computeInitialLayouts(cut.dialogue || []);
  const hasBubbles = dialogue.length > 0;
  const hasSfx = cut.sfx_items?.length > 0;

  if ((hasBubbles || hasSfx) && fontCSS) {
    // viewBox 참조 크기: 화면 비율 유지, 고정 너비
    const refW = REF_WIDTH;
    const refH = Math.round(refW * H / W);

    let innerContent = '';

    if (hasBubbles) {
      const bubbleSvg = renderToStaticMarkup(
        createElement(BubbleOverlayComponent, {
          dialogue,
          characters: characters || [],
          width: refW,
          height: refH,
        }),
      );
      innerContent += extractSvgContent(bubbleSvg);
    }

    if (hasSfx) {
      const sfxSvg = renderToStaticMarkup(
        createElement(SfxLayerComponent, {
          sfxItems: cut.sfx_items,
          width: refW,
          height: refH,
        }),
      );
      innerContent += extractSvgContent(sfxSvg);
    }

    if (innerContent) {
      // viewBox = 참조 크기 / width·height = 원본 해상도
      // → SVG 벡터 스케일링으로 고해상도 출력
      const svgString = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${refW} ${refH}">`,
        `<defs><style>${fontCSS}</style></defs>`,
        innerContent,
        `</svg>`,
      ].join('');

      const svgBlob = new Blob([svgString], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const svgUrl = URL.createObjectURL(svgBlob);
      try {
        const svgImg = await loadImage(svgUrl, false); // Blob URL — CORS 불필요
        ctx.drawImage(svgImg, 0, 0, W, H);
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    }
  }

  return canvas;
}

// ── Canvas → PNG Blob ──

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG 변환 실패'))),
      'image/png',
    );
  });
}

// ── 전체 Export 진행 루프 ──

async function processAllCuts(
  cuts,
  characters,
  getImageUrl,
  onProgress,
  signal,
) {
  // 폰트 CSS를 한 번만 로드하여 전 컷에 재사용 (캐시됨)
  const fontCSS = await loadFontCSS();

  const results = [];
  for (let i = 0; i < cuts.length; i++) {
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');
    onProgress?.(i, cuts.length);
    const cut = cuts[i];
    if (!cut.image_url) {
      results.push(null);
      continue;
    }
    const canvas = await renderCutToCanvas(
      cut,
      characters,
      getImageUrl(cut),
      fontCSS,
    );
    const blob = await canvasToBlob(canvas);
    results.push(blob);
    // 메모리 해제
    canvas.width = 0;
    canvas.height = 0;
  }
  onProgress?.(cuts.length, cuts.length);
  return results;
}

// ── PNG ZIP Export ──

export async function exportAsPNGZip(
  cuts,
  characters,
  getImageUrl,
  { onProgress, signal } = {},
) {
  const blobs = await processAllCuts(
    cuts,
    characters,
    getImageUrl,
    onProgress,
    signal,
  );

  const zip = new JSZip();
  blobs.forEach((blob, i) => {
    if (!blob) return;
    const name = `cut_${String(cuts[i].cut_number).padStart(3, '0')}.png`;
    zip.file(name, blob);
  });

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

// ── 세로 이어붙이기 Export ──

export async function exportAsVertical(
  cuts,
  characters,
  getImageUrl,
  { onProgress, signal } = {},
) {
  const blobs = await processAllCuts(
    cuts,
    characters,
    getImageUrl,
    onProgress,
    signal,
  );

  const imgs = await Promise.all(
    blobs.map((b) =>
      b ? loadImage(URL.createObjectURL(b), false) : Promise.resolve(null),
    ),
  );

  const targetW = Math.max(
    ...imgs.filter(Boolean).map((i) => i.naturalWidth),
  );
  const totalH = imgs
    .filter(Boolean)
    .reduce((sum, i) => sum + i.naturalHeight, 0);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, totalH);

  let y = 0;
  for (const img of imgs) {
    if (!img) continue;
    const x = Math.floor((targetW - img.naturalWidth) / 2);
    ctx.drawImage(img, x, y);
    y += img.naturalHeight;
    URL.revokeObjectURL(img.src);
  }

  return canvasToBlob(canvas);
}

// ── 인스타그램 캐러셀 ZIP Export ──

const INSTA_SIZE = 1080;

export async function exportAsInstagram(
  cuts,
  characters,
  getImageUrl,
  { onProgress, signal } = {},
) {
  const blobs = await processAllCuts(
    cuts,
    characters,
    getImageUrl,
    onProgress,
    signal,
  );

  const zip = new JSZip();
  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    if (!blob) continue;
    const blobUrl = URL.createObjectURL(blob);
    const img = await loadImage(blobUrl, false);
    const scale = Math.min(
      INSTA_SIZE / img.naturalWidth,
      INSTA_SIZE / img.naturalHeight,
    );
    const imgW = Math.round(img.naturalWidth * scale);
    const imgH = Math.round(img.naturalHeight * scale);
    const ox = Math.floor((INSTA_SIZE - imgW) / 2);
    const oy = Math.floor((INSTA_SIZE - imgH) / 2);

    const c = document.createElement('canvas');
    c.width = INSTA_SIZE;
    c.height = INSTA_SIZE;
    const ctx2 = c.getContext('2d');
    ctx2.fillStyle = '#ffffff';
    ctx2.fillRect(0, 0, INSTA_SIZE, INSTA_SIZE);
    ctx2.drawImage(img, ox, oy, imgW, imgH);
    URL.revokeObjectURL(blobUrl);

    const pngBlob = await canvasToBlob(c);
    const name = `instagram_${String(cuts[i].cut_number).padStart(3, '0')}.png`;
    zip.file(name, pngBlob);
    c.width = 0;
    c.height = 0;
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

// ══════════════════════════════════════════════════════════════
// ═══ 레거시: Canvas 2D 직접 그리기 코드 (비활성화)          ═══
// ═══ SVG 직렬화 방식 검증 완료 후 제거 예정                ═══
// ══════════════════════════════════════════════════════════════
//
// import {
//   BUBBLE_CONFIGS, wrapText, spikyPath,
//   computeSingleBubbleGeo, computeOverlayLayout,
// } from '../components/BubbleOverlay';
// import bubbleSpec from './bubbleSpec.json';
//
// function roundedRectPath(ctx, x, y, w, h, r) { ... }
// function drawTailCanvas(ctx, cfg, bx, by, needW, needH, tailDirection, flipTail) { ... }
// function drawOvalTail(ctx, cfg, cx, cy, erx, ery, dir, f) { ... }
// function drawIconCanvas(ctx, type, x, y, size) { ... }
// function drawBubbleCanvas(ctx, b) { ... }
// function drawSfxCanvas(ctx, sfxItems, W, H) { ... }
//
// 이전 renderCutToCanvas:
//   1. loadImage → Canvas에 drawImage
//   2. computeOverlayLayout으로 레이아웃 계산
//   3. Canvas 2D API로 말풍선 직접 다시 그리기 (drawBubbleCanvas)
//   4. Canvas 2D API로 효과음 직접 다시 그리기 (drawSfxCanvas)
//
// 문제점: 화면은 SVG <tspan>으로 그리고 Export는 Canvas fillText로 그려
//         폰트 메트릭 차이로 줄바꿈·글자 위치가 어긋남.
//         → SVG 직렬화 방식으로 대체하여 구조적 동일성 보장.
// ══════════════════════════════════════════════════════════════
