-- step16: 캐릭터 실사진 업로드 — reference_photos JSON 컬럼 추가
-- MariaDB 10.2+에서 JSON은 LONGTEXT alias + CHECK(JSON_VALID) 자동 적용
ALTER TABLE characters ADD COLUMN reference_photos JSON NULL DEFAULT NULL AFTER appearance_en;
