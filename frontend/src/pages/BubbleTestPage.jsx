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

      {/* ── fixedWidth=true 테스트 (실제 에피소드 경로) ── */}
      <h3 style={{ marginTop: 24, marginBottom: 8 }}>fixedWidth=true (에피소드 경로)</h3>
      {[
        { label: '60%', viewW: 400, ratio: 0.60 },
        { label: '92%', viewW: 400, ratio: 0.92 },
      ].map(({ label, viewW, ratio }) => {
        const bw = viewW * ratio;
        return (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>
              뷰폭 {viewW}px × {label} = bubbleW {Math.round(bw)}px (fixedWidth=true)
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {TEXT_CASES.map(tc => (
                <div key={`fw-${label}-${tc.label}`} style={{ border: '1px solid #ccc', background: '#fff', padding: 4 }}>
                  <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>
                    fixedW:{label} / {tc.label}
                  </div>
                  <div style={{ position: 'relative', width: viewW, height: 250, background: '#888' }}>
                    <svg width={viewW} height={250} viewBox={`0 0 ${viewW} 250`}
                      style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                      <SingleBubble
                        style={style}
                        text={tc.text}
                        bubbleX={(viewW - bw) / 2}
                        bubbleY={10}
                        bubbleW={bw}
                        bubbleH={0}
                        tailDirection="down"
                        flipTail={false}
                        fontScale={1.0}
                        fixedWidth={true}
                        viewW={viewW}
                      />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── 스케일 비교 (동일 텍스트, 다른 뷰 폭) ── */}
      <h3 style={{ marginTop: 24, marginBottom: 8 }}>스케일 비교 (viewW 변화 → 비율 동일해야 함)</h3>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 24 }}>
        {[800, 400, 280, 150].map(vw => {
          const h = vw * 0.75;
          const bw = vw * 0.6;
          return (
            <div key={`scale-${vw}`} style={{ border: '1px solid #ccc', background: '#fff', padding: 4 }}>
              <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>viewW={vw}px</div>
              <div style={{ position: 'relative', width: vw, height: h, background: '#888' }}>
                <svg width={vw} height={h} viewBox={`0 0 ${vw} ${h}`}
                  style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                  <SingleBubble
                    style={style}
                    text="오늘 날씨가 정말 좋아서 기분이 너무 좋다"
                    bubbleX={(vw - bw) / 2}
                    bubbleY={vw * 0.04}
                    bubbleW={bw}
                    bubbleH={0}
                    tailDirection="down"
                    flipTail={false}
                    fontScale={1.0}
                    fixedWidth={true}
                    viewW={vw}
                  />
                  <SingleBubble
                    style="narration"
                    text="나레이션 바도 같은 비율로 보여야 한다"
                    bubbleX={0}
                    bubbleY={h * 0.65}
                    bubbleW={vw}
                    bubbleH={0}
                    tailDirection="none"
                    flipTail={false}
                    fontScale={1.0}
                    fixedWidth={true}
                    viewW={vw}
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── min_height 비교 (0% / 25% / 50%) ── */}
      <h3 style={{ marginTop: 24, marginBottom: 8 }} id="min-height-section">min_height 비교 (0% / 25% / 50%)</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {[
          { key: 'round', label: '타원(round)' },
          { key: 'narration', label: '사각(narration)' },
          { key: 'shout', label: '스파이크(shout)' },
        ].map(({ key: st, label }) => (
          <div key={st}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>{label}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0, 0.25, 0.50].map(mh => {
                const vw = 400;
                const vh = 300;
                const bw = vw * 0.6;
                const minHPx = mh * vh;
                return (
                  <div key={`mh-${st}-${mh}`} style={{ border: '1px solid #ccc', background: '#fff', padding: 4 }}
                    data-testid={`mh-${st}-${Math.round(mh * 100)}`}>
                    <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>
                      min_height={Math.round(mh * 100)}% ({Math.round(minHPx)}px)
                    </div>
                    <div style={{ position: 'relative', width: vw, height: vh, background: '#888' }}>
                      <svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`}
                        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                        <SingleBubble
                          style={st}
                          text="오늘 날씨가 좋다"
                          bubbleX={st === 'narration' ? 0 : (vw - bw) / 2}
                          bubbleY={10}
                          bubbleW={st === 'narration' ? vw : bw}
                          bubbleH={minHPx}
                          tailDirection={st === 'narration' ? 'none' : 'down'}
                          flipTail={false}
                          fontScale={1.0}
                          fixedWidth={true}
                          viewW={vw}
                        />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── text_offset 검증 ── */}
      <h3 style={{ marginTop: 24, marginBottom: 8 }} id="text-offset-section">text_offset 검증 (round / narration / shout)</h3>
      {(() => {
        const toStyles = [
          { key: 'round', label: '타원(round)' },
          { key: 'narration', label: '사각(narration)' },
          { key: 'shout', label: '스파이크(shout)' },
        ];
        const toOffsets = [
          { label: '0,0', ox: 0, oy: 0 },
          { label: 'n5n5', ox: -0.5, oy: -0.5 },
          { label: 'p5p5', ox: 0.5, oy: 0.5 },
          { label: 'p50', ox: 0.5, oy: 0 },
          { label: '0n5', ox: 0, oy: -0.5 },
        ];
        const toTexts = [
          { label: 'short', text: '오늘 날씨가 좋다', desc: '짧은(여유O)' },
          { label: 'full', text: '이렇게 긴 문장을 말풍선 안에 넣으면 세 줄 이상으로 줄바꿈이 되어야 정상이다', desc: '긴(여유0)' },
        ];
        const vw = 400;
        const vh = 300;
        const bw = vw * 0.6;
        return toStyles.map(({ key: st, label: stLabel }) => (
          <div key={st} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>{stLabel}</div>
            {toTexts.map(({ label: tl, text: tt, desc }) => (
              <div key={tl} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>{desc}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {toOffsets.map(({ label: ol, ox, oy }) => (
                    <div key={`to-${st}-${tl}-${ol}`} style={{ border: '1px solid #ccc', background: '#fff', padding: 4 }}
                      data-testid={`to-${st}-${tl}-${ol}`}>
                      <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>
                        offset({ox},{oy})
                      </div>
                      <div style={{ position: 'relative', width: vw, height: vh, background: '#888' }}>
                        <svg width={vw} height={vh} viewBox={`0 0 ${vw} ${vh}`}
                          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                          <SingleBubble
                            style={st}
                            text={tt}
                            bubbleX={st === 'narration' ? 0 : (vw - bw) / 2}
                            bubbleY={10}
                            bubbleW={st === 'narration' ? vw : bw}
                            bubbleH={0}
                            tailDirection={st === 'narration' ? 'none' : 'down'}
                            flipTail={false}
                            fontScale={1.0}
                            fixedWidth={true}
                            viewW={vw}
                            textOffsetX={ox}
                            textOffsetY={oy}
                          />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ));
      })()}

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
