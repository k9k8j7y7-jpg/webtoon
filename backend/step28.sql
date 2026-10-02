-- step28: 실사 캐릭터 컬럼 + generation_logs model_tier ENUM 확장
ALTER TABLE characters
  ADD COLUMN is_photo_real TINYINT(1) NOT NULL DEFAULT 0 AFTER reference_photos,
  ADD COLUMN consent_given TINYINT(1) NOT NULL DEFAULT 0 AFTER is_photo_real;

ALTER TABLE generation_logs
  MODIFY COLUMN model_tier ENUM('flash','pro','gpt') DEFAULT 'flash';
