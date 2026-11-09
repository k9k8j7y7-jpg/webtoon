-- step37 rollback
DROP INDEX idx_projects_user_default ON projects;
ALTER TABLE projects DROP COLUMN is_default;
