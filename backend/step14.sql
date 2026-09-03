-- step14: 장소 사진 업로드 — reference_photo_url 컬럼 추가
ALTER TABLE locations ADD COLUMN reference_photo_url VARCHAR(500) NULL DEFAULT NULL AFTER mood_notes;
