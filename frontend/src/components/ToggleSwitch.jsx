// on/off 스위치 — 알림센터 푸시 토글·설정 알림 종류 공용
export default function ToggleSwitch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-gradient-to-r from-purple-500 to-cyan-400' : 'bg-gray-300 dark:bg-white/15'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}
