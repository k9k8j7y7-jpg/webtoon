-- step30: 작가 프로필 + 작가 공개(is_public) / 랜딩 추천(featured) 분리 + 작가 구독 + 알림
-- 2026-10-09  지시서: docs/지시서-구독알림.md 1a
-- 주의: 기존 subscriptions 테이블(billing 플랜)과 이름 충돌 → author_subscriptions

ALTER TABLE users
  ADD COLUMN nickname VARCHAR(20) NULL,
  ADD COLUMN bio VARCHAR(100) NULL,
  ADD COLUMN avatar_path VARCHAR(500) NULL,
  ADD UNIQUE KEY uk_users_nickname (nickname);

ALTER TABLE episodes
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN published_at DATETIME NULL,
  ADD COLUMN featured TINYINT(1) NOT NULL DEFAULT 0,
  ADD KEY idx_public (is_public, published_at),
  ADD KEY idx_featured (featured, showcase_category);

-- 데이터 이관: 기존 showcase 노출작(ep20·25·26·30) → 공개 + 랜딩 추천.
-- published_at을 채워 두어 이후 "최초 공개" 알림이 이 4편에 발송되지 않게 한다.
UPDATE episodes
  SET is_public = 1, featured = 1, published_at = COALESCE(published_at, updated_at)
  WHERE showcase = 1;

CREATE TABLE author_subscriptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  follower_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_author_sub (follower_id, author_id),
  KEY idx_author_sub_author (author_id),
  CONSTRAINT fk_author_sub_follower FOREIGN KEY (follower_id) REFERENCES users(id),
  CONSTRAINT fk_author_sub_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NULL,
  link VARCHAR(500) NULL,
  actor_id BIGINT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_noti_user_read (user_id, is_read, created_at),
  CONSTRAINT fk_noti_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
