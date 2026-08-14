-- step10: cuts 테이블에 합성 버전 추적 컬럼 추가
-- composed_renderer_version: 말풍선 렌더러 버전. Export 시 stale 판정에 사용.
-- composed_at: 합성 시각. (향후 활용 가능)

ALTER TABLE cuts
  ADD COLUMN composed_renderer_version VARCHAR(50) NULL AFTER composed_image_url,
  ADD COLUMN composed_at DATETIME NULL AFTER composed_renderer_version;
