-- step31 rollback
DROP TABLE IF EXISTS user_blocks;
DROP TABLE IF EXISTS comment_reports;
DROP TABLE IF EXISTS comments;

ALTER TABLE episodes DROP COLUMN comment_count;
