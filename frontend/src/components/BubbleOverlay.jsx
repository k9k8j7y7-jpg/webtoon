/**
 * BubbleOverlay — 컷 이미지 위에 12종 SVG 말풍선을 렌더링
 *
 * 핵심: 말풍선은 이미지 파일이 아니라 코드(SVG)로 그린다.
 * 텍스트 길이에 맞춰 자동 확장, 교체 시 이미지 재생성 불필요.
 */

import { useMemo } from 'react';
import { resolveBubbleStyle } from '../utils/bubbleMapping';

// ── 스타일별 설정 ──

const BUBBLE_CONFIGS = {
  round: {
    fill: 'rgba(255,255,255,0.92)',
    stroke: '#333',
    strokeWidth: 2,
    textColor: '#1e1e1e',
    radius: 18,
    hasTail: true,
    position: 'top',
  },
  narration: {
    fill: 'rgba(0,0,0,0.6)',
    stroke: 'none',
    strokeWidth: 0,
    textColor: '#ffffff',
    radius: 0,
    hasTail: false,
    position: 'bottom',
    isCaption: true,
    fontSize: 0.9,
  },
  thought: {
    fill: 'rgba(255,255,255,0.82)',
    stroke: '#999',
    strokeWidth: 2,
    textColor: '#505050',
    radius: 22,
    hasTail: 'dots',
    position: 'top',
  },
  whisper: {
    fill: 'rgba(255,255,255,0.72)',
    stroke: '#999',
    strokeWidth: 2,
    strokeDash: '6,4',
    textColor: '#777',
    radius: 50,
    isEllipse: true,
    hasTail: 'small',
    position: 'top',
    fontSize: 0.85,
  },
  shout: {
    fill: 'rgba(255,255,255,0.95)',
    stroke: '#222',
    strokeWidth: 3,
    textColor: '#111',
    isSpiky: true,
    spikeCount: 14,
    spikeDepth: 0.16,
    hasTail: false,
    position: 'top',
    fontSize: 1.15,
  },
  angry: {
    fill: 'rgba(255,230,230,0.95)',
    stroke: '#cc2222',
    strokeWidth: 3,
    textColor: '#aa2222',
    isSpiky: true,
    spikeCount: 14,
    spikeDepth: 0.18,
    hasTail: false,
    position: 'top',
    fontSize: 1.15,
    icon: 'lightning',
  },
  happy: {
    fill: 'rgba(255,230,240,0.92)',
    stroke: '#e06090',
    strokeWidth: 2,
    textColor: '#b03060',
    radius: 22,
    hasTail: true,
    position: 'top',
  },
  sad: {
    fill: 'rgba(225,235,255,0.92)',
    stroke: '#5070b0',
    strokeWidth: 2,
    textColor: '#3050a0',
    isEllipse: true,
    hasTail: false,
    position: 'top',
    icon: 'teardrop',
  },
  surprised: {
    fill: 'rgba(255,248,220,0.95)',
    stroke: '#cc8800',
    strokeWidth: 2,
    textColor: '#aa6600',
    isSpiky: true,
    spikeCount: 12,
    spikeDepth: 0.14,
    hasTail: false,
    position: 'top',
    icon: 'star',
  },
  shy: {
    fill: 'rgba(255,220,235,0.88)',
    stroke: '#cc6090',
    strokeWidth: 2,
    textColor: '#a04070',
    isEllipse: true,
    hasTail: 'small',
    position: 'top',
  },
  flustered: {
    fill: 'rgba(255,230,238,0.88)',
    stroke: '#bb5080',
    strokeWidth: 2,
    textColor: '#903060',
    isEllipse: true,
    hasTail: false,
    position: 'top',
    icon: 'swirl',
  },
  realize: {
    fill: 'rgba(255,255,220,0.92)',
    stroke: '#b0a030',
    strokeWidth: 2,
    textColor: '#706010',
    isEllipse: true,
    hasTail: false,
    position: 'top',
    icon: 'lightbulb',
  },
};

// ── 텍스트 줄바꿈 헬퍼 ──

function wrapText(text, maxCharsPerLine) {
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

function spikyPath(cx, cy, rx, ry, count, depth) {
  const points = [];
  const total = count * 2;
  for (let i = 0; i < total; i++) {
    const angle = (2 * Math.PI / total) * i - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const rxi = isOuter ? rx : rx * (1 - depth);
    const ryi = isOuter ? ry : ry * (1 - depth);
    points.push(`${cx + rxi * Math.cos(angle)},${cy + ryi * Math.sin(angle)}`);
  }
  return `M${points.join('L')}Z`;
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
          <path d={`M${x+3},${y+s*0.5} A${s*0.3},${s*0.3} 0 1,1 ${x-3},${y+s*0.3}`} />
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

// ── 단일 말풍선 렌더러 ──

function SingleBubble({ style, text, bubbleX, bubbleY, bubbleW, bubbleH, viewW }) {
  const cfg = BUBBLE_CONFIGS[style] || BUBBLE_CONFIGS.round;
  const fontSize = 14 * (cfg.fontSize || 1);
  const lineHeight = fontSize * 1.45;
  const paddingX = 14;
  const paddingY = 10;
  const maxChars = Math.max(4, Math.floor((bubbleW - paddingX * 2) / (fontSize * 0.55)));
  const lines = wrapText(text, maxChars);
  const textBlockH = lines.length * lineHeight;

  // 실제 말풍선 크기 (텍스트에 맞춤)
  const needW = cfg.isCaption ? bubbleW : Math.min(bubbleW, Math.max(60, maxChars * fontSize * 0.55 + paddingX * 2));
  const needH = textBlockH + paddingY * 2;
  const bx = bubbleX + (bubbleW - needW) / 2;
  const by = bubbleY;
  const cx = bx + needW / 2;
  const cy = by + needH / 2;

  const elements = [];

  // ── 자막 (나레이션) — 전체 너비, 테두리/꼬리 없음 ──
  if (cfg.isCaption) {
    elements.push(
      <rect key="shape" x={bx} y={by} width={needW} height={needH}
        fill={cfg.fill} stroke="none" />
    );
    elements.push(
      <foreignObject key="text" x={bx + paddingX} y={by + paddingY}
        width={needW - paddingX * 2} height={textBlockH + 4}>
        <div xmlns="http://www.w3.org/1999/xhtml"
          style={{
            color: cfg.textColor,
            fontSize: `${fontSize}px`,
            lineHeight: `${lineHeight}px`,
            fontFamily: "'Pretendard', 'Nanum Gothic', sans-serif",
            fontWeight: 400,
            textAlign: 'center',
            wordBreak: 'keep-all',
            overflowWrap: 'break-word',
            letterSpacing: '0.02em',
          }}>
          {text}
        </div>
      </foreignObject>
    );
    return <g>{elements}</g>;
  }

  // ── 말풍선 모양 ──
  if (cfg.isSpiky) {
    const margin = 8;
    const path = spikyPath(cx, cy, needW / 2 + margin, needH / 2 + margin, cfg.spikeCount, cfg.spikeDepth);
    elements.push(
      <path key="shape" d={path} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={cfg.strokeWidth} strokeLinejoin="round" />
    );
  } else if (cfg.isEllipse) {
    elements.push(
      <ellipse key="shape" cx={cx} cy={cy} rx={needW / 2 + 4} ry={needH / 2 + 4}
        fill={cfg.fill} stroke={cfg.stroke} strokeWidth={cfg.strokeWidth}
        strokeDasharray={cfg.strokeDash || 'none'} />
    );
  } else {
    elements.push(
      <rect key="shape" x={bx} y={by} width={needW} height={needH}
        rx={cfg.radius} ry={cfg.radius}
        fill={cfg.fill} stroke={cfg.stroke} strokeWidth={cfg.strokeWidth}
        strokeDasharray={cfg.strokeDash || 'none'} />
    );
  }

  // ── 꼬리 ──
  if (cfg.hasTail === true) {
    const tx = bx + Math.min(35, needW * 0.3);
    const tailY = by + needH;
    elements.push(
      <polygon key="tail"
        points={`${tx},${tailY - 1} ${tx + 8},${tailY + 10} ${tx + 16},${tailY - 1}`}
        fill={cfg.fill} stroke={cfg.stroke} strokeWidth={cfg.strokeWidth}
        strokeLinejoin="round" />
    );
    // 꼬리 연결부 덮기
    elements.push(
      <rect key="tail-cover" x={tx + 1} y={tailY - 2} width={14} height={4}
        fill={cfg.fill} stroke="none" />
    );
  } else if (cfg.hasTail === 'dots') {
    const tx = bx + Math.min(35, needW * 0.3);
    const tailY = by + needH;
    elements.push(
      <circle key="dot1" cx={tx + 5} cy={tailY + 6} r={4}
        fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1} />,
      <circle key="dot2" cx={tx + 9} cy={tailY + 14} r={2.5}
        fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1} />
    );
  } else if (cfg.hasTail === 'small') {
    const tx = bx + Math.min(35, needW * 0.3);
    const tailY = cfg.isEllipse ? cy + needH / 2 + 2 : by + needH;
    elements.push(
      <polygon key="tail"
        points={`${tx},${tailY - 1} ${tx + 6},${tailY + 7} ${tx + 12},${tailY - 1}`}
        fill={cfg.fill} stroke="none" />
    );
  }

  // ── 아이콘 ──
  if (cfg.icon) {
    const iconX = bx + needW - 2;
    const iconY = by - 2;
    elements.push(
      <BubbleIcon key="icon" type={cfg.icon} x={iconX} y={iconY} size={18} />
    );
  }

  // ── 텍스트 ──
  elements.push(
    <foreignObject key="text" x={bx + paddingX} y={by + paddingY}
      width={needW - paddingX * 2} height={textBlockH + 4}>
      <div xmlns="http://www.w3.org/1999/xhtml"
        style={{
          color: cfg.textColor,
          fontSize: `${fontSize}px`,
          lineHeight: `${lineHeight}px`,
          fontFamily: "'Pretendard', 'Nanum Gothic', sans-serif",
          fontWeight: style === 'shout' || style === 'angry' ? 700 : 500,
          textAlign: 'center',
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
        }}>
        {text}
      </div>
    </foreignObject>
  );

  return <g>{elements}</g>;
}

// ── 메인 오버레이 컴포넌트 ──

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
  const cx = w / 2, cy = h / 2;
  const pad = 3;

  let shape;
  if (cfg.isSpiky) {
    const path = spikyPath(cx, cy, cx - pad, cy - pad, cfg.spikeCount || 12, cfg.spikeDepth || 0.15);
    shape = <path d={path} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1.5} strokeLinejoin="round" />;
  } else if (cfg.isEllipse) {
    shape = <ellipse cx={cx} cy={cy} rx={cx - pad} ry={cy - pad}
      fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1.5}
      strokeDasharray={cfg.strokeDash || 'none'} />;
  } else if (styleKey === 'narration') {
    shape = <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2}
      rx={2} fill={cfg.fill} stroke={cfg.stroke || '#444'} strokeWidth={1} />;
  } else {
    shape = <rect x={pad} y={pad} width={w - pad * 2} height={h - pad * 2}
      rx={cfg.radius ? Math.min(cfg.radius, 8) : 6}
      fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1.5}
      strokeDasharray={cfg.strokeDash || 'none'} />;
  }

  // 미니 꼬리
  let tail = null;
  if (cfg.hasTail === true) {
    tail = <polygon points={`${cx - 3},${h - pad} ${cx},${h + 2} ${cx + 3},${h - pad}`} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={1} />;
  } else if (cfg.hasTail === 'dots') {
    tail = <>
      <circle cx={cx - 1} cy={h - pad + 3} r={1.5} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={0.8} />
      <circle cx={cx + 1} cy={h - pad + 6} r={1} fill={cfg.fill} stroke={cfg.stroke} strokeWidth={0.8} />
    </>;
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

export default function BubbleOverlay({ dialogue, characters, width, height }) {
  const bubbles = useMemo(() => {
    if (!dialogue || dialogue.length === 0 || !width || !height) return [];

    const sorted = [...dialogue].sort((a, b) => (a.order || 0) - (b.order || 0));
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

      const fontSize = 14 * (cfg.fontSize || 1);
      const lineHeight = fontSize * 1.45;
      const paddingY = 10;
      const paddingX = 14;
      const maxChars = Math.max(4, Math.floor((maxBubbleW - paddingX * 2) / (fontSize * 0.55)));
      const lines = wrapText(item.text || '', maxChars);
      const textH = lines.length * lineHeight;
      const bubbleH = textH + paddingY * 2;

      if (isBottom) {
        bottomY -= bubbleH;
        result.push({ style, text: item.text, x: (width - maxBubbleW) / 2, y: bottomY, w: maxBubbleW, h: bubbleH });
        bottomY -= gap;
      } else {
        result.push({ style, text: item.text, x: (width - maxBubbleW) / 2, y: topY, w: maxBubbleW, h: bubbleH });
        topY += bubbleH + gap + tailSpace;
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
          viewW={width}
        />
      ))}
    </svg>
  );
}
