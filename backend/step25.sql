-- step25: 제품 자산 테이블 (광고 에피소드용)
CREATE TABLE IF NOT EXISTS products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    episode_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    features TEXT,
    photo_url VARCHAR(500),
    sheet_url VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_products_episode (episode_id),
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
