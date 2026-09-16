-- step24_down: aspect_ratio 필드 제거 (롤백)
UPDATE episodes
SET gate_status = JSON_REMOVE(gate_status, '$.aspect_ratio', '$.aspect_ratio_locked')
WHERE gate_status IS NOT NULL
  AND JSON_VALUE(gate_status, '$.aspect_ratio') IS NOT NULL;
