-- step38: episodes.brief_public, is_example — 갤러리 레퍼런스 (브리프 공개 + 예시 배지)
-- brief_public: 공개 뷰어에서 브리프 노출 여부 (기본 OFF → 기존 공개 작품 브리프 노출 없음)
-- is_example: 관리자가 지정한 예시 작품 (brief_public 강제 ON)

ALTER TABLE episodes
  ADD COLUMN brief_public TINYINT(1) NOT NULL DEFAULT 0
  AFTER share_token;

ALTER TABLE episodes
  ADD COLUMN is_example TINYINT(1) NOT NULL DEFAULT 0
  AFTER brief_public;

-- 갤러리 예시 필터용 인덱스
CREATE INDEX idx_episodes_is_example ON episodes (is_example);
