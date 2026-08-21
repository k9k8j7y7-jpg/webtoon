import { Check, Lock, AlertTriangle, Pencil } from 'lucide-react';

const GATE_LABELS = ['기획', '대본', '자산', '콘티', '이미지'];
const GATE_KEYS = ['1_planning', '2_script', '3_assets', '4_storyboard', '5_review'];

const statusIcon = (status) => {
  switch (status) {
    case 'approved': return <Check size={14} className="text-white" />;
    case 'draft': return <Pencil size={12} className="text-white" />;
    case 'invalidated': return <AlertTriangle size={12} className="text-white" />;
    default: return <Lock size={12} className="text-gray-400 dark:text-zinc-500" />;
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
  if (!gateStatus) return null;
  const currentGate = gateStatus.current_gate;
  const activeGate = viewingGate || currentGate;

  return (
    <div className="flex items-center gap-1 w-full overflow-x-auto scrollbar-hide">
      {GATE_KEYS.map((key, i) => {
        const gate = gateStatus.gates[key];
        const status = gate?.status || 'locked';
        const isActive = i + 1 === activeGate;

        return (
          <div key={key} className="flex items-center flex-1 min-w-0">
            <button
              onClick={() => onGateClick?.(i + 1)}
              className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[11px] md:text-xs font-bold whitespace-nowrap transition-all
                ${isActive ? 'ring-2 ring-comic-orange ring-offset-1 dark:ring-offset-surface-dark' : ''}
                ${status === 'locked' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}
                ${statusColor(status)} ${status === 'locked' ? 'text-gray-500 dark:text-gray-400' : 'text-white'}`}
              disabled={status === 'locked'}
            >
              {statusIcon(status)}
              {GATE_LABELS[i]}
            </button>
            {i < 4 && <div className={`flex-1 h-0.5 mx-0.5 md:mx-1 min-w-1 ${i + 1 < currentGate ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-zinc-700'}`} />}
          </div>
        );
      })}
    </div>
  );
}
