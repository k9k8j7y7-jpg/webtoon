import { useEffect, useRef } from 'react';
import { Check, Lock, AlertTriangle, Pencil } from 'lucide-react';

const GATE_LABELS = ['기획', '대본', '자산', '콘티&장소', '이미지'];
const GATE_KEYS = ['1_planning', '2_script', '3_assets', '4_storyboard', '5_review'];

const statusIcon = (status) => {
  switch (status) {
    case 'approved': return <Check size={14} className="text-white" />;
    case 'draft': return <Pencil size={12} className="text-white" />;
    case 'invalidated': return <AlertTriangle size={12} className="text-white" />;
    default: return <Lock size={12} className="text-gray-400 dark:text-gray-400" />;
  }
};

const statusColor = (status) => {
  switch (status) {
    case 'approved': return 'bg-green-500 dark:bg-green-600';
    case 'draft': return 'bg-comic-blue';
    case 'invalidated': return 'bg-amber-500';
    default: return 'bg-gray-200 dark:bg-zinc-700';
  }
};

export default function GateProgress({ gateStatus, onGateClick, viewingGate }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);
  const currentGate = gateStatus?.current_gate;
  const activeGate = viewingGate || currentGate;

  // 모바일(가로 스크롤)에서 현재 게이트를 가운데로. scrollIntoView는 페이지 세로 스크롤까지 건드릴 수 있어 scrollLeft만 조정
  useEffect(() => {
    const box = scrollRef.current;
    const btn = activeRef.current;
    if (!box || !btn || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: btn.offsetLeft - (box.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
  }, [activeGate]);

  if (!gateStatus) return null;

  return (
    <div ref={scrollRef} className="relative flex flex-nowrap items-center gap-1 w-full overflow-x-auto scrollbar-hide px-1 py-1 sm:p-0">
      {GATE_KEYS.map((key, i) => {
        const gate = gateStatus.gates[key];
        const status = gate?.status || 'locked';
        const isActive = i + 1 === activeGate;

        return (
          <div key={key} className="flex items-center shrink-0 sm:shrink sm:flex-1 sm:min-w-0">
            <button
              ref={isActive ? activeRef : null}
              onClick={() => onGateClick?.(i + 1)}
              className={`shrink-0 flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[11px] md:text-xs font-bold whitespace-nowrap transition-all
                ${isActive ? 'neon-ring ring-offset-1 dark:ring-offset-night-bg' : ''}
                ${status === 'locked' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}
                ${statusColor(status)} ${status === 'locked' ? 'text-gray-500 dark:text-gray-400' : 'text-white'}`}
              disabled={status === 'locked'}
            >
              {statusIcon(status)}
              {GATE_LABELS[i]}
            </button>
            {i < 4 && <div className={`w-4 shrink-0 sm:w-auto sm:shrink sm:flex-1 h-0.5 mx-0.5 md:mx-1 sm:min-w-1 ${i + 1 < currentGate ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-zinc-700'}`} />}
          </div>
        );
      })}
    </div>
  );
}
