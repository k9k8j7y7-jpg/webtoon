-- step31: 댓글·답글(1단계 깊이) + 신고 + 작가의 사용자 차단
-- 2026-10-09  지시서: docs/지시서-구독알림.md 2단계

ALTER TABLE episodes
  ADD COLUMN comment_count INT NOT NULL DEFAULT 0;

CREATE TABLE comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  episode_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  parent_id BIGINT NULL,                 -- 답글이면 최상위 댓글 id (답글의 답글 없음 — 앱에서 검증)
  body VARCHAR(1000) NOT NULL,
  status ENUM('visible','deleted','hidden') NOT NULL DEFAULT 'visible',  -- deleted=본인·작가 삭제, hidden=관리자 숨김
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cmt_ep (episode_id, parent_id, id),
  KEY idx_cmt_user (user_id),
  CONSTRAINT fk_cmt_ep FOREIGN KEY (episode_id) REFERENCES episodes(id),
  CONSTRAINT fk_cmt_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_cmt_parent FOREIGN KEY (parent_id) REFERENCES comments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE comment_reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  comment_id BIGINT NOT NULL,
  reporter_id BIGINT NOT NULL,
  reason VARCHAR(30) NOT NULL,           -- spam / abuse / sexual / other
  status ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_report (comment_id, reporter_id),
  KEY idx_report_status (status, created_at),
  CONSTRAINT fk_rep_cmt FOREIGN KEY (comment_id) REFERENCES comments(id),
  CONSTRAINT fk_rep_user FOREIGN KEY (reporter_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_blocks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  author_id BIGINT NOT NULL,
  blocked_user_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_block (author_id, blocked_user_id),
  KEY idx_block_user (blocked_user_id),
  CONSTRAINT fk_blk_author FOREIGN KEY (author_id) REFERENCES users(id),
  CONSTRAINT fk_blk_user FOREIGN KEY (blocked_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
