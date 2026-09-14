-- step20_down: 롤백
ALTER TABLE episodes
  DROP INDEX uk_share_token,
  DROP INDEX idx_showcase,
  DROP COLUMN share_token,
  DROP COLUMN showcase_category,
  DROP COLUMN showcase;

DELETE FROM schema_migrations WHERE version = 'step20';
