/**
 * bubbleLayout.js — 말풍선 초기 레이아웃 계산
 *
 * CutEditor 보기모드와 Export에서 동일한 배치를 사용하기 위해
 * 공유 유틸리티로 분리.
 *
 * bubble_layout이 이미 있는 항목은 그대로 유지하고,
 * 없는 항목에만 기본 배치를 할당한다.
 */

export function computeInitialLayouts(dialogue) {
  if (!dialogue || !dialogue.length) return dialogue || [];

  const speakers = [];
  for (const item of dialogue) {
    if (item.type !== 'narration' && item.speaker && !speakers.includes(item.speaker)) {
      speakers.push(item.speaker);
    }
  }
  const n = Math.max(1, speakers.length);
  const yTracker = {};

  return dialogue.map((item, idx) => {
    if (item.bubble_layout) return { ...item };

    if (item.type === 'narration') {
      return { ...item, bubble_layout: { x: 0.0, y: 0.82, width: 1.0, tail_direction: 'none' } };
    }

    const speakerIdx = speakers.indexOf(item.speaker);
    const yKey = item.speaker || `__idx_${idx}`;
    const yOrder = yTracker[yKey] || 0;
    yTracker[yKey] = yOrder + 1;

    let x, w, tailDir;
    if (n <= 1) {
      x = 0.28; w = 0.45; tailDir = 'down';
    } else if (n === 2) {
      if (speakerIdx === 0) { x = 0.03; w = 0.42; tailDir = 'down'; }
      else                  { x = 0.55; w = 0.42; tailDir = 'down'; }
    } else {
      const slot = n > 1 ? speakerIdx / (n - 1) : 0;
      x = 0.03 + slot * 0.50;
      w = 0.35;
      tailDir = 'down';
    }
    const y = 0.04 + yOrder * 0.22;

    return {
      ...item,
      bubble_layout: {
        x: Math.max(0, Math.min(0.96 - w, x)),
        y: Math.max(0.02, Math.min(0.74, y)),
        width: w,
        tail_direction: tailDir,
      },
    };
  });
}
