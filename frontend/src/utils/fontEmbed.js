/**
 * fontEmbed.js — SVG Export용 폰트 Base64 인라인
 *
 * SVG를 <img>로 로드하면 외부 폰트를 참조할 수 없으므로,
 * woff2 파일을 Base64로 인코딩하여 SVG <style>에 인라인한다.
 *
 * Pretendard: CDN에서 4개 굵기 다운로드 (캐시)
 * 커스텀 폰트: FONT_CATALOG 기반, 사용된 폰트만 로드
 */

import FONT_CATALOG, { getFontById } from './fontCatalog';

const FONT_WEIGHTS = [
  { weight: 400, name: 'Regular' },
  { weight: 500, name: 'Medium' },
  { weight: 700, name: 'Bold' },
  { weight: 900, name: 'Black' },
];

const CDN_BASE =
  'https://cdn.jsdelivr.net/npm/pretendard/dist/web/static/woff2';

// 캐시: Pretendard CSS + 개별 커스텀 폰트
let _pretendardCSS = null;
const _customCache = new Map(); // fontId → @font-face CSS string

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const chunkSize = 0x4000; // 16 KB — stack-safe
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    chunks.push(String.fromCharCode.apply(null, slice));
  }
  return btoa(chunks.join(''));
}

/**
 * Pretendard 4개 굵기의 @font-face CSS를 Base64 data-URI로 생성.
 */
async function loadPretendardCSS() {
  if (_pretendardCSS) return _pretendardCSS;

  const faces = await Promise.all(
    FONT_WEIGHTS.map(async ({ weight, name }) => {
      const url = `${CDN_BASE}/Pretendard-${name}.woff2`;
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(
          `폰트 로드 실패: Pretendard-${name} (${res.status}). 인터넷 연결을 확인해주세요.`,
        );
      const buf = await res.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      return (
        `@font-face{font-family:'Pretendard';font-weight:${weight};` +
        `font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`
      );
    }),
  );

  _pretendardCSS = faces.join('\n');
  return _pretendardCSS;
}

/**
 * 커스텀 폰트 1개의 @font-face CSS를 Base64로 생성 (캐시)
 */
async function loadCustomFontCSS(fontId) {
  if (_customCache.has(fontId)) return _customCache.get(fontId);

  const entry = getFontById(fontId);
  if (!entry || !entry.file) return ''; // pretendard 등 CDN 폰트

  const res = await fetch(entry.file);
  if (!res.ok)
    throw new Error(`커스텀 폰트 로드 실패: ${entry.label} (${res.status})`);
  const buf = await res.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);

  // font-family에서 첫 번째 이름 추출 (e.g., "'NanumBrush'" → "NanumBrush")
  const familyName = entry.family.split(',')[0].replace(/'/g, '').trim();
  const css =
    `@font-face{font-family:'${familyName}';font-weight:100 900;` +
    `font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;

  _customCache.set(fontId, css);
  return css;
}

/**
 * Export에 필요한 전체 폰트 CSS 생성.
 * @param {string[]} usedFontIds - 컷들에서 사용된 커스텀 폰트 id 목록
 */
export async function loadFontCSS(usedFontIds = []) {
  const parts = [await loadPretendardCSS()];

  // 중복 제거 후 커스텀 폰트 병렬 로드
  const unique = [...new Set(usedFontIds.filter(id => id && id !== 'pretendard'))];
  if (unique.length > 0) {
    const customParts = await Promise.all(unique.map(loadCustomFontCSS));
    parts.push(...customParts.filter(Boolean));
  }

  return parts.join('\n');
}

/**
 * 컷 목록에서 사용된 SFX 폰트 id 수집
 */
export function collectUsedFonts(cuts) {
  const ids = new Set();
  for (const cut of cuts) {
    for (const sfx of cut.sfx_items || []) {
      const fontId = sfx.sfx_layout?.font;
      if (fontId) ids.add(fontId);
    }
  }
  return [...ids];
}

/**
 * 폰트가 브라우저에 로드될 때까지 대기
 * (SVG Blob → Image 변환 전에 호출)
 */
export async function ensureFontsLoaded(fontIds = []) {
  const unique = [...new Set(fontIds.filter(id => id && id !== 'pretendard'))];
  if (unique.length === 0) return;

  const promises = unique.map(id => {
    const entry = getFontById(id);
    if (!entry || !entry.file) return Promise.resolve();
    const familyName = entry.family.split(',')[0].replace(/'/g, '').trim();
    // document.fonts.load: 해당 폰트가 로드될 때까지 명시적 대기
    return document.fonts.load(`900 48px '${familyName}'`).catch(() => {});
  });

  await Promise.all(promises);
}
