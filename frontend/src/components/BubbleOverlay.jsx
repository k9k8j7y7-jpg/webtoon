/**
 * BubbleOverlay — 컷 이미지 위에 12종 SVG 말풍선을 렌더링
 *
 * 핵심: 말풍선은 이미지 파일이 아니라 코드(SVG)로 그린다.
 * 텍스트 길이에 맞춰 자동 확장, 교체 시 이미지 재생성 불필요.
 *
 * Export: default(BubbleOverlay), BUBBLE_CONFIGS, SingleBubble,
 *         BubbleMiniIcon, wrapText, computeSingleBubbleGeo,
 *         STYLE_ORDER, STYLE_LABELS
 */

import { useMemo } from 'react';
import { resolveBubbleStyle } from '../utils/bubbleMapping';

// ── 스타일별 설정 (색상은 backend/app/composition/service.py 기준) ──

const BUBBLE_CONFIGS = {
  round: {
    fill: 'rgba(255,255,255,0.95)',
    stroke: '#1a1a1a',
    strokeWidth: 2,
    textColor: '#1a1a1a',
    isOval: true,
    position: 'top',
  },
  narration: {
    fill: 'rgba(0,0,0,0.65)',
    stroke: 'none',
    strokeWidth: 0,
    textColor: '#ffffff',
    position: 'bottom',
    isCaption: true,
    fontSize: 0.9,
  },
  thought: {
    fill: 'rgba(255,255,255,0.78)',
    stroke: '#969696',
    strokeWidth: 2,
    strokeDash: '6,4',
    textColor: '#505050',
    isOval: true,
    position: 'top',
  },
  whisper: {
    fill: 'rgba(255,255,255,0.71)',
    stroke: '#8c8c8c',
    strokeWidth: 2,
    strokeDash: '6,4',
    textColor: '#787878',
    isOval: true,
    position: 'top',
    fontSize: 0.85,
  },
  shout: {
    fill: 'rgba(255,255,255,0.95)',
    stroke: '#1e1e1e',
    strokeWidth: 3,
    textColor: '#141414',
    isSpiky: true,
    spikeCount: 13,
    innerRatio: 0.80,
    position: 'top',
    fontSize: 1.15,
  },
  angry: {
    fill: 'rgba(255,230,230,0.95)',
    stroke: '#c82828',
    strokeWidth: 3,
    textColor: '#aa1e1e',
    isSpiky: true,
    spikeCount: 15,
    innerRatio: 0.72,
    angryVariation: true,
    position: 'top',
    fontSize: 1.15,
    icon: 'lightning',
  },
  happy: {
    fill: 'rgba(255,230,242,0.95)',
    stroke: '#e06090',
    strokeWidth: 2,
    textColor: '#aa3264',
    isOval: true,
    position: 'top',
  },
  sad: {
    fill: 'rgba(225,235,255,0.90)',
    stroke: '#506eb4',
    strokeWidth: 2,
    textColor: '#324678',
    isOval: true,
    position: 'top',
    icon: 'teardrop',
  },
  surprised: {
    fill: 'rgba(255,248,220,0.95)',
    stroke: '#c88800',
    strokeWidth: 2,
    textColor: '#a06414',
    isSpiky: true,
    spikeCount: 10,
    innerRatio: 0.78,
    position: 'top',
    icon: 'star',
  },
  shy: {
    fill: 'rgba(255,220,235,0.86)',
    stroke: '#c86090',
    strokeWidth: 2,
    textColor: '#96426c',
    isTrapezoidal: true,
    position: 'top',
    insetX: 0.10, insetY: 0.12,
    tail: { type: 'B', skewRatio: -0.14 },
  },
  flustered: {
    fill: 'rgba(255,230,238,0.86)',
    stroke: '#be5078',
    strokeWidth: 2,
    textColor: '#8c3250',
    isRoundedRect: true,
    position: 'top',
    insetX: 0.08, insetY: 0.10,
    tail: { type: 'A', skewRatio: 0.18, curveAmount: 0.35 },
  },
  realize: {
    fill: 'rgba(255,255,220,0.90)',
    stroke: '#b0a030',
    strokeWidth: 2,
    textColor: '#5a5014',
    isOval: true,
    position: 'top',
  },
};

// ── 꼬리 없는 스타일 목록 ──
export const NO_TAIL_STYLES = ['narration', 'shout', 'angry', 'surprised'];

// ── 하드코딩 상수 (bubbleSpec.json 사용 금지 — 0.72 charWidth가 버그 원인) ──
const CHAR_WIDTH = 0.93;
const REF_WIDTH = 800;          // 기준 렌더 폭 (미리보기 모달 기준)
const BASE_FONT_SIZE = 14;      // REF_WIDTH 기준 폰트 크기
const LINE_HEIGHT_RATIO = 1.45;
const BASE_PADDING_X = 14;      // REF_WIDTH 기준 가로 패딩
const BASE_PADDING_Y = 10;      // REF_WIDTH 기준 세로 패딩
// ── 꼬리 고정 크기 (REF_WIDTH 기준 px, scale 곱해서 사용) ──
const TAIL_BASE = 18;            // 밑변 폭 px
const TAIL_LEN = 26;             // 꼬리 길이 px

// 렌더 폭에 비례하는 스케일 계산
function getScale(viewW) {
  return (viewW || REF_WIDTH) / REF_WIDTH;
}

// ── 텍스트 줄바꿈 헬퍼 ──

export function wrapText(text, maxCharsPerLine) {
  if (!text) return [];
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    for (let i = 0; i < paragraph.length; i += maxCharsPerLine) {
      lines.push(paragraph.slice(i, i + maxCharsPerLine));
    }
  }
  return lines;
}

// ── 스파이크 다각형 경로 생성 ──

function spikyPath(cx, cy, rx, ry, count, depth, variation) {
  const points = [];
  const total = count * 2;
  for (let i = 0; i < total; i++) {
    const angle = (2 * Math.PI / total) * i - Math.PI / 2;
    const isOuter = i % 2 === 0;
    let mult = 1;
    if (variation && isOuter) {
      // angry: i%3 기반 결정적 변주 (±5%)
      const mod = (i / 2) % 3;
      mult = mod === 0 ? 1.05 : mod === 1 ? 0.95 : 1.0;
    }
    const rxi = isOuter ? rx * mult : rx * (1 - depth);
    const ryi = isOuter ? ry * mult : ry * (1 - depth);
    points.push(`${cx + rxi * Math.cos(angle)},${cy + ryi * Math.sin(angle)}`);
  }
  return `M${points.join('L')}Z`;
}

// ══════════════════════════════════════════════════════
// 꼬리 공통 헬퍼
// ══════════════════════════════════════════════════════

function lerp(a, b, t) { return a + (b - a) * t; }


// ══════════════════════════════════════════════════════
// flustered: 둥근 사각형 + 타입A 꼬리 — 단일 path, 고정 크기
// ══════════════════════════════════════════════════════
function buildRoundedRectWithTailA(bx, by, w, h, r, tailDir, flip, params, scale) {
  const sc = scale || 1;
  const { skewRatio } = params;

  // 꼬리 고정 크기
  const isHoriz = tailDir === 'up' || tailDir === 'down';
  const straightLen = isHoriz ? (w - 2 * r) : (h - 2 * r);
  const tailBase = Math.min(TAIL_BASE * sc, straightLen * 0.6);
  const tailLen = TAIL_LEN * sc;

  // 부착 위치: 직선 구간의 0~1 비율 (레퍼런스처럼 우하단 쪽)
  const sk = flip ? -skewRatio : skewRatio;
  const attachT = Math.max(0.1, Math.min(0.9, 0.5 + sk));

  // 부착 변의 직선 구간 시작/끝점과 바깥 법선
  let segStart, segEnd, normalX, normalY;
  switch (tailDir) {
    case 'up':
      segStart = { x: bx + r, y: by }; segEnd = { x: bx + w - r, y: by };
      normalX = 0; normalY = -1; break;
    case 'right':
      segStart = { x: bx + w, y: by + r }; segEnd = { x: bx + w, y: by + h - r };
      normalX = 1; normalY = 0; break;
    case 'left':
      segStart = { x: bx, y: by + h - r }; segEnd = { x: bx, y: by + r };
      normalX = -1; normalY = 0; break;
    default: // down
      segStart = { x: bx + w - r, y: by + h }; segEnd = { x: bx + r, y: by + h };
      normalX = 0; normalY = 1; break;
  }

  // 부착점 (직선 위)
  const attachX = lerp(segStart.x, segEnd.x, attachT);
  const attachY = lerp(segStart.y, segEnd.y, attachT);

  // 변 방향 단위벡터
  const eDx = segEnd.x - segStart.x;
  const eDy = segEnd.y - segStart.y;
  const eLen = Math.sqrt(eDx * eDx + eDy * eDy) || 1;
  const eUx = eDx / eLen;
  const eUy = eDy / eLen;

  // 밑변 두 점 (변 위에서)
  const p1x = attachX - eUx * tailBase / 2;
  const p1y = attachY - eUy * tailBase / 2;
  const p2x = attachX + eUx * tailBase / 2;
  const p2y = attachY + eUy * tailBase / 2;

  // 꼬리 끝점: 레퍼런스(당황.jpg)처럼 단순 삼각형
  // 법선 방향으로 뻗되, p2 쪽으로 치우침 (비대칭 삼각형)
  const tipX = p2x + normalX * tailLen;
  const tipY = p2y + normalY * tailLen;

  // 둥근 사각형 path (시계방향) + 꼬리 삽입
  const tl = { x: bx + r, y: by };
  const tr = { x: bx + w - r, y: by };
  const rt = { x: bx + w, y: by + r };
  const rb = { x: bx + w, y: by + h - r };
  const br = { x: bx + w - r, y: by + h };
  const bl = { x: bx + r, y: by + h };
  const lb = { x: bx, y: by + h - r };
  const lt = { x: bx, y: by + r };

  // 단순 삼각형 꼬리: p1 → tip → p2 (직선 2개)
  const tailSeg = `L${p1x},${p1y} L${tipX},${tipY} L${p2x},${p2y}`;

  function edge(from, to, dir) {
    if (dir === tailDir) return `${tailSeg} L${to.x},${to.y}`;
    return `L${to.x},${to.y}`;
  }

  let d = `M${tl.x},${tl.y}`;
  d += edge(tl, tr, 'up');
  d += ` A${r},${r} 0 0,1 ${rt.x},${rt.y}`;
  d += edge(rt, rb, 'right');
  d += ` A${r},${r} 0 0,1 ${br.x},${br.y}`;
  d += edge(br, bl, 'down');
  d += ` A${r},${r} 0 0,1 ${lb.x},${lb.y}`;
  d += edge(lb, lt, 'left');
  d += ` A${r},${r} 0 0,1 ${tl.x},${tl.y}`;
  d += ' Z';

  return d;
}

// ══════════════════════════════════════════════════════
// shy: 사다리꼴 + 타입B 꼬리 — 단일 path, 고정 크기
// ══════════════════════════════════════════════════════
function buildTrapezoidWithTailB(bx, by, w, h, r, tailDir, flip, params, scale) {
  const sc = scale || 1;
  const { skewRatio } = params;

  // 사다리꼴 4 꼭짓점
  const corners = {
    tl: { x: bx + w * 0.03, y: by + h * 0.12 },
    tr: { x: bx + w * 0.97, y: by },
    br: { x: bx + w * 0.95, y: by + h },
    bl: { x: bx, y: by + h * 0.90 },
  };
  const { tl, tr, br, bl } = corners;

  // 변 정보 (path 진행 방향: tl→tr→br→bl→tl)
  function getEdge(dir) {
    switch (dir) {
      case 'up':    return { from: tl, to: tr };
      case 'right': return { from: tr, to: br };
      case 'down':  return { from: br, to: bl };
      case 'left':  return { from: bl, to: tl };
    }
  }

  const edge = getEdge(tailDir || 'down');
  const eDx = edge.to.x - edge.from.x;
  const eDy = edge.to.y - edge.from.y;
  const eLen = Math.sqrt(eDx * eDx + eDy * eDy) || 1;
  const eUx = eDx / eLen;
  const eUy = eDy / eLen;

  // 바깥 법선 (반시계 회전 후 중심에서 멀어지는 방향)
  const ccx = (tl.x + tr.x + br.x + bl.x) / 4;
  const ccy = (tl.y + tr.y + br.y + bl.y) / 4;
  let nX = -eUy, nY = eUx;
  if ((edge.from.x + eDx / 2 - ccx) * nX + (edge.from.y + eDy / 2 - ccy) * nY < 0) {
    nX = -nX; nY = -nY;
  }

  // 꼬리 고정 크기 (직선 구간 60% 상한)
  const tailBase = Math.min(TAIL_BASE * sc, (eLen - 2 * r) * 0.6);
  const tailLen = TAIL_LEN * sc;

  // 부착 위치 (변 위 0~1 비율)
  const sk = flip ? -skewRatio : skewRatio;
  const attachT = Math.max(0.15, Math.min(0.85, 0.5 + sk));
  const attachX = lerp(edge.from.x, edge.to.x, attachT);
  const attachY = lerp(edge.from.y, edge.to.y, attachT);

  // 밑변 두 점 (변 직선 위에서)
  const p1x = attachX - eUx * tailBase / 2;
  const p1y = attachY - eUy * tailBase / 2;
  const p2x = attachX + eUx * tailBase / 2;
  const p2y = attachY + eUy * tailBase / 2;

  // 끝점: 법선 방향 + 약간의 치우침
  const skewAngle = (flip ? -1 : 1) * Math.atan2(sk, 1) * 0.5;
  const tipDirX = nX * Math.cos(skewAngle) - nY * Math.sin(skewAngle);
  const tipDirY = nX * Math.sin(skewAngle) + nY * Math.cos(skewAngle);
  const tipX = attachX + tipDirX * tailLen;
  const tipY = attachY + tipDirY * tailLen;

  // 사다리꼴 path + 꼬리 삽입
  function towards(from, to, dist) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const t = Math.min(dist / len, 0.4);
    return { x: from.x + dx * t, y: from.y + dy * t };
  }

  const p = [
    towards(tl, tr, r), towards(tr, tl, r),
    towards(tr, br, r), towards(br, tr, r),
    towards(br, bl, r), towards(bl, br, r),
    towards(bl, tl, r), towards(tl, bl, r),
  ];

  function edgeSeg(segEnd, dir) {
    if (dir !== tailDir) return `L${segEnd.x},${segEnd.y}`;
    return `L${p1x},${p1y} L${tipX},${tipY} L${p2x},${p2y} L${segEnd.x},${segEnd.y}`;
  }

  let d = `M${p[0].x},${p[0].y}`;
  d += edgeSeg(p[1], 'up');
  d += ` Q${tr.x},${tr.y} ${p[2].x},${p[2].y}`;
  d += edgeSeg(p[3], 'right');
  d += ` Q${br.x},${br.y} ${p[4].x},${p[4].y}`;
  d += edgeSeg(p[5], 'down');
  d += ` Q${bl.x},${bl.y} ${p[6].x},${p[6].y}`;
  d += edgeSeg(p[7], 'left');
  d += ` Q${tl.x},${tl.y} ${p[0].x},${p[0].y}`;
  d += ' Z';

  return d;
}


// ── round 전용 꼬리 — 4점 접힌 갈고리, 고정 크기 ──
function buildRoundTail(cx, cy, rx, ry, needH, tailDir, flip, scale) {
  const sc = scale || 1;
  const tailBase = TAIL_BASE * sc;   // 밑변 폭 (고정 px)
  const tailLen = TAIL_LEN * sc;     // 꼬리 길이 (고정 px)
  const SKEW = 18;        // 치우침(도)
  const TIP_SWEEP = 39;   // 끝점이 중심각에서 더 휘는 각도(도)

  const sign = flip ? -1 : 1;

  let base;
  switch (tailDir) {
    case 'up':    base = -90; break;
    case 'left':  base = 180; break;
    case 'right': base = 0;   break;
    default:      base = 90;
  }

  const thetaC = base + SKEW * sign;
  const rad = d => d * Math.PI / 180;
  const onEllipse = d => ({
    x: cx + rx * Math.cos(rad(d)),
    y: cy + ry * Math.sin(rad(d)),
  });

  // 타원 위 호 속도로 tailBase → 각도 변환
  const thetaRad = rad(thetaC);
  const dxdt = -rx * Math.sin(thetaRad);
  const dydt = ry * Math.cos(thetaRad);
  const speed = Math.sqrt(dxdt * dxdt + dydt * dydt);
  const halfSpreadDeg = Math.min((tailBase / 2 / speed) * 180 / Math.PI, 20);

  const P1 = onEllipse(thetaC - halfSpreadDeg * sign);
  const P2 = onEllipse(thetaC + halfSpreadDeg * sign);
  const K  = onEllipse(thetaC);

  const tipAngle = thetaC + TIP_SWEEP * sign;
  const T = {
    x: K.x + Math.cos(rad(tipAngle)) * tailLen,
    y: K.y + Math.sin(rad(tipAngle)) * tailLen,
  };

  return { P1, P2, K, T };
}

// ── 큰 스파이크 path (surprised) — 골이 둥글게 파임 ──
function bigSpikyPath(cx, cy, rx, ry, count, depth) {
  const total = count * 2;
  let d = '';
  for (let i = 0; i < total; i++) {
    const angle = (2 * Math.PI / total) * i - Math.PI / 2;
    const nextAngle = (2 * Math.PI / total) * (i + 1) - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const rxi = isOuter ? rx : rx * (1 - depth);
    const ryi = isOuter ? ry : ry * (1 - depth);
    const x = cx + rxi * Math.cos(angle);
    const y = cy + ryi * Math.sin(angle);

    if (i === 0) {
      d = `M${x},${y}`;
    }

    // 골짜기(inner→outer)에서 Q 곡선으로 둥글게
    const nextIsOuter = (i + 1) % 2 === 0;
    const nrx = nextIsOuter ? rx : rx * (1 - depth);
    const nry = nextIsOuter ? ry : ry * (1 - depth);
    const nx = cx + nrx * Math.cos(nextAngle);
    const ny = cy + nry * Math.sin(nextAngle);

    if (!isOuter) {
      // 현재가 골짜기 → Q 곡선으로 둥글게 파임
      const midAngle = (angle + nextAngle) / 2;
      const cR = (rxi + nrx) / 2 * 0.92; // 곡선 제어점은 약간 안쪽
      const ctrlX = cx + cR * Math.cos(midAngle);
      const ctrlY = cy + cR * Math.sin(midAngle);
      d += ` Q${ctrlX},${ctrlY} ${nx},${ny}`;
    } else {
      d += ` L${nx},${ny}`;
    }
  }
  d += ' Z';
  return d;
}

// ── 사다리꼴 path (shy) ──
// 왼쪽이 좁고 오른쪽이 넓은 기울어진 사각형, 모서리를 Q 곡선으로 둥글게
function trapezoidPath(bx, by, w, h) {
  // 4 꼭짓점
  const tl = { x: bx + w * 0.03, y: by + h * 0.12 };
  const tr = { x: bx + w * 0.97, y: by };
  const br = { x: bx + w * 0.95, y: by + h };
  const bl = { x: bx, y: by + h * 0.90 };
  const r = Math.max(4, w * 0.06); // corner radius

  // Helper: point on edge at distance r from corner
  function towards(from, to, dist) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const t = Math.min(dist / len, 0.4);
    return { x: from.x + dx * t, y: from.y + dy * t };
  }

  const p = [
    towards(tl, tr, r), // start: top-left → top-right
    towards(tr, tl, r), // before top-right corner
    towards(tr, br, r), // after top-right corner
    towards(br, tr, r), // before bottom-right corner
    towards(br, bl, r), // after bottom-right corner
    towards(bl, br, r), // before bottom-left corner
    towards(bl, tl, r), // after bottom-left corner
    towards(tl, bl, r), // before top-left corner
  ];

  return `M${p[0].x},${p[0].y} L${p[1].x},${p[1].y} Q${tr.x},${tr.y} ${p[2].x},${p[2].y} L${p[3].x},${p[3].y} Q${br.x},${br.y} ${p[4].x},${p[4].y} L${p[5].x},${p[5].y} Q${bl.x},${bl.y} ${p[6].x},${p[6].y} L${p[7].x},${p[7].y} Q${tl.x},${tl.y} ${p[0].x},${p[0].y} Z`;
}


// ── 아이콘 렌더러 ──

function BubbleIcon({ type, x, y, size = 16 }) {
  const s = size;
  switch (type) {
    case 'lightning':
      return (
        <polygon
          points={`${x},${y} ${x-5},${y+8} ${x-1},${y+8} ${x-7},${y+s} ${x+2},${y+7} ${x-2},${y+7}`}
          fill="#cc3333"
        />
      );
    case 'teardrop':
      return (
        <g>
          <ellipse cx={x} cy={y + s * 0.65} rx={s * 0.3} ry={s * 0.35} fill="#5080cc" />
          <polygon points={`${x},${y} ${x - s * 0.25},${y + s * 0.5} ${x + s * 0.25},${y + s * 0.5}`} fill="#5080cc" />
        </g>
      );
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (2 * Math.PI / 10) * i - Math.PI / 2;
        const r = i % 2 === 0 ? s * 0.45 : s * 0.2;
        pts.push(`${x + r * Math.cos(a)},${y + s * 0.45 + r * Math.sin(a)}`);
      }
      return <polygon points={pts.join(' ')} fill="#cc9900" />;
    }
    case 'swirl':
      return (
        <g fill="none" stroke="#aa4070" strokeWidth="2" strokeLinecap="round">
          <path d={`M${x+3},${y+s*0.5} A${s*0.3},${s*0.3} 0 1,1 ${x-1},${y+s*0.3}`} />
          <path d={`M${x-1},${y+s*0.4} A${s*0.15},${s*0.15} 0 1,0 ${x+2},${y+s*0.55}`} />
        </g>
      );
    case 'lightbulb':
      return (
        <g>
          <ellipse cx={x} cy={y + s * 0.35} rx={s * 0.3} ry={s * 0.35} fill="#eedd44" stroke="#b0a030" strokeWidth="1" />
          <rect x={x - s * 0.12} y={y + s * 0.65} width={s * 0.24} height={s * 0.2} fill="#b0a030" rx="1" />
          <line x1={x} y1={y - s * 0.05} x2={x} y2={y - s * 0.15} stroke="#b0a030" strokeWidth="1.5" />
          <line x1={x + s * 0.35} y1={y + s * 0.2} x2={x + s * 0.45} y2={y + s * 0.15} stroke="#b0a030" strokeWidth="1.5" />
          <line x1={x - s * 0.35} y1={y + s * 0.2} x2={x - s * 0.45} y2={y + s * 0.15} stroke="#b0a030" strokeWidth="1.5" />
        </g>
      );
    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════
// needW / needH 계산 — 타원은 방정식, 나머지는 inset
// ══════════════════════════════════════════════════════

function computeBubbleSize(cfg, textBlockW, textBlockH, bubbleW, fixedWidth, minHeightPx, padX, padY, scale) {
  const PADDING_X = padX || BASE_PADDING_X;
  const PADDING_Y = padY || BASE_PADDING_Y;
  const sc = scale || 1;
  // ── 타원(isOval) 전용: 타원 방정식으로 계산 ──
  if (cfg.isOval) {
    // 패딩 포함 반쪽 크기
    const a = textBlockW / 2 + PADDING_X;
    const b = textBlockH / 2 + PADDING_Y;

    if (fixedWidth || cfg.isCaption) {
      // fixedWidth: 폭 고정, 높이를 타원 방정식으로 역산
      const needW = bubbleW;
      const rx = needW / 2;
      const ratio = a / rx;

      // ratio가 크면 ry가 발산하므로 0.85 상한
      const safeRatio = Math.min(ratio, 0.85);
      const ry = b / Math.sqrt(1 - safeRatio * safeRatio);
      let needH = ry * 2;
      needH = Math.max(needH, minHeightPx || 0);
      return { needW, needH };
    } else {
      // 자동 크기: √2 배율로 두 축 동일 비율
      const rx = a * Math.SQRT2;
      const ry = b * Math.SQRT2;
      let needW = rx * 2;
      let needH = ry * 2;
      needW = Math.min(bubbleW, Math.max(60 * sc, needW));

      // 폭이 잘렸으면 fixedWidth 방식으로 높이 재계산
      if (needW < rx * 2) {
        const rxClamp = needW / 2;
        const safeRatioC = Math.min(a / rxClamp, 0.85);
        needH = (b / Math.sqrt(1 - safeRatioC * safeRatioC)) * 2;
      }
      needH = Math.max(needH, minHeightPx || 0);
      return { needW, needH };
    }
  }

  // ── 스파이크(isSpiky): 골(innerR) 기준 타원 방정식 ──
  if (cfg.isSpiky) {
    const ir = cfg.innerRatio || 0.80;
    const a = textBlockW / 2 + PADDING_X;
    const b = textBlockH / 2 + PADDING_Y;

    if (fixedWidth || cfg.isCaption) {
      const needW = bubbleW;
      const innerRx = needW / 2 * ir;
      const safeRatio = Math.min(a / innerRx, 0.85);
      const innerRy = b / Math.sqrt(1 - safeRatio * safeRatio);
      let needH = (innerRy / ir) * 2;
      needH = Math.max(needH, minHeightPx || 0);
      return { needW, needH };
    } else {
      const innerRx = a * Math.SQRT2;
      const innerRy = b * Math.SQRT2;
      let needW = (innerRx / ir) * 2;
      let needH = (innerRy / ir) * 2;
      needW = Math.min(bubbleW, Math.max(60 * sc, needW));
      if (needW < (innerRx / ir) * 2) {
        const clampedInnerRx = needW / 2 * ir;
        const safeRatioC = Math.min(a / clampedInnerRx, 0.85);
        needH = ((b / Math.sqrt(1 - safeRatioC * safeRatioC)) / ir) * 2;
      }
      needH = Math.max(needH, minHeightPx || 0);
      return { needW, needH };
    }
  }

  // ── 비타원(사각형 등): 기존 inset 방식 ──
  const ix = cfg.insetX || 0;
  const iy = cfg.insetY || 0;

  let needW;
  if (cfg.isCaption || fixedWidth) {
    needW = bubbleW;
  } else {
    const rawW = textBlockW + PADDING_X * 2;
    needW = ix > 0 ? rawW / (1 - ix * 2) : rawW;
    needW = Math.min(bubbleW, Math.max(60 * sc, needW));
  }

  const rawH = textBlockH + PADDING_Y * 2;
  let needH = iy > 0 ? rawH / (1 - iy * 2) : rawH;
  needH = Math.max(needH, minHeightPx || 0);

  return { needW, needH };
}

// ── 텍스트 오프셋 계산 — 가용 영역 기반, 기존 안전 영역 재사용 ──

function computeTextShift(cfg, rxE, ryE, needW, needH, textBlockW, textBlockH, padX, padY, textOffsetX, textOffsetY) {
  let availW, availH;
  if (cfg.isOval) {
    // safeRatio 0.85 내접 사각형 (computeBubbleSize L569 동일 기준)
    availW = rxE * 2 * 0.85 - padX * 2;
    availH = ryE * 2 * 0.85 - padY * 2;
  } else if (cfg.isSpiky) {
    // 골(inner) 타원 기준 내접 사각형 (computeBubbleSize L605 동일 기준)
    const ir = cfg.innerRatio || 0.80;
    availW = rxE * ir * 2 * 0.85 - padX * 2;
    availH = ryE * ir * 2 * 0.85 - padY * 2;
  } else {
    // 사각형: 본체 − inset − 패딩 (computeBubbleSize L627-628 동일 기준)
    const ix = cfg.insetX || 0;
    const iy = cfg.insetY || 0;
    availW = needW * (1 - ix * 2) - padX * 2;
    availH = needH * (1 - iy * 2) - padY * 2;
  }
  const marginX = Math.max(0, (availW - textBlockW)) / 2;
  const marginY = Math.max(0, (availH - textBlockH)) / 2;
  return {
    shiftX: (textOffsetX || 0) * 2 * marginX,
    shiftY: (textOffsetY || 0) * 2 * marginY,
  };
}

// ── 말풍선 기하학 계산 (CutEditor 편집 모드에서 선택 박스·히트 영역에 사용) ──

export function computeSingleBubbleGeo(style, text, bubbleX, bubbleY, bubbleW, minHeightPx, fontScale, tailDirection, flipTail, fixedWidth, viewW, textOffsetX, textOffsetY) {
  const cfg = BUBBLE_CONFIGS[style] || BUBBLE_CONFIGS.round;
  const s = getScale(viewW);
  const fs = fontScale || 1.0;
  const fontSize = BASE_FONT_SIZE * s * (cfg.fontSize || 1) * fs;
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const padX = BASE_PADDING_X * s;
  const padY = BASE_PADDING_Y * s;
  const maxChars = Math.max(4, Math.floor((bubbleW - padX * 2) / (fontSize * CHAR_WIDTH)));
  const lines = wrapText(text, maxChars);
  const longestLine = Math.max(...lines.map(l => l.length), 1);
  const textBlockW = longestLine * fontSize * CHAR_WIDTH;
  const textBlockH = lines.length * lineHeight;

  const { needW, needH } = computeBubbleSize(cfg, textBlockW, textBlockH, bubbleW, fixedWidth, minHeightPx, padX, padY, s);

  const bx = bubbleX + (bubbleW - needW) / 2;
  const by = bubbleY;
  const rxE = needW / 2;
  const ryE = needH / 2;
  const { shiftX, shiftY } = computeTextShift(cfg, rxE, ryE, needW, needH, textBlockW, textBlockH, padX, padY, textOffsetX, textOffsetY);

  return { bx, by, needW, needH, style, cfg, shiftX, shiftY };
}

// ── 단일 말풍선 렌더러 ──

export function SingleBubble({
  style, text, bubbleX, bubbleY, bubbleW, bubbleH,
  tailDirection, flipTail, fontScale, fixedWidth, viewW,
  textOffsetX, textOffsetY, renderMode,
}) {
  const cfg = BUBBLE_CONFIGS[style] || BUBBLE_CONFIGS.round;
  const s = getScale(viewW);
  const fs = fontScale || 1.0;
  const fontSize = BASE_FONT_SIZE * s * (cfg.fontSize || 1) * fs;
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const padX = BASE_PADDING_X * s;
  const padY = BASE_PADDING_Y * s;
  const maxChars = Math.max(4, Math.floor((bubbleW - padX * 2) / (fontSize * CHAR_WIDTH)));
  const lines = wrapText(text, maxChars);
  const longestLine = Math.max(...lines.map(l => l.length), 1);
  const textBlockW = longestLine * fontSize * CHAR_WIDTH;
  const textBlockH = lines.length * lineHeight;

  const { needW, needH } = computeBubbleSize(cfg, textBlockW, textBlockH, bubbleW, fixedWidth, bubbleH, padX, padY, s);

  const bx = bubbleX + (bubbleW - needW) / 2;
  const by = bubbleY;
  const cx = bx + needW / 2;
  const cy = by + needH / 2;
  const rxE = needW / 2;
  const ryE = needH / 2;
  const sw = Math.max(1, (cfg.strokeWidth || 2) * s); // 스케일된 선 두께

  const elements = [];
  const dir = tailDirection || 'down';
  const flip = flipTail || false;

  // ── 텍스트 오프셋 계산 (caption/non-caption 공통) ──
  const { shiftX, shiftY } = computeTextShift(cfg, rxE, ryE, needW, needH, textBlockW, textBlockH, padX, padY, textOffsetX, textOffsetY);

  // ── 자막 (나레이션) — 전폭, 각진 사각형, 꼬리 없음 ──
  if (cfg.isCaption) {
    elements.push(
      <rect key="shape" x={bx} y={by} width={needW} height={needH}
        rx={0} ry={0} fill={cfg.fill} stroke="none" />
    );
    // 텍스트 — 줄 단위, 가운데 정렬
    const textCenterX = bx + shiftX + needW / 2;
    const textStartY = cy - textBlockH / 2 + shiftY;
    if (renderMode === 'svg-text') {
      elements.push(
        <text key="text" textAnchor="middle" fill={cfg.textColor}
          fontSize={fontSize} fontFamily="'Pretendard', 'Nanum Gothic', sans-serif"
          fontWeight={400} letterSpacing="0.02em">
          {lines.map((line, i) => (
            <tspan key={i} x={textCenterX}
              y={textStartY + i * lineHeight + lineHeight * 0.72}>{line}</tspan>
          ))}
        </text>
      );
    } else {
      elements.push(
        <foreignObject key="text" x={bx + shiftX} y={textStartY}
          width={needW} height={textBlockH}>
          <div xmlns="http://www.w3.org/1999/xhtml"
            style={{
              width: '100%',
              color: cfg.textColor,
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeight}px`,
              fontFamily: "'Pretendard', 'Nanum Gothic', sans-serif",
              fontWeight: 400,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'visible',
              letterSpacing: '0.02em',
            }}>
            {lines.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </foreignObject>
      );
    }
    return <g>{elements}</g>;
  }

  // ── 말풍선 모양 + 꼬리 ──

  if (cfg.isSpiky) {
    const ir = cfg.innerRatio || 0.80;
    const depth = 1 - ir;
    const innerRx = rxE * ir;
    const innerRy = ryE * ir;
    // 스파이크 path (outerR = rxE, innerR = rxE * ir)
    const pathFn = cfg.roundedValleys ? bigSpikyPath : spikyPath;
    const path = cfg.angryVariation
      ? spikyPath(cx, cy, rxE, ryE, cfg.spikeCount, depth, true)
      : pathFn(cx, cy, rxE, ryE, cfg.spikeCount, depth);
    // 스파이크 3종은 꼬리 없음 (디자인 확정)
    elements.push(
      <path key="shape" d={path} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={sw} strokeLinejoin="round" />
    );
  } else if (cfg.isOval) {
    if (dir !== 'none') {
      const rt = buildRoundTail(cx, cy, rxE, ryE, needH, dir, flip, s);
      const sweep = flip ? 1 : 0;
      const d = `M${rt.P1.x},${rt.P1.y} A${rxE},${ryE} 0 1,${sweep} ${rt.P2.x},${rt.P2.y} L${rt.T.x},${rt.T.y} L${rt.K.x},${rt.K.y} Z`;
      elements.push(
        <path key="shape" d={d}
          fill={cfg.fill} stroke={cfg.stroke} strokeWidth={sw}
          strokeDasharray={cfg.strokeDash || 'none'}
          strokeLinejoin="round" />
      );
    } else {
      elements.push(
        <ellipse key="shape" cx={cx} cy={cy} rx={rxE} ry={ryE}
          fill={cfg.fill} stroke={cfg.stroke} strokeWidth={sw}
          strokeDasharray={cfg.strokeDash || 'none'} />
      );
    }
  } else if (cfg.isTrapezoidal) {
    // shy — 사다리꼴 + 꼬리 단일 path
    const cornerR = Math.max(4 * s, needW * 0.06);
    if (cfg.tail && dir !== 'none') {
      const d = buildTrapezoidWithTailB(bx, by, needW, needH, cornerR, dir, flip, cfg.tail, s);
      elements.push(
        <path key="shape" d={d} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={sw} strokeLinejoin="round" />
      );
    } else {
      const d = trapezoidPath(bx, by, needW, needH);
      elements.push(
        <path key="shape" d={d} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={sw} strokeLinejoin="round" />
      );
    }
  } else if (cfg.isRoundedRect) {
    // flustered — 둥근 사각형 + 꼬리 단일 path
    // 반경: min(W,H)*0.25, 상한 H*0.35 — 알약 방지, 직선 구간 보장
    const rawR = Math.min(needW, needH) * 0.25;
    const radius = Math.min(rawR, needH * 0.35);
    if (cfg.tail && dir !== 'none') {
      const d = buildRoundedRectWithTailA(bx, by, needW, needH, radius, dir, flip, cfg.tail, s);
      elements.push(
        <path key="shape" d={d} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={sw} strokeLinejoin="round" />
      );
    } else {
      // 꼬리 없는 둥근 사각형
      elements.push(
        <rect key="shape" x={bx} y={by} width={needW} height={needH}
          rx={radius} ry={radius}
          fill={cfg.fill} stroke={cfg.stroke} strokeWidth={sw} />
      );
    }
  }

  // ── 아이콘 ──
  if (cfg.icon) {
    const iconSize = Math.round(18 * s);
    const iconX = bx + needW - 2 * s;
    const iconY = by - 2 * s;
    elements.push(
      <BubbleIcon key="icon" type={cfg.icon} x={iconX} y={iconY} size={iconSize} />
    );
  }

  // ── 텍스트 — 줄 단위, 가로·세로 중앙 정렬 ──
  const textCX = cx + shiftX;
  const textSY = cy - textBlockH / 2 + shiftY;
  const textFW = style === 'shout' || style === 'angry' ? 700 : 500;
  if (renderMode === 'svg-text') {
    elements.push(
      <text key="text" textAnchor="middle" fill={cfg.textColor}
        fontSize={fontSize} fontFamily="'Pretendard', 'Nanum Gothic', sans-serif"
        fontWeight={textFW} letterSpacing="0.02em">
        {lines.map((line, i) => (
          <tspan key={i} x={textCX}
            y={textSY + i * lineHeight + lineHeight * 0.72}>{line}</tspan>
        ))}
      </text>
    );
  } else {
    elements.push(
      <foreignObject key="text" x={bx + shiftX} y={textSY}
        width={needW} height={textBlockH}>
        <div xmlns="http://www.w3.org/1999/xhtml"
          style={{
            width: '100%',
            color: cfg.textColor,
            fontSize: `${fontSize}px`,
            lineHeight: `${lineHeight}px`,
            fontFamily: "'Pretendard', 'Nanum Gothic', sans-serif",
            fontWeight: textFW,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'visible',
          }}>
          {lines.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      </foreignObject>
    );
  }

  return <g>{elements}</g>;
}

// ── 미니 말풍선 아이콘 (팔레트용, 32x28 SVG) ──

const STYLE_LABELS = {
  round: '라운드', narration: '나레이션', thought: '생각', whisper: '속삭임',
  shout: '외침', angry: '화남', happy: '기쁨', sad: '슬픔',
  surprised: '놀람', shy: '부끄', flustered: '당황', realize: '깨달음',
};

const STYLE_ORDER = [
  'round', 'narration', 'thought', 'whisper',
  'shout', 'angry', 'happy', 'sad', 'surprised', 'shy', 'flustered', 'realize',
];

export function BubbleMiniIcon({ styleKey, size = 32, selected = false, onClick }) {
  const cfg = BUBBLE_CONFIGS[styleKey] || BUBBLE_CONFIGS.round;
  const w = size;
  const h = size * 0.8;
  const mcx = w / 2, mcy = h / 2;
  const pad = 3;

  let shape;
  if (cfg.isSpiky) {
    const ir = cfg.innerRatio || 0.80;
    const depth = 1 - ir;
    const pathFn = cfg.roundedValleys ? bigSpikyPath : spikyPath;
    const path = pathFn(mcx, mcy, mcx - pad, mcy - pad, cfg.spikeCount || 12, depth);
    shape = <path d={path} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1.5} strokeLinejoin="round" />;
  } else if (cfg.isOval) {
    shape = <ellipse cx={mcx} cy={mcy} rx={mcx - pad} ry={mcy - pad}
      fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1.5}
      strokeDasharray={cfg.strokeDash || 'none'} />;
  } else if (cfg.isCaption) {
    shape = <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2}
      rx={2} fill={cfg.fill} stroke={cfg.stroke || '#444'} strokeWidth={1} />;
  } else if (cfg.isTrapezoidal) {
    const mw = w - pad * 2, mh = h - pad * 2;
    const d = trapezoidPath(pad, pad, mw, mh);
    shape = <path d={d} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1.5} strokeLinejoin="round" />;
  } else {
    const radius = cfg.cornerRadius ? Math.max(3, (w - pad * 2) * cfg.cornerRadius) : Math.max(3, (w - pad * 2) * 0.08);
    shape = <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2}
      rx={radius}
      fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1.5} />;
  }

  // 미니 꼬리
  let tail = null;
  if (cfg.tail) {
    if (cfg.tail.type === 'A' || cfg.tail.type === 'B' || cfg.tail.type === 'C') {
      tail = <polygon points={`${mcx - 3},${h - pad} ${mcx},${h + 2} ${mcx + 3},${h - pad}`} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1} />;
    } else if (cfg.tail.type === 'D') {
      tail = <>
        <circle cx={mcx - 1} cy={h - pad + 3} r={1.5} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={0.8} />
        <circle cx={mcx + 1} cy={h - pad + 6} r={1} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={0.8} />
      </>;
    }
  }

  // 미니 아이콘
  let icon = null;
  if (cfg.icon) {
    const ix = w - 7, iy = 3;
    if (cfg.icon === 'lightning') icon = <polygon points={`${ix},${iy} ${ix-2},${iy+4} ${ix},${iy+4} ${ix-3},${iy+8} ${ix+1},${iy+3} ${ix-1},${iy+3}`} fill="#cc3333" />;
    if (cfg.icon === 'teardrop') icon = <><ellipse cx={ix} cy={iy+5} rx={2} ry={2.5} fill="#5080cc" /><polygon points={`${ix},${iy+1} ${ix-1.5},${iy+4} ${ix+1.5},${iy+4}`} fill="#5080cc" /></>;
    if (cfg.icon === 'star') {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = (2*Math.PI/10)*i-Math.PI/2; const r = i%2===0?3.5:1.5; pts.push(`${ix+r*Math.cos(a)},${iy+4+r*Math.sin(a)}`); }
      icon = <polygon points={pts.join(' ')} fill="#cc9900" />;
    }
    if (cfg.icon === 'swirl') icon = <path d={`M${ix+1},${iy+4} A2,2 0 1,1 ${ix-1},${iy+3}`} fill="none" stroke="#aa4070" strokeWidth={1.2} />;
    if (cfg.icon === 'lightbulb') icon = <><ellipse cx={ix} cy={iy+4} rx={2.5} ry={2.5} fill="#eedd44" stroke="#b0a030" strokeWidth={0.8} /><rect x={ix-1} y={iy+6.5} width={2} height={1.5} fill="#b0a030" rx={0.5} /></>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={STYLE_LABELS[styleKey]}
      className={`inline-flex flex-col items-center gap-0.5 p-1 rounded-lg transition-all cursor-pointer
        ${selected
          ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/30 scale-110'
          : 'hover:bg-gray-100 dark:hover:bg-zinc-700 hover:scale-105'
        }`}
    >
      <svg width={w} height={h + (tail ? 6 : 0)} viewBox={`0 0 ${w} ${h + (tail ? 8 : 0)}`}>
        {shape}
        {tail}
        {icon}
      </svg>
      <span className="text-[9px] text-gray-500 dark:text-gray-400 font-bold leading-none">
        {STYLE_LABELS[styleKey]}
      </span>
    </button>
  );
}

export { STYLE_ORDER, STYLE_LABELS, BUBBLE_CONFIGS };

// ── 메인 오버레이 컴포넌트 ──

export default function BubbleOverlay({ dialogue, characters, width, height, renderMode }) {
  const bubbles = useMemo(() => {
    if (!dialogue || dialogue.length === 0 || !width || !height) return [];

    const sorted = [...dialogue].sort((a, b) => (a.order || 0) - (b.order || 0));
    const s = getScale(width);
    const padX = BASE_PADDING_X * s;
    const padY = BASE_PADDING_Y * s;
    const maxBubbleW = width * 0.78;
    const margin = width * 0.04;
    const gap = height * 0.015;
    const tailSpace = height * 0.025;

    const result = [];
    let topY = margin;
    let bottomY = height - margin;

    for (const item of sorted) {
      const style = resolveBubbleStyle(item, characters);
      const cfg = BUBBLE_CONFIGS[style] || BUBBLE_CONFIGS.round;
      const isBottom = cfg.position === 'bottom';

      // bubble_layout이 있으면 사용자 지정 좌표 사용
      if (item.bubble_layout) {
        const bl = item.bubble_layout;
        const bw = bl.width * width;
        const bx = bl.x * width;
        const by = bl.y * height;
        const fs = bl.font_scale || 1.0;
        const minH = (bl.min_height || 0) * height;
        const tailDir = bl.tail_direction || 'down';
        const flip = bl.tail_flip || false;
        const txOff = bl.text_offset_x || 0;
        const tyOff = bl.text_offset_y || 0;

        const fontSize = BASE_FONT_SIZE * s * (cfg.fontSize || 1) * fs;
        const lineHeight = fontSize * LINE_HEIGHT_RATIO;
        const maxChars = Math.max(4, Math.floor((bw - padX * 2) / (fontSize * CHAR_WIDTH)));
        const lines = wrapText(item.text || '', maxChars);
        const textBlockW = Math.max(...lines.map(l => l.length), 1) * fontSize * CHAR_WIDTH;
        const textH = lines.length * lineHeight;
        const { needW: w2, needH: h2 } = computeBubbleSize(cfg, textBlockW, textH, bw, true, minH, padX, padY, s);

        result.push({
          style, text: item.text,
          x: bx, y: by, w: bw, h: h2,
          tailDirection: tailDir, flipTail: flip, fontScale: fs,
          fixedWidth: true,
          textOffsetX: txOff, textOffsetY: tyOff,
        });
        continue;
      }

      // 기본 자동 배치
      const fontSize = BASE_FONT_SIZE * s * (cfg.fontSize || 1);
      const lineHeight = fontSize * LINE_HEIGHT_RATIO;
      const maxChars = Math.max(4, Math.floor((maxBubbleW - padX * 2) / (fontSize * CHAR_WIDTH)));
      const lines = wrapText(item.text || '', maxChars);
      const textBlockW = Math.max(...lines.map(l => l.length), 1) * fontSize * CHAR_WIDTH;
      const textH = lines.length * lineHeight;
      const { needW: autoW, needH: autoH } = computeBubbleSize(cfg, textBlockW, textH, maxBubbleW, false, 0, padX, padY, s);

      if (isBottom) {
        bottomY -= autoH;
        result.push({ style, text: item.text, x: (width - autoW) / 2, y: bottomY, w: autoW, h: autoH });
        bottomY -= gap;
      } else {
        result.push({ style, text: item.text, x: (width - autoW) / 2, y: topY, w: autoW, h: autoH });
        topY += autoH + gap + tailSpace;
      }
    }

    return result;
  }, [dialogue, characters, width, height]);

  if (bubbles.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {bubbles.map((b, i) => (
        <SingleBubble
          key={i}
          style={b.style}
          text={b.text}
          bubbleX={b.x}
          bubbleY={b.y}
          bubbleW={b.w}
          bubbleH={b.h}
          tailDirection={b.tailDirection}
          flipTail={b.flipTail}
          fontScale={b.fontScale}
          fixedWidth={b.fixedWidth}
          viewW={width}
          textOffsetX={b.textOffsetX}
          textOffsetY={b.textOffsetY}
          renderMode={renderMode}
        />
      ))}
    </svg>
  );
}
