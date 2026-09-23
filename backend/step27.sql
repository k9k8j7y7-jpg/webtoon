-- step27: 장소 텍스트화 — location_spec_en 컬럼 추가
-- 장소 영문 스펙 (컷 프롬프트 주입용, appearance_en 패턴)
ALTER TABLE locations ADD COLUMN location_spec_en VARCHAR(500) NULL AFTER mood_notes;
