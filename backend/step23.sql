-- step23: 상품 테이블 (products.py → DB 이전)
-- 2026-09-15

CREATE TABLE packet_products (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  packets INT NOT NULL,
  price INT NOT NULL COMMENT '원 단위',
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기존 3종 이전
INSERT INTO packet_products (code, name, packets, price, is_visible, sort_order) VALUES
  ('packet_30',  '30 패킷',  30,  5900,  1, 1),
  ('packet_100', '100 패킷', 100, 14900, 1, 2),
  ('packet_300', '300 패킷', 300, 34900, 1, 3);

-- 가격 변경 로그
CREATE TABLE product_price_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  field_name VARCHAR(30) NOT NULL COMMENT 'price, packets, name 등',
  old_value VARCHAR(100),
  new_value VARCHAR(100),
  changed_by BIGINT NOT NULL COMMENT 'admin user_id',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_price_log_product FOREIGN KEY (product_id) REFERENCES packet_products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations (version) VALUES ('step23');
