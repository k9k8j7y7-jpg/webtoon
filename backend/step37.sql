-- step37: projects.is_default — 사용자별 숨은 기본 프로젝트 (한 컷·인스타툰 에피소드 보관용)
-- 내 작품 단일 목록: 한 컷·인스타툰 = 기본 프로젝트(kind=ad, is_default=1) 에피소드

ALTER TABLE projects
  ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0
  AFTER kind;

-- 사용자+기본 프로젝트 조회용 인덱스
CREATE INDEX idx_projects_user_default ON projects (user_id, is_default);
