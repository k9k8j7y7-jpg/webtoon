-- step21_down: 롤백
DROP TABLE IF EXISTS showcase_likes;

ALTER TABLE episodes
  DROP COLUMN like_count,
  DROP COLUMN view_count;

DELETE FROM schema_migrations WHERE version = 'step21';
