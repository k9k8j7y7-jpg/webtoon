-- step20: 공개 뷰어 + 갤러리용 showcase 필드
-- 2026-09-14

ALTER TABLE episodes
  ADD COLUMN showcase TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN showcase_category ENUM('short','series','ad') NULL,
  ADD COLUMN share_token VARCHAR(36) NULL,
  ADD INDEX idx_showcase (showcase, showcase_category),
  ADD UNIQUE KEY uk_share_token (share_token);

INSERT INTO schema_migrations (version) VALUES ('step20');
