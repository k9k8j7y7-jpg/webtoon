-- step22_down: 롤백
ALTER TABLE users DROP COLUMN is_admin;

DELETE FROM schema_migrations WHERE version = 'step22';
