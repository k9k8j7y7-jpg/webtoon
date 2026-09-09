-- Step 18: 패킷 과금 시스템 + 공지 테이블

CREATE TABLE IF NOT EXISTS packet_balances (
  user_id       BIGINT PRIMARY KEY,
  balance       INT NOT NULL DEFAULT 0,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS packet_transactions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  delta         INT NOT NULL,
  reason        ENUM('purchase','generation','refund','admin_grant') NOT NULL,
  ref_log_id    BIGINT,
  balance_after INT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user_time (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS notices (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  title         VARCHAR(200) NOT NULL,
  body          TEXT,
  notice_type   ENUM('info','warning','maintenance','update') NOT NULL DEFAULT 'info',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  starts_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at       DATETIME,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE generation_logs ADD COLUMN packets_charged INT NOT NULL DEFAULT 0;

-- 기존 사용자 패킷 잔량 초기화 (전원 0 시작)
INSERT IGNORE INTO packet_balances (user_id, balance) SELECT id, 0 FROM users;

INSERT INTO schema_migrations (version) VALUES ('step18');
