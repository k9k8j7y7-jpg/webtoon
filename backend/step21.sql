-- step21: 좋아요·조회수 (공개 뷰어 폴리싱)
-- 2026-09-15

ALTER TABLE episodes
  ADD COLUMN view_count INT NOT NULL DEFAULT 0,
  ADD COLUMN like_count INT NOT NULL DEFAULT 0;

CREATE TABLE showcase_likes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  episode_id BIGINT NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_episode_fp (episode_id, fingerprint),
  CONSTRAINT fk_showcase_likes_episode FOREIGN KEY (episode_id) REFERENCES episodes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations (version) VALUES ('step21');
