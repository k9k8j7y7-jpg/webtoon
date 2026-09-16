-- step24: 기존 에피소드 gate_status에 aspect_ratio 필드 추가
-- 이미지(시트·장소·컷)가 있는 에피소드 → '1:1' 잠금
-- 이미지 없는 에피소드 → '9:16' 미잠금

-- 1) 이미지가 있는 에피소드: 1:1 잠금
UPDATE episodes e
SET e.gate_status = JSON_SET(
    e.gate_status,
    '$.aspect_ratio', '1:1',
    '$.aspect_ratio_locked', CAST(TRUE AS JSON)
)
WHERE e.deleted_at IS NULL
  AND e.gate_status IS NOT NULL
  AND (
    EXISTS (SELECT 1 FROM cuts c WHERE c.episode_id = e.id AND c.image_url IS NOT NULL)
    OR EXISTS (
      SELECT 1 FROM characters ch
      JOIN episode_characters ec ON ec.character_id = ch.id
      JOIN character_images ci ON ci.character_id = ch.id
      WHERE ec.episode_id = e.id
    )
    OR EXISTS (
      SELECT 1 FROM locations loc
      JOIN location_images li ON li.location_id = loc.id
      WHERE loc.episode_id = e.id
    )
  );

-- 2) 이미지 없는 에피소드: 9:16 미잠금
UPDATE episodes e
SET e.gate_status = JSON_SET(
    e.gate_status,
    '$.aspect_ratio', '9:16',
    '$.aspect_ratio_locked', CAST(FALSE AS JSON)
)
WHERE e.deleted_at IS NULL
  AND e.gate_status IS NOT NULL
  AND JSON_VALUE(e.gate_status, '$.aspect_ratio') IS NULL
  AND NOT EXISTS (SELECT 1 FROM cuts c WHERE c.episode_id = e.id AND c.image_url IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM characters ch
    JOIN episode_characters ec ON ec.character_id = ch.id
    JOIN character_images ci ON ci.character_id = ch.id
    WHERE ec.episode_id = e.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM locations loc
    JOIN location_images li ON li.location_id = loc.id
    WHERE loc.episode_id = e.id
  );
