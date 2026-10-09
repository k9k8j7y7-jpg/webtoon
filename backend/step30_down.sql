-- step30 rollback (showcase 컬럼은 손대지 않았으므로 기존 노출 상태 그대로 복귀)
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS author_subscriptions;

ALTER TABLE episodes
  DROP KEY idx_featured,
  DROP KEY idx_public,
  DROP COLUMN featured,
  DROP COLUMN published_at,
  DROP COLUMN is_public;

ALTER TABLE users
  DROP KEY uk_users_nickname,
  DROP COLUMN avatar_path,
  DROP COLUMN bio,
  DROP COLUMN nickname;
