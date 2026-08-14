CREATE TABLE characters (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  ref_key       VARCHAR(50) NOT NULL,
  episode_id    BIGINT NOT NULL,
  name          VARCHAR(100),
  description   TEXT,
  status        ENUM('draft','approved','invalidated') DEFAULT 'draft',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_char_ref (episode_id, ref_key),
  INDEX idx_episode (episode_id)
);

CREATE TABLE character_images (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  character_id  BIGINT NOT NULL,
  type          ENUM('front','side','expression') NOT NULL,
  label         VARCHAR(50),
  image_url     VARCHAR(500) NOT NULL,
  seed          BIGINT,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  INDEX idx_character (character_id)
);

CREATE TABLE character_outfits (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  character_id  BIGINT NOT NULL,
  outfit_key    VARCHAR(50) NOT NULL,
  label         VARCHAR(100),
  description   TEXT,
  is_default    BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  UNIQUE KEY uq_outfit (character_id, outfit_key)
);

CREATE TABLE outfit_images (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  outfit_id     BIGINT NOT NULL,
  image_url     VARCHAR(500) NOT NULL,
  FOREIGN KEY (outfit_id) REFERENCES character_outfits(id),
  INDEX idx_outfit (outfit_id)
);

CREATE TABLE locations (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  ref_key       VARCHAR(50) NOT NULL,
  episode_id    BIGINT NOT NULL,
  name          VARCHAR(100),
  description   TEXT,
  status        ENUM('draft','approved','invalidated') DEFAULT 'draft',
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_loc_ref (episode_id, ref_key)
);

CREATE TABLE location_images (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  location_id   BIGINT NOT NULL,
  image_url     VARCHAR(500) NOT NULL,
  seed          BIGINT,
  FOREIGN KEY (location_id) REFERENCES locations(id),
  INDEX idx_location (location_id)
);

CREATE TABLE styles (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  episode_id    BIGINT NOT NULL,
  preset_key    VARCHAR(50) NOT NULL,
  tier          ENUM('core','beta') DEFAULT 'core',
  prompt_snippet TEXT,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_episode_style (episode_id)
);

SHOW TABLES;
