/**
 * StepHeader — 게이트 상단 STEP N/5 헤더 + 단계 이동 메뉴
 * GateProgress.jsx 교체. 현재 단계를 크게 표시, 완료된 단계는 드롭다운(PC)/바텀시트(폰).
 * 메뉴는 createPortal(body) — 상단 고정 헤더에 가려지지 않도록 z-[60].
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Lock, AlertTriangle, Pencil, ChevronDown, ArrowRight } from 'lucide-react';

// ── 단계 정의 (단일 소스) ──
const STEPS_DEFAULT = [
  { n: 1, key: '1_planning',    name: '기획',     desc: '아이디어와 등장인물을 정리해요', gates: [1] },
  { n: 2, key: '2_script',      name: '대본',     desc: '컷별 대사와 장면을 만들어요', gates: [2] },
  { n: 3, key: '3_assets',      name: '자산 준비', desc: '캐릭터 시트·장소·스타일을 정해요', gates: [3] },
  { n: 4, key: '4_storyboard',  name: '콘티·장소', desc: '컷 구성과 말풍선 배치를 확인해요', gates: [4] },
  { n: 5, key: '5_review',      name: '웹툰 만들기', desc: '컷을 생성하고 공개·내보내요', gates: [5] },
];

const STEPS_ONECUT = [
  { n: 1, key: '1_planning',  name: '브리프',   desc: '광고 목적과 카피를 정해요', gates: [1, 2] },
  { n: 2, key: '3_assets',    name: '준비',     desc: '모델·제품·스타일을 준비해요', gates: [3] },
  { n: 3, key: '5_review',    name: '완성',     desc: '한 컷을 생성하고 공유해요', gates: [4, 5] },
];

const STEPS_INSTA_BRAND = [
  { n: 1, key: '1_planning',  name: '브리프', desc: '광고 목적과 카피를 정해요', gates: [1] },
  { n: 2, key: '2_script',    name: '대본',   desc: '컷별 대사와 장면을 만들어요', gates: [2] },
  { n: 3, key: '3_assets',    name: '준비',   desc: '모델·제품·스타일을 준비해요', gates: [3] },
  { n: 4, key: '5_review',    name: '완성',   desc: '컷을 생성하고 공유해요', gates: [4, 5] },
];

function getSteps(purpose) {
  if (purpose === 'onecut_ad') return STEPS_ONECUT;
  if (purpose === 'instatoon_ad' || purpose === 'brand_series') return STEPS_INSTA_BRAND;
  return STEPS_DEFAULT;
}

// 게이트 번호 → 표시 스텝 번호 변환
function gateToStepN(gateNumber, steps) {
  for (const s of steps) {
    if (s.gates.includes(gateNumber)) return s.n;
  }
  return steps[steps.length - 1].n;
}

// 기존 호환용 (외부에서 import { STEPS })
const STEPS = STEPS_DEFAULT;
export { STEPS, getSteps, gateToStepN };

function getStatus(gateStatus, key) {
  return gateStatus?.gates?.[key]?.status || 'locked';
}

function StatusIcon({ status, size = 14 }) {
  switch (status) {
    case 'approved': return <Check size={size} />;
    case 'draft': return <Pencil size={size - 2} />;
    case 'invalidated': return <AlertTriangle size={size - 2} />;
    default: return <Lock size={size - 2} />;
  }
}

function statusLabel(status) {
  switch (status) {
    case 'approved': return '완료';
    case 'draft': return '진행 중';
    case 'invalidated': return '다시 확인 필요';
    default: return '잠김';
  }
}

function statusColor(status) {
  switch (status) {
    case 'approved': return 'text-emerald-500 dark:text-emerald-400';
    case 'draft': return 'text-neon-from dark:text-purple-400';
    case 'invalidated': return 'text-amber-500 dark:text-amber-400';
    default: return 'text-zinc-400 dark:text-zinc-500';
  }
}

function statusBgDot(status) {
  switch (status) {
    case 'approved': return 'bg-emerald-500';
    case 'draft': return 'bg-neon-from';
    case 'invalidated': return 'bg-amber-500';
    default: return 'bg-zinc-300 dark:bg-zinc-600';
  }
}

export default function StepHeader({ gateStatus, onGateClick, viewingGate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef(null);
  const closeFnRef = useRef(null);
  const [pos, setPos] = useState(null);

  const purpose = gateStatus?.purpose || 'story';
  const steps = getSteps(purpose);
  const currentGate = gateStatus?.current_gate || 1;
  const displayGate = viewingGate || currentGate;
  const displayStepN = gateToStepN(displayGate, steps);
  const step = steps.find(s => s.n === displayStepN) || steps[0];
  const isViewing = viewingGate && viewingGate !== currentGate;

  const approvedCount = steps.filter(s => getStatus(gateStatus, s.key) === 'approved').length;

  // matchMedia로 모바일 판정 (리사이즈 반영)
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

  // 바깥 클릭·Esc 닫기 — 열린 다음 틱에 리스너 등록 (토글 버튼의 pointerdown과 충돌 방지)
  useEffect(() => {
    if (!menuOpen) return;
    const tid = setTimeout(() => {
      const close = (e) => {
        if (e.target.closest?.('[data-step-menu]')) return;
        setMenuOpen(false);
      };
      const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
      document.addEventListener('pointerdown', close);
      document.addEventListener('keydown', onKey);
      closeFnRef.current = () => {
        document.removeEventListener('pointerdown', close);
        document.removeEventListener('keydown', onKey);
      };
    }, 0);
    return () => { clearTimeout(tid); closeFnRef.current?.(); };
  }, [menuOpen]);

  if (!gateStatus) return null;

  const handleToggle = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // PC: 버튼 오른쪽 정렬, 아래로 펼침. 뷰포트 넘치면 왼쪽으로 보정
      const menuW = 320;
      let left = r.right - menuW;
      if (left < 8) left = 8;
      setPos({ left, top: r.bottom + 6 });
    }
    setMenuOpen(!menuOpen);
  };

  const handleItemClick = (n) => {
    setMenuOpen(false);
    onGateClick?.(n);
  };

  // ── 메뉴 항목 렌더 ──
  const renderItems = () => steps.map((s) => {
    const st = getStatus(gateStatus, s.key);
    const clickGate = s.gates[0]; // 클릭 시 이동할 게이트 번호
    const isCurrent = s.gates.includes(currentGate);
    const isLocked = st === 'locked';
    const isDisplay = s.n === displayStepN;

    return (
      <button
        key={s.n}
        onPointerDown={isLocked ? undefined : () => handleItemClick(clickGate)}
        disabled={isLocked}
        role="menuitem"
        aria-disabled={isLocked}
        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors
          ${isDisplay ? 'bg-neon-from/10 dark:bg-neon-from/15' : ''}
          ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer'}`}
      >
        <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${statusBgDot(st)} ${st === 'locked' ? 'text-zinc-500' : 'text-white'}`}>
          <StatusIcon status={st} size={13} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className={`text-sm font-bold ${isLocked ? 'text-zinc-400 dark:text-zinc-500' : 'text-ink-black dark:text-white'}`}>
              STEP {s.n} &nbsp;{s.name}
            </span>
            {isCurrent && !isViewing && (
              <span className="text-[10px] font-bold text-neon-from bg-neon-from/10 px-1.5 py-0.5 rounded-full">현재</span>
            )}
          </span>
          <span className={`block text-xs mt-0.5 ${statusColor(st)}`}>
            {st === 'invalidated' ? '다시 확인 필요 — 앞 단계가 바뀌었어요' : st === 'locked' ? `잠김 — ${s.n - 1}단계를 먼저 완료하세요` : statusLabel(st)}
          </span>
        </span>
      </button>
    );
  });

  // ── 메뉴 포탈 ──
  const menu = menuOpen ? createPortal(
    isMobile ? (
      // 모바일: 바텀시트
      <div data-step-menu className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
        onPointerDown={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}
      >
        <div className="w-full glass-card rounded-t-2xl shadow-2xl max-h-[70vh] overflow-y-auto"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-night-border dark:border-zinc-700">
            <span className="text-sm font-bold text-ink-black dark:text-white">단계 이동</span>
            <button onPointerDown={() => setMenuOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full">✕</button>
          </div>
          <div className="divide-y divide-border dark:divide-night-border">
            {renderItems()}
          </div>
        </div>
      </div>
    ) : (
      // PC: fixed 팝오버 (버튼 좌표 기준)
      <div data-step-menu className="fixed z-[60] w-80 bg-white dark:bg-night-card border border-border dark:border-night-border rounded-xl shadow-xl overflow-hidden"
        style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="divide-y divide-border dark:divide-night-border">
          {renderItems()}
        </div>
      </div>
    ),
    document.body,
  ) : null;

  const displayStatus = getStatus(gateStatus, step.key);

  return (
    <div className="glass-card p-4 sm:p-5 space-y-3">
      {/* 상단: STEP N/5 + 단계 이동 버튼 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${statusBgDot(displayStatus)} text-white`}>
              <StatusIcon status={displayStatus} size={13} />
            </span>
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              STEP {displayStepN} / {steps.length}
            </span>
          </div>
          <h2 className="text-lg font-bold font-serif text-ink-black dark:text-white">{step.name}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{step.desc}</p>
        </div>
        <div className="shrink-0">
          <button
            ref={btnRef}
            onPointerDown={handleToggle}
            aria-expanded={menuOpen}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/15 border border-zinc-200 dark:border-white/10 transition-colors"
          >
            단계 이동 <ChevronDown size={13} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* 보기 모드 배지 */}
      {isViewing && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
          <span className="font-bold">보기 모드</span>
          <span className="text-zinc-500 dark:text-zinc-400">· 수정하려면 아래 [수정하기]</span>
          <button
            onPointerDown={() => onGateClick?.(currentGate)}
            className="ml-auto flex items-center gap-1 font-bold text-neon-from hover:underline shrink-0"
          >
            현재 단계로 <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* 진행 바 */}
      <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{
            width: `${(approvedCount / steps.length) * 100}%`,
            background: 'linear-gradient(to right, var(--color-neon-from, #a855f7), var(--color-neon-to, #6366f1))',
          }}
        />
      </div>

      {/* 메뉴 포탈 */}
      {menu}
    </div>
  );
}
