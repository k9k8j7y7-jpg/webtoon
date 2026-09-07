/**
 * EffectLayer — 배경효과 PNG 오버레이 (읽기 전용)
 *
 * 레이어 순서: 컷 이미지 → **효과** → 말풍선 → 효과음
 * 좌표: x, y는 0~1 정규화 (효과 중심), width는 컷 너비 기준 0~1
 */

import EFFECT_CATALOG from '../utils/effectCatalog';

const catalogMap = Object.fromEntries(EFFECT_CATALOG.map(e => [e.id, e]));

export default function EffectLayer({ effectItems, width, height }) {
  if (!effectItems?.length || !width || !height) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ width, height }}
    >
      {effectItems.map((item, i) => {
        const entry = catalogMap[item.effect_id];
        if (!entry) return null;
        const w = (item.width ?? 1) * width;
        const rotation = item.rotation || 0;
        const opacity = item.opacity ?? 1;
        const flipH = item.flip_h ? ' scaleX(-1)' : '';

        return (
          <img
            key={i}
            src={entry.src}
            alt=""
            style={{
              position: 'absolute',
              left: (item.x ?? 0.5) * width,
              top: (item.y ?? 0.5) * height,
              width: w,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)${flipH}`,
              opacity,
              pointerEvents: 'none',
            }}
            draggable={false}
          />
        );
      })}
    </div>
  );
}
