/**
 * BubbleTestPage — 말풍선 검증용 개발 페이지
 * /bubble-test?style=round
 *
 * 그리드: 행=방향(down/up/left/right), 열=flip(off/on), 각 셀에 3케이스(1줄/2줄/3줄)
 * = 4 × 2 × 3 = 24개 조합
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SingleBubble, STYLE_ORDER, STYLE_LABELS } from '../components/BubbleOverlay';

const DIRECTIONS = ['down', 'up', 'left', 'right'];
const FLIPS = [false, true];
const TEXT_CASES = [
  { label: '1줄', text: '짧다' },
  { label: '2줄', text: '오늘 날씨가 정말 좋아서 기분이 너무 좋다' },
  { label: '3줄', text: '이렇게 긴 문장을 말풍선 안에 넣으면 세 줄 이상으로 줄바꿈이 되어야 정상이다' },
];

const NARR_TEXT_CASES = [
  { label: '1줄', text: '짧다' },
  { label: '2줄', text: '오늘 날씨가 정말 좋아서 기분이 너무 좋다고 말했다. 그래서 우리는 밖으로 나가기로 했다.' },
  { label: '3줄', text: '이렇게 긴 문장을 나레이션 바 안에 넣으면 세 줄 이상으로 줄바꿈이 되어야 정상이다. 줄바꿈이 안 되면 바가 늘어나야 한다. 이것은 매우 긴 테스트 문장이다.' },
];

const CELL_W = 260;
const CELL_H = 200;
const BUBBLE_W = 200;

export default function BubbleTestPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStyle = searchParams.get('style') || 'round';
  const [style, setStyle] = useState(initialStyle);

  const handleStyleChange = (e) => {
    const v = e.target.value;
    setStyle(v);
    setSearchParams({ style: v });
  };

  return (
    <div style={{ padding: 20, background: '#f0f0f0', minHeight: '100vh' }}>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 'bold', marginRight: 8 }}>스타일:</label>
        <select value={style} onChange={handleStyleChange} style={{ padding: '4px 8px', fontSize: 14 }}>
          {STYLE_ORDER.map(k => (
            <option key={k} value={k}>{STYLE_LABELS[k]} ({k})</option>
          ))}
        </select>
      </div>

      {/* ── 나레이션 바 테스트 (방향·flip 불필요) ── */}
      <h3 style={{ marginTop: 24, marginBottom: 8 }}>나레이션 바 (narration)</h3>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {NARR_TEXT_CASES.map(tc => (
          <div key={`narr-${tc.label}`} style={{ border: '1px solid #ccc', background: '#fff', padding: 4 }}>
            <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>narration / {tc.label}</div>
            <div style={{ position: 'relative', width: 320, height: 160, background: '#888' }}>
              <svg width={320} height={160} viewBox="0 0 320 160"
                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                <SingleBubble
                  style="narration"
                  text={tc.text}
                  bubbleX={0}
                  bubbleY={20}
                  bubbleW={320}
                  bubbleH={0}
                  tailDirection="none"
                  flipTail={false}
                  fontScale={1.0}
                  fixedWidth={true}
                  viewW={320}
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* ── 메인 그리드 (선택된 스타일) ── */}
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: 4, border: '1px solid #ccc', background: '#ddd' }}>방향 / flip</th>
            {FLIPS.map(flip => (
              TEXT_CASES.map(tc => (
                <th key={`${flip}-${tc.label}`} style={{ padding: 4, border: '1px solid #ccc', background: '#ddd', fontSize: 11 }}>
                  flip:{flip ? 'on' : 'off'} / {tc.label}
                </th>
              ))
            ))}
          </tr>
        </thead>
        <tbody>
          {DIRECTIONS.map(dir => (
            <tr key={dir}>
              <td style={{ padding: 4, border: '1px solid #ccc', background: '#eee', fontWeight: 'bold', textAlign: 'center' }}>
                {dir}
              </td>
              {FLIPS.map(flip => (
                TEXT_CASES.map(tc => (
                  <td key={`${dir}-${flip}-${tc.label}`} style={{ padding: 4, border: '1px solid #ccc', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>
                      {dir} / flip:{flip ? 'on' : 'off'} / {tc.label}
                    </div>
                    <div style={{ position: 'relative', width: CELL_W, height: CELL_H, background: '#888', overflow: 'visible' }}>
                      <svg
                        width={CELL_W}
                        height={CELL_H}
                        viewBox={`0 0 ${CELL_W} ${CELL_H}`}
                        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
                      >
                        <SingleBubble
                          style={style}
                          text={tc.text}
                          bubbleX={(CELL_W - BUBBLE_W) / 2}
                          bubbleY={10}
                          bubbleW={BUBBLE_W}
                          bubbleH={0}
                          tailDirection={dir}
                          flipTail={flip}
                          fontScale={1.0}
                          fixedWidth={false}
                          viewW={CELL_W}
                        />
                      </svg>
                    </div>
                  </td>
                ))
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
