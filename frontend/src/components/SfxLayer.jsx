/**
 * SfxLayer — 컷 이미지 위에 효과음 텍스트를 SVG로 렌더링 (읽기 전용)
 *
 * 특징:
 * - 배경/말풍선 없음 — 텍스트 자체가 디자인 요소
 * - 굵은 폰트 + 흰색 아웃라인 (웹툰 효과음 스타일)
 * - 회전 지원 (sfx_layout.rotation)
 * - pointer-events: none (편집은 CutEditor에서)
 * - sfx_layout.font: FONT_CATALOG id → 커스텀 폰트 적용
 */

import { getFontById } from '../utils/fontCatalog';

export default function SfxLayer({ sfxItems, width, height }) {
  if (!sfxItems?.length || !width || !height) return null;

  // 표시 너비 기준으로 기본 폰트 크기 산출 (400px 기준 28px)
  const baseFontPx = Math.max(16, width * 0.07);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {sfxItems.map((sfx, i) => {
        const layout = sfx.sfx_layout || {};
        const px = (layout.x ?? 0.5) * width;
        const py = (layout.y ?? 0.5) * height;
        const fontScale = layout.font_scale || 1.0;
        const fontSize = baseFontPx * fontScale;
        const rotation = layout.rotation || 0;
        const color = layout.color || '#1a1a1a';
        const text = sfx.text || '';
        const strokeW = Math.max(1.5, fontSize * 0.08);
        // 흰색 텍스트일 때는 아웃라인을 검정으로
        const outlineColor = color === '#ffffff' ? '#1a1a1a' : '#ffffff';
        const fontEntry = getFontById(layout.font);

        return (
          <g key={sfx.id || i} transform={`translate(${px}, ${py}) rotate(${rotation})`}>
            <text
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: `${fontSize}px`,
                fontWeight: 900,
                fill: color,
                stroke: outlineColor,
                strokeWidth: strokeW,
                paintOrder: 'stroke fill',
                fontFamily: fontEntry.family,
                letterSpacing: '0.02em',
              }}
            >
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
