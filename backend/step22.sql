-- step22: 관리자 권한 (is_admin)
-- 2026-09-15

ALTER TABLE users
  ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;

-- 도도 구글 계정(id=3)을 관리자로 지정
UPDATE users SET is_admin = 1 WHERE id = 3;

INSERT INTO schema_migrations (version) VALUES ('step22');
