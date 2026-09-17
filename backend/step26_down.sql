-- step26 rollback: generation_logs.kind ENUM에서 'product' 제거
ALTER TABLE generation_logs
  MODIFY COLUMN kind ENUM('cut','character','location') NOT NULL;
