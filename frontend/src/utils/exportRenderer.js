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
import PngBubbleLayerComponent from '../components/PngBubbleLayer';
import EFFECT_CATALOG from './effectCatalog';
import PNGBUBBLE_CATALOG from './pngBubbleCatalog';
import { loadFontCSS, collectUsedFonts, ensureFontsLoaded } from './fontEmbed';
import { computeInitialLayouts } from './bubbleLayout';

// ── 이미지 로드 헬퍼 ──

function loadImage(src, useCORS = false) {
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

export async function renderCutToCanvas(cut, characters, imageUrl, fontCSS, products) {
  const img = await loadImage(imageUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 1. 베이스 이미지
  ctx.drawImage(img, 0, 0, W, H);

  // 2. SVG 오버레이 (제품 + 효과 + 말풍선 + PNG말풍선 + 효과음) — CutEditor 보기모드와 동일한 배치
  // 레이어 순서: 이미지 → 제품 → 효과 → SVG말풍선 → PNG말풍선 → 효과음
  const dialogue = computeInitialLayouts(cut.dialogue || []);
  const hasBubbles = dialogue.length > 0;
  const hasSfx = cut.sfx_items?.length > 0;
  const effectItems = cut.effect_items || [];
  const hasEffects = effectItems.length > 0;
  const productItems = cut.product_items || [];
  const productMap = products ? Object.fromEntries(products.map(p => [p.id, p])) : {};
  const hasProducts = productItems.length > 0 && products?.length > 0;
  const pngbubbleItems = cut.pngbubble_items || [];
  const hasPngbubbles = pngbubbleItems.length > 0;

  // 배경효과 PNG → Base64 변환 (CORS taint 방지)
  const effectBase64Cache = {};
  if (hasEffects) {
    const uniqueIds = [...new Set(effectItems.map(e => e.effect_id))];
    for (const id of uniqueIds) {
      const entry = EFFECT_CATALOG.find(e => e.id === id);
      if (!entry) continue;
      const effImg = await loadImage(entry.src, false);
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = effImg.naturalWidth;
      tmpCanvas.height = effImg.naturalHeight;
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(effImg, 0, 0);
      effectBase64Cache[id] = {
        dataUrl: tmpCanvas.toDataURL('image/png'),
        aspect: effImg.naturalHeight / effImg.naturalWidth,
      };
      tmpCanvas.width = 0;
      tmpCanvas.height = 0;
    }
  }

  // 제품 사진 → Base64 변환
  const productBase64Cache = {};
  if (hasProducts) {
    const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';
    const uniqueIds = [...new Set(productItems.map(p => p.product_id))];
    for (const pid of uniqueIds) {
      const product = productMap[pid];
      if (!product?.photo_url) continue;
      const url = product.photo_url.startsWith('http')
        ? product.photo_url
        : `${API_BASE}${product.photo_url.startsWith('/') ? '' : '/'}${product.photo_url}`;
      try {
        const pImg = await loadImage(url, true);
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = pImg.naturalWidth;
        tmpCanvas.height = pImg.naturalHeight;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(pImg, 0, 0);
        productBase64Cache[pid] = {
          dataUrl: tmpCanvas.toDataURL('image/png'),
          aspect: pImg.naturalHeight / pImg.naturalWidth,
        };
        tmpCanvas.width = 0;
        tmpCanvas.height = 0;
      } catch { /* 로드 실패 무시 */ }
    }
  }

  // PNG 말풍선 이미지 → Base64 변환
  const pngbubbleBase64Cache = {};
  if (hasPngbubbles) {
    const uniqueIds = [...new Set(pngbubbleItems.map(p => p.bubble_id))];
    for (const id of uniqueIds) {
      const entry = PNGBUBBLE_CATALOG.find(e => e.id === id);
      if (!entry) continue;
      const pbImg = await loadImage(entry.src, false);
      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = pbImg.naturalWidth;
      tmpCanvas.height = pbImg.naturalHeight;
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(pbImg, 0, 0);
      pngbubbleBase64Cache[id] = {
        dataUrl: tmpCanvas.toDataURL('image/png'),
        aspect: pbImg.naturalHeight / pbImg.naturalWidth,
        size: [pbImg.naturalWidth, pbImg.naturalHeight],
        text_area: entry.text_area,
      };
      tmpCanvas.width = 0;
      tmpCanvas.height = 0;
    }
  }

  if (hasBubbles || hasSfx || hasEffects || hasProducts || hasPngbubbles) {
    // viewBox 참조 크기: 화면 비율 유지, 고정 너비
    const refW = REF_WIDTH;
    const refH = Math.round(refW * H / W);

    let innerContent = '';

    // 제품 (이미지 바로 위, 효과·말풍선·효과음 아래)
    if (hasProducts) {
      for (const item of productItems) {
        const cached = productBase64Cache[item.product_id];
        if (!cached) continue;
        const pW = (item.width ?? 0.3) * refW;
        const pH = pW * cached.aspect;
        const cx = (item.x ?? 0.5) * refW;
        const cy = (item.y ?? 0.5) * refH;
        const rotation = item.rotation || 0;
        const opacity = item.opacity ?? 1;
        const transforms = [`translate(${cx},${cy})`, `rotate(${rotation})`];
        innerContent += `<g transform="${transforms.join(' ')}"><image href="${cached.dataUrl}" x="${-pW/2}" y="${-pH/2}" width="${pW}" height="${pH}" opacity="${opacity}"/></g>`;
      }
    }

    // 배경효과 (제품 위, 말풍선·효과음 아래)
    if (hasEffects) {
      for (const item of effectItems) {
        const cached = effectBase64Cache[item.effect_id];
        if (!cached) continue;
        const effW = (item.width ?? 1) * refW;
        const effH = effW * cached.aspect;
        const cx = (item.x ?? 0.5) * refW;
        const cy = (item.y ?? 0.5) * refH;
        const rotation = item.rotation || 0;
        const opacity = item.opacity ?? 1;
        const transforms = [`translate(${cx},${cy})`, `rotate(${rotation})`];
        if (item.flip_h) transforms.push('scale(-1,1)');
        innerContent += `<g transform="${transforms.join(' ')}"><image href="${cached.dataUrl}" x="${-effW/2}" y="${-effH/2}" width="${effW}" height="${effH}" opacity="${opacity}"/></g>`;
      }
    }

    if (hasBubbles) {
      const bubbleSvg = renderToStaticMarkup(
        createElement(BubbleOverlayComponent, {
          dialogue,
          characters: characters || [],
          width: refW,
          height: refH,
          renderMode: 'svg-text',
        }),
      );
      innerContent += extractSvgContent(bubbleSvg);
    }

    // PNG 말풍선 (SVG 말풍선 뒤, 효과음 앞)
    if (hasPngbubbles) {
      const pbSvg = renderToStaticMarkup(
        createElement(PngBubbleLayerComponent, {
          pngbubbleItems: pngbubbleItems,
          width: refW,
          height: refH,
        }),
      );
      // PngBubbleLayer의 <image href>를 Base64로 치환 (CORS taint 방지)
      let pbContent = extractSvgContent(pbSvg);
      for (const [id, cached] of Object.entries(pngbubbleBase64Cache)) {
        const entry = PNGBUBBLE_CATALOG.find(e => e.id === id);
        if (entry) {
          // src 경로를 Base64 dataUrl로 치환
          pbContent = pbContent.split(entry.src).join(cached.dataUrl);
        }
      }
      innerContent += pbContent;
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
      const defsContent = fontCSS ? `<defs><style>${fontCSS}</style></defs>` : '';
      const svgString = [
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${refW} ${refH}">`,
        defsContent,
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
  products,
) {
  // 사용된 커스텀 폰트 수집 → 폰트 CSS 로드 + 브라우저 폰트 대기
  const usedFontIds = collectUsedFonts(cuts);
  const fontCSS = await loadFontCSS(usedFontIds);
  await ensureFontsLoaded(usedFontIds);

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
      products,
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

// ── 페이지 형식 헬퍼 ──

const CUT_GAP_PX = 48;

/**
 * 컷 blobs → renderCutToCanvas 캔버스 배열 (composePageGrid 입력용)
 */
async function blobsToCanvases(blobs) {
  const canvases = [];
  for (const blob of blobs) {
    if (!blob) { canvases.push(null); continue; }
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url, false);
    URL.revokeObjectURL(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    canvases.push(c);
  }
  return canvases;
}

/**
 * 페이지 캔버스 배열 → blob 배열 (메모리 해제 포함)
 */
async function pageCanvasesToBlobs(pages) {
  const result = [];
  for (const pc of pages) {
    result.push(await canvasToBlob(pc));
    pc.width = 0; pc.height = 0;
  }
  return result;
}

// ── PNG ZIP Export ──

export async function exportAsPNGZip(
  cuts,
  characters,
  getImageUrl,
  { onProgress, signal, products, pageFormat } = {},
) {
  const blobs = await processAllCuts(
    cuts,
    characters,
    getImageUrl,
    onProgress,
    signal,
    products,
  );

  const zip = new JSZip();
  blobs.forEach((blob, i) => {
    if (!blob) return;
    const name = `cut_${String(cuts[i].cut_number).padStart(3, '0')}.png`;
    zip.file(name, blob);
  });

  // 페이지 형식이 있으면 pages/ 폴더에 페이지 합성 이미지도 추가
  if (pageFormat && pageFormat.per_page) {
    const canvases = await blobsToCanvases(blobs);
    const pages = composePageGrid(canvases.filter(Boolean), pageFormat);
    const pageBlobs = await pageCanvasesToBlobs(pages);
    pageBlobs.forEach((pb, i) => {
      zip.file(`pages/page_${String(i + 1).padStart(2, '0')}.png`, pb);
    });
    // 컷 캔버스 메모리 해제
    canvases.forEach(c => { if (c) { c.width = 0; c.height = 0; } });
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

// ── 세로 이어붙이기 Export ──

export async function exportAsVertical(
  cuts,
  characters,
  getImageUrl,
  { onProgress, signal, products, pageFormat } = {},
) {
  const blobs = await processAllCuts(
    cuts,
    characters,
    getImageUrl,
    onProgress,
    signal,
    products,
  );

  // 페이지 형식이 있으면 → 페이지 합성 후 세로 이어붙이기 (간격 CUT_GAP_PX)
  if (pageFormat && pageFormat.per_page) {
    const canvases = await blobsToCanvases(blobs);
    const pages = composePageGrid(canvases.filter(Boolean), pageFormat);
    canvases.forEach(c => { if (c) { c.width = 0; c.height = 0; } });

    const targetW = Math.max(...pages.map(p => p.width));
    const totalH = pages.reduce((sum, p) => sum + p.height, 0) + CUT_GAP_PX * (pages.length - 1);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, totalH);

    let y = 0;
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      const x = Math.floor((targetW - pg.width) / 2);
      ctx.drawImage(pg, x, y);
      y += pg.height + CUT_GAP_PX;
      pg.width = 0; pg.height = 0;
    }

    const result = await canvasToBlob(canvas);
    canvas.width = 0; canvas.height = 0;
    return result;
  }

  // vertical 형식 — 현행 그대로 (컷 이어붙이기)
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
  { onProgress, signal, products, pageFormat } = {},
) {
  const blobs = await processAllCuts(
    cuts,
    characters,
    getImageUrl,
    onProgress,
    signal,
    products,
  );

  // 페이지 형식이 있으면 → 페이지 1장씩 인스타 크기로
  if (pageFormat && pageFormat.per_page) {
    const canvases = await blobsToCanvases(blobs);
    // 인스타 크기로 composePageGrid — 2x2는 1080×1080, 3단은 1080×(비율에 따름)
    const pages = composePageGrid(canvases.filter(Boolean), pageFormat, INSTA_SIZE);
    canvases.forEach(c => { if (c) { c.width = 0; c.height = 0; } });

    if (pages.length === 1) {
      const result = await canvasToBlob(pages[0]);
      pages[0].width = 0; pages[0].height = 0;
      return result;
    }

    const zip = new JSZip();
    for (let i = 0; i < pages.length; i++) {
      const pb = await canvasToBlob(pages[i]);
      zip.file(`instagram_page_${String(i + 1).padStart(2, '0')}.png`, pb);
      pages[i].width = 0; pages[i].height = 0;
    }
    return zip.generateAsync({ type: 'blob', compression: 'STORE' });
  }

  // vertical 형식 — 현행 그대로 (컷 1장씩 letterbox)
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

// ── A4 인쇄용 Export ──

const A4_WIDTH = 2480;
const A4_HEIGHT = 3508;
const A4_MARGIN = 59;
const GRID_COLS = 4;
const GRID_ROWS = 3;
const GRID_GAP = 20;

// 모드 1 — 한 컷 크게 (지정 컷 1개를 페이지 중앙에 최대 크기)
export async function exportAsA4Single(
  cut,
  characters,
  getImageUrl,
  { onProgress, signal, products } = {},
) {
  // processAllCuts 재사용 (단일 컷 배열)
  const blobs = await processAllCuts(
    [cut],
    characters,
    getImageUrl,
    onProgress,
    signal,
    products,
  );

  const blob = blobs[0];
  if (!blob) throw new Error('컷 렌더링 실패');

  const blobUrl = URL.createObjectURL(blob);
  const img = await loadImage(blobUrl, false);
  URL.revokeObjectURL(blobUrl);

  const contentW = A4_WIDTH - A4_MARGIN * 2;
  const contentH = A4_HEIGHT - A4_MARGIN * 2;

  // 9:16 비율 유지 fit
  const scale = Math.min(contentW / img.naturalWidth, contentH / img.naturalHeight);
  const imgW = Math.round(img.naturalWidth * scale);
  const imgH = Math.round(img.naturalHeight * scale);
  const ox = A4_MARGIN + Math.floor((contentW - imgW) / 2);
  const oy = A4_MARGIN + Math.floor((contentH - imgH) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = A4_WIDTH;
  canvas.height = A4_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
  ctx.drawImage(img, ox, oy, imgW, imgH);

  const result = await canvasToBlob(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return result;
}

// 모드 2 — 그리드 (4×3, 페이지 분할) 또는 페이지 형식 → A4
export async function exportAsA4Grid(
  cuts,
  characters,
  getImageUrl,
  { onProgress, signal, products, pageFormat } = {},
) {
  const blobs = await processAllCuts(
    cuts,
    characters,
    getImageUrl,
    onProgress,
    signal,
    products,
  );

  // 페이지 형식이 있으면 → 페이지 합성 → 각 페이지를 A4 한 면에
  if (pageFormat && pageFormat.per_page) {
    const canvases = await blobsToCanvases(blobs);
    const pages = composePageGrid(canvases.filter(Boolean), pageFormat);
    canvases.forEach(c => { if (c) { c.width = 0; c.height = 0; } });

    const zip = new JSZip();
    for (let i = 0; i < pages.length; i++) {
      if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');

      const pg = pages[i];
      const contentW = A4_WIDTH - A4_MARGIN * 2;
      const contentH = A4_HEIGHT - A4_MARGIN * 2;
      const scale = Math.min(contentW / pg.width, contentH / pg.height);
      const imgW = Math.round(pg.width * scale);
      const imgH = Math.round(pg.height * scale);
      const ox = A4_MARGIN + Math.floor((contentW - imgW) / 2);
      const oy = A4_MARGIN + Math.floor((contentH - imgH) / 2);

      const a4 = document.createElement('canvas');
      a4.width = A4_WIDTH;
      a4.height = A4_HEIGHT;
      const ctx = a4.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
      ctx.drawImage(pg, ox, oy, imgW, imgH);
      pg.width = 0; pg.height = 0;

      const pb = await canvasToBlob(a4);
      a4.width = 0; a4.height = 0;

      if (pages.length === 1) return pb;
      zip.file(`A4-page_${String(i + 1).padStart(2, '0')}.png`, pb);
    }
    return zip.generateAsync({ type: 'blob', compression: 'STORE' });
  }

  // vertical 형식 — 현행 그리드 (4×3)
  const validBlobs = [];
  for (let i = 0; i < blobs.length; i++) {
    if (blobs[i]) validBlobs.push({ blob: blobs[i], cutNumber: cuts[i].cut_number });
  }

  const perPage = GRID_COLS * GRID_ROWS;
  const pageCount = Math.ceil(validBlobs.length / perPage);
  const zip = new JSZip();

  const contentW = A4_WIDTH - A4_MARGIN * 2;
  const contentH = A4_HEIGHT - A4_MARGIN * 2;
  const cellW = Math.floor((contentW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
  const cellH = Math.floor((contentH - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS);

  for (let p = 0; p < pageCount; p++) {
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');

    const canvas = document.createElement('canvas');
    canvas.width = A4_WIDTH;
    canvas.height = A4_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    const start = p * perPage;
    const end = Math.min(start + perPage, validBlobs.length);

    for (let idx = start; idx < end; idx++) {
      const pos = idx - start;
      const col = pos % GRID_COLS;
      const row = Math.floor(pos / GRID_COLS);

      const cellX = A4_MARGIN + col * (cellW + GRID_GAP);
      const cellY = A4_MARGIN + row * (cellH + GRID_GAP);

      const blobUrl = URL.createObjectURL(validBlobs[idx].blob);
      const img = await loadImage(blobUrl, false);
      URL.revokeObjectURL(blobUrl);

      // 셀 안에 비율 유지 fit
      const scale = Math.min(cellW / img.naturalWidth, cellH / img.naturalHeight);
      const imgW = Math.round(img.naturalWidth * scale);
      const imgH = Math.round(img.naturalHeight * scale);
      const ox = cellX + Math.floor((cellW - imgW) / 2);
      const oy = cellY + Math.floor((cellH - imgH) / 2);

      ctx.drawImage(img, ox, oy, imgW, imgH);
    }

    const pageBlob = await canvasToBlob(canvas);
    canvas.width = 0;
    canvas.height = 0;

    if (pageCount === 1) return pageBlob;
    zip.file(`A4-${p + 1}.png`, pageBlob);
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

// ── 페이지 합성 (형식별 그리드) ──

/**
 * composePageGrid — 컷 Canvas 배열을 형식 정의에 따라 페이지 Canvas로 합성.
 * @param {HTMLCanvasElement[]} cutCanvases - renderCutToCanvas로 만든 캔버스 배열
 * @param {object} format - PAGE_FORMATS의 형식 정의 (cols, rows, per_page, gap, border)
 * @param {number} pageWidth - 출력 페이지 가로 px (기본 1080)
 * @returns {HTMLCanvasElement[]} - 합성된 페이지 캔버스 배열
 */
export function composePageGrid(cutCanvases, format, pageWidth = 1080) {
  if (!format || !format.per_page) {
    return cutCanvases;
  }

  const { cols, rows, per_page, frame } = format;
  const fr = frame || { border_px: 3, gap_ratio: 0.025, margin_ratio: 0.03, bg: '#ffffff', stroke: '#000000' };

  const margin = Math.round(pageWidth * fr.margin_ratio);
  const gap = Math.round(pageWidth * fr.gap_ratio);
  const borderW = fr.border_px;

  const innerW = pageWidth - margin * 2;
  const totalGapX = gap * (cols - 1);
  const cellW = Math.floor((innerW - totalGapX) / cols);
  const [rw, rh] = (format.cell_ratio || '1:1').split(':').map(Number);
  const cellH = Math.round(cellW * (rh / rw));
  const totalGapY = gap * (rows - 1);
  const innerH = rows * cellH + totalGapY;
  const pageHeight = innerH + margin * 2;

  const pages = [];
  const pageCount = Math.ceil(cutCanvases.length / per_page);

  for (let p = 0; p < pageCount; p++) {
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    const ctx = canvas.getContext('2d');

    // 페이지 배경
    ctx.fillStyle = fr.bg;
    ctx.fillRect(0, 0, pageWidth, pageHeight);

    // 페이지 외곽 테두리
    if (borderW > 0) {
      ctx.strokeStyle = fr.stroke;
      ctx.lineWidth = borderW;
      const half = borderW / 2;
      ctx.strokeRect(half, half, pageWidth - borderW, pageHeight - borderW);
    }

    const start = p * per_page;
    const end = Math.min(start + per_page, cutCanvases.length);

    for (let idx = start; idx < end; idx++) {
      const pos = idx - start;
      const col = pos % cols;
      const row = Math.floor(pos / cols);

      const cellX = margin + col * (cellW + gap);
      const cellY = margin + row * (cellH + gap);

      const src = cutCanvases[idx];
      if (!src) continue;

      // 셀 안에 비율 유지 fit
      const scale = Math.min(cellW / src.width, cellH / src.height);
      const imgW = Math.round(src.width * scale);
      const imgH = Math.round(src.height * scale);
      const ox = cellX + Math.floor((cellW - imgW) / 2);
      const oy = cellY + Math.floor((cellH - imgH) / 2);

      ctx.drawImage(src, ox, oy, imgW, imgH);

      // 칸 테두리 (검정, 직각)
      if (borderW > 0) {
        ctx.strokeStyle = fr.stroke;
        ctx.lineWidth = borderW;
        const half = borderW / 2;
        ctx.strokeRect(cellX + half, cellY + half, cellW - borderW, cellH - borderW);
      }
    }

    pages.push(canvas);
  }

  return pages;
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
