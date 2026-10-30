-- step35: projects 테이블에 시리즈 기본값 JSON 컬럼 추가
-- brand_series 용도: 2화부터 브리프·제품 프리필 소스
-- 구조: {brief: {product_name, features, usage, enrich, target, tone, ...}, saved_at, source_episode_id}

ALTER TABLE projects
    ADD COLUMN series_defaults JSON NULL;
