-- step36: projects.kind 컬럼 추가 (story/ad/series)
-- 연재툰 2차: 시리즈 = 프로젝트 구분

-- 1. kind 컬럼 추가
ALTER TABLE projects
  ADD COLUMN kind ENUM('story','ad','series') NOT NULL DEFAULT 'story'
  AFTER title;

-- 2. 기존 프로젝트 자동 판별: 광고 purpose 에피소드만 있으면 'ad'
-- (섞인 프로젝트는 story로 남김 — 연재툰 입구만 없을 뿐 기존 동작 유지)
UPDATE projects p SET p.kind = 'ad'
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM episodes e
    WHERE e.project_id = p.id
      AND e.deleted_at IS NULL
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.gate_status, '$.purpose')), 'story') NOT IN ('onecut_ad', 'instatoon_ad', 'brand_series')
  )
  AND EXISTS (
    SELECT 1 FROM episodes e
    WHERE e.project_id = p.id
      AND e.deleted_at IS NULL
  );
