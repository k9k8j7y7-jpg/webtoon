CREATE TABLE cuts (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  cut_id        VARCHAR(50) NOT NULL,
  episode_id    BIGINT NOT NULL,
  scene_id      VARCHAR(50) NOT NULL,
  cut_number    INT NOT NULL,
  status        ENUM('pending','approved','regenerating','invalidated') DEFAULT 'pending',
  spec          JSON NOT NULL,
  image_url     VARCHAR(500),
  prev_image_url VARCHAR(500),
  seed          BIGINT,
  version       INT DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_cut (episode_id, cut_id),
  INDEX idx_episode_order (episode_id, cut_number),
  INDEX idx_status (status)
);

CREATE TABLE cut_asset_refs (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  cut_id        VARCHAR(50) NOT NULL,
  episode_id    BIGINT NOT NULL,
  asset_type    ENUM('character','location','style') NOT NULL,
  asset_ref     VARCHAR(50) NOT NULL,
  INDEX idx_asset (episode_id, asset_type, asset_ref),
  INDEX idx_cut (cut_id)
);

CREATE TABLE generation_logs (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  cut_id          VARCHAR(50),
  episode_id      BIGINT NOT NULL,
  project_id      BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  kind            ENUM('cut','character','location') NOT NULL,
  model           VARCHAR(80) NOT NULL,
  model_tier      ENUM('flash','pro') DEFAULT 'flash',
  cost_usd        DECIMAL(10,5) NOT NULL,
  credits_charged INT NOT NULL,
  seed            BIGINT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_time (user_id, created_at),
  INDEX idx_cut (cut_id),
  INDEX idx_project (project_id)
);

SHOW TABLES;
