/**
 * fontEmbed.js — SVG Export용 Pretendard 폰트 Base64 인라인
 *
 * SVG를 <img>로 로드하면 외부 폰트를 참조할 수 없으므로,
 * woff2 파일을 Base64로 인코딩하여 SVG <style>에 인라인한다.
 *
 * 한 번 로드하면 모듈 레벨에서 캐시 → 12컷 Export에서도
 * 폰트 다운로드는 1회만 발생한다.
 */

const FONT_WEIGHTS = [
  { weight: 400, name: 'Regular' },
  { weight: 500, name: 'Medium' },
  { weight: 700, name: 'Bold' },
  { weight: 900, name: 'Black' },
];

const CDN_BASE =
  'https://cdn.jsdelivr.net/npm/pretendard/dist/web/static/woff2';

let _cached = null;

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
 * 최초 호출 시 CDN에서 woff2 다운로드 → 이후 캐시 반환.
 */
export async function loadFontCSS() {
  if (_cached) return _cached;

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

  _cached = faces.join('\n');
  return _cached;
}
