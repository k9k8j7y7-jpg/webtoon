-- step19: 토스페이먼츠 결제 주문 테이블
-- 2026-09-13

CREATE TABLE IF NOT EXISTS orders (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  order_id      VARCHAR(64) NOT NULL,           -- 토스에 전달하는 고유 주문번호
  product_code  VARCHAR(32) NOT NULL,           -- packet_30 / packet_100 / packet_300
  amount        INT NOT NULL,                   -- 결제 금액 (원)
  packet_delta  INT NOT NULL,                   -- 지급할 패킷 수
  status        ENUM('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
  payment_key   VARCHAR(200),                   -- 토스 승인 후 반환되는 키
  paid_at       DATETIME,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_order_id (order_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user_status (user_id, status),
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
