-- step15: 장소 사진 변환본 — converted_photo_url 컬럼 추가
ALTER TABLE locations ADD COLUMN converted_photo_url VARCHAR(500) NULL DEFAULT NULL AFTER reference_photo_url;
