-- step32: 웹푸시 구독 + 사용자 알림 설정
-- 2026-10-11  지시서: docs/지시서-구독알림.md 3단계 (웹푸시+PWA)

CREATE TABLE push_subscriptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  endpoint VARCHAR(500) NOT NULL,        -- 브라우저 푸시 서비스 URL (기기·브라우저당 1개)
  p256dh VARCHAR(200) NOT NULL,          -- 구독 공개키 (base64url)
  auth VARCHAR(100) NOT NULL,            -- 구독 인증 비밀 (base64url)
  user_agent VARCHAR(300) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_push_endpoint (endpoint),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 알림 종류별 푸시 수신 여부 (알림센터 기록은 설정과 무관하게 항상 남음)
ALTER TABLE users
  ADD COLUMN notify_prefs JSON NOT NULL
    DEFAULT '{"new_episode": true, "comment": true, "reply": true, "inquiry": true}';
