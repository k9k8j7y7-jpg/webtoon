-- Step 6: 과금 테이블 (Data-Model 8장)

CREATE TABLE IF NOT EXISTS subscriptions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  plan          VARCHAR(50) NOT NULL DEFAULT 'free',
  status        ENUM('active','canceled','past_due') DEFAULT 'active',
  cut_quota     INT NOT NULL DEFAULT 0,
  cut_used      INT NOT NULL DEFAULT 0,
  renews_at     DATETIME,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user (user_id)
);

CREATE TABLE IF NOT EXISTS credit_balances (
  user_id       BIGINT PRIMARY KEY,
  balance       INT NOT NULL DEFAULT 0,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  delta         INT NOT NULL,
  reason        ENUM('subscription_grant','purchase','generation','refund') NOT NULL,
  ref_log_id    BIGINT,
  balance_after INT NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user_time (user_id, created_at)
);

-- 기존 사용자에게 free 구독 + 초기 크레딧 부여
INSERT IGNORE INTO subscriptions (user_id, plan, cut_quota, cut_used)
  SELECT id, 'free', 50, 0 FROM users;

INSERT IGNORE INTO credit_balances (user_id, balance)
  SELECT id, 100 FROM users;

INSERT IGNORE INTO credit_transactions (user_id, delta, reason, balance_after)
  SELECT id, 100, 'subscription_grant', 100 FROM users;
