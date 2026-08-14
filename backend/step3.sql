CREATE TABLE scenes (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  episode_id   BIGINT NOT NULL,
  scene_no     INT NOT NULL,
  summary      TEXT,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  INDEX idx_episode (episode_id)
);

DELETE FROM episodes WHERE id > 0;
DELETE FROM project_memory WHERE id > 0;
DELETE FROM projects WHERE id > 0;

SHOW TABLES;
