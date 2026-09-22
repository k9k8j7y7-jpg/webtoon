/**
 * PngBubbleLayer — 특수 말풍선 PNG 오버레이 (읽기 전용)
 *
 * 레이어 순서: 컷 이미지 → 제품 → 효과 → SVG 말풍선 → **PNG 말풍선** → 효과음
 * 글자: svg-text 모드 전용 (foreignObject 금지 — canvas taint·폰트 불일치 방지)
 */

import PNGBUBBLE_CATALOG from '../utils/pngBubbleCatalog';
import { wrapText } from './BubbleOverlay';
import { getFontById } from '../utils/fontCatalog';

const catalogMap = Object.fromEntries(PNGBUBBLE_CATALOG.map(e => [e.id, e]));

export default function PngBubbleLayer({ pngbubbleItems, width, height, showTextArea = false }) {
  if (!pngbubbleItems?.length || !width || !height) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      width={width} height={height}
      style={{ top: 0, left: 0 }}
    >
      {pngbubbleItems.map((item, i) => {
        const entry = catalogMap[item.bubble_id];
        if (!entry) return null;

        const cx = (item.x ?? 0.5) * width;
        const cy = (item.y ?? 0.5) * height;
        const bw = (item.width ?? 0.35) * width;
        const aspect = entry.size[1] / entry.size[0];
        const bh = bw * aspect;
        const rotation = item.rotation || 0;
        const opacity = item.opacity ?? 1;
        const flipH = item.flip_h || false;

        // text area in pixel coords (relative to bubble top-left)
        const ta = entry.text_area;
        const taX = ta.x * bw;
        const taY = ta.y * bh;
        const taW = ta.w * bw;
        const taH = ta.h * bh;

        // text rendering
        const text = item.text || '';
        const fontSize = item.font_size || Math.max(12, bw * 0.08);
        const fontEntry = getFontById(item.font_family);
        const textAlign = item.text_align || 'center';
        const lineHeight = fontSize * 1.45;
        const cw = fontEntry.charWidth;
        const maxChars = Math.max(2, Math.floor(taW / (fontSize * cw)));
        const lines = wrapText(text, maxChars);

        // auto-shrink if text overflows
        let renderFontSize = fontSize;
        let renderLines = lines;
        if (text && lines.length * lineHeight > taH) {
          // try smaller sizes
          for (let fs = fontSize - 1; fs >= 8; fs--) {
            const lh = fs * 1.45;
            const mc = Math.max(2, Math.floor(taW / (fs * cw)));
            const ls = wrapText(text, mc);
            if (ls.length * lh <= taH) {
              renderFontSize = fs;
              renderLines = ls;
              break;
            }
          }
          if (renderFontSize === fontSize) {
            renderFontSize = 8;
            const mc = Math.max(2, Math.floor(taW / (8 * cw)));
            renderLines = wrapText(text, mc);
          }
        }
        const renderLineHeight = renderFontSize * 1.45;
        const totalTextH = renderLines.length * renderLineHeight;
        const textStartY = taY + (taH - totalTextH) / 2;

        let textAnchor = 'middle';
        let textX = taX + taW / 2;
        if (textAlign === 'left') { textAnchor = 'start'; textX = taX + 4; }
        else if (textAlign === 'right') { textAnchor = 'end'; textX = taX + taW - 4; }

        // build transform: translate to center → rotate → flip
        let transform = `translate(${cx}, ${cy}) rotate(${rotation})`;
        // flip_h: flip the image but NOT the text
        // we'll render image with flip and text without flip

        return (
          <g key={i} opacity={opacity}>
            {/* PNG image — may be flipped */}
            <g transform={`${transform}${flipH ? ' scale(-1,1)' : ''}`}>
              <image
                href={entry.src}
                x={-bw / 2} y={-bh / 2}
                width={bw} height={bh}
                preserveAspectRatio="none"
              />
            </g>

            {/* text_area outline (editor debug) */}
            {showTextArea && (
              <g transform={transform}>
                <rect
                  x={-bw / 2 + taX} y={-bh / 2 + taY}
                  width={taW} height={taH}
                  fill="none" stroke="rgba(168,85,247,0.4)" strokeWidth={1}
                  strokeDasharray="4,3" rx={2}
                />
              </g>
            )}

            {/* text — always upright (not flipped) */}
            {text && (
              <g transform={transform}>
                <text
                  textAnchor={textAnchor}
                  fill="#1a1a1a"
                  fontSize={renderFontSize}
                  fontFamily={fontEntry.family}
                  fontWeight={700}
                  letterSpacing="0.02em"
                  stroke="white"
                  strokeWidth={Math.max(1, renderFontSize * 0.06)}
                  paintOrder="stroke fill"
                >
                  {renderLines.map((line, li) => (
                    <tspan
                      key={li}
                      x={textX - bw / 2}
                      y={-bh / 2 + textStartY + li * renderLineHeight + renderLineHeight * 0.72}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
