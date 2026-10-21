-- step33 rollback

ALTER TABLE characters DROP COLUMN is_preset;

ALTER TABLE generation_logs DROP COLUMN source;

DELETE FROM schema_migrations WHERE version = 'step33';
