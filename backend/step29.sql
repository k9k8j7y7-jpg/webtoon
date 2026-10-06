-- step29: 1:1 문의 게시판
CREATE TABLE inquiries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  category ENUM('bug','howto','payment','feature','other') NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  episode_id BIGINT NULL,
  status ENUM('received','checking','answered','closed') NOT NULL DEFAULT 'received',
  satisfaction TINYINT NULL,
  attachments JSON NULL,
  device_info JSON NULL,
  answered_at DATETIME NULL,
  user_read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_status (status),
  INDEX idx_category_created (category, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inquiry_messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  inquiry_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  attachments JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inquiry (inquiry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
