-- step38 rollback
DROP INDEX idx_episodes_is_example ON episodes;
ALTER TABLE episodes DROP COLUMN is_example;
ALTER TABLE episodes DROP COLUMN brief_public;
