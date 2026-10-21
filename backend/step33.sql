-- step33: 빠른 컷 — characters.is_preset + generation_logs.source

ALTER TABLE characters ADD COLUMN is_preset BOOLEAN NOT NULL DEFAULT FALSE AFTER consent_given;

ALTER TABLE generation_logs ADD COLUMN source VARCHAR(20) DEFAULT NULL AFTER seed;

INSERT INTO schema_migrations (version) VALUES ('step33');
