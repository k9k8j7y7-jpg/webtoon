-- step28 rollback
ALTER TABLE characters
  DROP COLUMN consent_given,
  DROP COLUMN is_photo_real;

ALTER TABLE generation_logs
  MODIFY COLUMN model_tier ENUM('flash','pro') DEFAULT 'flash';
